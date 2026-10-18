import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { Entry, Loader } from '@deepseek-ai/cordis-plugin-loader'
import type { SessionTitleProviderRequest } from '@deepseek-ai/dsh-session-title'
import {
  TITLE_CADENCES,
  apply,
  composeTitleRoute,
  forwardedConfig,
  frameTitleInput,
  inject,
  isMaxTokensFailure,
  isModernTitleModule,
  name,
  normalizeTitleText,
  officialTitleEntry,
  officialTitlePackage,
  resolveNamingPolicy,
  selectTitleMessages,
  selectTitleReasoningEffort,
  shouldTryNextCandidate,
  splitTitlePolicy,
  titleCadence,
  titleFromOutput,
  titleFromResponse,
  titleRouteCandidates,
  titleSystemPrompt,
  widerTitleBudget,
} from '../src/session-title.ts'

/** Every call into the official auxiliary-LLM implementation, in order. */
const llm = vi.hoisted(() => ({
  calls: [] as Array<{
    config: Record<string, unknown>
    request: unknown
    messages: readonly unknown[]
    titleProvider: string
  }>,
  /** Swappable policy validator so one test can feed an invalid stored policy. */
  resolve: { impl: (config: Record<string, unknown>): Record<string, unknown> => ({ ...config }) },
  /** Swappable legacy call so one test can make a route fail. */
  generate: { impl: async (_config: Record<string, unknown>): Promise<unknown> => ({ title: 'generated', messageSeqs: [] }) },
  /** Every call into the 0.2.1+ provider-prepared call, in order. */
  executed: [] as Array<{
    config: Record<string, unknown>
    titleProvider: string
    prepared: { system: string; input: string; messageSeqs: readonly number[]; selectReasoningEffort: (model: unknown) => string | undefined }
    request: unknown
  }>,
  /** The assembled response the 0.2.1+ call returns, swappable per test. */
  execute: {
    impl: async (): Promise<unknown> => ({
      blocks: [{ type: 'text', text: 'Fresh title' }],
      finish: { kind: 'stop' },
      model: { provider: 'p', model: 'm' },
    }),
  },
}))

vi.mock('@deepseek-ai/dsh-session-title-llm', () => ({
  resolveSessionTitleLlmConfig: (config: unknown) => llm.resolve.impl(config as Record<string, unknown>),
  generateSessionTitleWithLlm: async (
    _ctx: unknown,
    config: Record<string, unknown>,
    request: unknown,
    messages: readonly unknown[],
    titleProvider: string,
  ) => {
    llm.calls.push({ config, request, messages, titleProvider })
    return llm.generate.impl(config)
  },
}))

beforeEach(() => {
  llm.calls.length = 0
  llm.executed.length = 0
  llm.resolve.impl = config => ({ ...config })
  llm.generate.impl = async () => ({ title: 'generated', messageSeqs: [] })
  llm.execute.impl = async () => ({
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

/** Required policy fields the shipped row always carries; no defaults exist. */
const POLICY = Object.freeze({ targetWords: 6, targetCjkCharacters: 12, maxInputBytes: 4096, maxOutputTokens: 24, timeoutMs: 3000 })

/** One loader row shaped like the shipped session-title-llm entry. */
function officialRow(config: Record<string, unknown> = {}, pkg: string = FIRST_PROMPT): Record<string, unknown> {
  return { id: 'session-title-llm', options: { name: pkg, config: { ...POLICY, ...config } } }
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

/** One naming request owned by the service, shaped like the official snapshot. */
function titleRequest(session: unknown, messages: readonly unknown[]): SessionTitleProviderRequest {
  return { session, messages, signal: new AbortController().signal } as unknown as SessionTitleProviderRequest
}

/** One registered provider, reduced to the faces these tests observe. */
interface RegisteredProvider {
  readonly id: string
  readonly automatic: string
  readonly generate: (request: SessionTitleProviderRequest) => Promise<unknown>
}

/**
 * Context bench for `apply`: the structural services the row reads plus capture
 * surfaces for the registration, the settings listener, and the log lines.
 */
function bench(options: {
  settings?: Record<string, unknown>
  entries?: unknown[]
  host?: boolean
  registerThrows?: boolean
} = {}) {
  const info: string[] = []
  const errors: string[] = []
  const warns: string[] = []
  const registrations: RegisteredProvider[] = []
  const listeners: Array<{ event: string; listener: () => void; options?: unknown }> = []
  const settings: Record<string, unknown> = { ...options.settings }
  const entries = options.entries ?? [officialRow()]
  const ctx = {
    get(name: string) {
      if (name === 'loader') return { entries: () => entries.values() } satisfies Loader
      if (name === 'modelSwitch' && options.host !== false) return { currentSettings: () => ({ ...settings }) }
      return undefined
    },
    logger: {
      info: (line: unknown) => { info.push(String(line)) },
      warn: (line: unknown) => { warns.push(String(line)) },
      error: (line: unknown) => { errors.push(String(line)) },
    },
    sessionTitle: {
      register(provider: RegisteredProvider) {
        // The seam allows one provider per context; another row owning it makes
        // the real register() throw instead of silently replacing the provider.
        if (options.registerThrows) throw new Error('session-title provider already registered')
        registrations.push(provider)
        return async () => {}
      },
    },
    on(event: string, listener: () => void, listenerOptions?: unknown) {
      listeners.push({ event, listener, options: listenerOptions })
    },
  }
  return { ctx: ctx as unknown as Context, info, errors, warns, registrations, listeners, settings }
}

describe('session-title plugin identity', () => {
  it('keeps the loader contract stable', () => {
    expect(name).toBe('model-switch-session-title')
    expect(inject).toEqual(['loader', 'sessionTitle', 'llm'])
  })
})

describe('titleCadence', () => {
  it('mirrors exactly the two official cadence packages', () => {
    expect(titleCadence(FIRST_PROMPT)).toEqual({
      pkg: FIRST_PROMPT,
      id: 'session-title-first-prompt-llm',
      automatic: 'first-prompt',
      firstPromptOnly: true,
    })
    expect(titleCadence(ALL_PROMPTS)).toEqual({
      pkg: ALL_PROMPTS,
      id: 'session-title-all-prompts-llm',
      automatic: 'all-prompts',
      firstPromptOnly: false,
    })
  })

  it('resolves nothing for a row this plugin cannot mirror', () => {
    expect(titleCadence(undefined)).toBeUndefined()
    expect(titleCadence('@deepseek-ai/dsh-web')).toBeUndefined()
  })
})

describe('TITLE_CADENCES', () => {
  it('declares the first-prompt cadence before the all-prompts one', () => {
    expect(TITLE_CADENCES.map(cadence => ({
      pkg: cadence.pkg, id: cadence.id, automatic: cadence.automatic, firstPromptOnly: cadence.firstPromptOnly,
    }))).toEqual([
      { pkg: FIRST_PROMPT, id: 'session-title-first-prompt-llm', automatic: 'first-prompt', firstPromptOnly: true },
      { pkg: ALL_PROMPTS, id: 'session-title-all-prompts-llm', automatic: 'all-prompts', firstPromptOnly: false },
    ])
  })
})

describe('composeTitleRoute', () => {
  const policy = { targetWords: 6, provider: 'old-policy-provider', model: 'old-policy-model' }

  it('overlays the session-resolved route over the row policy', () => {
    expect(composeTitleRoute(policy, { provider: 'p', model: 'm' }))
      .toEqual({ targetWords: 6, provider: 'p', model: 'm' })
  })

  it('returns the row policy itself when nothing resolves', () => {
    expect(composeTitleRoute(policy, undefined)).toBe(policy)
  })
})

describe('selectTitleMessages', () => {
  const messages = [message(1, 'first'), message(2, 'second')]

  it('passes every message through for an all-prompts cadence', () => {
    expect(selectTitleMessages(messages, false)).toBe(messages)
  })

  it('frames only the first message for a first-prompt cadence', () => {
    expect(selectTitleMessages(messages, true)).toEqual([messages[0]])
  })

  it('rejects an empty revision for a first-prompt cadence', () => {
    expect(() => selectTitleMessages([], true)).toThrow('first-prompt title provider requires one human message')
  })

  it('passes an empty revision through for an all-prompts cadence', () => {
    expect(selectTitleMessages([], false)).toEqual([])
  })
})

describe('officialTitleEntry', () => {
  const loaderOf = (...entries: unknown[]) => ({ entries: () => entries.values() }) as unknown as Loader

  it('matches by row id or either cadence package name and tolerates a missing loader', () => {
    const byId = { id: 'session-title-llm', options: { config: {} } }
    const byFirstPrompt = { id: 'custom-title', options: { name: FIRST_PROMPT, config: {} } }
    const byAllPrompts = { id: 'custom-title', options: { name: ALL_PROMPTS, config: {} } }
    expect(officialTitleEntry(loaderOf(byId))).toBe(byId)
    expect(officialTitleEntry(loaderOf(byFirstPrompt))).toBe(byFirstPrompt)
    expect(officialTitleEntry(loaderOf(byAllPrompts))).toBe(byAllPrompts)
    expect(officialTitleEntry(loaderOf({ id: 'web', options: { name: '@deepseek-ai/dsh-web' } }))).toBeUndefined()
    expect(officialTitleEntry(loaderOf())).toBeUndefined()
    expect(officialTitleEntry(undefined)).toBeUndefined()
  })
})

describe('officialTitlePackage', () => {
  it('reads the declared package name of the row', () => {
    expect(officialTitlePackage(officialRow() as unknown as Entry)).toBe(FIRST_PROMPT)
    expect(officialTitlePackage({ id: 'session-title-llm', options: { name: '  ' } } as unknown as Entry)).toBeUndefined()
    expect(officialTitlePackage({ id: 'session-title-llm', options: {} } as unknown as Entry)).toBeUndefined()
  })
})

describe('forwardedConfig', () => {
  const entryOf = (config: unknown) => ({ id: 'session-title-llm', options: { config } }) as unknown as Entry

  it('passes object configs through and normalizes everything else to an empty object', () => {
    expect(forwardedConfig(entryOf({ targetWords: 6, timeoutMs: 5000 }))).toEqual({ targetWords: 6, timeoutMs: 5000 })
    expect(forwardedConfig(entryOf(undefined))).toEqual({})
    expect(forwardedConfig(entryOf('not-an-object'))).toEqual({})
    expect(forwardedConfig(entryOf([1, 2]))).toEqual({})
    expect(forwardedConfig({ id: 'x' } as unknown as Entry)).toEqual({})
  })
})

describe('apply', () => {
  it('registers exactly one provider mirroring the disabled first-prompt row', async () => {
    const { ctx, registrations, errors } = bench()
    await apply(ctx)
    expect(errors).toEqual([])
    expect(registrations).toHaveLength(1)
    expect(registrations[0]).toMatchObject({ id: 'session-title-first-prompt-llm', automatic: 'first-prompt' })
    expect(typeof registrations[0]?.generate).toBe('function')
  })

  it('mirrors the all-prompts cadence the disabled row declared', async () => {
    const { ctx, registrations, errors } = bench({ entries: [officialRow({}, ALL_PROMPTS)] })
    await apply(ctx)
    expect(errors).toEqual([])
    expect(registrations).toHaveLength(1)
    expect(registrations[0]).toMatchObject({ id: 'session-title-all-prompts-llm', automatic: 'all-prompts' })
  })

  it('registers the shipped cadence when the official row is not instantiated', async () => {
    // A `disabled` row is not a loader entry, so the row to mirror is often
    // absent even though the profile declares it. Dropping the provider there
    // would silently restore fallback titles, so the shipped first-prompt
    // cadence is mirrored instead.
    const { ctx, registrations, info, errors } = bench({ entries: [{ id: 'web', options: { name: '@deepseek-ai/dsh-web', config: {} } }] })
    await apply(ctx)
    expect(errors).toEqual([])
    expect(registrations).toHaveLength(1)
    expect(registrations[0]).toMatchObject({ id: 'session-title-first-prompt-llm', automatic: 'first-prompt' })
    expect(info.some(line => line.includes('no instantiated official session-title row'))).toBe(true)
  })

  it('mirrors the shipped cadence for a row package it cannot recognize', async () => {
    const { ctx, registrations, errors } = bench({
      entries: [{ id: 'session-title-llm', options: { name: '@deepseek-ai/something-else', config: {} } }],
    })
    await apply(ctx)
    expect(errors).toEqual([])
    expect(registrations).toHaveLength(1)
    expect(registrations[0]).toMatchObject({ id: 'session-title-first-prompt-llm', automatic: 'first-prompt' })
  })

  it('reports an invalid stored policy instead of registering', async () => {
    llm.resolve.impl = () => { throw new Error('policy rejected') }
    const { ctx, registrations, errors } = bench()
    await apply(ctx)
    expect(registrations).toHaveLength(0)
    expect(errors.some(line => line.includes('no valid naming policy'))).toBe(true)
  })

  it('reports a seam another provider already owns without failing the row', async () => {
    const { ctx, registrations, errors } = bench({ registerThrows: true })
    await expect(apply(ctx)).resolves.toBeUndefined()
    expect(registrations).toHaveLength(0)
    expect(errors.some(line => line.includes('already registered'))).toBe(true)
  })

  it('routes each request through the delegating session provider saved group', async () => {
    const { ctx, registrations } = bench({
      settings: {
        titleProvider: 'deepseek',
        titleModel: 'deep-title',
        providerGroups: { codex: { titleProvider: 'grok', titleModel: 'grok-title' } },
      },
    })
    await apply(ctx)
    const request = titleRequest(sessionOf('codex'), [message(1, 'first'), message(2, 'second')])
    const result = await registrations[0]!.generate(request)
    expect(result).toEqual({ title: 'generated', messageSeqs: [] })
    expect(llm.calls).toHaveLength(1)
    expect(llm.calls[0]?.config).toEqual({ ...POLICY, provider: 'grok', model: 'grok-title' })
    expect(llm.calls[0]?.titleProvider).toBe('session-title-first-prompt-llm')
    expect(llm.calls[0]?.messages).toEqual([message(1, 'first')])
    expect(llm.calls[0]?.request).toBe(request)
  })

  it('falls back to the flat title pair when the session provider has no group', async () => {
    const { ctx, registrations } = bench({ settings: { titleProvider: 'deepseek', titleModel: 'deep-title' } })
    await apply(ctx)
    await registrations[0]!.generate(titleRequest(sessionOf('ungrouped'), [message(1, 'only')]))
    expect(llm.calls[0]?.config).toEqual({ ...POLICY, provider: 'deepseek', model: 'deep-title' })
  })

  it('keeps the row鈥檚 own policy when the session resolves no route', async () => {
    const { ctx, registrations } = bench()
    await apply(ctx)
    await registrations[0]!.generate(titleRequest(sessionOf(undefined), [message(1, 'only')]))
    expect(llm.calls[0]?.config).toEqual(POLICY)
    expect(llm.calls[0]?.config).not.toHaveProperty('provider')
  })

  it('keeps the row鈥檚 own policy when host settings are unavailable', async () => {
    const { ctx, registrations } = bench({ host: false, settings: { titleProvider: 'deepseek', titleModel: 'deep-title' } })
    await apply(ctx)
    await registrations[0]!.generate(titleRequest(sessionOf('codex'), [message(1, 'only')]))
    expect(llm.calls[0]?.config).toEqual(POLICY)
  })

  it('forwards every message for the all-prompts cadence and records its id', async () => {
    const { ctx, registrations } = bench({ entries: [officialRow({}, ALL_PROMPTS)] })
    await apply(ctx)
    const messages = [message(1, 'first'), message(2, 'second')]
    await registrations[0]!.generate(titleRequest(sessionOf(undefined), messages))
    expect(llm.calls[0]?.messages).toEqual(messages)
    expect(llm.calls[0]?.titleProvider).toBe('session-title-all-prompts-llm')
  })

  it('re-reads the live route on every request, so a settings save needs no remount', async () => {
    const { ctx, registrations, settings } = bench({ settings: { titleProvider: 'p1', titleModel: 'm1' } })
    await apply(ctx)
    await registrations[0]!.generate(titleRequest(sessionOf('plain'), [message(1, 'only')]))
    settings.titleProvider = 'p2'
    settings.titleModel = 'm2'
    await registrations[0]!.generate(titleRequest(sessionOf('plain'), [message(1, 'only')]))
    expect(registrations).toHaveLength(1)
    expect(llm.calls[0]?.config).toMatchObject({ provider: 'p1', model: 'm1' })
    expect(llm.calls[1]?.config).toMatchObject({ provider: 'p2', model: 'm2' })
  })

  it('registers no settings listener, so an emission cannot remount or dispose', async () => {
    const { ctx, registrations, listeners } = bench({ settings: { titleProvider: 'p', titleModel: 'm' } })
    await apply(ctx)
    expect(registrations).toHaveLength(1)
    expect(listeners.filter(entry => entry.event === 'model-switch/settings-update')).toEqual([])
    // A settings emission reaches no listener of this row, so the single
    // registration survives untouched.
    for (const entry of listeners) entry.listener()
    expect(registrations).toHaveLength(1)
  })
})

/** Policy keys both official auxiliary-LLM lines validate. */
const EXECUTION = Object.freeze({ maxInputBytes: 4096, maxOutputTokens: 24, timeoutMs: 3000 })

describe('splitTitlePolicy', () => {
  it('keeps execution keys and drops provider-owned targets from the shared half', () => {
    const split = splitTitlePolicy({ ...POLICY, provider: 'p', model: 'm', extra: 'ignored' })
    expect(split.execution).toEqual({ ...EXECUTION, provider: 'p', model: 'm' })
    expect(split.targets).toEqual({ targetWords: 6, targetCjkCharacters: 12 })
  })

  it('fills absent execution controls with the shipped official defaults', () => {
    expect(splitTitlePolicy({}).execution).toEqual({ maxInputBytes: 4096, maxOutputTokens: 64, timeoutMs: 60_000 })
    expect(splitTitlePolicy({}).targets).toEqual({ targetWords: 5, targetCjkCharacters: 10 })
  })

  it('ignores invalid targets instead of forwarding them', () => {
    expect(splitTitlePolicy({ targetWords: 0, targetCjkCharacters: 'x' }).targets)
      .toEqual({ targetWords: 5, targetCjkCharacters: 10 })
  })
})

describe('resolveNamingPolicy', () => {
  /** A module shaped like the pre-0.2.1 line. */
  const legacyShape = {
    resolveSessionTitleLlmConfig: (config: Record<string, unknown>) => ({ ...config }),
    generateSessionTitleWithLlm: async () => ({ title: 'x', messageSeqs: [] }),
  } as never
  /** A module shaped like the 0.2.1+ line. */
  const modernShape = {
    resolveSessionTitleLlmConfig: (config: Record<string, unknown>) => ({ ...config }),
    executeSessionTitleLlm: async () => ({ blocks: [], finish: { kind: 'stop' }, model: { provider: 'p', model: 'm' } }),
  } as never

  it('feeds the title-length targets into the pre-0.2.1 shared policy', () => {
    const policy = resolveNamingPolicy(legacyShape, { ...POLICY })
    expect(policy.config).toMatchObject({ ...EXECUTION, targetWords: 6, targetCjkCharacters: 12 })
    expect(policy.targets).toEqual({ targetWords: 6, targetCjkCharacters: 12 })
  })

  it('keeps the targets out of the 0.2.1 shared policy', () => {
    const policy = resolveNamingPolicy(modernShape, { ...POLICY })
    expect(policy.config).toEqual(EXECUTION)
    expect(policy.targets).toEqual({ targetWords: 6, targetCjkCharacters: 12 })
  })
})

describe('isModernTitleModule', () => {
  it('selects the provider-prepared line by its call entry point', () => {
    expect(isModernTitleModule({ executeSessionTitleLlm: async () => ({}) } as never)).toBe(true)
    expect(isModernTitleModule({ generateSessionTitleWithLlm: async () => ({}) } as never)).toBe(false)
    expect(isModernTitleModule({} as never)).toBe(false)
  })
})

describe('titleRouteCandidates', () => {
  const policy = { ...EXECUTION, provider: 'row', model: 'row-model' }
  const settings = {
    titleProvider: 'flat',
    titleModel: 'flat-model',
    providerGroups: { ark: { titleProvider: 'ark', titleModel: 'ark-model' } },
  } as never

  it('orders group, deployment, row, then the session route', () => {
    expect(titleRouteCandidates(settings, 'ark', policy, { provider: 'session', model: 's' })).toEqual([
      { provider: 'ark', model: 'ark-model' },
      { provider: 'flat', model: 'flat-model' },
      { provider: 'row', model: 'row-model' },
      { provider: 'session', model: 's' },
    ])
  })

  it('drops a candidate an earlier source already named', () => {
    expect(titleRouteCandidates(settings, 'ark', { ...policy, provider: 'flat', model: 'flat-model' }, undefined))
      .toEqual([{ provider: 'ark', model: 'ark-model' }, { provider: 'flat', model: 'flat-model' }])
  })

  it('returns no candidate when neither settings nor the row pin a route', () => {
    expect(titleRouteCandidates(undefined, undefined, EXECUTION, undefined)).toEqual([])
  })
})

describe('title interpretation helpers', () => {
  it('normalizes controls and whitespace exactly like the official service', () => {
    expect(normalizeTitleText('  hello\u001B[31m \u200Bworld \u001B[0m ')).toBe('hello world')
  })

  it('takes the first content line and unwraps whole-line emphasis', () => {
    expect(titleFromOutput('**Real title**\nexplanation')).toBe('Real title')
    expect(titleFromOutput('Plain title\nmore')).toBe('Plain title')
    expect(titleFromOutput('   ')).toBe('')
  })

  it('accepts only a stopped, text-only, non-empty response', () => {
    const response = (finish: string, blocks: readonly unknown[], model = { provider: 'p', model: 'm' }) => ({ finish: { kind: finish }, blocks, model }) as never
    expect(titleFromResponse(response('stop', [{ type: 'text', text: '**Bold**' }]))).toBe('Bold')
    expect(() => titleFromResponse(response('max-tokens', []))).toThrow('title output reached maxOutputTokens')
    expect(() => titleFromResponse(response('tool-calls', []))).toThrow('must contain text only')
    expect(() => titleFromResponse(response('stop', [{ type: 'tool-call' }]))).toThrow('must contain text only')
    expect(() => titleFromResponse(response('stop', [{ type: 'text', text: '  ' }]))).toThrow('produced no text')
    expect(() => titleFromResponse(response('weird', []))).toThrow('unsupported finish reason')
  })

  it('adds the current-title stability rules only when anchored', () => {
    expect(titleSystemPrompt({ targetWords: 5, targetCjkCharacters: 10 }, true)).toContain('currentTitle')
    expect(titleSystemPrompt({ targetWords: 5, targetCjkCharacters: 10 }, false)).not.toContain('currentTitle')
  })

  it('frames messages as JSON and the anchor as an update object', () => {
    const messages = [message(1, 'first')]
    expect(frameTitleInput(messages, undefined))
      .toBe('Generate the session title from this JSON array of human messages:\n[{"seq":1,"text":"first"}]')
    expect(frameTitleInput(messages, 'Existing'))
      .toBe('Update the session title from this JSON object:\n{"currentTitle":"Existing","messages":[{"seq":1,"text":"first"}]}')
  })

  it('selects the least supported reasoning effort the model declares', () => {
    expect(selectTitleReasoningEffort({ reasoning: { efforts: [{ id: 'off' }, { id: 'high' }] } })).toBe('off')
    expect(selectTitleReasoningEffort({})).toBeUndefined()
  })

  it('recognizes only a max-token failure as budget-widenable', () => {
    expect(isMaxTokensFailure(new Error('session-title-llm: title output reached maxOutputTokens'))).toBe(true)
    expect(isMaxTokensFailure(new Error('429: Requests are too frequent'))).toBe(false)
    expect(isMaxTokensFailure('max-tokens')).toBe(false)
    expect(widerTitleBudget(24)).toBe(96)
    expect(widerTitleBudget(2000)).toBe(4096)
  })

  it('stops the attempt loop for a cancelled request or an expired deadline', () => {
    const request = { signal: new AbortController().signal } as unknown as SessionTitleProviderRequest
    expect(shouldTryNextCandidate(new Error('boom'), request)).toBe(true)
    const deadline = Object.assign(new Error('timeout'), { code: 'SESSION_TITLE_TIMEOUT' })
    expect(shouldTryNextCandidate(deadline, request)).toBe(false)
    const aborted = { signal: AbortSignal.abort() } as unknown as SessionTitleProviderRequest
    expect(shouldTryNextCandidate(new Error('boom'), aborted)).toBe(false)
  })
})

describe('naming route fallback', () => {
  /** A session whose provider selects one saved group. */
  const grouped = {
    settings: {
      titleProvider: 'apigoto',
      titleModel: 'mimo',
      providerGroups: { ark: { titleProvider: 'ark', titleModel: 'ark-code' } },
    },
  }

  it('falls through to the deployment pair when the group pair fails', async () => {
    const { ctx, registrations } = bench(grouped)
    await apply(ctx)
    let call = 0
    llm.generate.impl = async () => {
      call += 1
      if (call === 1) throw new Error('429: Requests are too frequent')
      return { title: 'fallback title', messageSeqs: [1] }
    }
    const result = await registrations[0]!.generate(titleRequest(sessionOf('ark'), [message(1, 'only')]))
    expect(result).toEqual({ title: 'fallback title', messageSeqs: [1] })
    expect(llm.calls.map(entry => entry.config)).toEqual([
      { ...POLICY, provider: 'ark', model: 'ark-code' },
      { ...POLICY, provider: 'apigoto', model: 'mimo' },
    ])
  })

  it('retries the same route with a widened budget on a max-token failure', async () => {
    const { ctx, registrations } = bench()
    await apply(ctx)
    let call = 0
    llm.generate.impl = async () => {
      call += 1
      if (call === 1) throw new Error('session-title-llm: title output reached maxOutputTokens')
      return { title: 'widened title', messageSeqs: [1] }
    }
    const result = await registrations[0]!.generate(titleRequest(sessionOf(undefined), [message(1, 'only')]))
    expect(result).toEqual({ title: 'widened title', messageSeqs: [1] })
    expect(llm.calls.map(entry => entry.config.maxOutputTokens)).toEqual([24, 96])
  })

  it('reports every candidate failure when no route works', async () => {
    const { ctx, registrations, warns } = bench(grouped)
    await apply(ctx)
    llm.generate.impl = async () => { throw new Error('boom') }
    await expect(registrations[0]!.generate(titleRequest(sessionOf('ark'), [message(1, 'only')])))
      .rejects.toThrow('boom')
    expect(warns.some(line => line.includes('failed on every candidate'))).toBe(true)
    expect(warns[0]).toContain('ark/ark-code')
    expect(warns[0]).toContain('apigoto/mimo')
  })

  it('keeps a cancelled request silent instead of falling through', async () => {
    const { ctx, registrations, warns } = bench(grouped)
    await apply(ctx)
    llm.generate.impl = async () => { throw new Error('aborted') }
    const controller = new AbortController()
    controller.abort()
    await expect(registrations[0]!.generate({
      session: sessionOf('ark'),
      messages: [message(1, 'only')],
      signal: controller.signal,
    } as unknown as SessionTitleProviderRequest)).rejects.toThrow('aborted')
    expect(warns).toEqual([])
    expect(llm.calls).toHaveLength(1)
  })
})


describe('module availability', () => {
  it('reports an unavailable auxiliary package without registering', async () => {
    // The module layer is swapped for a factory that fails to evaluate,
    // reproducing a profile where the auxiliary-LLM package is not installed.
    vi.doMock('@deepseek-ai/dsh-session-title-llm', () => {
      throw new Error('auxiliary package missing')
    })
    vi.resetModules()
    try {
      const isolated = await import('../src/session-title.ts')
      const { ctx, registrations, errors } = bench()
      await isolated.apply(ctx)
      expect(registrations).toHaveLength(0)
      expect(errors.some(line => line.includes('is unavailable'))).toBe(true)
    } finally {
      vi.doUnmock('@deepseek-ai/dsh-session-title-llm')
      vi.resetModules()
    }
  })
})
