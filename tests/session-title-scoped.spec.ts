import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Entry } from '@deepseek-ai/cordis-plugin-loader'
import type { SessionTitleProviderRequest } from '@deepseek-ai/dsh-session-title'
import * as titleRow from '../src/session-title.ts'

/**
 * Real-Cordis scoping suite for the session-naming row.
 *
 * Unlike `session-title.spec.ts` (structural fakes), every context here is a
 * real `Context` with real service resolution: the row starts through
 * `registry.plugin`, so its declared `inject` is resolved by Cordis itself, the
 * settings service is provided by a genuine sibling fiber (the geometry the
 * loader composes on a real host), and unload/reload run through the registry.
 * The only mocked seam is the auxiliary-LLM package, which records every call.
 */

/** Every call into the official auxiliary-LLM implementation, in order. */
const llm = vi.hoisted(() => ({
  calls: [] as Array<{
    config: Record<string, unknown>
    request: unknown
    messages: readonly unknown[]
    titleProvider: string
  }>,
  /** When set, the auxiliary call waits on it before returning (in-flight test). */
  gate: undefined as Promise<void> | undefined,
}))

vi.mock('@deepseek-ai/dsh-session-title-llm', () => ({
  resolveSessionTitleLlmConfig: (config: unknown) => ({ ...(config as Record<string, unknown>) }),
  generateSessionTitleWithLlm: async (
    _ctx: unknown,
    config: Record<string, unknown>,
    request: unknown,
    messages: readonly unknown[],
    titleProvider: string,
  ) => {
    llm.calls.push({ config, request, messages, titleProvider })
    if (llm.gate !== undefined) await llm.gate
    // The legacy shared call owns the result: it echoes the framed messages it
    // carried, so the recorded seqs name exactly what was sent.
    return { title: 'generated', messageSeqs: (messages as ReadonlyArray<{ readonly seq: number }>).map(item => item.seq) }
  },
}))

const FIRST_PROMPT = '@deepseek-ai/dsh-session-title-first-prompt-llm'
const ALL_PROMPTS = '@deepseek-ai/dsh-session-title-all-prompts-llm'

/** Required policy fields the shipped row always carries; no defaults exist. */
const POLICY = Object.freeze({ targetWords: 6, targetCjkCharacters: 12, maxInputBytes: 4096, maxOutputTokens: 24, timeoutMs: 3000 })

beforeEach(() => {
  llm.calls.length = 0
  llm.gate = undefined
})

/** One loader row shaped like the shipped session-title-llm entry, disabled by the patch layer. */
function officialRow(pkg: string = FIRST_PROMPT, id: string = 'session-title-llm'): Entry & { disabled: boolean } {
  const entry = {
    id,
    options: { id, name: pkg, config: { ...POLICY } },
    disabled: true,
    async update(options: Record<string, unknown>) {
      if (options.disabled === true) entry.disabled = true
    },
  }
  return entry as unknown as Entry & { disabled: boolean }
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
 * The host-shaped composition: one real root context playing `loader.ctx`,
 * with the single-slot naming service, the loader tree, and the official `llm`
 * service provided on it. The settings row starts as a sibling plugin, exactly
 * like the `model-switch` entry on a real host.
 */
const live: Array<{ root: Context; plugins: unknown[] }> = []

function bench(options: { settings?: Record<string, unknown>; entries?: unknown[] } = {}) {
  const root = new Context()
  const record: { root: Context; plugins: unknown[] } = { root, plugins: [] }
  live.push(record)
  /** Start one plugin on this composition and remember it for afterEach. */
  const start = (plugin: unknown) => {
    record.plugins.push(plugin)
    return root.registry.plugin(plugin)
  }
  const state = { settings: { ...options.settings } }
  const registrations: RegisteredProvider[] = []
  root.provide('sessionTitle', {
    register(provider: RegisteredProvider) {
      registrations.push(provider)
      return async () => {}
    },
  })
  const entries = options.entries ?? []
  root.provide('loader', { entries: () => entries[Symbol.iterator]() } as never)
  root.provide('llm', {})
  return { root, state, registrations, start }
}

afterEach(() => {
  // Every real context is disposed after its test: sibling fibers, the row
  // fiber, and the reader's inject fiber all tear down through the registry.
  for (const { root, plugins } of live.splice(0)) {
    for (const plugin of plugins) root.registry.delete(plugin)
  }
})

/** The sibling settings row: provides `modelSwitch` from a live settings snapshot. */
function settingsRow(state: { settings: Record<string, unknown> }) {
  const plugin = {
    name: 'model-switch-test-settings',
    apply(host: Context): void {
      host.provide('modelSwitch', { currentSettings: () => ({ ...state.settings }) })
    },
  }
  return plugin
}

describe('real-Cordis scoping of the naming row', () => {
  it('declares no modelSwitch dependency, so the row can never pend on it', async () => {
    // The hard-dependency regression guard: `modelSwitch` in the inject list
    // would leave the row pending on a profile without the settings row.
    expect(titleRow.inject).toEqual(['loader', 'sessionTitle', 'llm'])
    expect(titleRow.inject).not.toContain('modelSwitch')
  })

  it('activates without the settings row and keeps official route behavior', async () => {
    const { root, registrations, start } = bench({ entries: [officialRow()] })
    const fiber = start(titleRow)
    // A pending fiber would never settle here; awaiting it is the proof.
    await fiber
    expect(fiber.state).toBe(2)
    expect(registrations).toHaveLength(1)
    const result = await registrations[0]!.generate(titleRequest(sessionOf('ark'), [message(1, 'only')]))
    expect(result).toMatchObject({ title: 'generated' })
    // No settings are reachable: the row's own policy carries no route.
    expect(llm.calls[0]?.config).toEqual(POLICY)
  })

  it('reads live settings through a real dependent scope', async () => {
    const { root, state, registrations, start } = bench({
      settings: {
        titleProvider: 'flat',
        titleModel: 'flat-model',
        providerGroups: { ark: { titleProvider: 'ark', titleModel: 'ark-code' } },
      },
    })
    const settingsFiber = start(settingsRow(state))
    await settingsFiber
    const fiber = start(titleRow)
    await fiber
    expect(fiber.state).toBe(2)
    const request = titleRequest(sessionOf('ark'), [message(1, 'only')])
    // The scoped inject binds asynchronously; the route must arrive once it settles.
    await vi.waitFor(() => {
      llm.calls.length = 0
      return registrations[0]!.generate(request).then(() => {
        expect(llm.calls[0]?.config).toMatchObject({ provider: 'ark', model: 'ark-code' })
      })
    }, { timeout: 5000 })
    // An ungrouped session resolves the deployment-wide pair.
    llm.calls.length = 0
    await registrations[0]!.generate(titleRequest(sessionOf('ungrouped'), [message(1, 'only')]))
    expect(llm.calls[0]?.config).toMatchObject({ provider: 'flat', model: 'flat-model' })
  })

  it('re-reads settings on every request without remounting the row', async () => {
    const { root, state, registrations, start } = bench({
      settings: { titleProvider: 'p1', titleModel: 'm1' },
    })
    const settingsFiber = start(settingsRow(state))
    await settingsFiber
    const fiber = start(titleRow)
    await fiber
    const request = titleRequest(sessionOf('plain'), [message(1, 'only')])
    await vi.waitFor(() => {
      llm.calls.length = 0
      return registrations[0]!.generate(request).then(() => {
        expect(llm.calls[0]?.config).toMatchObject({ provider: 'p1', model: 'm1' })
      })
    }, { timeout: 5000 })
    state.settings.titleProvider = 'p2'
    state.settings.titleModel = 'm2'
    await registrations[0]!.generate(request)
    expect(llm.calls[1]?.config).toMatchObject({ provider: 'p2', model: 'm2' })
    // No remount: one registration, same live fiber.
    expect(registrations).toHaveLength(1)
    expect(fiber.state).toBe(2)
  })

  it('falls back to official behavior when the settings service unloads', async () => {
    const { root, state, registrations, start } = bench({
      settings: { titleProvider: 'p1', titleModel: 'm1' },
    })
    const plugin = settingsRow(state)
    const settingsFiber = start(plugin)
    await settingsFiber
    const fiber = start(titleRow)
    await fiber
    const request = titleRequest(sessionOf('plain'), [message(1, 'only')])
    await vi.waitFor(() => {
      llm.calls.length = 0
      return registrations[0]!.generate(request).then(() => {
        expect(llm.calls[0]?.config).toMatchObject({ provider: 'p1', model: 'm1' })
      })
    }, { timeout: 5000 })
    // The settings row is disabled/unloaded on the real registry.
    root.registry.delete(plugin)
    // The next naming request resolves no route: official behavior, not a stale scope.
    // No row policy exists (the settings-only bench), so the shipped execution
    // defaults and targets carry the request.
    await vi.waitFor(() => {
      llm.calls.length = 0
      return registrations[0]!.generate(request).then(() => {
        expect(llm.calls[0]?.config).toEqual({
          maxInputBytes: 4096, maxOutputTokens: 64, timeoutMs: 60_000, targetWords: 5, targetCjkCharacters: 10,
        })
      })
    }, { timeout: 5000 })
    // The naming row itself never unloaded or re-registered.
    expect(registrations).toHaveLength(1)
    expect(fiber.state).toBe(2)
  })

  it('follows a rebuilt settings service without caching the old scope', async () => {
    const { root, state, registrations, start } = bench({
      settings: { titleProvider: 'old', titleModel: 'route' },
    })
    const first = settingsRow(state)
    // Keep the wrapped fiber handle (not the resolved value): the raw fiber is
    // not thenable, and the handle is what re-awaits after a dispose.
    const firstHandle = start(first)
    await firstHandle
    const fiber = start(titleRow)
    await fiber
    const request = titleRequest(sessionOf('plain'), [message(1, 'only')])
    await vi.waitFor(() => {
      llm.calls.length = 0
      return registrations[0]!.generate(request).then(() => {
        expect(llm.calls[0]?.config).toMatchObject({ provider: 'old', model: 'route' })
      })
    }, { timeout: 5000 })
    // The host rebuilds the settings service (new fiber, new settings). The old
    // fiber's unload completes before the replacement starts, so the two never
    // race over the same service registration.
    state.settings.titleProvider = 'new'
    state.settings.titleModel = 'route2'
    root.registry.delete(first)
    await firstHandle
    await start(settingsRow(state))
    await vi.waitFor(() => {
      llm.calls.length = 0
      return registrations[0]!.generate(request).then(() => {
        expect(llm.calls[0]?.config).toMatchObject({ provider: 'new', model: 'route2' })
      })
    }, { timeout: 5000 })
    expect(registrations).toHaveLength(1)
    expect(fiber.state).toBe(2)
  })

  it('cannot interrupt an in-flight naming request', async () => {
    const { root, state, registrations, start } = bench({
      settings: { titleProvider: 'p1', titleModel: 'm1' },
    })
    const plugin = settingsRow(state)
    await start(plugin)
    const fiber = start(titleRow)
    await fiber
    const request = titleRequest(sessionOf('plain'), [message(1, 'only')])
    // Warm-up: the scoped bind must have settled before the gated call starts,
    // so the in-flight route is observable as the settings pair.
    await vi.waitFor(() => {
      llm.calls.length = 0
      return registrations[0]!.generate(request).then(() => {
        expect(llm.calls[0]?.config).toMatchObject({ provider: 'p1', model: 'm1' })
      })
    }, { timeout: 5000 })
    // Only the gated call may sit in the record for the length assertions below.
    llm.calls.length = 0
    let release: (() => void) | undefined
    llm.gate = new Promise<void>(resolve => { release = resolve })
    const inFlight = registrations[0]!.generate(request)
    await vi.waitFor(() => { expect(llm.calls).toHaveLength(1) }, { timeout: 5000 })
    try {
      // The settings service goes away while the auxiliary call is running.
      root.registry.delete(plugin)
    } finally {
      // Always ungate: a leaked gate would hang unrelated tests.
      release!()
      llm.gate = undefined
    }
    await expect(inFlight).resolves.toMatchObject({ title: 'generated', messageSeqs: [1] })
    // The in-flight call kept the route it was composed with.
    expect(llm.calls[0]?.config).toMatchObject({ provider: 'p1', model: 'm1' })
    // Naming still works after the rebuild settles, on the official fallback.
    await vi.waitFor(() => {
      llm.calls.length = 0
      return registrations[0]!.generate(request).then(() => {
        expect(llm.calls[0]?.config).toEqual({
          maxInputBytes: 4096, maxOutputTokens: 64, timeoutMs: 60_000, targetWords: 5, targetCjkCharacters: 10,
        })
      })
    }, { timeout: 5000 })
    expect(registrations).toHaveLength(1)
    expect(fiber.state).toBe(2)
  })
})

describe('cadence authority on a real loader tree', () => {
  it('mirrors the first-prompt row the patch disables', async () => {
    const { root, registrations, start } = bench({ entries: [officialRow()] })
    const fiber = start(titleRow)
    await fiber
    expect(registrations[0]).toMatchObject({ id: 'session-title-first-prompt-llm', automatic: 'first-prompt' })
  })

  it('keeps the all-prompts cadence when the experimental bundle row is composed', async () => {
    // A user who enabled the all-prompts bundle must not be downgraded to the
    // first-prompt default just because the row is disabled by the patch layer.
    const { root, registrations, start } = bench({
      entries: [officialRow(), officialRow(ALL_PROMPTS, 'optional-session-title-all-prompts')],
    })
    const fiber = start(titleRow)
    await fiber
    expect(registrations[0]).toMatchObject({ id: 'session-title-all-prompts-llm', automatic: 'all-prompts' })
  })

  it('forwards every message under the all-prompts cadence and anchors provider titles', async () => {
    const { root, registrations, start } = bench({
      entries: [officialRow(ALL_PROMPTS, 'optional-session-title-all-prompts')],
    })
    const fiber = start(titleRow)
    await fiber
    const anchored = {
      session: sessionOf(undefined),
      messages: [message(1, 'first'), message(2, 'second')],
      currentTitle: { title: 'Existing', messageSeqs: [1], source: { kind: 'provider' } },
      signal: new AbortController().signal,
    } as unknown as SessionTitleProviderRequest
    const result = await registrations[0]!.generate(anchored)
    expect(result).toMatchObject({ messageSeqs: [1, 2] })
    expect(llm.calls[0]?.titleProvider).toBe('session-title-all-prompts-llm')
    // Every human message of the revision is framed, not just the first.
    expect(llm.calls[0]?.messages).toEqual([message(1, 'first'), message(2, 'second')])
  })

  it('uses the shipped first-prompt default when no official row is instantiated', async () => {
    const { root, registrations, start } = bench({ entries: [] })
    const fiber = start(titleRow)
    await fiber
    expect(registrations[0]).toMatchObject({ id: 'session-title-first-prompt-llm', automatic: 'first-prompt' })
  })
})
