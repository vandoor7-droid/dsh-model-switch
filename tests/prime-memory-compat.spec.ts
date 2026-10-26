import { describe, expect, it } from 'vitest'
import { planPrimeMemoryRoute } from '../src/prime-memory-compat.js'
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
