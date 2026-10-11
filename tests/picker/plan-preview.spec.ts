import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { PlanReview } from '@deepseek-ai/dsh-client-ui-user-questions/client'
import { createPlanPreviewBinding, planPreviewIdentity, wasPlanPreviewOpened } from '../../src/client/picker/plan-preview.ts'

const SID = 'session-prev' as SessionId
const OPENER_ID = '@deepseek-ai/dsh-client-ui-plan'

function review(callId?: string): PlanReview {
  return {
    id: 'q1', question: 'Ready?', plan: '# Plan body',
    approve: { label: 'Approve' },
    ...(callId === undefined ? {} : { callId: callId as PlanReview['callId'] }),
  }
}

/** ui-plan opener stand-in: an inject face plus a settable on-screen Session gate. */
function openerBench(mounted: SessionId | undefined) {
  const openReview = vi.fn()
  let current = mounted
  const listeners = new Set<() => void>()
  const sidebarMounted = {
    getSnapshot: (): SessionId | undefined => current,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
  }
  const inject = vi.fn(() => ({ openReview, hooks: { sidebarMounted } }))
  const entries = vi.fn(() => [{ component: null, options: { id: OPENER_ID }, inject }])
  const setMounted = (next: SessionId | undefined): void => {
    current = next
    for (const listener of [...listeners]) listener()
  }
  return { entries, inject, openReview, setMounted }
}

describe('plan preview binding', () => {
  it('reports availability from the registered opener entry', () => {
    const present = openerBench(undefined)
    expect(createPlanPreviewBinding(present).available()).toBe(true)
    expect(createPlanPreviewBinding({ entries: () => [] }).available()).toBe(false)
    expect(createPlanPreviewBinding({ entries: () => [{ component: null, options: { id: 'someone-else' } }] }).available()).toBe(false)
  })

  it('opens through ui-plan inject face and degrades when it is absent or broken', () => {
    const bench = openerBench(SID)
    const binding = createPlanPreviewBinding(bench)
    expect(binding.open(SID, review(), 'k-open')).toBe(true)
    expect(bench.inject).toHaveBeenCalledExactlyOnceWith(SID)
    expect(bench.openReview).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ plan: '# Plan body' }), 'k-open')

    // The manual button stays a real re-open: official parity is a fresh navigation per click.
    expect(binding.open(SID, review(), 'k-open')).toBe(true)
    expect(bench.openReview).toHaveBeenCalledTimes(2)

    expect(createPlanPreviewBinding({ entries: () => [] }).open(SID, review(), 'k-none')).toBe(false)
    const throwing = createPlanPreviewBinding({
      entries: () => [{ component: null, options: { id: OPENER_ID }, inject: () => { throw new Error('unknown session') } }],
    })
    expect(throwing.open(SID, review(), 'k-throw')).toBe(false)
    const shapeless = createPlanPreviewBinding({
      entries: () => [{ component: null, options: { id: OPENER_ID }, inject: () => ({}) }],
    })
    expect(shapeless.open(SID, review(), 'k-shapeless')).toBe(false)
  })

  it('waits for a Session on screen, then opens exactly once per identity', () => {
    const bench = openerBench(undefined)
    const binding = createPlanPreviewBinding(bench)
    const stop = binding.autoOpen(SID, review(), 'k-wait')
    expect(bench.openReview).not.toHaveBeenCalled()

    bench.setMounted(SID)
    expect(bench.openReview).toHaveBeenCalledExactlyOnceWith(expect.anything(), 'k-wait')

    // Later gate flips and a second mount for the same identity stay silent.
    bench.setMounted(undefined)
    const second = binding.autoOpen(SID, review(), 'k-wait')
    bench.setMounted(SID)
    expect(bench.openReview).toHaveBeenCalledTimes(1)
    second()
    stop()
    bench.setMounted(SID)
    expect(bench.openReview).toHaveBeenCalledTimes(1)
  })

  it('opens immediately when a Session is already on screen', () => {
    const bench = openerBench(SID)
    const binding = createPlanPreviewBinding(bench)
    const stop = binding.autoOpen(SID, review(), 'k-ready')
    expect(bench.openReview).toHaveBeenCalledExactlyOnceWith(expect.anything(), 'k-ready')
    expect(bench.inject).toHaveBeenCalledExactlyOnceWith(SID)
    stop()
  })

  it('stays silent while the opener entry is missing', () => {
    const binding = createPlanPreviewBinding({ entries: () => [] })
    const stop = binding.autoOpen(SID, review(), 'k-absent')
    expect(() => stop()).not.toThrow()
    expect(wasPlanPreviewOpened(planPreviewIdentity(SID, review(), 'k-absent'))).toBe(false)
  })

  it('keys identity by callId when the Host named one, else by request key', () => {
    expect(planPreviewIdentity(SID, review(), 'req-1')).toBe('session-prev:review:req-1')
    expect(planPreviewIdentity(SID, review('call-9'), 'req-1')).toBe('session-prev:call:call-9')
    expect(wasPlanPreviewOpened('session-prev:review:req-1')).toBe(false)

    const bench = openerBench(SID)
    const binding = createPlanPreviewBinding(bench)
    binding.autoOpen(SID, review('call-9'), 'req-1')
    expect(bench.openReview).toHaveBeenCalledExactlyOnceWith(expect.anything(), 'req-1')
    expect(wasPlanPreviewOpened('session-prev:call:call-9')).toBe(true)
    expect(wasPlanPreviewOpened('session-prev:review:req-1')).toBe(false)
  })
})
