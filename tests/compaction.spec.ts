import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Entry, Loader } from '@deepseek-ai/cordis-plugin-loader'
import {
  apply,
  compactionRouteOf,
  composeCompactionConfig,
  forwardedConfig,
  inject,
  name,
  officialCompactionEntry,
} from '../src/compaction.ts'

/** Every engine construction, in order: the composed config each mount received. */
const mounts = vi.hoisted(() => [] as Record<string, unknown>[])

vi.mock('@deepseek-ai/dsh-compaction-basic', async () => {
  const { Service } = await import('@deepseek-ai/cordis')
  // Mirrors the real engine's failure shape: the service registers in
  // `super(...)` and config validation throws afterwards.
  class FakeCompactionEngine extends Service {
    constructor(ctx: Context, config: Record<string, unknown> = {}) {
      super(ctx, 'compaction')
      mounts.push({ ...config })
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
  const settings: Record<string, unknown> = { compactOnSwitch: true, ...options.settings }
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
})
