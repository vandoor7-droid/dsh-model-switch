import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import {
  estimatePlanExitTokens,
  planCompactRunner,
  planCompactWithEngine,
  runPlanCompaction,
  type PlanCompactEngineModule,
} from '../src/plan-compact.js'
import { isPlanCompactOutcome, planCompactDecision } from '../src/picker/plan-compact.js'
import type { ModelSwitchSettings } from '../src/host-settings.js'

const SIGNAL = new AbortController().signal

function settings(threshold: number): ModelSwitchSettings {
  return { subagentMode: 'follow-main', compactOnSwitch: true, planCompactThreshold: threshold }
}

/** Session stub whose request header presence the estimator keys off. */
function sessionBench(header?: unknown) {
  return { requestHeader: () => header } as never
}

function agentBench(header?: unknown): Agent {
  return { session: sessionBench(header ?? { config: {} }) } as unknown as Agent
}

describe('planCompactDecision', () => {
  it('maps threshold policy onto the three verdicts', () => {
    expect(planCompactDecision(0, 999_999)).toBe('disabled')
    expect(planCompactDecision(-5, 999_999)).toBe('disabled')
    expect(planCompactDecision(Number.NaN, 999_999)).toBe('disabled')
    expect(planCompactDecision(200_000, 200_001)).toBe('compact')
    expect(planCompactDecision(200_000, 200_000)).toBe('skip')
    expect(planCompactDecision(200_000, 10)).toBe('skip')
    // Unknown measurements justify neither a model call nor a block.
    expect(planCompactDecision(200_000, Number.NaN)).toBe('skip')
    expect(planCompactDecision(200_000, -1)).toBe('skip')
  })
})

describe('isPlanCompactOutcome', () => {
  it('accepts every declared status and rejects strangers', () => {
    for (const status of ['disabled', 'skipped', 'compacted', 'empty', 'error']) {
      expect(isPlanCompactOutcome({ status })).toBe(true)
    }
    expect(isPlanCompactOutcome({ status: 'later' })).toBe(false)
    expect(isPlanCompactOutcome(null)).toBe(false)
    expect(isPlanCompactOutcome('compacted')).toBe(false)
  })
})

describe('estimatePlanExitTokens', () => {
  it('takes the larger of the two envelope prices', () => {
    // canonicalHeader builds a fresh target envelope; the previous header keeps its tag.
    const meter = { measure: vi.fn((_session: unknown, header?: unknown) => ({ totalTokens: (header as { tag?: string } | undefined)?.tag === 'previous' ? 205_000 : 210_000 })) }
    const session = sessionBench({ tag: 'previous' })
    const estimate = estimatePlanExitTokens(meter as never, session as never, { provider: 'p', model: 'm' })
    expect(estimate).toBe(210_000)
    expect(meter.measure).toHaveBeenCalledTimes(2)
  })

  it('reports nothing without a prior request or when metering throws', () => {
    expect(estimatePlanExitTokens({ measure: () => ({ totalTokens: 1 }) } as never, sessionBench(undefined) as never, { provider: 'p', model: 'm' })).toBeUndefined()
    const broken = { measure: () => { throw new Error('meter offline') } }
    expect(estimatePlanExitTokens(broken as never, sessionBench({}) as never, { provider: 'p', model: 'm' })).toBeUndefined()
  })
})

describe('planCompactWithEngine', () => {
  it('maps a null reduction to empty and a result to compacted', async () => {
    const agent = agentBench()
    await expect(planCompactWithEngine({ compactIfNeeded: async () => null }, agent, SIGNAL)).resolves.toEqual({ status: 'empty' })
    await expect(planCompactWithEngine({ compactIfNeeded: async () => ({ shadowedTokenCount: 5 }) }, agent, SIGNAL)).resolves.toEqual({ status: 'compacted' })
  })

  it('classifies failures and preserves cancellation', async () => {
    const agent = agentBench()
    const failing = { compactIfNeeded: async () => { throw new Error('summary rejected') } }
    await expect(planCompactWithEngine(failing, agent, SIGNAL)).resolves.toEqual({ status: 'error', message: 'summary rejected' })

    const controller = new AbortController()
    controller.abort()
    const cancelled = { compactIfNeeded: async () => { throw new Error('aborted') } }
    await expect(planCompactWithEngine(cancelled, agent, controller.signal)).resolves.toEqual({ status: 'error', message: 'compaction was cancelled' })
  })
})

/** Fake compaction-basic module: records the route config and replays a canned result. */
function fakeEngineModule(result: () => unknown, options?: { provide?: boolean }) {
  const observed: Array<Record<string, unknown>> = []
  class FakeEngine {
    observedConfig: Record<string, unknown>
    constructor(ctx: Context, config: Record<string, unknown>) {
      this.observedConfig = config
      observed.push(config)
      if (options?.provide !== false) ctx.provide('compaction', this)
    }
    compactIfNeeded = vi.fn(async () => result())
  }
  return { module: { default: FakeEngine } as unknown as PlanCompactEngineModule, observed }
}

describe('runPlanCompaction', () => {
  it('mounts an isolated engine pinned to the switched-to route and reports compacted', async () => {
    const ctx = new Context()
    const agent = agentBench()
    const fake = fakeEngineModule(() => ({ shadowedTokenCount: 42 }))
    const outcome = await runPlanCompaction(ctx, agent, { provider: 'new-p', model: 'new-m' }, SIGNAL, async () => fake.module)
    expect(outcome).toEqual({ status: 'compacted' })
    expect(fake.observed[0]).toMatchObject({
      auto: false,
      summarizationProvider: 'new-p',
      summarizationModel: 'new-m',
      compactionRetries: 0,
    })
  })

  it('surfaces a missing engine and a failing import as explicit errors', async () => {
    const ctx = new Context()
    const agent = agentBench()
    const unmounted = fakeEngineModule(() => null, { provide: false })
    // The fake never provides `ctx.compaction`.
    await expect(runPlanCompaction(ctx, agent, { provider: 'p', model: 'm' }, SIGNAL, async () => unmounted.module))
      .resolves.toEqual({ status: 'error', message: 'private compaction engine is unavailable' })

    const broken = {
      module: undefined,
      load: async () => { throw new Error('package absent') },
    }
    await expect(runPlanCompaction(ctx, agent, { provider: 'p', model: 'm' }, SIGNAL, broken.load))
      .resolves.toEqual({ status: 'error', message: 'package absent' })
  })
})

describe('planCompactRunner', () => {
  function bench(options: { threshold: number; totalTokens?: number; agent?: Agent | null; meter?: boolean }) {
    const ctx = new Context()
    const total = options.totalTokens ?? 0
    if (options.meter !== false) ctx.provide('tokenMeter', { measure: () => ({ totalTokens: total }) } as never)
    const agent = 'agent' in options ? options.agent : agentBench()
    ctx.provide('agents', { get: () => agent ?? undefined } as never)
    const fake = fakeEngineModule(() => ({ shadowedTokenCount: 7 }))
    const runner = planCompactRunner(ctx, () => settings(options.threshold), async () => fake.module)
    return { ctx, runner, fake }
  }

  const request = { sessionId: 's1', provider: 'p2', model: 'm2' }

  it('skips disabled thresholds without resolving any agent or meter', async () => {
    const ctx = new Context()
    const fake = fakeEngineModule(() => ({ shadowedTokenCount: 7 }))
    const runner = planCompactRunner(ctx, () => settings(0), async () => fake.module)
    await expect(runner(request, SIGNAL)).resolves.toEqual({ status: 'disabled', threshold: 0 })
    expect(fake.observed).toHaveLength(0)
  })

  it('skips a context at or below the threshold', async () => {
    const { runner, fake } = bench({ threshold: 200_000, totalTokens: 120_000 })
    await expect(runner(request, SIGNAL)).resolves.toEqual({ status: 'skipped', threshold: 200_000, estimate: 120_000 })
    expect(fake.observed).toHaveLength(0)
  })

  it('compacts an over-threshold context and reports the estimate', async () => {
    const { runner, fake } = bench({ threshold: 200_000, totalTokens: 260_000 })
    await expect(runner(request, SIGNAL)).resolves.toEqual({ status: 'compacted', threshold: 200_000, estimate: 260_000 })
    expect(fake.observed).toHaveLength(1)
    // The summary is written by the switched-to route.
    expect(fake.observed[0]).toMatchObject({ summarizationProvider: 'p2', summarizationModel: 'm2' })
  })

  it('fails explicitly without an agent, a meter, or a complete route', async () => {
    const noAgent = bench({ threshold: 1, totalTokens: 10, agent: null })
    await expect(noAgent.runner(request, SIGNAL)).resolves.toMatchObject({ status: 'error', message: 'the session has no live agent' })

    const noMeter = bench({ threshold: 1, totalTokens: 10, meter: false })
    await expect(noMeter.runner(request, SIGNAL)).resolves.toMatchObject({ status: 'error', message: 'token metering is unavailable' })

    const incomplete = bench({ threshold: 1, totalTokens: 10 })
    await expect(incomplete.runner({ sessionId: 's1', provider: ' ', model: 'm2' }, SIGNAL))
      .resolves.toMatchObject({ status: 'error', message: 'the execution route is incomplete' })
  })

  it('passes a live threshold from settings on every verdict', async () => {
    const { runner } = bench({ threshold: 500, totalTokens: 400 })
    const verdict = await runner(request, SIGNAL)
    expect(verdict.threshold).toBe(500)
    expect(isPlanCompactOutcome(verdict)).toBe(true)
  })
})
