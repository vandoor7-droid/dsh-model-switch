import { describe, expect, it, vi } from 'vitest'
import { PlanDismissalUnsupportedError, dismissPendingQuestion } from '../../src/picker/pending-dismissal.ts'

describe('pending question dismissal across Host generations', () => {
  it('prefers the 0.2.x dismiss() verb', async () => {
    const dismiss = vi.fn(async () => undefined)
    const cancel = vi.fn(async () => undefined)
    await expect(dismissPendingQuestion({ dismiss, cancel })).resolves.toBe('dismiss')
    expect(dismiss).toHaveBeenCalledOnce()
    expect(cancel).not.toHaveBeenCalled()
  })

  it('falls back to the 0.1.x cancel() verb', async () => {
    const cancel = vi.fn(async () => undefined)
    await expect(dismissPendingQuestion({ cancel })).resolves.toBe('cancel')
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('fails loudly instead of leaving the card with no withdrawal path', async () => {
    await expect(dismissPendingQuestion({})).rejects.toBeInstanceOf(PlanDismissalUnsupportedError)
    await expect(dismissPendingQuestion({ dismiss: 'not a function' } as never)).rejects.toBeInstanceOf(PlanDismissalUnsupportedError)
  })

  it('propagates a refusal from the Host verb', async () => {
    const dismissed = Object.assign(new Error('already settled'), { code: 'question/settled' })
    await expect(dismissPendingQuestion({ dismiss: async () => { throw dismissed } })).rejects.toBe(dismissed)
  })
})
