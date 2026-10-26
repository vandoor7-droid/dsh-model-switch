import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { Loader } from '@deepseek-ai/cordis-plugin-loader'
import type { SessionTitleProviderRequest } from '@deepseek-ai/dsh-session-title'
import { apply } from '../src/session-title.ts'

/** Every call into the 0.2.1+ provider-prepared call, in order. */
const llm = vi.hoisted(() => ({
  executed: [] as Array<{
    config: Record<string, unknown>
    titleProvider: string
    prepared: {
      system: string
      input: string
      messageSeqs: readonly number[]
      selectReasoningEffort: (model: unknown) => string | undefined
    }
    request: unknown
  }>,
  /** The assembled response the call returns, swappable per test. */
  impl: async (): Promise<unknown> => ({
    blocks: [{ type: 'text', text: 'Fresh title' }],
    finish: { kind: 'stop' },
    model: { provider: 'p', model: 'm' },
  }),
  /** The policy validator of the 0.2.1 line: provider-owned keys are rejected. */
  resolve: (config: Record<string, unknown>) => {
    for (const key of Object.keys(config)) {
      if (key === 'targetWords' || key === 'targetCjkCharacters') throw new Error(`session-title-llm: unknown config key "${key}"`)
    }
    return { ...config }
  },
}))

vi.mock('@deepseek-ai/dsh-session-title-llm', () => ({
  resolveSessionTitleLlmConfig: (config: unknown) => llm.resolve(config as Record<string, unknown>),
  executeSessionTitleLlm: async (
    _ctx: unknown,
    config: Record<string, unknown>,
    request: unknown,
    titleProvider: string,
    prepared: {
      system: string
      input: string
      messageSeqs: readonly number[]
      selectReasoningEffort: (model: unknown) => string | undefined
    },
  ) => {
    llm.executed.push({ config, titleProvider, prepared, request })
    return llm.impl()
  },
}))

beforeEach(() => {
  llm.executed.length = 0
  llm.impl = async () => ({
    blocks: [{ type: 'text', text: 'Fresh title' }],
    finish: { kind: 'stop' },
    model: { provider: 'p', model: 'm' },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

const FIRST_PROMPT = '@deepseek-ai/dsh-session-title-first-prompt-llm'
const ALL_PROMPTS = '@deepseek-ai/dsh-session-title-all-prompts-llm'
/** Required policy fields the shipped row always carries, no defaults exist. */
const POLICY = Object.freeze({ targetWords: 6, targetCjkCharacters: 12, maxInputBytes: 4096, maxOutputTokens: 24, timeoutMs: 3000 })

/** One loader row shaped like the shipped session-title-llm entry. */
function officialRow(pkg: string = FIRST_PROMPT): Record<string, unknown> {
  return { id: 'session-title-llm', options: { name: pkg, config: { ...POLICY } } }
}

/** One eligible human message of one naming revision. */
function message(seq: number, text: string) {
  return { seq, text } as never
}

/** What one fake session reports through the public provider reads. */
function sessionOf(provider?: string) {
  return {
    requestContext: () => provider === undefined ? undefined : { provider, model: 'session-model' },
    requestHeader: () => undefined,
  }
}

/** One registered provider, reduced to the faces these tests observe. */
interface RegisteredProvider {
  readonly id: string
  readonly automatic: string
  readonly generate: (request: SessionTitleProviderRequest) => Promise<unknown>
}

/** Context bench for `apply`: structural services plus capture surfaces. */
function bench(options: { settings?: Record<string, unknown>; entries?: unknown[] } = {}) {
  const warns: string[] = []
  const errors: string[] = []
  const registrations: RegisteredProvider[] = []
  const settings: Record<string, unknown> = { ...options.settings }
  const entries = options.entries ?? [officialRow()]
  const ctx = {
    get(name: string) {
      if (name === 'loader') return { entries: () => entries.values() } satisfies Loader
      if (name === 'modelSwitch') return { currentSettings: () => ({ ...settings }) }
      return undefined
    },
    logger: {
      info: () => {},
      warn: (line: unknown) => { warns.push(String(line)) },
      error: (line: unknown) => { errors.push(String(line)) },
    },
    sessionTitle: {
      register(provider: RegisteredProvider) {
        registrations.push(provider)
        return async () => {}
      },
    },
    on() {},
  }
  return { ctx: ctx as unknown as Context, warns, errors, registrations, settings }
}

/** Let the asynchronous takeover settle: an enabled official row is displaced after `apply` returns. */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 200))

describe('the 0.2.1 provider-prepared line', () => {
  it('prepares the official prompt and interprets the assembled response', async () => {
    llm.impl = async () => ({
      blocks: [{ type: 'text', text: '**Fresh title**' }],
      finish: { kind: 'stop' },
      model: { provider: 'ark', model: 'ark-code' },
    })
    const { ctx, registrations, errors } = bench({ settings: { titleProvider: 'p', titleModel: 'm' } })
    await apply(ctx)

    await settle()
    expect(errors).toEqual([])
    const request = {
      session: sessionOf('plain'),
      messages: [message(1, 'first'), message(2, 'second')],
      signal: new AbortController().signal,
    } as unknown as SessionTitleProviderRequest
    const result = await registrations[0]!.generate(request)
    expect(result).toEqual({ title: 'Fresh title', messageSeqs: [1], model: { provider: 'ark', model: 'ark-code' } })
    const call = llm.executed[0]!
    expect(call.titleProvider).toBe('session-title-first-prompt-llm')
    expect(call.config).toEqual({ maxInputBytes: 4096, maxOutputTokens: 24, timeoutMs: 3000, provider: 'p', model: 'm' })
    expect(call.prepared.system).toContain('Aim for about 6 words in non-CJK languages or 12 CJK characters.')
    expect(call.prepared.system).toContain('best-effort title')
    expect(call.prepared.input).toBe('Generate the session title from this JSON array of human messages:\n[{"seq":1,"text":"first"}]')
    expect(call.prepared.messageSeqs).toEqual([1])
    expect(call.prepared.selectReasoningEffort({ reasoning: { efforts: [{ id: 'off' }, { id: 'max' }] } })).toBe('off')
  })

  it('anchors an all-prompts update on the accepted provider title only', async () => {
    const { ctx, registrations } = bench({ entries: [officialRow(ALL_PROMPTS)] })
    await apply(ctx)

    await settle()
    const anchored = {
      session: sessionOf(undefined),
      messages: [message(1, 'first'), message(2, 'second')],
      currentTitle: { title: 'Existing title', messageSeqs: [1], source: { kind: 'provider' } },
      signal: new AbortController().signal,
    } as unknown as SessionTitleProviderRequest
    const result = await registrations[0]!.generate(anchored)
    expect(result).toMatchObject({ messageSeqs: [1, 2] })
    expect(llm.executed[0]?.titleProvider).toBe('session-title-all-prompts-llm')
    expect(llm.executed[0]?.prepared.system).toContain('currentTitle')
    expect(llm.executed[0]?.prepared.input).toBe(
      'Update the session title from this JSON object:\n{"currentTitle":"Existing title","messages":[{"seq":1,"text":"first"},{"seq":2,"text":"second"}]}',
    )
  })

  it('ignores a fallback title and a first-prompt request as anchors', async () => {
    const { ctx, registrations } = bench()
    await apply(ctx)

    await settle()
    await registrations[0]!.generate({
      session: sessionOf(undefined),
      messages: [message(1, 'first'), message(2, 'second')],
      currentTitle: { title: 'Fallback title', messageSeqs: [1], source: { kind: 'fallback' } },
      signal: new AbortController().signal,
    } as unknown as SessionTitleProviderRequest)
    expect(llm.executed[0]?.prepared.system).not.toContain('currentTitle')
    expect(llm.executed[0]?.prepared.input.startsWith('Generate the session title from this JSON array')).toBe(true)
  })

  it('widens the budget on a max-token response and then falls through', async () => {
    const { ctx, registrations } = bench({
      settings: {
        titleProvider: 'apigoto',
        titleModel: 'mimo',
        providerGroups: { ark: { titleProvider: 'ark', titleModel: 'ark-code' } },
      },
    })
    await apply(ctx)

    await settle()
    let call = 0
    llm.impl = async () => {
      call += 1
      if (call === 1) return { blocks: [], finish: { kind: 'max-tokens' }, model: { provider: 'ark', model: 'ark-code' } }
      if (call === 2) throw new Error('429: Requests are too frequent')
      return { blocks: [{ type: 'text', text: 'Recovered' }], finish: { kind: 'stop' }, model: { provider: 'apigoto', model: 'mimo' } }
    }
    const result = await registrations[0]!.generate({
      session: sessionOf('ark'),
      messages: [message(1, 'only')],
      signal: new AbortController().signal,
    } as unknown as SessionTitleProviderRequest)
    expect(result).toMatchObject({ title: 'Recovered' })
    expect(llm.executed.map(entry => [entry.config.provider, entry.config.maxOutputTokens])).toEqual([
      ['ark', 24],
      ['ark', 96],
      ['apigoto', 24],
    ])
  })

  it('reports an invalid stored policy without registering', async () => {
    const { ctx, registrations, errors } = bench()
    const original = llm.resolve
    llm.resolve = () => { throw new Error('policy rejected') }
    try {
      await apply(ctx)

      await settle()
    } finally {
      llm.resolve = original
    }
    expect(registrations).toHaveLength(0)
    expect(errors.some(line => line.includes('no valid naming policy'))).toBe(true)
  })
})
