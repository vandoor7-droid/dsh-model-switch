import { describe, expect, it, vi } from 'vitest'
import { PlanApprovalResponseError, approvePlanReview, planActionView, planErrorText, planReviewOf, selectPlanReview, settlePlanAction } from '../../src/picker/plan-review.ts'

const reviewQuestion = {
  id: 'plan-review',
  question: 'Approve?',
  detail: '# Plan',
  options: [{ label: 'Approve' }, { label: 'Keep planning' }],
  intent: { kind: 'plan-review' as const, approve: 'Approve' },
}

describe('plugin-owned Plan Review', () => {
  it('claims only a binary plan-review question from the composer chain', () => {
    const pending = {
      kind: 'plan-review', key: 'question:1', sessionId: 'session-1',
      questions: [reviewQuestion], answer: vi.fn(), cancel: vi.fn(),
    }
    expect(selectPlanReview({ pendingInteraction: pending } as never)).toBe(pending)
    expect(planReviewOf([reviewQuestion])?.plan).toBe('# Plan')

    const generic = { ...pending, kind: 'question', questions: [{ id: 'q', question: 'Hi?' }] }
    expect(selectPlanReview({ pendingInteraction: generic } as never)).toBeNull()
    expect(selectPlanReview({ pendingInteraction: undefined } as never)).toBeNull()
  })

  it.each([
    { name: 'multiple questions', questions: [reviewQuestion, reviewQuestion] },
    { name: 'generic question', questions: [{ ...reviewQuestion, intent: undefined }] },
    { name: 'missing detail', questions: [{ ...reviewQuestion, detail: undefined }] },
    { name: 'multi-select', questions: [{ ...reviewQuestion, multiSelect: true }] },
    { name: 'too many options', questions: [{ ...reviewQuestion, options: [...reviewQuestion.options, { label: 'Other' }] }] },
    { name: 'missing approve option', questions: [{ ...reviewQuestion, intent: { kind: 'plan-review', approve: 'Missing' } }] },
  ])('declines malformed Plan Review input: $name', ({ questions }) => {
    expect(planReviewOf(questions as never)).toBeUndefined()
  })

  it('commits the selected execution model before answering Approve', async () => {
    const select = vi.fn(async () => ({ committed: true, mainDefaultRestored: true }))
    const answer = vi.fn(async () => undefined)

    await expect(approvePlanReview({
      select,
      selection: { provider: 'codex', model: 'gpt-5.6-sol' },
      answer,
    })).resolves.toBe(true)

    expect(select.mock.invocationCallOrder[0]).toBeLessThan(answer.mock.invocationCallOrder[0]!)
  })

  it('keeps the pending review unanswered when execution-model commit fails', async () => {
    const answer = vi.fn(async () => undefined)

    await expect(approvePlanReview({
      select: async () => ({ committed: false, mainDefaultRestored: true }),
      selection: { provider: 'codex', model: 'gpt-5.6-sol' },
      answer,
    })).resolves.toBe(false)
    expect(answer).not.toHaveBeenCalled()
  })

  it('answers a committed switch and still announces an unrestored Main default', async () => {
    const answer = vi.fn(async () => undefined)
    const notRestored = vi.fn()

    await expect(approvePlanReview({
      select: async () => ({ committed: true, mainDefaultRestored: false }),
      selection: { provider: 'codex', model: 'gpt-5.6-sol' },
      answer,
      onNotRestored: notRestored,
    })).resolves.toBe(true)

    expect(answer).toHaveBeenCalledOnce()
    // The notice follows the answer: an uncompensated deployment default is
    // reported, never a reason to hold the human's Plan decision back.
    expect(notRestored.mock.invocationCallOrder[0]).toBeGreaterThan(answer.mock.invocationCallOrder[0]!)
  })

  it('does not announce anything when the Main default was restored', async () => {
    const notRestored = vi.fn()
    await expect(approvePlanReview({
      select: async () => ({ committed: true, mainDefaultRestored: true }),
      selection: { provider: 'codex', model: 'gpt-5.6-sol' },
      answer: async () => undefined,
      onNotRestored: notRestored,
    })).resolves.toBe(true)
    expect(notRestored).not.toHaveBeenCalled()
  })

  it('skips execution-model commit when the picker already matches', async () => {
    const select = vi.fn(async () => ({ committed: false, mainDefaultRestored: false }))
    const answer = vi.fn(async () => undefined)
    const selection = { provider: 'antigravity', model: 'gemini-3.8-flash', reasoningEffort: 'low' }
    await expect(approvePlanReview({ select, selection, current: selection, answer })).resolves.toBe(true)
    expect(select).not.toHaveBeenCalled()
    expect(answer).toHaveBeenCalledOnce()
  })

  it('shows a commit error and re-enables retry after rejection', async () => {
    const states: Array<{ busy: boolean; blocked: boolean; error: string | null }> = []

    await expect(settlePlanAction(
      async () => { throw new Error('select failed') },
      state => { states.push(state) },
    )).resolves.toBe(false)

    expect(states).toEqual([
      { busy: true, blocked: false, error: null },
      { busy: false, blocked: false, error: 'select failed' },
    ])
    expect(planActionView(states.at(-1)!, true, true)).toEqual({
      approveDisabled: false,
      error: 'select failed',
    })
  })
})

describe('plan action diagnostics', () => {
  it('keeps the wire code of a failed action visible', () => {
    expect(planErrorText(new Error('writer held'))).toBe('writer held')
    expect(planErrorText(Object.assign(new Error('writer held'), { code: 'session/writer-held' })))
      .toBe('session/writer-held: writer held')
  })

  it('keeps the code of a cause behind a localized rejection', () => {
    const cause = Object.assign(new Error('writer held'), { code: 'session/writer-held' })
    expect(planErrorText(new PlanApprovalResponseError('localized copy', { cause })))
      .toBe('session/writer-held: localized copy')
  })

  it('reports a non-Error rejection as its string form', () => {
    expect(planErrorText('plain failure')).toBe('plain failure')
  })
})
