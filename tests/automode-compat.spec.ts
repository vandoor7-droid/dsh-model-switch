import { describe, expect, it, vi } from 'vitest'
import {
  AUTOMODE_PACKAGE,
  automodeCompatStatus,
  automodeCompatView,
  describeAutomodePlan,
  installAutomodeCompat,
  isAutomodeEntry,
  planAutomodeCompat,
} from '../src/automode-compat.ts'
import type { ModelSwitchSettings } from '../src/host-settings.ts'

const ROUTE = { provider: 'apigoto', model: 'mimo-v2.6-flash' }

/** Minimal settings object for the adapter (only the Auto-review fields are read). */
function settings(patch: Partial<ModelSwitchSettings> = {}): ModelSwitchSettings {
  return {
    autoReviewProvider: 'apigoto',
    autoReviewModel: 'mimo-v2.6-flash',
    autoReviewSkipReadOnly: true,
    autoReviewAllowlist: ['read', 'grep'],
    ...patch,
  } as ModelSwitchSettings
}

describe('automode row adapter', () => {
  it('fills an empty classifier route from the Model Switch route', () => {
    const plan = planAutomodeCompat({ classifier: { provider: '', model: '', maxTokens: 2048 }, failClosed: true }, ROUTE, [])
    expect(plan.changed).toBe(true)
    expect(plan.config.classifier).toEqual({ provider: 'apigoto', model: 'mimo-v2.6-flash', maxTokens: 2048 })
    expect(plan.applied.route).toBe('apigoto/mimo-v2.6-flash')
    expect(plan.config.failClosed).toBe(true)
  })

  it('never overrides a route the row already declares', () => {
    const plan = planAutomodeCompat({ classifier: { provider: 'ark', model: 'ark-code-latest' } }, ROUTE, [])
    expect(plan.changed).toBe(false)
    expect(plan.applied.routeSkipped).toBe('user-set')
    expect(plan.config.classifier).toEqual({ provider: 'ark', model: 'ark-code-latest' })
  })

  it('treats a half-configured route as user intent', () => {
    const plan = planAutomodeCompat({ classifier: { provider: 'ark', model: '' } }, ROUTE, [])
    expect(plan.changed).toBe(false)
    expect(plan.applied.routeSkipped).toBe('user-set')
  })

  it('reports a missing route instead of writing a partial one', () => {
    const plan = planAutomodeCompat({ classifier: {} }, { provider: 'apigoto', model: '' }, [])
    expect(plan.changed).toBe(false)
    expect(plan.applied.routeSkipped).toBe('no-route')
  })

  it('unions the read-only list and keeps the row order first', () => {
    const plan = planAutomodeCompat({ readOnlyTools: ['list', 'read'] }, ROUTE, ['read', 'grep', 'glob'])
    expect(plan.config.readOnlyTools).toEqual(['list', 'read', 'grep', 'glob'])
    expect(plan.applied.added).toEqual(['grep', 'glob'])
  })

  it('reports pattern entries it cannot transfer', () => {
    const plan = planAutomodeCompat({}, ROUTE, ['read', 'sessions_list__*'])
    expect(plan.config.readOnlyTools).toEqual(['read'])
    expect(plan.applied.skipped).toEqual(['sessions_list__*'])
  })

  it('leaves a non-object config alone', () => {
    const plan = planAutomodeCompat(undefined, ROUTE, ['read'])
    expect(plan.changed).toBe(false)
    expect(plan.config).toEqual({})
  })

  it('identifies the row by package name only', () => {
    expect(isAutomodeEntry({ options: { name: AUTOMODE_PACKAGE } })).toBe(true)
    expect(isAutomodeEntry({ options: { name: `${AUTOMODE_PACKAGE}-extra` } })).toBe(false)
    expect(isAutomodeEntry({ options: {} })).toBe(false)
    expect(isAutomodeEntry(undefined)).toBe(false)
  })

  it('describes what it applied', () => {
    expect(describeAutomodePlan(planAutomodeCompat({}, ROUTE, ['read', 'x__*']))).toBe('route apigoto/mimo-v2.6-flash, +1 read-only tools, 1 pattern entries skipped')
  })
})

describe('installAutomodeCompat', () => {
  interface FakeEntry {
    options: { name?: string; config?: Record<string, unknown>; id?: string }
    update: ReturnType<typeof vi.fn>
  }

  const entryOf = (config: Record<string, unknown>, name = AUTOMODE_PACKAGE): FakeEntry => ({
    options: { id: 'auto-mode', name, config },
    update: vi.fn(),
  })

  const contextOf = () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    on: vi.fn(() => () => {}),
  })

  const loaderOf = (entries: FakeEntry[]) => ({ entries: () => entries })

  it('rewrites a live row in memory and never persists it', () => {
    const row = entryOf({ classifier: { provider: '', model: '' } })
    const ctx = contextOf()
    installAutomodeCompat(ctx as never, loaderOf([row]) as never, () => settings())
    expect(row.options.config?.classifier).toEqual({ provider: 'apigoto', model: 'mimo-v2.6-flash' })
    expect(row.options.config?.readOnlyTools).toEqual(['read', 'grep'])
    expect(row.update).not.toHaveBeenCalled()
    expect(ctx.logger.info).toHaveBeenCalledWith('model-switch: adapted dsh-automode (route apigoto/mimo-v2.6-flash, +2 read-only tools)')
  })

  it('leaves the read-only list alone while the skip switch is off', () => {
    const row = entryOf({ readOnlyTools: ['list'] })
    installAutomodeCompat(contextOf() as never, loaderOf([row]) as never, () => settings({ autoReviewSkipReadOnly: false }))
    expect(row.options.config?.readOnlyTools).toEqual(['list'])
    expect(row.options.config?.classifier).toEqual({ provider: 'apigoto', model: 'mimo-v2.6-flash' })
  })

  it('ignores rows that are not the automode package', () => {
    const other = entryOf({ classifier: {} }, 'dsh-something-else')
    installAutomodeCompat(contextOf() as never, loaderOf([other]) as never, () => settings())
    expect(other.options.config).toEqual({ classifier: {} })
  })

  it('re-applies after a settings change', () => {
    const row = entryOf({ classifier: { provider: '', model: '' } })
    let current = settings()
    const adapter = installAutomodeCompat(contextOf() as never, loaderOf([row]) as never, () => current)
    expect(row.options.config?.classifier).toMatchObject({ model: 'mimo-v2.6-flash' })
    current = settings({ autoReviewModel: 'deepseek-flash' })
    expect(adapter.replay()).toBe(true)
    expect(row.options.config?.classifier).toMatchObject({ provider: 'apigoto', model: 'deepseek-flash' })
    expect(row.update).not.toHaveBeenCalled()
  })

  it('survives a loader that exposes no entries', () => {
    expect(() => installAutomodeCompat(contextOf() as never, {} as never, () => settings())).not.toThrow()
    expect(() => installAutomodeCompat(contextOf() as never, undefined, () => settings())).not.toThrow()
  })

  it('reports a view only when a row was seen', () => {
    const row = entryOf({ classifier: { provider: '', model: '' } })
    installAutomodeCompat(contextOf() as never, loaderOf([row]) as never, () => settings())
    const view = automodeCompatView()
    expect(view?.installed).toBe(true)
    expect(view?.route).toBe('apigoto/mimo-v2.6-flash')
    expect(automodeCompatStatus.added.length).toBeGreaterThan(0)
  })

  /** A row whose fiber is settled and reloadable. */
  const liveEntry = (config: Record<string, unknown>): FakeEntry & { fiber: { state: number; update: ReturnType<typeof vi.fn>; await: () => Promise<void> } } => ({
    ...entryOf(config),
    fiber: { state: 2, update: vi.fn(), await: () => Promise.resolve() },
  })

  /** Let the fire-and-forget reload settle. */
  const settle = () => new Promise<void>(resolve => { setTimeout(resolve, 0) })

  it('does not reload a row on the mount sweep (it is about to start anyway)', () => {
    const row = liveEntry({ classifier: { provider: '', model: '' } })
    installAutomodeCompat(contextOf() as never, loaderOf([row]) as never, () => settings())
    expect(row.fiber.update).not.toHaveBeenCalled()
  })

  it('reloads the live row when a settings change moves the route', async () => {
    const row = liveEntry({ classifier: { provider: '', model: '' } })
    let current = settings()
    const adapter = installAutomodeCompat(contextOf() as never, loaderOf([row]) as never, () => current)
    current = settings({ autoReviewModel: 'deepseek-flash' })
    expect(adapter.replay()).toBe(true)
    await settle()
    expect(row.fiber.update).toHaveBeenCalledOnce()
    expect(row.fiber.update.mock.calls[0]?.[1]).toBe(true)
    expect((row.fiber.update.mock.calls[0]?.[0] as { classifier: unknown }).classifier).toMatchObject({
      provider: 'apigoto',
      model: 'deepseek-flash',
    })
    expect(automodeCompatStatus.hot).toBe('applied')
  })

  it('does not reload again when the route already matches', async () => {
    const row = liveEntry({ classifier: { provider: '', model: '' } })
    let current = settings()
    const adapter = installAutomodeCompat(contextOf() as never, loaderOf([row]) as never, () => current)
    current = settings({ autoReviewModel: 'deepseek-flash' })
    adapter.replay()
    await settle()
    expect(row.fiber.update).toHaveBeenCalledOnce()
    // The reload re-runs the patch-context waterfall and the replay; neither may
    // start a second restart loop.
    adapter.replay()
    await settle()
    expect(row.fiber.update).toHaveBeenCalledOnce()
  })

  it('reports restart-required when the reload fails', async () => {
    const row = liveEntry({ classifier: { provider: '', model: '' } })
    row.fiber.update = vi.fn(() => { throw new Error('vetoed') })
    let current = settings()
    const adapter = installAutomodeCompat(contextOf() as never, loaderOf([row]) as never, () => current)
    current = settings({ autoReviewModel: 'deepseek-flash' })
    adapter.replay()
    await settle()
    expect(automodeCompatStatus.hot).toBe('restart-required')
    expect(automodeCompatStatus.hotReason).toBe('vetoed')
  })
})
