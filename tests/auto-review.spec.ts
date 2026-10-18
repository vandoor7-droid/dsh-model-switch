import { AsyncLocalStorage } from 'node:async_hooks'
import { describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { Session } from '@deepseek-ai/dsh-session'
import {
  apply,
  autoReviewGate,
  autoReviewRouteOf,
  bindAutoReviewSessionCorrelation,
  inject,
  name,
  resolveSessionAutoReviewRoute,
  reviewLlm,
  reviewScope,
  type ReviewLlm,
} from '../src/auto-review.ts'

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
    // plugin; mirroring it here is what broke every tool call on 0.2.1.
    expect(inject).toEqual(['llm', 'modelSwitch'])
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
  it('shadows only llm on a child context and leaves the parent service untouched', () => {
    const { ctx, stream, currentSettings } = bench({ settings: { autoReviewProvider: 'pin-p', autoReviewModel: 'pin-m' } })
    const parentLlm = ctx.llm
    const scope = reviewScope(ctx)
    expect(scope.llm).not.toBe(parentLlm)
    expect(ctx.llm).toBe(parentLlm)
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

  it('reports an already-active official row instead of failing the fiber', async () => {
    const { ctx, registerAuto } = bench({ startedBundles: [BUNDLE], auto: true })
    await expect(apply(ctx)).resolves.toBeUndefined()
    expect(registerAuto).toHaveBeenCalledOnce()
  })
})
