import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Entry, Loader } from '@deepseek-ai/cordis-plugin-loader'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import {
  apply,
  compactionLlm,
  compactionRouteOf,
  compactionScope,
  composeCompactionConfig,
  forwardedConfig,
  inject,
  name,
  officialCompactionEntry,
  resolveSessionCompactionRoute,
  type CompactionLlm,
} from '../src/compaction.ts'

/** Every engine construction, in order: the composed config each mount received. */
const mounts = vi.hoisted(() => [] as Record<string, unknown>[])
const seenContexts = vi.hoisted(() => [] as Context[])

vi.mock('@deepseek-ai/dsh-compaction-basic', async () => {
  const { Service } = await import('@deepseek-ai/cordis')
  // Mirrors the real engine's failure shape: the service registers in
  // `super(...)` and config validation throws afterwards.
  class FakeCompactionEngine extends Service {
    constructor(ctx: Context, config: Record<string, unknown> = {}) {
      super(ctx, 'compaction')
      mounts.push({ ...config })
      seenContexts.push(this.ctx as Context)
      if (config.summarizationProvider === 'poison') throw new Error('route rejected')
      // `auto: 'unactivated'` mirrors a fiber whose injections were never
      // satisfied: the service exists but exposes none of the engine's public
      // entry points, so the row must not record it as the live engine.
      if (config.auto === 'unactivated') Object.defineProperty(this, 'compactIfNeeded', { value: undefined })
    }
    compactIfNeeded() { return Promise.resolve(null) }
  }
  return { default: FakeCompactionEngine }
})

/** One loader row shaped like the official compaction-basic entry. */
function officialRow(config: Record<string, unknown> = { auto: false }): Record<string, unknown> {
  return { id: 'compaction-basic', options: { name: '@deepseek-ai/dsh-compaction-basic', config } }
}

/** Host-like bench: live settings and a loader tree, per test. */
function bench(options: { settings?: Record<string, unknown>; entries?: unknown[]; host?: boolean } = {}) {
  const ctx = new Context()
  mounts.length = 0
  seenContexts.length = 0
  const settings: Record<string, unknown> = { ...options.settings }
  if (options.host !== false) ctx.provide('modelSwitch', { currentSettings: () => ({ ...settings }) } as never)
  const entries = options.entries ?? [officialRow()]
  ctx.provide('loader', { entries: () => entries.values() } as never)
  return { ctx, settings }
}

describe('compaction plugin identity', () => {
  it('keeps the loader contract stable', () => {
    expect(name).toBe('model-switch-compaction')
    expect(inject).toEqual(['loader'])
  })
})

describe('compactionRouteOf', () => {
  it('pins a route only when both identifiers are present', () => {
    expect(compactionRouteOf({ compactProvider: 'deepseek', compactModel: 'deep-chat' }))
      .toEqual({ provider: 'deepseek', model: 'deep-chat' })
    expect(compactionRouteOf({ compactProvider: '  deepseek ', compactModel: 'deep-chat' }))
      .toEqual({ provider: 'deepseek', model: 'deep-chat' })
    expect(compactionRouteOf(undefined)).toBeUndefined()
    expect(compactionRouteOf({})).toBeUndefined()
    expect(compactionRouteOf({ compactProvider: 'deepseek' })).toBeUndefined()
    expect(compactionRouteOf({ compactModel: 'deep-chat' })).toBeUndefined()
    expect(compactionRouteOf({ compactProvider: '', compactModel: '' })).toBeUndefined()
    expect(compactionRouteOf({ compactProvider: '   ', compactModel: 'm' })).toBeUndefined()
  })
})

describe('composeCompactionConfig', () => {
  it('merges the resolved route over the forwarded row config', () => {
    expect(composeCompactionConfig({ auto: false }, { provider: 'p', model: 'm' }))
      .toEqual({ auto: false, summarizationProvider: 'p', summarizationModel: 'm' })
    expect(composeCompactionConfig(
      { auto: false, summarizationProvider: 'old', summarizationModel: 'om', thresholdRatio: 0.5 },
      { provider: 'p', model: 'm' },
    )).toEqual({ auto: false, summarizationProvider: 'p', summarizationModel: 'm', thresholdRatio: 0.5 })
  })

  it('copies the forwarded config detached when no route is configured', () => {
    const forwarded = { auto: true, summarizationProvider: 'kept', summarizationModel: 'km' }
    const copy = composeCompactionConfig(forwarded, undefined)
    expect(copy).toEqual(forwarded)
    expect(copy).not.toBe(forwarded)
  })
})

describe('officialCompactionEntry', () => {
  const loaderOf = (...entries: unknown[]) => ({ entries: () => entries.values() }) as unknown as Loader

  it('matches by row id or package name and tolerates a missing loader', () => {
    const byId = { id: 'compaction-basic', options: { config: {} } }
    const byName = { id: 'custom-compaction', options: { name: '@deepseek-ai/dsh-compaction-basic', config: {} } }
    expect(officialCompactionEntry(loaderOf(byId))).toBe(byId)
    expect(officialCompactionEntry(loaderOf(byName))).toBe(byName)
    expect(officialCompactionEntry(loaderOf({ id: 'web', options: { name: '@deepseek-ai/dsh-web' } }))).toBeUndefined()
    expect(officialCompactionEntry(loaderOf())).toBeUndefined()
    expect(officialCompactionEntry(undefined)).toBeUndefined()
  })
})

describe('forwardedConfig', () => {
  const entryOf = (config: unknown) => ({ id: 'compaction-basic', options: { config } }) as unknown as Entry

  it('passes object configs through and normalizes everything else to an empty object', () => {
    expect(forwardedConfig(entryOf({ auto: false, thresholdRatio: 0.5 }))).toEqual({ auto: false, thresholdRatio: 0.5 })
    expect(forwardedConfig(entryOf(undefined))).toEqual({})
    expect(forwardedConfig(entryOf('not-an-object'))).toEqual({})
    expect(forwardedConfig(entryOf([1, 2]))).toEqual({})
    expect(forwardedConfig({ id: 'x' } as unknown as Entry)).toEqual({})
  })
})

describe('apply', () => {
  it('mounts the official engine with the configured summarization route', async () => {
    const { ctx } = bench({ settings: { compactProvider: 'deepseek', compactModel: 'deep-chat' } })
    await apply(ctx)
    expect(mounts).toEqual([{ auto: false, summarizationProvider: 'deepseek', summarizationModel: 'deep-chat' }])
    expect(ctx.get('compaction', false)).toBeTruthy()
  })

  it('forwards the official row config alongside the route', async () => {
    const { ctx } = bench({
      settings: { compactProvider: 'deepseek', compactModel: 'deep-chat' },
      entries: [officialRow({ auto: false, thresholdRatio: 0.5 })],
    })
    await apply(ctx)
    expect(mounts).toEqual([{ auto: false, thresholdRatio: 0.5, summarizationProvider: 'deepseek', summarizationModel: 'deep-chat' }])
  })

  it('keeps the official inherit default when no route is configured', async () => {
    const { ctx } = bench()
    await apply(ctx)
    expect(mounts).toEqual([{ auto: false }])
    expect(ctx.get('compaction', false)).toBeTruthy()
  })

  it('ignores a half-configured route', async () => {
    const { ctx } = bench({ settings: { compactProvider: 'deepseek' } })
    await apply(ctx)
    expect(mounts).toEqual([{ auto: false }])
  })

  it('mounts the official defaults when host settings are unavailable', async () => {
    const { ctx } = bench({ host: false })
    await apply(ctx)
    expect(mounts).toEqual([{ auto: false }])
  })

  it('leaves the engine unmounted without an official compaction row', async () => {
    const { ctx } = bench({ entries: [{ id: 'web', options: { name: '@deepseek-ai/dsh-web', config: {} } }] })
    await apply(ctx)
    expect(mounts).toHaveLength(0)
    expect(ctx.get('compaction', false)).toBeUndefined()
    await ctx.emit('model-switch/settings-update')
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(mounts).toHaveLength(0)
    expect(ctx.get('compaction', false)).toBeUndefined()
  })

  it('remounts the engine when the configured route changes', async () => {
    const { ctx, settings } = bench({ settings: { compactProvider: 'p1', compactModel: 'm1' } })
    await apply(ctx)
    expect(mounts).toHaveLength(1)
    settings.compactProvider = 'p2'
    settings.compactModel = 'm2'
    await ctx.emit('model-switch/settings-update')
    await vi.waitFor(() => {
      expect(mounts).toHaveLength(2)
    })
    expect(mounts.at(1)).toEqual({ auto: false, summarizationProvider: 'p2', summarizationModel: 'm2' })
    expect(ctx.get('compaction', false)).toBeTruthy()
  })

  it('keeps the engine mounted when settings did not change', async () => {
    const { ctx } = bench({ settings: { compactProvider: 'p', compactModel: 'm' } })
    await apply(ctx)
    expect(mounts).toHaveLength(1)
    await ctx.emit('model-switch/settings-update')
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(mounts).toHaveLength(1)
    expect(ctx.get('compaction', false)).toBeTruthy()
  })

  it('leaves the engine unmounted when the configured route is rejected, then retries', async () => {
    const { ctx, settings } = bench({ settings: { compactProvider: 'poison', compactModel: 'bad' } })
    await apply(ctx)
    // Exactly one attempt: an invalid route is reported instead of being
    // silently downgraded to a config the profile never configured.
    expect(mounts).toEqual([{ auto: false, summarizationProvider: 'poison', summarizationModel: 'bad' }])
    expect(ctx.get('compaction', false)).toBeUndefined()
    settings.compactProvider = 'good'
    settings.compactModel = 'ok'
    await ctx.emit('model-switch/settings-update')
    await vi.waitFor(() => {
      expect(mounts).toHaveLength(2)
    })
    expect(mounts.at(1)).toEqual({ auto: false, summarizationProvider: 'good', summarizationModel: 'ok' })
    expect(ctx.get('compaction', false)).toBeTruthy()
  })

  it('collapses a burst of settings updates into one reconcile pass', async () => {
    const { ctx, settings } = bench({ settings: { compactProvider: 'p1', compactModel: 'm1' } })
    await apply(ctx)
    expect(mounts).toHaveLength(1)
    settings.compactProvider = 'p2'
    settings.compactModel = 'm2'
    ctx.emit('model-switch/settings-update')
    ctx.emit('model-switch/settings-update')
    ctx.emit('model-switch/settings-update')
    await vi.waitFor(() => {
      expect(mounts).toHaveLength(2)
    })
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(mounts).toHaveLength(2)
    expect(mounts.at(1)).toEqual({ auto: false, summarizationProvider: 'p2', summarizationModel: 'm2' })
    expect(ctx.get('compaction', false)).toBeTruthy()
  })

  it('unloads a mount that never activated and keeps the row retryable', async () => {
    const { ctx } = bench({ entries: [officialRow({ auto: 'unactivated' })] })
    await apply(ctx)
    expect(mounts).toHaveLength(1)
    expect(ctx.get('compaction', false)).toBeUndefined()
    await ctx.emit('model-switch/settings-update')
    await vi.waitFor(() => {
      expect(mounts.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('mounts the engine under compactionScope so the child fiber sees the per-session llm wrapper while parent ctx.llm stays untouched', async () => {
    const { ctx, settings } = bench({
      settings: {
        compactProvider: 'global-p',
        compactModel: 'global-m',
        providerGroups: {
          codex: { compactProvider: 'group-p', compactModel: 'group-m' },
        },
      },
    })
    async function* chunks(): AsyncGenerator<StreamChunk> {}
    const stream = vi.fn((_opts: GenerateOptions) => chunks())
    const resolveModelInfo = vi.fn(async (provider: string, model: string) => ({ provider, id: model }))
    const realLlm = { stream, resolveModelInfo }
    ctx.provide('llm', realLlm as never)

    const sessionState = { provider: 'codex' }
    const session = {
      id: 'session-1',
      requestContext: () => ({ provider: sessionState.provider, model: 'gpt-5' }),
      requestHeader: () => undefined,
    }
    ctx.provide('sessions', { get: (id: string) => id === 'session-1' ? session : undefined } as never)

    await apply(ctx)
    expect(ctx.llm).toBe(realLlm)
    const engineLlm = seenContexts[0]?.llm as unknown as typeof realLlm
    expect(engineLlm).toBeDefined()
    expect(engineLlm).not.toBe(realLlm)

    // `resolveModelInfo` passes through to the real service untouched.
    await expect(engineLlm.resolveModelInfo('codex', 'gpt-5')).resolves.toEqual({ provider: 'codex', id: 'gpt-5' })
    expect(resolveModelInfo).toHaveBeenCalledWith('codex', 'gpt-5')

    // A compaction summarization call mutates options in place so `summarizeWithLlm`
    // records the exact provider/model that wrote the summary in `compaction/summary`.
    const options = {
      provider: 'global-p',
      model: 'global-m',
      sessionId: 'session-1',
      purpose: 'compaction',
      messages: [],
    } as unknown as GenerateOptions
    void engineLlm.stream(options)
    expect(options.provider).toBe('group-p')
    expect(options.model).toBe('group-m')
    expect(stream).toHaveBeenLastCalledWith(expect.objectContaining({ provider: 'group-p', model: 'group-m' }))

    // Mid-session provider switch: switching the session to an ungrouped provider
    // immediately falls back to the deployment-wide pair without remounting the engine.
    sessionState.provider = 'deepseek'
    const secondOptions = {
      provider: 'codex',
      model: 'gpt-5',
      sessionId: 'session-1',
      purpose: 'compaction',
      messages: [],
    } as unknown as GenerateOptions
    void engineLlm.stream(secondOptions)
    expect(secondOptions.provider).toBe('global-p')
    expect(secondOptions.model).toBe('global-m')
    expect(mounts).toHaveLength(1)

    // Updating providerGroups in settings takes effect on the next call with zero remounts.
    settings.providerGroups = {
      deepseek: { compactProvider: 'ds-compact-p', compactModel: 'ds-compact-m' },
    }
    const thirdOptions = {
      provider: 'deepseek',
      model: 'deep-chat',
      sessionId: 'session-1',
      purpose: 'compaction',
      messages: [],
    } as unknown as GenerateOptions
    void engineLlm.stream(thirdOptions)
    expect(thirdOptions.provider).toBe('ds-compact-p')
    expect(thirdOptions.model).toBe('ds-compact-m')
    expect(mounts).toHaveLength(1)
  })
})

describe('compactionLlm & resolveSessionCompactionRoute', () => {
  async function* chunks(): AsyncGenerator<StreamChunk> {}

  it('passes non-compaction or sessionless calls through untouched', () => {
    const stream = vi.fn((_opts: GenerateOptions) => chunks())
    const resolve = vi.fn(() => ({ provider: 'group-p', model: 'group-m' }))
    const wrapped = compactionLlm({ stream } as CompactionLlm, resolve)

    const chatOpts = { provider: 'orig-p', model: 'orig-m', sessionId: 's1', messages: [] } as unknown as GenerateOptions
    void wrapped.stream(chatOpts)
    expect(resolve).not.toHaveBeenCalled()
    expect(chatOpts.provider).toBe('orig-p')

    const noSessionOpts = { provider: 'orig-p', model: 'orig-m', purpose: 'compaction', messages: [] } as unknown as GenerateOptions
    void wrapped.stream(noSessionOpts)
    expect(resolve).not.toHaveBeenCalled()
    expect(noSessionOpts.provider).toBe('orig-p')
  })

  it('copies frozen options instead of throwing and recovers when the resolver throws', () => {
    const stream = vi.fn((_opts: GenerateOptions) => chunks())
    const onError = vi.fn()
    let shouldThrow = false
    const wrapped = compactionLlm(
      { stream } as CompactionLlm,
      () => {
        if (shouldThrow) throw new Error('boom')
        return { provider: 'group-p', model: 'group-m' }
      },
      onError,
    )

    const frozen = Object.freeze({
      provider: 'orig-p',
      model: 'orig-m',
      sessionId: 's1',
      purpose: 'compaction',
      messages: [],
    }) as unknown as GenerateOptions
    void wrapped.stream(frozen)
    expect(stream).toHaveBeenLastCalledWith(expect.objectContaining({ provider: 'group-p', model: 'group-m' }))
    expect(frozen.provider).toBe('orig-p')

    shouldThrow = true
    const mutable = {
      provider: 'orig-p',
      model: 'orig-m',
      sessionId: 's1',
      purpose: 'compaction',
      messages: [],
    } as unknown as GenerateOptions
    void wrapped.stream(mutable)
    expect(onError).toHaveBeenCalledOnce()
    expect(mutable.provider).toBe('orig-p')
    expect(stream).toHaveBeenLastCalledWith(mutable)
  })

  it('prefers the pending modelSelection projection when resolving a session compaction route', () => {
    const { ctx } = bench({
      settings: {
        providerGroups: {
          codex: { compactProvider: 'codex-c', compactModel: 'gpt-c' },
          grok: { compactProvider: 'grok-c', compactModel: 'grok-m' },
        },
      },
    })
    const projection = {
      lastUsed: { provider: 'codex', model: 'gpt-5' },
      pending: { provider: 'grok', model: 'grok-4' } as { provider: string; model: string } | null,
    }
    const session = {
      id: 's1',
      requestContext: () => ({ provider: 'codex', model: 'gpt-5' }),
      requestHeader: () => undefined,
    }
    ctx.provide('sessions', { get: (id: string) => id === 's1' ? session : undefined } as never)
    ctx.provide('sessionProjections', { stateOf: () => projection } as never)

    expect(resolveSessionCompactionRoute(ctx, 's1')).toEqual({ provider: 'grok-c', model: 'grok-m' })
    projection.pending = null
    expect(resolveSessionCompactionRoute(ctx, 's1')).toEqual({ provider: 'codex-c', model: 'gpt-c' })
    expect(resolveSessionCompactionRoute(ctx, '')).toBeUndefined()
    expect(resolveSessionCompactionRoute(ctx, undefined)).toBeUndefined()
    expect(compactionScope(ctx)).toBe(ctx)
  })
})
