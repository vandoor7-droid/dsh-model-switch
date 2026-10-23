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
const REF: GoalRef = { id: 'goal-1', revision: 3 }
const VIEW: GoalView = { id: 'goal-1', revision: 3, phase: 'active', activation: 'armed' }
const DOC_REF = { requestKey: 'plan-1' } as const
const OBJECTIVE = '持续推进当前plan直到完成（plan 文档：dsh-resource://plan-review/session-1/plan-1）'

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
  it('creates the goal with a short objective pointing at the plan document', async () => {
    const { remote, create, get, clear } = bench()

    await expect(setPlanAsGoal(remote, SESSION, PLAN, DOC_REF)).resolves.toEqual({ kind: 'created' })

    expect(create).toHaveBeenCalledExactlyOnceWith(SESSION, { objective: OBJECTIVE })
    // The raw plan markdown never rides on the objective: goal objectives are
    // injected every round and a full plan would be truncated mid-sentence.
    expect((create.mock.calls[0]![1] as { objective: string }).objective).not.toContain('# Ship it')
    expect(get).not.toHaveBeenCalled()
    expect(clear).not.toHaveBeenCalled()
  })

  it('points at the durable plan address when the review carries a logged call id', async () => {
    const { remote, create } = bench()

    await expect(setPlanAsGoal(remote, SESSION, PLAN, { callId: 'call/ 1', requestKey: 'plan-1' })).resolves.toEqual({ kind: 'created' })

    expect(create).toHaveBeenCalledExactlyOnceWith(SESSION, {
      objective: '持续推进当前plan直到完成（plan 文档：dsh-resource://plan/session-1/call%2F%201）',
    })
  })

  it('replaces an unfinished goal with a fresh one before returning', async () => {
    const { remote, create, get, clear } = bench({
      create: [refuse('GOAL_ALREADY_EXISTS'), ok({ ref: { id: 'goal-2', revision: 1 } })],
    })

    await expect(setPlanAsGoal(remote, SESSION, PLAN, DOC_REF)).resolves.toEqual({ kind: 'replaced' })

    expect(get).toHaveBeenCalledExactlyOnceWith(SESSION)
    expect(clear).toHaveBeenCalledExactlyOnceWith(SESSION, { id: 'goal-1', revision: 3 })
    expect(create).toHaveBeenCalledTimes(2)
    expect(create).toHaveBeenNthCalledWith(2, SESSION, { objective: OBJECTIVE })
    // The clear settles before the retry: clearing after the second create would
    // race the goal that just replaced the first one.
    expect(clear.mock.invocationCallOrder[0]).toBeLessThan(create.mock.invocationCallOrder[1]!)
  })

  it('reads the compare-and-set ref from the current view', async () => {
    const { remote, clear } = bench({
      create: [refuse('GOAL_ALREADY_EXISTS'), ok({ ref: REF })],
      get: ok({ id: 'goal-9', revision: 42, phase: 'paused', activation: 'disarmed' }),
    })

    await expect(setPlanAsGoal(remote, SESSION, PLAN, DOC_REF)).resolves.toEqual({ kind: 'replaced' })

    expect(clear).toHaveBeenCalledWith(SESSION, { id: 'goal-9', revision: 42 })
  })

  it.each(['GOAL_INVALID_OBJECTIVE', 'GOAL_AGENT_NOT_LIVE', 'GOAL_INVALID_TRANSITION'])(
    'reports a refused create without touching the current goal (%s)',
    async (code) => {
      const { remote, create, get, clear } = bench({ create: [refuse(code, 'create refused')] })

      await expect(setPlanAsGoal(remote, SESSION, PLAN, DOC_REF)).resolves.toEqual({ kind: 'failed', code, message: 'create refused' })

      expect(create).toHaveBeenCalledOnce()
      expect(get).not.toHaveBeenCalled()
      expect(clear).not.toHaveBeenCalled()
    },
  )

  it('reports an unreadable current goal', async () => {
    const { remote, clear } = bench({ create: [refuse('GOAL_ALREADY_EXISTS'), ok({ ref: REF })], get: refuse('GOAL_AGENT_NOT_LIVE', 'agent is gone') })

    await expect(setPlanAsGoal(remote, SESSION, PLAN, DOC_REF)).resolves.toEqual({ kind: 'failed', code: 'GOAL_AGENT_NOT_LIVE', message: 'agent is gone' })

    expect(clear).not.toHaveBeenCalled()
  })

  it('reports a clear that refuses, without retrying the create', async () => {
    const { remote, create } = bench({
      create: [refuse('GOAL_ALREADY_EXISTS'), ok({ ref: REF })],
      clear: refuse('GOAL_STALE_REVISION', 'someone else edited'),
    })

    await expect(setPlanAsGoal(remote, SESSION, PLAN, DOC_REF)).resolves.toEqual({ kind: 'failed', code: 'GOAL_STALE_REVISION', message: 'someone else edited' })

    expect(create).toHaveBeenCalledOnce()
  })

  it('reports the second create refusing after a successful clear', async () => {
    const { remote, create } = bench({ create: [refuse('GOAL_ALREADY_EXISTS'), refuse('GOAL_INVALID_OBJECTIVE', 'untrimmed')] })

    await expect(setPlanAsGoal(remote, SESSION, PLAN, DOC_REF)).resolves.toEqual({ kind: 'failed', code: 'GOAL_INVALID_OBJECTIVE', message: 'untrimmed' })
  })

  it('falls back to its own wording when the Host sends a blank message', async () => {
    const { remote } = bench({ create: [refuse('GOAL_INVALID_TRANSISION', '   ')] })

    await expect(setPlanAsGoal(remote, SESSION, PLAN, DOC_REF))
      .resolves.toEqual({ kind: 'failed', code: 'GOAL_INVALID_TRANSISION', message: 'the goal could not be created' })
  })

  it('reports an unsupported deployment before any call', async () => {
    const create = vi.fn()

    await expect(setPlanAsGoal(undefined, SESSION, PLAN, DOC_REF)).resolves.toEqual({ kind: 'unsupported' })

    expect(create).not.toHaveBeenCalled()
  })

  it('refuses an empty plan locally with the Host objective code', async () => {
    const { remote, create } = bench()

    await expect(setPlanAsGoal(remote, SESSION, '   \n ', DOC_REF))
      .resolves.toEqual({ kind: 'failed', code: 'GOAL_INVALID_OBJECTIVE', message: 'goal objective must be a non-empty string' })

    expect(create).not.toHaveBeenCalled()
  })

  it('replaces the goal when the gateway relays the refusal as gateway/internal', async () => {
    // The Host throws GoalError; the RPC gateway answers
    // `{ code: 'gateway/internal', message: <thrown text> }` instead of the
    // domain code, so the text is the only conflict signal a client ever sees.
    const { remote, create, clear } = bench({
      create: [
        refuse('gateway/internal', 'goal "goal-1" already exists with phase "paused"'),
        ok({ ref: { id: 'goal-2', revision: 1 } }),
      ],
      get: ok({ id: 'goal-1', revision: 7, phase: 'paused', activation: 'disarmed' }),
    })

    await expect(setPlanAsGoal(remote, SESSION, PLAN, DOC_REF)).resolves.toEqual({ kind: 'replaced' })

    expect(clear).toHaveBeenCalledExactlyOnceWith(SESSION, { id: 'goal-1', revision: 7 })
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('replaces a blocked goal the same way', async () => {
    const { remote, clear } = bench({
      create: [refuse('gateway/internal', 'goal "goal-1" already exists with phase "blocked"'), ok({ ref: REF })],
      get: ok({ id: 'goal-1', revision: 4, phase: 'blocked', activation: 'disarmed' }),
    })

    await expect(setPlanAsGoal(remote, SESSION, PLAN, DOC_REF)).resolves.toEqual({ kind: 'replaced' })

    expect(clear).toHaveBeenCalledWith(SESSION, { id: 'goal-1', revision: 4 })
  })

  it('never clears the current goal for a gateway refusal that is not a conflict', async () => {
    const { remote, create, get, clear } = bench({
      create: [refuse('gateway/internal', 'goal "goal-1" owner agent is not live')],
    })

    await expect(setPlanAsGoal(remote, SESSION, PLAN, DOC_REF)).resolves.toEqual({
      kind: 'failed',
      message: 'goal "goal-1" owner agent is not live',
    })

    expect(create).toHaveBeenCalledOnce()
    expect(get).not.toHaveBeenCalled()
    expect(clear).not.toHaveBeenCalled()
  })

  it('turns a rejected create into a failed handoff instead of throwing', async () => {
    const remote: GoalRemote = {
      create: (async () => { throw new Error('gateway/internal: connection lost') }) as unknown as GoalRemote['create'],
      get: vi.fn() as unknown as GoalRemote['get'],
      clear: vi.fn() as unknown as GoalRemote['clear'],
    }

    await expect(setPlanAsGoal(remote, SESSION, PLAN, DOC_REF)).resolves.toEqual({
      kind: 'failed',
      message: 'connection lost',
    })
  })

  it('reports a rejected read without clearing anything', async () => {
    const clear = vi.fn()
    const remote: GoalRemote = {
      create: (async () => refuse('GOAL_ALREADY_EXISTS')) as unknown as GoalRemote['create'],
      get: (async () => { throw new Error('read exploded') }) as unknown as GoalRemote['get'],
      clear: clear as unknown as GoalRemote['clear'],
    }

    await expect(setPlanAsGoal(remote, SESSION, PLAN, DOC_REF)).resolves.toEqual({ kind: 'failed', message: 'read exploded' })

    expect(clear).not.toHaveBeenCalled()
  })

  it('reports a rejected clear without retrying the create', async () => {
    const create = vi.fn(async () => refuse('GOAL_ALREADY_EXISTS')) as unknown as GoalRemote['create']
    const remote: GoalRemote = {
      create,
      get: (async () => ok({ id: 'goal-1', revision: 2, phase: 'blocked', activation: 'disarmed' })) as unknown as GoalRemote['get'],
      clear: (async () => { throw new Error('clear exploded') }) as unknown as GoalRemote['clear'],
    }

    await expect(setPlanAsGoal(remote, SESSION, PLAN, DOC_REF)).resolves.toEqual({ kind: 'failed', message: 'clear exploded' })

    expect(create).toHaveBeenCalledOnce()
  })
})
