import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { Entry, Loader } from '@deepseek-ai/cordis-plugin-loader'
import type { SessionTitleProviderRequest } from '@deepseek-ai/dsh-session-title'
import {
  TITLE_CADENCES,
  apply,
  composeTitleRoute,
  forwardedConfig,
  inject,
  name,
  officialTitleEntry,
  officialTitlePackage,
  selectTitleMessages,
  titleCadence,
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
    return { title: 'generated', messageSeqs: [] }
  },
}))

beforeEach(() => {
  llm.calls.length = 0
  llm.resolve.impl = config => ({ ...config })
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
  return { ctx: ctx as unknown as Context, info, errors, registrations, listeners, settings }
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

  it('keeps the row’s own policy when the session resolves no route', async () => {
    const { ctx, registrations } = bench()
    await apply(ctx)
    await registrations[0]!.generate(titleRequest(sessionOf(undefined), [message(1, 'only')]))
    expect(llm.calls[0]?.config).toEqual(POLICY)
    expect(llm.calls[0]?.config).not.toHaveProperty('provider')
  })

  it('keeps the row’s own policy when host settings are unavailable', async () => {
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
