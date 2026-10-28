import { afterEach, describe, expect, it, vi } from 'vitest'
import { memoryLiveMatchesRoute, planPrimeMemoryRoute, pushMemoryRoute } from '../src/prime-memory-compat.js'
import { memoryRouteOf, type RouteBearingSettings } from '../src/session-route.js'

/** The row config dsh-prime-memory ships with when it follows its own default. */
const following = { family: 'auto', llm: { mode: 'reuse', fallbacks: [] } }

describe('planPrimeMemoryRoute', () => {
  it('fills an empty route with this plugin route', () => {
    const plan = planPrimeMemoryRoute(following, { provider: 'apigoto', model: 'mimo-v2.6-flash' })
    expect(plan.changed).toBe(true)
    expect(plan.route).toBe('apigoto/mimo-v2.6-flash')
    expect((plan.config.llm as Record<string, unknown>).provider).toBe('apigoto')
  })

  it('never overwrites a route the user set', () => {
    const user = { llm: { provider: 'ark', model: 'ark-code-latest' } }
    const plan = planPrimeMemoryRoute(user, { provider: 'apigoto', model: 'mimo-v2.6-flash' })
    expect(plan).toMatchObject({ changed: false, skipped: 'user-set' })
    expect(plan.config).toBe(user)
  })

  it('treats half a user route as user intent', () => {
    const plan = planPrimeMemoryRoute({ llm: { provider: 'ark' } }, { provider: 'apigoto', model: 'x' })
    expect(plan.skipped).toBe('user-set')
  })

  it('rewrites the value it wrote on an earlier pass', () => {
    const adopted = 'apigoto/mimo-v2.6-flash'
    const mine = { llm: { provider: 'apigoto', model: 'mimo-v2.6-flash' } }
    const plan = planPrimeMemoryRoute(mine, { provider: 'deepseek-account', model: 'deepseek-flash' }, adopted)
    expect(plan).toMatchObject({ changed: true, route: 'deepseek-account/deepseek-flash' })
  })

  it('stays out when this plugin has no complete route', () => {
    expect(planPrimeMemoryRoute(following, undefined).skipped).toBe('no-route')
    expect(planPrimeMemoryRoute(following, { provider: 'apigoto', model: ' ' }).skipped).toBe('no-route')
  })

  it('does not touch a config that is not a record', () => {
    expect(planPrimeMemoryRoute(undefined, { provider: 'a', model: 'b' })).toMatchObject({ changed: false, skipped: 'no-route' })
  })

  it('keeps the rest of the config intact', () => {
    const plan = planPrimeMemoryRoute({ family: 'work', llm: { mode: 'reuse', fallbacks: [{ provider: 'x', model: 'y' }] } }, { provider: 'a', model: 'b' })
    const llm = plan.config.llm as Record<string, unknown>
    expect(plan.config.family).toBe('work')
    expect(llm.mode).toBe('reuse')
    expect(llm.fallbacks).toHaveLength(1)
  })
})

describe('memoryRouteOf', () => {
  const settings: RouteBearingSettings = {
    memoryProvider: 'deepseek-account',
    memoryModel: 'deepseek-flash',
    providerGroups: { apigoto: { memoryProvider: 'apigoto', memoryModel: 'mimo-v2.6-flash' } },
  }

  it('uses the group of the deployment default provider', () => {
    expect(memoryRouteOf(settings, 'apigoto')).toEqual({ provider: 'apigoto', model: 'mimo-v2.6-flash' })
  })

  it('falls back to the flat memory pair', () => {
    expect(memoryRouteOf(settings, 'ark')).toEqual({ provider: 'deepseek-account', model: 'deepseek-flash' })
    expect(memoryRouteOf(settings, undefined)).toEqual({ provider: 'deepseek-account', model: 'deepseek-flash' })
  })

  it('resolves nothing when neither layer is set', () => {
    expect(memoryRouteOf({}, 'apigoto')).toBeUndefined()
  })
})

describe('pushMemoryRoute payload', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('sends the legacy pair with an empty chain and the per-layer chains', async () => {
    const bodies: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: { body?: string }) => {
      bodies.push(String(init?.body ?? ''))
      return { ok: true, status: 200 } as unknown as Response
    }))
    const outcome = await pushMemoryRoute({ get: () => ({ port: 4321 }) } as never, { provider: 'apigoto', model: 'probe-memory' })
    expect(outcome).toBe('pushed')
    const body = JSON.parse(bodies[0]!) as Record<string, unknown>
    // A non-empty chain plus a static pin is the combination that cancels itself
    // out in effectiveCfg, so the chain must stay empty and the pair carries it.
    expect(body.distillChain).toEqual([])
    expect(body.distillProvider).toBe('apigoto')
    expect(body.distillModel).toBe('probe-memory')
    expect(body.distillLayerChains).toEqual({
      l1: [{ provider: 'apigoto', model: 'probe-memory' }],
      l2: [{ provider: 'apigoto', model: 'probe-memory' }],
      l3: [{ provider: 'apigoto', model: 'probe-memory' }],
    })
  })

  it('reports an absent endpoint instead of pretending to push', async () => {
    const outcome = await pushMemoryRoute({ get: () => ({}) } as never, { provider: 'a', model: 'b' })
    expect(outcome).toBe('absent')
  })
})

describe('memoryLiveMatchesRoute', () => {
  const layer = { provider: 'apigoto', model: 'mimo-v2.6-flash' }
  const live = {
    distillProvider: 'apigoto',
    distillModel: 'mimo-v2.6-flash',
    distillChain: [],
    distillLayerChains: { l1: [layer], l2: [layer], l3: [layer] },
  }

  it('matches a live section that already carries the route', () => {
    expect(memoryLiveMatchesRoute(live, 'apigoto', 'mimo-v2.6-flash')).toBe(true)
  })

  it('rejects a different provider or model', () => {
    expect(memoryLiveMatchesRoute(live, 'probe', 'mimo-v2.6-flash')).toBe(false)
    expect(memoryLiveMatchesRoute(live, 'apigoto', 'gpt-6-luna')).toBe(false)
  })

  it('rejects a non-empty distillChain', () => {
    expect(memoryLiveMatchesRoute({ ...live, distillChain: [layer] }, 'apigoto', 'mimo-v2.6-flash')).toBe(false)
  })

  it('rejects missing or partial layer chains', () => {
    expect(memoryLiveMatchesRoute({ ...live, distillLayerChains: undefined }, 'apigoto', 'mimo-v2.6-flash')).toBe(false)
    expect(memoryLiveMatchesRoute({ ...live, distillLayerChains: { l1: [layer], l2: [layer] } }, 'apigoto', 'mimo-v2.6-flash')).toBe(false)
  })

  it('rejects non-object values', () => {
    expect(memoryLiveMatchesRoute(undefined, 'apigoto', 'mimo-v2.6-flash')).toBe(false)
    expect(memoryLiveMatchesRoute('nope', 'apigoto', 'mimo-v2.6-flash')).toBe(false)
  })
})
