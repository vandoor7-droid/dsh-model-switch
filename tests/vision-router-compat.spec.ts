import { afterEach, describe, expect, it, vi } from 'vitest'
import { installVisionRouterCompat, visionRouterCompatStatus } from '../src/vision-router-compat.js'
import { isVisionRouterRow, normalizeVisionProviderEntries, planVisionProviders, visionRouterRows } from '../src/vision-router-route.js'
import { deploymentDefaultProviderOf } from '../src/prime-memory-route.js'
import { visionRouteOf, type RouteBearingSettings } from '../src/session-route.js'

/** The backend chain a desktop-like deployment carries before any takeover. */
const userChain = [
  { provider: 'yijia925', model: 'glm-5.3-flash', fallbacks: [] as readonly string[] },
  { provider: 'vision-http', model: 'ovh/Qwen3.5-397B-A17B', fallbacks: [] as readonly string[] },
]

describe('planVisionProviders', () => {
  it('keeps the chain untouched without a complete route', () => {
    expect(planVisionProviders(userChain, undefined)).toMatchObject({ changed: false, skipped: 'no-route' })
    expect(planVisionProviders(userChain, { provider: 'apigoto', model: ' ' })).toMatchObject({ changed: false, skipped: 'no-route' })
  })

  it('leaves a chain whose head already carries the route', () => {
    const plan = planVisionProviders(userChain, { provider: 'yijia925', model: 'glm-5.3-flash' })
    expect(plan).toMatchObject({ changed: false, route: 'yijia925/glm-5.3-flash' })
    expect(plan.providers).toEqual(userChain)
  })

  it('prepends the wanted pair and keeps the user chain as fallbacks', () => {
    const plan = planVisionProviders(userChain, { provider: 'apigoto', model: 'mimo-v2.6-flash' })
    expect(plan.changed).toBe(true)
    expect(plan.route).toBe('apigoto/mimo-v2.6-flash')
    expect(plan.providers).toEqual([{ provider: 'apigoto', model: 'mimo-v2.6-flash', fallbacks: [] }, ...userChain])
  })

  it('replaces its own adopted entry instead of accumulating', () => {
    const adopted = 'apigoto/mimo-v2.6-flash'
    const current = [{ provider: 'apigoto', model: 'mimo-v2.6-flash', fallbacks: [] as readonly string[] }, ...userChain]
    const plan = planVisionProviders(current, { provider: 'xiaomi', model: 'mimo-v2-pro' }, adopted)
    expect(plan.providers).toEqual([{ provider: 'xiaomi', model: 'mimo-v2-pro', fallbacks: [] }, ...userChain])
  })

  it('drops duplicates of the wanted pair from the fallback rows', () => {
    const plan = planVisionProviders([...userChain, { provider: 'apigoto', model: 'mimo-v2.6-flash', fallbacks: [] as readonly string[] }], { provider: 'apigoto', model: 'mimo-v2.6-flash' })
    expect(plan.providers).toEqual([{ provider: 'apigoto', model: 'mimo-v2.6-flash', fallbacks: [] }, ...userChain])
  })

  it('drops invalid rows and caps the chain at the plugin row limit', () => {
    expect(normalizeVisionProviderEntries(undefined)).toEqual([])
    expect(normalizeVisionProviderEntries(['junk', null, { provider: '', model: 'x' }, { provider: 'a', model: 'b' }])).toEqual([{ provider: 'a', model: 'b', fallbacks: [] }])
    const many = Array.from({ length: 40 }, (_, index) => ({ provider: 'p' + index, model: 'm' + index }))
    expect(normalizeVisionProviderEntries(many)).toHaveLength(32)
  })
})

describe('isVisionRouterRow', () => {
  it('matches by package name first, then by row id', () => {
    expect(isVisionRouterRow({ options: { id: 'anything', name: 'dsh-vision-router' } })).toBe(true)
    expect(isVisionRouterRow({ options: { id: 'vision-router' } })).toBe(true)
    expect(isVisionRouterRow({ options: { id: 'vision-router', name: 'other-package' } })).toBe(false)
    expect(isVisionRouterRow(undefined)).toBe(false)
  })

  it('collects the matching rows in loader order', () => {
    const rows = visionRouterRows([
      { options: { id: 'web' } },
      { options: { id: 'vision-router', name: 'dsh-vision-router' } },
      { options: { id: 'clone', name: 'dsh-vision-router' } },
    ])
    expect(rows).toHaveLength(2)
  })
})

describe('deploymentDefaultProviderOf', () => {
  it('reads the agent-default-model row and strips a vision twin suffix', () => {
    const loader = { entries: () => [{ options: { id: 'other' } }, { options: { id: 'agent-default-model', config: { provider: 'yijia925-vision', model: 'glm-5.3' } } }] }
    expect(deploymentDefaultProviderOf(loader)).toBe('yijia925')
  })

  it('keeps a base provider and returns undefined without the row', () => {
    expect(deploymentDefaultProviderOf({ entries: () => [{ options: { id: 'agent-default-model', config: { provider: 'apigoto' } } }] })).toBe('apigoto')
    expect(deploymentDefaultProviderOf({ entries: () => [{ options: { id: 'agent-default-model' } }] })).toBeUndefined()
    expect(deploymentDefaultProviderOf(undefined)).toBeUndefined()
  })
})

describe('visionRouteOf', () => {
  const settings: RouteBearingSettings = {
    visionProvider: 'deepseek-account',
    visionModel: 'deepseek-flash',
    providerGroups: { apigoto: { visionProvider: 'apigoto', visionModel: 'mimo-v2.6-flash' } },
  }

  it('uses the group of the deployment default provider', () => {
    expect(visionRouteOf(settings, 'apigoto')).toEqual({ provider: 'apigoto', model: 'mimo-v2.6-flash' })
  })

  it('falls back to the flat vision pair', () => {
    expect(visionRouteOf(settings, 'ark')).toEqual({ provider: 'deepseek-account', model: 'deepseek-flash' })
    expect(visionRouteOf(settings, undefined)).toEqual({ provider: 'deepseek-account', model: 'deepseek-flash' })
  })

  it('resolves nothing when neither layer is set', () => {
    expect(visionRouteOf({}, 'apigoto')).toBeUndefined()
  })
})

describe('adapter writes', () => {
  afterEach(() => {
    visionRouterCompatStatus.installed = false
    visionRouterCompatStatus.replays = 0
    delete visionRouterCompatStatus.route
    delete visionRouterCompatStatus.routeSkipped
  })

  /** A host that exposes only the ConfigEditor seam and a vision-router row. */
  function host(config: { value: Record<string, unknown> }, options?: { ignoreEdits?: boolean }) {
    const edits: Array<Record<string, unknown>> = []
    const entry = { options: { id: 'vision-router', name: 'dsh-vision-router', config: config.value } }
    const editor = {
      // A method that reads its receiver, like the class-backed real service:
      // extracting it without .bind would throw here, not silently pass.
      receiver: 'configEditor',
      entries: () => [entry],
      edit: async function (this: { receiver: string }, _target: unknown, change: (current: Record<string, unknown>) => Record<string, unknown>) {
        if (this?.receiver !== 'configEditor') throw new Error('edit called without its ConfigEditor receiver')
        if (options?.ignoreEdits === true) return
        const next = change(structuredClone(config.value))
        edits.push(next)
        config.value = next
        ;(entry.options as { config: unknown }).config = next
      },
    }
    const ctx = {
      get: (name: string): unknown => (name === 'configEditor' ? editor : undefined),
      logger: { info: vi.fn(), warn: vi.fn() },
      on: (): (() => void) => () => {},
    }
    return { ctx, edits }
  }

  it('installs the configured pair as the chain head through configEditor.edit', async () => {
    const shared = host({ value: { routingMode: 'ordered', providers: [...userChain] } })
    installVisionRouterCompat(shared.ctx as never, () => ({ provider: 'apigoto', model: 'mimo-v2.6-flash' }))
    await vi.waitFor(() => expect(shared.edits).toHaveLength(1))
    const written = shared.edits[0] as { providers: unknown[]; routingMode: unknown }
    // Only the providers key changes; the row keeps every other field it had.
    expect(written.routingMode).toBe('ordered')
    expect(written.providers).toEqual([{ provider: 'apigoto', model: 'mimo-v2.6-flash', fallbacks: [] }, ...userChain])
    expect(visionRouterCompatStatus.installed).toBe(true)
    expect(visionRouterCompatStatus.route).toBe('apigoto/mimo-v2.6-flash')
  })

  it('does not rewrite a chain whose head already matches', async () => {
    const shared = host({ value: { providers: [{ provider: 'apigoto', model: 'mimo-v2.6-flash', fallbacks: [] }, ...userChain] } })
    installVisionRouterCompat(shared.ctx as never, () => ({ provider: 'apigoto', model: 'mimo-v2.6-flash' }))
    await new Promise(resolve => setTimeout(resolve, 60))
    expect(shared.edits).toHaveLength(0)
    expect(visionRouterCompatStatus.installed).toBe(true)
  })

  it('replaces its own earlier entry when the route changes', async () => {
    const shared = host({ value: { providers: [...userChain] } })
    let route = { provider: 'apigoto', model: 'mimo-v2.6-flash' }
    const adapter = installVisionRouterCompat(shared.ctx as never, () => route)
    await vi.waitFor(() => expect(shared.edits).toHaveLength(1))
    route = { provider: 'xiaomi', model: 'mimo-v2-pro' }
    adapter.replay()
    await vi.waitFor(() => expect(shared.edits).toHaveLength(2))
    const written = shared.edits[1] as { providers: unknown[] }
    // The earlier adopted head is replaced in place; the user chain survives below.
    expect(written.providers).toEqual([{ provider: 'xiaomi', model: 'mimo-v2-pro', fallbacks: [] }, ...userChain])
    expect(visionRouterCompatStatus.route).toBe('xiaomi/mimo-v2-pro')
  })

  it('leaves the chain alone when this plugin has no route', async () => {
    const shared = host({ value: { providers: [...userChain] } })
    installVisionRouterCompat(shared.ctx as never, () => undefined)
    await new Promise(resolve => setTimeout(resolve, 60))
    expect(shared.edits).toHaveLength(0)
    expect(visionRouterCompatStatus.routeSkipped).toBe('no-route')
  })

  it('reports no-row when the vision plugin is not composed', async () => {
    const ctx = {
      get: (name: string): unknown => (name === 'configEditor' ? { entries: () => [], edit: vi.fn() } : undefined),
      logger: { info: vi.fn(), warn: vi.fn() },
      on: (): (() => void) => () => {},
    }
    installVisionRouterCompat(ctx as never, () => ({ provider: 'apigoto', model: 'mimo-v2.6-flash' }))
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(visionRouterCompatStatus.routeSkipped).toBe('no-row')
    expect(visionRouterCompatStatus.installed).toBe(false)
  })

  it('reports no-seam without the configEditor service', async () => {
    const ctx = {
      get: (): undefined => undefined,
      logger: { info: vi.fn(), warn: vi.fn() },
      on: (): (() => void) => () => {},
    }
    installVisionRouterCompat(ctx as never, () => ({ provider: 'apigoto', model: 'mimo-v2.6-flash' }))
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(visionRouterCompatStatus.routeSkipped).toBe('no-seam')
  })

  it('marks the write rejected when the running row never shows it', async () => {
    const shared = host({ value: { providers: [...userChain] } }, { ignoreEdits: true })
    installVisionRouterCompat(shared.ctx as never, () => ({ provider: 'apigoto', model: 'mimo-v2.6-flash' }))
    await vi.waitFor(() => expect(visionRouterCompatStatus.routeSkipped).toBe('rejected'))
    expect(visionRouterCompatStatus.installed).toBe(false)
  })
})
