import { describe, expect, it, vi } from 'vitest'
import { discussPlan } from '../../src/picker/discuss-plan.ts'

const SESSION = 'session-1'

describe('discussPlan', () => {
  it('interrupts the turn so the transcript keeps the work details expanded', async () => {
    const cancelTurn = vi.fn(async () => undefined)
    const dismiss = vi.fn(async () => undefined)
    await expect(discussPlan(cancelTurn, SESSION, dismiss)).resolves.toBe('interrupted')
    expect(cancelTurn).toHaveBeenCalledWith(SESSION)
    // The released withdrawal must not also run: dismissing would settle the
    // question and complete the turn, which is exactly what folds the steps.
    expect(dismiss).not.toHaveBeenCalled()
  })

  it('falls back to the released withdrawal when cancellation is refused', async () => {
    const cancelTurn = vi.fn(async () => { throw new Error('no live turn') })
    const dismiss = vi.fn(async () => undefined)
    await expect(discussPlan(cancelTurn, SESSION, dismiss)).resolves.toBe('dismissed')
    expect(cancelTurn).toHaveBeenCalledOnce()
    expect(dismiss).toHaveBeenCalledOnce()
  })

  it('falls back when the Host exposes no cancellation seam', async () => {
    const dismiss = vi.fn(async () => undefined)
    await expect(discussPlan(undefined, SESSION, dismiss)).resolves.toBe('dismissed')
    expect(dismiss).toHaveBeenCalledOnce()
  })

  it('never cancels without a session identity', async () => {
    const cancelTurn = vi.fn(async () => undefined)
    const dismiss = vi.fn(async () => undefined)
    await expect(discussPlan(cancelTurn, '', dismiss)).resolves.toBe('dismissed')
    expect(cancelTurn).not.toHaveBeenCalled()
    expect(dismiss).toHaveBeenCalledOnce()
  })

  it('surfaces a failed withdrawal instead of reporting success', async () => {
    const dismiss = vi.fn(async () => { throw new Error('dismiss unsupported') })
    await expect(discussPlan(undefined, SESSION, dismiss)).rejects.toThrow('dismiss unsupported')
  })
})
