import { AsyncLocalStorage } from 'node:async_hooks'
import { describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { Session } from '@deepseek-ai/dsh-session'
import {
  apply,
  autoReviewGate,
  autoReviewRouteOf,
  autoReviewStatus,
  bindAutoReviewSessionCorrelation,
  defensivePermissionPresets,
  inject,
  installToolCallSafetyNet,
  isReviewerInfrastructureFailure,
  name,
  resolveSessionAutoReviewRoute,
  reviewLlm,
  reviewScope,
  type ReviewLlm,
} from '../src/auto-review.ts'
import { installAutoReviewTakeover } from '../src/auto-review-takeover.ts'

const BUNDLE = '@deepseek-ai/dsh-experimental-auto-review'

// The official bundle is a real dynamic import (not mocked), so a loaded
// full-suite run can spend seconds in module resolution before the first
// assertion; the default 5s per-test timeout is too tight for that.
vi.setConfig({ testTimeout: 30_000 })

function routeOptions(provider: string, model: string): GenerateOptions {
  return { provider, model, system: 'policy', messages: [{ role: 'user', content: 'x' }] } as unknown as GenerateOptions
}

async function* chunks(): AsyncGenerator<StreamChunk> {
  /* empty review stream; tests only observe the route fields */
}

/** Host-like bench: the services the official gate and our scope resolve. */
function bench(options: { startedBundles?: string[] | undefined; auto?: boolean; settings?: Record<string, unknown> } = {}) {
  const ctx = new Context()
  const stream = vi.fn(() => chunks())
  const registerAuto = options.auto === true
    ? vi.fn(() => { throw new Error(`permission: "${'auto'}" is already registered`) })
    : vi.fn(() => () => undefined)
  const currentSettings = vi.fn(() => ({ ...options.settings }))
  ctx.provide('modelSwitch', { currentSettings } as never)
  ctx.provide('llm', { stream } as never)
  ctx.provide('permissionPresets', { registerAuto, current: () => 'safe', set: vi.fn() } as never)
  ctx.provide('approval', { overrideOf: () => 'never' } as never)
  ctx.provide('sessions', { list: () => [] } as never)
  ctx.provide('tools', {} as never)
  if (options.startedBundles !== undefined) ctx.provide('profileContext', { name: 'lab', startedBundles: options.startedBundles } as never)
  return { ctx, stream, registerAuto, currentSettings }
}

describe('auto-review plugin identity', () => {
  it('declares only the services this row reads itself', () => {
    expect(name).toBe('model-switch-auto-review')
    // The official gate's own dependency list (including 0.2.1's
    // `workingDirectory`) is resolved by cordis when the gate is mounted as a
    // plugin; mirroring it here is what broke every tool call on 0.2.1. The
    // loader drives the official-row takeover.
    expect(inject).toEqual(['llm', 'modelSwitch', 'loader'])
  })
})

describe('autoReviewGate', () => {
  class ProbeWorkingDirectory extends Service {
    calls = 0
    constructor(ctx: Context) { super(ctx, 'probeWorkingDirectory') }
    ensure(): string { this.calls += 1; return '/probe-cwd' }
  }

  async function serveWorkingDirectory(): Promise<{ ctx: Context; service: ProbeWorkingDirectory }> {
    const ctx = new Context()
    const fiber = ctx.plugin(ProbeWorkingDirectory)
    await fiber
    return { ctx, service: ctx.get('probeWorkingDirectory', false) as ProbeWorkingDirectory }
  }

  it('reproduces the 0.2.1 failure when the gate runs on a fiber that does not declare its service', async () => {
    const { ctx } = await serveWorkingDirectory()
    await expect(ctx.plugin({
      name: 'raw-gate',
      apply(gateCtx: Context) { (gateCtx as unknown as { probeWorkingDirectory: ProbeWorkingDirectory }).probeWorkingDirectory.ensure() },
    })).rejects.toThrow('cannot get property "probeWorkingDirectory" without inject')
  })

  it('keeps the official dependency list on the mounted fiber, so a new Host service cannot break the gate', async () => {
    const { ctx, service } = await serveWorkingDirectory()
    let applied = 0
    await ctx.plugin(autoReviewGate({
      name: 'experimental-auto-review',
      inject: ['probeWorkingDirectory'],
      apply(gateCtx: Context) {
        (gateCtx as unknown as { probeWorkingDirectory: ProbeWorkingDirectory }).probeWorkingDirectory.ensure()
      },
    }, { onApplied: () => { applied += 1 } }))
    expect(service.calls).toBe(1)
    expect(applied).toBe(1)
  })

  it('reports a failing gate to the caller and keeps the rejection', async () => {
    const { ctx } = await serveWorkingDirectory()
    const failures: unknown[] = []
    await expect(ctx.plugin(autoReviewGate({
      name: 'experimental-auto-review',
      apply() { throw new Error('already registered') },
    }, { onFailure: error => failures.push(error) }))).rejects.toThrow('already registered')
    expect(failures).toHaveLength(1)
  })

  it('mounts the official name and inject list unchanged', () => {
    const gate = autoReviewGate({ name: 'experimental-auto-review', inject: ['a', 'b'], apply: () => undefined })
    expect(gate.name).toBe('experimental-auto-review')
    expect(gate.inject).toEqual(['a', 'b'])
    expect(autoReviewGate({ apply: () => undefined }).name).toBe('experimental-auto-review')
  })
})

describe('autoReviewRouteOf', () => {
  it('pins a route only when both identifiers are present', () => {
    expect(autoReviewRouteOf({ autoReviewProvider: 'deepseek', autoReviewModel: 'deep-chat' }))
      .toEqual({ provider: 'deepseek', model: 'deep-chat' })
    expect(autoReviewRouteOf({ autoReviewProvider: '  deepseek ', autoReviewModel: 'deep-chat' }))
      .toEqual({ provider: 'deepseek', model: 'deep-chat' })
    expect(autoReviewRouteOf(undefined)).toBeUndefined()
    expect(autoReviewRouteOf({})).toBeUndefined()
    expect(autoReviewRouteOf({ autoReviewProvider: 'deepseek' })).toBeUndefined()
    expect(autoReviewRouteOf({ autoReviewModel: 'deep-chat' })).toBeUndefined()
    expect(autoReviewRouteOf({ autoReviewProvider: '', autoReviewModel: '' })).toBeUndefined()
    expect(autoReviewRouteOf({ autoReviewProvider: '   ', autoReviewModel: 'm' })).toBeUndefined()
  })
})

describe('reviewLlm', () => {
  it('rewrites only stream() route fields and keeps every other option', () => {
    const real = { stream: vi.fn(() => chunks()), label: 'real' } as unknown as ReviewLlm & { label: string }
    const wrapper = reviewLlm(real, () => ({ provider: 'review-p', model: 'review-m' }))
    const options = routeOptions('session-p', 'session-m')
    void wrapper.stream(options)
    expect(real.stream).toHaveBeenCalledExactlyOnceWith({
      ...options, provider: 'review-p', model: 'review-m',
    })
    // The session's own options object is never mutated.
    expect(options.provider).toBe('session-p')
    expect(options.model).toBe('session-m')
  })

  it('passes options through by identity when no route is configured', () => {
    const stream = vi.fn(() => chunks())
    const real = { stream } as unknown as ReviewLlm
    const wrapper = reviewLlm(real, () => undefined)
    const options = routeOptions('session-p', 'session-m')
    expect(wrapper.stream(options)).toBe(stream.mock.results[0]!.value)
    expect(stream).toHaveBeenCalledExactlyOnceWith(options)
  })

  it('re-reads the route per call and forwards non-stream members to the real service', () => {
    const real = {
      stream: vi.fn(() => chunks()),
      owner(this: unknown): string { return this === real ? 'real' : 'other' },
      assistant: { who: () => 'nested' },
      version: 7,
    } as unknown as ReviewLlm
    let pinned: { provider: string; model: string } | undefined = { provider: 'p1', model: 'm1' }
    const wrapper = reviewLlm(real, () => pinned)
    void wrapper.stream(routeOptions('s-p', 's-m'))
    expect(real.stream).toHaveBeenLastCalledWith(expect.objectContaining({ provider: 'p1', model: 'm1' }))
    pinned = undefined
    void wrapper.stream(routeOptions('s-p', 's-m'))
    expect(real.stream).toHaveBeenLastCalledWith(expect.objectContaining({ provider: 's-p', model: 's-m' }))
    pinned = { provider: 'p2', model: 'm2' }
    void wrapper.stream(routeOptions('s-p', 's-m'))
    expect(real.stream).toHaveBeenLastCalledWith(expect.objectContaining({ provider: 'p2', model: 'm2' }))

    // Top-level methods keep the real service as `this`; nested values pass by reference.
    const members = wrapper as unknown as { owner(): string; assistant: { who(): string }; version: number }
    expect(members.version).toBe(7)
    expect(members.owner()).toBe('real')
    expect(members.assistant).toBe((real as unknown as { assistant: unknown }).assistant)
    expect(members.assistant.who()).toBe('nested')
  })
})

describe('reviewScope', () => {
  it('shadows llm and the permission-preset service on a child context and leaves the parent services untouched', () => {
    const { ctx, stream, currentSettings } = bench({ settings: { autoReviewProvider: 'pin-p', autoReviewModel: 'pin-m' } })
    const parentLlm = ctx.llm
    const parentPresets = ctx.permissionPresets
    const scope = reviewScope(ctx)
    expect(scope.llm).not.toBe(parentLlm)
    expect(ctx.llm).toBe(parentLlm)
    // The preset face is wrapped so a broken service cannot fail a tool call.
    expect(scope.permissionPresets).not.toBe(parentPresets)
    expect(scope.permissionPresets.current({} as never)).toBe('safe')
    // Inherited services still resolve to the real instances.
    expect(scope.modelSwitch).toBe(ctx.modelSwitch)

    void scope.llm.stream(routeOptions('session-p', 'session-m'))
    expect(stream).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ provider: 'pin-p', model: 'pin-m', system: 'policy' }))
    expect(currentSettings).toHaveBeenCalled()

    // Unpinning flips the very next review back to the session route.
    const settings = { autoReviewProvider: 'pin-p', autoReviewModel: 'pin-m' }
    currentSettings.mockImplementation(() => ({ ...settings }))
    settings.autoReviewProvider = ''
    void scope.llm.stream(routeOptions('session-p', 'session-m'))
    expect(stream).toHaveBeenLastCalledWith(expect.objectContaining({ provider: 'session-p', model: 'session-m' }))
  })

  it('correlates parallel tools/pre-execute waterfalls to their own sessions and follows mid-session provider switches', async () => {
    const settings: Record<string, unknown> = {
      autoReviewProvider: 'global-p',
      autoReviewModel: 'global-m',
      providerGroups: {
        codex: { autoReviewProvider: 'codex-rev-p', autoReviewModel: 'codex-rev-m' },
        grok: { autoReviewProvider: 'grok-rev-p', autoReviewModel: 'grok-rev-m' },
      },
    }
    const { ctx, stream } = bench({ settings })
    const projections = new Map<object, { lastUsed?: { provider: string } | null; pending?: { provider: string } | null }>()
    ctx.provide('sessionProjections', { stateOf: (session: object) => projections.get(session) } as never)

    const sessionA = {
      requestContext: () => ({ provider: 'codex', model: 'gpt-5' }),
      requestHeader: () => undefined,
    } as unknown as Session
    const sessionB = {
      requestContext: () => ({ provider: 'grok', model: 'grok-4' }),
      requestHeader: () => undefined,
    } as unknown as Session
    const sessionUngrouped = {
      requestContext: () => ({ provider: 'deepseek', model: 'deep-chat' }),
      requestHeader: () => undefined,
    } as unknown as Session

    const activeSession = new AsyncLocalStorage<Session | undefined>()
    const scope = reviewScope(ctx, activeSession)

    // Register a fake gate listener first (just like official.apply(scope) does),
    // then bindAutoReviewSessionCorrelation afterwards so its { prepend: true }
    // listener sits ahead of the gate listener in the waterfall.
    scope.on('tools/pre-execute', async (_exec: { agent?: { session?: Session } }, next: () => Promise<unknown>) => {
      await new Promise(resolve => setTimeout(resolve, Math.random() * 5))
      const frozen = Object.freeze(routeOptions('session-orig-p', 'session-orig-m'))
      void scope.llm.stream(frozen)
      return next()
    }, { prepend: true })
    bindAutoReviewSessionCorrelation(scope, activeSession)

    // Dispatch two tool calls in parallel for sessions on different providers.
    await Promise.all([
      scope.waterfall('tools/pre-execute', { agent: { session: sessionA } } as never, async () => ({ kind: 'allow' as const })),
      scope.waterfall('tools/pre-execute', { agent: { session: sessionB } } as never, async () => ({ kind: 'allow' as const })),
    ])

    const seenRoutes = stream.mock.calls.map(call => {
      const arg = (call as unknown as [GenerateOptions])[0]
      return { provider: arg.provider, model: arg.model }
    })
    expect(seenRoutes).toContainEqual({ provider: 'codex-rev-p', model: 'codex-rev-m' })
    expect(seenRoutes).toContainEqual({ provider: 'grok-rev-p', model: 'grok-rev-m' })

    // Mid-session provider switch on sessionA (pending selection -> grok) switches
    // the very next review to grok's reviewer group without writing global settings.
    projections.set(sessionA, { lastUsed: { provider: 'codex' }, pending: { provider: 'grok' } })
    await scope.waterfall('tools/pre-execute', { agent: { session: sessionA } } as never, async () => ({ kind: 'allow' as const }))
    expect(stream).toHaveBeenLastCalledWith(expect.objectContaining({ provider: 'grok-rev-p', model: 'grok-rev-m' }))

    // Ungrouped session falls back to the deployment-wide reviewer pair.
    await scope.waterfall('tools/pre-execute', { agent: { session: sessionUngrouped } } as never, async () => ({ kind: 'allow' as const }))
    expect(stream).toHaveBeenLastCalledWith(expect.objectContaining({ provider: 'global-p', model: 'global-m' }))
    expect(resolveSessionAutoReviewRoute(ctx, sessionUngrouped)).toEqual({ provider: 'global-p', model: 'global-m' })
  })
})

describe('defensivePermissionPresets', () => {
  it('degrades a failing preset probe to custom so a tool call still runs', () => {
    const warn = vi.fn()
    const failure = new Error('cannot get required service "sessionProjections" in inactive context')
    const face = defensivePermissionPresets(() => ({
      current: () => { throw failure },
      set: () => undefined,
      registerAuto: () => () => undefined,
    }), { warn }, () => 'uid=7 state=4 name=permission inject=[shell|approval|sessions|sessionProjections]')
    expect(face.current({} as never)).toBe('custom')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('inactive context')
    // The report names the fiber chain a resolution walks.
    expect(String(warn.mock.calls[0]?.[0])).toContain('uid=7')
    // The degradation report is one line, not one per tool call.
    expect(face.current({} as never)).toBe('custom')
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('stays protective while the service is not resolvable yet (lazy shadow)', () => {
    const warn = vi.fn()
    let resolvable = true
    const preset = { current: vi.fn(() => 'safe'), set: vi.fn(), registerAuto: vi.fn(() => () => undefined) }
    const face = defensivePermissionPresets(() => (resolvable ? preset : undefined), { warn })
    resolvable = false
    expect(face.current({} as never)).toBe('custom')
    // Registration must fail loudly: the Auto preset must never be silently absent.
    expect(() => face.registerAuto(() => undefined)).toThrow(/unavailable/)
    resolvable = true
    expect(face.current({} as never)).toBe('safe')
  })

  it('brokers the Auto registration so the takeover can yield and reclaim it', () => {
    const disposed = vi.fn()
    const preset = { current: vi.fn(() => 'auto'), set: vi.fn(() => true), registerAuto: vi.fn(() => disposed) }
    const face = defensivePermissionPresets(() => preset, { warn: vi.fn() })
    const admit = vi.fn()
    const disposer = face.registerAuto(admit)
    expect(preset.registerAuto).toHaveBeenCalledOnce()
    expect(face.registered).toBe(true)

    // The takeover hands the single registration over synchronously ...
    face.releaseForTakeover()
    expect(disposed).toHaveBeenCalledTimes(1)
    expect(face.registered).toBe(false)

    // ... and takes it back with the same admit callback.
    expect(face.reclaimRegistration()).toBe(true)
    expect(preset.registerAuto).toHaveBeenNthCalledWith(2, admit)
    expect(face.registered).toBe(true)

    // The gate's own teardown still releases the live registration.
    void disposer()
    expect(disposed).toHaveBeenCalledTimes(2)
    expect(face.registered).toBe(false)
  })

  it('reports reclaim conflicts as false so the takeover loop retries', () => {
    const preset = {
      current: vi.fn(() => 'safe'),
      set: vi.fn(),
      registerAuto: vi.fn(() => () => undefined),
    }
    const face = defensivePermissionPresets(() => preset, { warn: vi.fn() })
    face.registerAuto(() => undefined)
    face.releaseForTakeover()
    preset.registerAuto.mockImplementation(() => { throw new Error('permission: preset "auto" is already registered') })
    expect(face.reclaimRegistration()).toBe(false)
    expect(face.registered).toBe(false)
  })

  it('swallows a failing preset write during teardown', () => {
    const warn = vi.fn()
    const face = defensivePermissionPresets(() => ({
      current: () => 'safe',
      set: () => { throw new Error('no session') },
      registerAuto: () => () => undefined,
    }), { warn })
    expect(face.set({} as never, 'danger-full-access')).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
  })
})

describe('apply', () => {
  it('mounts the official gate when the profile started with the auto-review bundle', async () => {
    const { ctx, registerAuto } = bench({ startedBundles: ['@deepseek-ai/dsh-base', BUNDLE] })
    await apply(ctx)
    // registerAuto inside proves the official apply ran under our scope.
    expect(registerAuto).toHaveBeenCalledOnce()
  })

  it('stays unmounted when the profile never enabled the bundle', async () => {
    const { ctx, registerAuto } = bench({ startedBundles: ['@deepseek-ai/dsh-base'] })
    await apply(ctx)
    expect(registerAuto).not.toHaveBeenCalled()
  })

  it('stays unmounted without launcher profile facts', async () => {
    const { ctx, registerAuto } = bench()
    await apply(ctx)
    expect(registerAuto).not.toHaveBeenCalled()
  })

  it('reports a held Auto registration instead of failing the fiber', async () => {
    const { ctx, registerAuto } = bench({ startedBundles: [BUNDLE], auto: true })
    await expect(apply(ctx)).resolves.toBeUndefined()
    expect(registerAuto).toHaveBeenCalledOnce()
  })

  it('takes the seam over from a live official row and keeps sessions on Auto', async () => {
    const ctx = new Context()
    let preset = 'auto'
    const writes: string[] = []
    const session = { id: 's1' }
    const presets = {
      current: vi.fn(() => preset),
      set: vi.fn((_session: unknown, value: string) => { preset = value; writes.push(value) }),
      registerAuto: vi.fn(() => () => { preset = 'custom' }),
    }
    ctx.provide('modelSwitch', { currentSettings: () => ({}) } as never)
    ctx.provide('llm', { stream: vi.fn() } as never)
    ctx.provide('permissionPresets', presets as never)
    ctx.provide('approval', { overrideOf: () => 'never' } as never)
    ctx.provide('sessions', { list: () => [session] } as never)
    ctx.provide('tools', {} as never)
    ctx.provide('profileContext', { name: 'lab', startedBundles: [BUNDLE] } as never)
    // A live official row whose disposal flips Auto sessions off Auto: that is
    // the official gate teardown, and the takeover must put them back.
    const entry = {
      id: 'auto-review',
      options: { id: 'auto-review', name: '@deepseek-ai/dsh-experimental-auto-review', config: {} },
      disabled: false,
      updates: [] as unknown[],
      async update(options: Record<string, unknown>) {
        entry.updates.push(options)
        if (options.disabled === true) {
          entry.disabled = true
          if (preset === 'auto') {
            preset = 'danger-full-access'
            writes.push('danger-full-access')
          }
        }
      },
    }
    ctx.provide('loader', { entries: () => [entry][Symbol.iterator]() } as never)

    await apply(ctx)

    // The official row is displaced and this row owns the single registration.
    expect(entry.updates).toContainEqual({ disabled: true })
    expect(presets.registerAuto).toHaveBeenCalledOnce()
    // The displacement flipped the session (the official teardown) and the
    // takeover restored its Auto selection.
    expect(writes).toContain('danger-full-access')
    expect(preset).toBe('auto')
  })
})

describe('takeover choreography', () => {
  it('yields the Auto registration on every official activation, not only the first', async () => {
    // Regression behind 「停用失败: permission: preset "auto" is already registered」.
    // A plugin-manager enable runs `Entry.update({ disabled: false }) → init()`,
    // and the loader calls `_patchContext([])` right before that row's plugin
    // apply. A one-shot `handled` guard skipped the yield from the second
    // activation on, so the official `registerAuto` collided with this row's
    // live registration and the whole operation reported as failed.
    const listeners = new Map<string, (...args: unknown[]) => unknown>()
    const ctx = {
      on: (event: string, listener: (...args: unknown[]) => unknown) => {
        listeners.set(event, listener)
        return () => { listeners.delete(event) }
      },
      effect: (body: () => unknown) => {
        const generator = body() as Generator<unknown>
        for (let step = generator.next(); !step.done; step = generator.next()) { /* disposer collected */ }
        return () => undefined
      },
      get: () => undefined,
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    }
    const entry = {
      options: { id: 'auto-review', name: '@deepseek-ai/dsh-experimental-auto-review', config: {} },
      disabled: false,
      update: vi.fn(async (options: Record<string, unknown>) => {
        if (options.disabled === true) entry.disabled = true
      }),
    }
    const yieldRegistration = vi.fn()
    const claim = vi.fn(async () => true)
    installAutoReviewTakeover(ctx as never, {
      yieldRegistration,
      claim,
      preserveAuto: async action => { await action() },
    })

    const listener = listeners.get('loader/patch-context')
    expect(listener).toBeTypeOf('function')
    const next = vi.fn(() => undefined)
    // Startup activation, then the plugin manager's re-enable: both must yield
    // before the loader runs the official apply.
    listener!.call(entry, next)
    await new Promise(resolve => setTimeout(resolve, 0))
    listener!.call(entry, next)
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(yieldRegistration).toHaveBeenCalledTimes(2)
    expect(next).toHaveBeenCalledTimes(2)
    // The reclaim is single-flight per entry: one cycle at a time, so yielding
    // on every activation cannot loop.
    expect(claim).toHaveBeenCalled()
    expect(entry.update).toHaveBeenCalledWith({ disabled: true })
  })

  it('keeps the yield away from rows that are not the official auto-review entry', () => {
    const listeners = new Map<string, (...args: unknown[]) => unknown>()
    const ctx = {
      on: (event: string, listener: (...args: unknown[]) => unknown) => {
        listeners.set(event, listener)
        return () => { listeners.delete(event) }
      },
      effect: (body: () => unknown) => {
        const generator = body() as Generator<unknown>
        for (let step = generator.next(); !step.done; step = generator.next()) { /* disposer collected */ }
        return () => undefined
      },
      get: () => undefined,
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    }
    const yieldRegistration = vi.fn()
    installAutoReviewTakeover(ctx as never, {
      yieldRegistration,
      claim: async () => true,
      preserveAuto: async action => { await action() },
    })
    const next = vi.fn(() => undefined)
    listeners.get('loader/patch-context')!.call({ options: { id: 'other', name: 'dsh-model-switch', config: {} } }, next)
    expect(yieldRegistration).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledOnce()
  })
})

describe('reviewer-path safety net', () => {
  /** Terminal that fails like the official gate's unshielded probe. */
  const brokenProbe = async (): Promise<never> => {
    throw new Error('cannot get required service "sessionProjections" in inactive context')
  }

  it('allows the call and reports once when the reviewer seam is broken', async () => {
    const { ctx } = bench()
    const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => undefined)
    installToolCallSafetyNet(ctx)

    const first = await ctx.waterfall('tools/pre-execute', { agent: { session: {} } } as never, brokenProbe)
    expect(first).toEqual({ kind: 'allow' })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('run unreviewed instead of failing')

    // The runtime-capability snapshot reads this store: a call allowed by the
    // net must be counted so the settings card can report skipped reviews.
    const allowedBefore = autoReviewStatus.allowedCalls
    const second = await ctx.waterfall('tools/pre-execute', { agent: { session: {} } } as never, brokenProbe)
    expect(second).toEqual({ kind: 'allow' })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(autoReviewStatus.allowedCalls).toBe(allowedBefore + 1)
  })

  it('keeps a reviewer transport or quota failure failing closed', async () => {
    const { ctx } = bench()
    vi.spyOn(ctx.logger, 'warn').mockImplementation(() => undefined)
    installToolCallSafetyNet(ctx)

    await expect(ctx.waterfall('tools/pre-execute', { agent: { session: {} } } as never, async () => {
      throw new Error('Auto review of tool "pwsh" failed; its body was not executed: RATE_LIMIT: 429 AccountQuotaExceeded')
    })).rejects.toThrow(/AccountQuotaExceeded/)
  })

  it('stays inert while this row still holds the reviewer route', async () => {
    const { ctx } = bench()
    installToolCallSafetyNet(ctx, { isDegraded: () => false })
    await expect(ctx.waterfall('tools/pre-execute', { agent: { session: {} } } as never, brokenProbe))
      .rejects.toThrow(/inactive context/)
  })

  it('tells an inject failure apart from a denial', () => {
    expect(isReviewerInfrastructureFailure(new Error('cannot get property "workingDirectory" without inject'))).toBe(true)
    expect(isReviewerInfrastructureFailure(new Error('permission: "auto" is already registered'))).toBe(false)
    expect(isReviewerInfrastructureFailure({ kind: 'deny', reason: 'high risk' })).toBe(false)
  })
})
