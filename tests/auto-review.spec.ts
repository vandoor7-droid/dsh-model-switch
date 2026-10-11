import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { apply, autoReviewRouteOf, inject, name, reviewLlm, reviewScope, type ReviewLlm } from '../src/auto-review.ts'

const BUNDLE = '@deepseek-ai/dsh-experimental-auto-review'

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
  const currentSettings = vi.fn(() => ({ compactOnSwitch: true, ...options.settings }))
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
  it('keeps the loader contract stable', () => {
    expect(name).toBe('model-switch-auto-review')
    expect(inject).toEqual(['modelSwitch', 'approval', 'llm', 'permissionPresets', 'sessions', 'tools'])
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
    currentSettings.mockImplementation(() => ({ compactOnSwitch: true, ...settings }))
    settings.autoReviewProvider = ''
    void scope.llm.stream(routeOptions('session-p', 'session-m'))
    expect(stream).toHaveBeenLastCalledWith(expect.objectContaining({ provider: 'session-p', model: 'session-m' }))
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
