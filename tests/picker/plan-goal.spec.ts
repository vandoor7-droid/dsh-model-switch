import { describe, expect, it, vi } from 'vitest'
import {
  setPlanAsGoal,
  type GoalRef,
  type GoalRemote,
  type GoalRemoteResult,
  type GoalView,
} from '../../src/picker/plan-goal.ts'

const SESSION = 'session-1'
const PLAN = '  # Ship it\n\n1. build  '
const TRIMMED = '# Ship it\n\n1. build'
const REF: GoalRef = { id: 'goal-1', revision: 3 }
const VIEW: GoalView = { id: 'goal-1', revision: 3, phase: 'active', activation: 'armed' }

const ok = <T,>(value: T): GoalRemoteResult<T> => ({ ok: true, value })
const refuse = (code: string, message = `${code} detail`): GoalRemoteResult<never> => ({ ok: false, error: { code, message } })

/** A goal remote whose create results are queued so the replace path is scriptable. */
function bench(options: {
  create?: readonly GoalRemoteResult<{ readonly ref: GoalRef }>[]
  get?: GoalRemoteResult<GoalView | null | undefined>
  clear?: GoalRemoteResult<unknown>
} = {}) {
  const queue = [...(options.create ?? [ok({ ref: REF })])]
  const create = vi.fn(async (_sessionId: string, request: { readonly objective: string }) => {
    void request
    const next = queue.shift()
    if (next === undefined) throw new Error('no scripted create result')
    return next
  })
  const get = vi.fn(async () => options.get ?? ok(VIEW))
  const clear = vi.fn(async () => options.clear ?? ok(undefined))
  const remote: GoalRemote = { create, get, clear }
  return { remote, create, get, clear }
}

describe('setPlanAsGoal', () => {
  it('creates the goal with the trimmed plan text', async () => {
    const { remote, create, get, clear } = bench()

    await expect(setPlanAsGoal(remote, SESSION, PLAN)).resolves.toEqual({ kind: 'created' })

    expect(create).toHaveBeenCalledExactlyOnceWith(SESSION, { objective: TRIMMED })
    expect(get).not.toHaveBeenCalled()
    expect(clear).not.toHaveBeenCalled()
  })

  it('replaces an unfinished goal with a fresh one before returning', async () => {
    const { remote, create, get, clear } = bench({
      create: [refuse('GOAL_ALREADY_EXISTS'), ok({ ref: { id: 'goal-2', revision: 1 } })],
    })

    await expect(setPlanAsGoal(remote, SESSION, PLAN)).resolves.toEqual({ kind: 'replaced' })

    expect(get).toHaveBeenCalledExactlyOnceWith(SESSION)
    expect(clear).toHaveBeenCalledExactlyOnceWith(SESSION, { id: 'goal-1', revision: 3 })
    expect(create).toHaveBeenCalledTimes(2)
    expect(create).toHaveBeenNthCalledWith(2, SESSION, { objective: TRIMMED })
    // The clear settles before the retry: clearing after the second create would
    // race the goal that just replaced the first one.
    expect(clear.mock.invocationCallOrder[0]).toBeLessThan(create.mock.invocationCallOrder[1]!)
  })

  it('reads the compare-and-set ref from the current view', async () => {
    const { remote, clear } = bench({
      create: [refuse('GOAL_ALREADY_EXISTS'), ok({ ref: REF })],
      get: ok({ id: 'goal-9', revision: 42, phase: 'paused', activation: 'disarmed' }),
    })

    await expect(setPlanAsGoal(remote, SESSION, PLAN)).resolves.toEqual({ kind: 'replaced' })

    expect(clear).toHaveBeenCalledWith(SESSION, { id: 'goal-9', revision: 42 })
  })

  it.each(['GOAL_INVALID_OBJECTIVE', 'GOAL_AGENT_NOT_LIVE', 'GOAL_INVALID_TRANSITION'])(
    'reports a refused create without touching the current goal (%s)',
    async (code) => {
      const { remote, create, get, clear } = bench({ create: [refuse(code, 'create refused')] })

      await expect(setPlanAsGoal(remote, SESSION, PLAN)).resolves.toEqual({ kind: 'failed', code, message: 'create refused' })

      expect(create).toHaveBeenCalledOnce()
      expect(get).not.toHaveBeenCalled()
      expect(clear).not.toHaveBeenCalled()
    },
  )

  it('reports an unreadable current goal', async () => {
    const { remote, clear } = bench({ create: [refuse('GOAL_ALREADY_EXISTS'), ok({ ref: REF })], get: refuse('GOAL_AGENT_NOT_LIVE', 'agent is gone') })

    await expect(setPlanAsGoal(remote, SESSION, PLAN)).resolves.toEqual({ kind: 'failed', code: 'GOAL_AGENT_NOT_LIVE', message: 'agent is gone' })

    expect(clear).not.toHaveBeenCalled()
  })

  it('reports a clear that refuses, without retrying the create', async () => {
    const { remote, create } = bench({
      create: [refuse('GOAL_ALREADY_EXISTS'), ok({ ref: REF })],
      clear: refuse('GOAL_STALE_REVISION', 'someone else edited'),
    })

    await expect(setPlanAsGoal(remote, SESSION, PLAN)).resolves.toEqual({ kind: 'failed', code: 'GOAL_STALE_REVISION', message: 'someone else edited' })

    expect(create).toHaveBeenCalledOnce()
  })

  it('reports the second create refusing after a successful clear', async () => {
    const { remote, create } = bench({ create: [refuse('GOAL_ALREADY_EXISTS'), refuse('GOAL_INVALID_OBJECTIVE', 'untrimmed')] })

    await expect(setPlanAsGoal(remote, SESSION, PLAN)).resolves.toEqual({ kind: 'failed', code: 'GOAL_INVALID_OBJECTIVE', message: 'untrimmed' })
  })

  it('falls back to its own wording when the Host sends a blank message', async () => {
    const { remote } = bench({ create: [refuse('GOAL_INVALID_TRANSISION', '   ')] })

    await expect(setPlanAsGoal(remote, SESSION, PLAN))
      .resolves.toEqual({ kind: 'failed', code: 'GOAL_INVALID_TRANSISION', message: 'the goal could not be created' })
  })

  it('reports an unsupported deployment before any call', async () => {
    const create = vi.fn()

    await expect(setPlanAsGoal(undefined, SESSION, PLAN)).resolves.toEqual({ kind: 'unsupported' })

    expect(create).not.toHaveBeenCalled()
  })

  it('refuses an empty plan locally with the Host objective code', async () => {
    const { remote, create } = bench()

    await expect(setPlanAsGoal(remote, SESSION, '   \n '))
      .resolves.toEqual({ kind: 'failed', code: 'GOAL_INVALID_OBJECTIVE', message: 'goal objective must be a non-empty string' })

    expect(create).not.toHaveBeenCalled()
  })
})
