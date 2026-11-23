import { describe, expect, it } from 'vitest'
import { AsyncLocalStorage } from 'node:async_hooks'
import {
  parseDecision,
  reviewMessages,
  readDecision,
  snapshotAutoReview,
  installOwnReviewGate,
  topLevelMemberCount,
  type OwnGateAmbient,
  type OwnGateExecution,
} from '../src/auto-review-gate.ts'
import { defensivePermissionPresets, autoReviewStatus, ownGateEngaged } from '../src/auto-review.ts'

const abort = (): AbortSignal => new AbortController().signal

function textDelta(text: string) {
  return { type: 'text-delta', index: 0, text }
}
function finishChunk() {
  return { type: 'finish', reason: { kind: 'stop' } }
}
async function* streamOf(...chunks: unknown[]) {
  for (const chunk of chunks) yield chunk
}

describe('parseDecision', () => {
  it('accepts every protocol shape', () => {
    expect(parseDecision('{"risk":"low","decision":"allow"}')).toEqual({ risk: 'low', decision: 'allow' })
    expect(parseDecision('{"risk":"medium","decision":"allow"}')).toEqual({ risk: 'medium', decision: 'allow' })
    expect(parseDecision('{"risk":"medium","decision":"deny"}')).toEqual({ risk: 'medium', decision: 'deny' })
    expect(parseDecision('{"risk":"high","decision":"deny","reason":"no"}')).toEqual({ risk: 'high', decision: 'deny', reason: 'no' })
  })
  it('rejects every off-protocol shape', () => {
    expect(() => parseDecision('{"risk":"low","decision":"deny"}')).toThrow()
    expect(() => parseDecision('{"risk":"high","decision":"allow"}')).toThrow()
    expect(() => parseDecision('{"risk":"low","decision":"allow","reason":"x"}')).toThrow()
    expect(() => parseDecision('[]')).toThrow()
    expect(() => parseDecision('null')).toThrow()
    expect(() => parseDecision('{"risk":"low","decision":"allow","risk":"low"}')).toThrow()
  })
})

describe('topLevelMemberCount', () => {
  it('counts top-level members ignoring strings and nesting', () => {
    expect(topLevelMemberCount('{"a":1,"b":{"c":2}}')).toBe(2)
    expect(topLevelMemberCount('{"a":"{\"x\":1}","b":2}')).toBe(2)
    expect(topLevelMemberCount('{}')).toBe(0)
  })
})

describe('readDecision', () => {
  it('parses one text block after a terminal stop', async () => {
    const decision = await readDecision(streamOf(textDelta('{"risk":"low","decision":"allow"}'), finishChunk()))
    expect(decision).toEqual({ risk: 'low', decision: 'allow' })
  })
  it('fails when the finish is an error', async () => {
    await expect(readDecision(streamOf(textDelta('{}'), { type: 'finish', reason: { kind: 'error', failure: { code: 429, message: 'quota' } } }))).rejects.toThrow()
  })
})

describe('snapshotAutoReview', () => {
  function nativeSession() {
    const events = [
      { type: 'session', seq: 0, data: {} },
      { type: 'turn/start', seq: 1, data: { turn: 1 } },
      { type: 'step/start', seq: 2, data: { turn: 1, step: 1 } },
      { type: 'user/message', seq: 3, data: { source: { kind: 'user', rpcId: 'r1' }, content: [{ type: 'text', text: 'run it' }] } },
      { type: 'assistant/message', seq: 4, data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'tool-call', id: 'call_1', name: 'pwsh', arguments: '{"command":"echo hi"}' }] } } },
      { type: 'tool/call', seq: 5, data: { turn: 1, step: 1, callId: 'call_1', name: 'pwsh', arguments: '{"command":"echo hi"}' } },
    ]
    return {
      events,
      session: {
        id: 'session-snap',
        snapshotEvents: () => events,
        surface: { nodes: [1, 2, 3, 4] },
        requestHeader: () => ({ config: { provider: 'p1', model: 'm1' }, tools: [{ name: 'pwsh', description: 'Run a shell command', parameters: { type: 'object' } }] }),
        isOwnSeq: () => true,
        header: {},
      },
    }
  }
  function execOf(session: unknown, name = 'pwsh'): OwnGateExecution {
    return {
      name,
      arguments: { command: 'echo hi' },
      rootCallId: 'call_1',
      callId: 'call_1',
      parent: undefined,
      signal: abort(),
      agent: { session: session as never },
      schema: undefined,
    }
  }
  it('assembles the environment, the instruction, the schema and the pending call', () => {
    const { session } = nativeSession()
    const snapshot = snapshotAutoReview(session as never, execOf(session), 'D:\\cwd', new Map())
    expect(snapshot.provider).toBe('p1')
    expect(snapshot.model).toBe('m1')
    expect(snapshot.cwd).toBe('D:\\cwd')
    expect(snapshot.pending.schema.name).toBe('pwsh')
    expect(snapshot.pending.key).toContain('native')
    const roles = snapshot.history.map((entry: unknown) => (entry as { kind?: string; role?: string; mode?: string; name?: string }))
    expect(roles.map(r => r.kind)).toEqual(['user-message', 'tool-schema', 'tool-call'])
    expect(roles[0]?.role).toBe('user-instruction')
    expect(roles[1]?.name).toBe('pwsh')
    expect(roles[2]?.name).toBe('pwsh')
  })
  it('freezes the snapshot', () => {
    const { session } = nativeSession()
    const snapshot = snapshotAutoReview(session as never, execOf(session), 'cwd', new Map())
    expect(Object.isFrozen(snapshot)).toBe(true)
  })
  it('names the pending item by mode and step-scoped identity', () => {
    const { session } = nativeSession()
    const snapshot = snapshotAutoReview(session as never, execOf(session), 'cwd', new Map())
    expect(snapshot.pending.key).toContain('native')
    expect(snapshot.pending.key).toContain('call_1')
    expect(snapshot.pending.schema.description).toBe('Run a shell command')
  })
})

describe('installOwnReviewGate', () => {
  interface Harness {
    dispatch(exec: OwnGateExecution, next: () => Promise<unknown>, preset?: Partial<OwnGateAmbient>): Promise<unknown>
    execOf(): OwnGateExecution
    dispose(): Promise<void>
    llmCalls: Array<{ provider: string; model: string; system: string; purpose: string }>
    skips: number
    lastStore: OwnGateAmbient | undefined
  }
  function harness(options: Partial<Parameters<typeof installOwnReviewGate>[1]> & {
    decisions?: string[]
    approvalPolicy?: string
    isActive?: () => boolean
    allowlisted?: boolean
  } = {}): Harness {
    const decisions = options.decisions ?? ['{"risk":"low","decision":"allow"}']
    const llmCalls: Array<{ provider: string; model: string; system: string; purpose: string }> = []
    let skips = 0
    const listeners: Array<(exec: unknown, next: () => Promise<unknown>) => Promise<unknown>> = []
    const asyncDisposers: Array<() => unknown> = []
    const activeSession = new AsyncLocalStorage<OwnGateAmbient | undefined>()
    const { session } = ((): { session: unknown } => {
      const events = [
        { type: 'turn/start', seq: 1, data: { turn: 1 } },
        { type: 'step/start', seq: 2, data: { turn: 1, step: 1 } },
        { type: 'user/message', seq: 3, data: { source: { kind: 'user', rpcId: 'r1' }, content: [{ type: 'text', text: 'go' }] } },
        { type: 'assistant/message', seq: 4, data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'tool-call', id: 'call_1', name: 'pwsh', arguments: '{}' }] } } },
        { type: 'tool/call', seq: 5, data: { turn: 1, step: 1, callId: 'call_1', name: 'pwsh', arguments: '{}' } },
      ]
      return {
        session: {
          id: 'session-gate',
          snapshotEvents: () => events,
          surface: { nodes: [1, 2, 3, 4] },
          requestHeader: () => ({ config: { provider: 'p1', model: 'm1' }, tools: [{ name: 'pwsh', description: 'Run a command', parameters: { type: 'object' } }] }),
          isOwnSeq: () => true,
          header: {},
        },
      }
    })()
    let decisionIndex = 0
    const llm = {
      stream: (callOptions: { provider: string; model: string; system: string; purpose: string }) => {
        llmCalls.push({ provider: callOptions.provider, model: callOptions.model, system: callOptions.system, purpose: callOptions.purpose })
        const decision = decisions[Math.min(decisionIndex, decisions.length - 1)] as string
        decisionIndex += 1
        return streamOf(textDelta(decision), finishChunk())
      },
    }
    const workingDirectory = { ensure: async () => 'D:\\cwd' }
    const approval = { overrideOf: () => options.approvalPolicy ?? 'ask' }
    const gateCtx = {
      llm,
      workingDirectory,
      approval,
      on: (_event: string, handler: (exec: unknown, next: () => Promise<unknown>) => Promise<unknown>, _opts: unknown) => {
        listeners.unshift(handler)
        return () => {
          const at = listeners.indexOf(handler)
          if (at >= 0) listeners.splice(at, 1)
        }
      },
      effect: (gen: () => Generator<unknown, void, unknown>) => {
        const it = gen()
        let step = it.next()
        while (!step.done) {
          const value = step.value
          asyncDisposers.push(typeof value === 'function' ? (value as () => unknown) : () => undefined)
          step = it.next()
        }
        return () => { for (const dispose of asyncDisposers.splice(0)) void dispose() }
      },
    } as never
    installOwnReviewGate(gateCtx, {
      activeSession,
      isActive: options.isActive ?? (() => true),
      currentPreset: () => options.currentPreset ? options.currentPreset() : 'auto',
      skipReadOnly: options.skipReadOnly ?? (() => options.allowlisted === true),
      countReadOnlySkip: () => { skips += 1 },
      ...options,
    } as never)

    let lastStore: OwnGateAmbient | undefined
    const dispatch = (exec: OwnGateExecution, next: () => Promise<unknown>, preset?: Partial<OwnGateAmbient>): Promise<unknown> => {
      const store: OwnGateAmbient = { session: exec.agent?.session as never, tool: exec.name, handled: false, officialEngaged: false, ...preset }
      lastStore = store
      return activeSession.run(store, () => (listeners[0] as (e: unknown, n: () => Promise<unknown>) => Promise<unknown>)(exec, next))
    }
    const execOf = (): OwnGateExecution => ({
      name: 'pwsh',
      arguments: {},
      rootCallId: 'call_1',
      callId: 'call_1',
      parent: undefined,
      signal: abort(),
      agent: { session: session as never },
      schema: undefined,
    })
    return {
      dispatch,
      execOf,
      dispose: async () => { for (const dispose of asyncDisposers.splice(0)) await dispose() },
      llmCalls,
      get skips() { return skips },
      get lastStore() { return lastStore },
    }
  }
  it('reviews, allows, and passes the downstream decision through', async () => {
    const h = harness()
    const result = await h.dispatch(h.execOf(), async () => ({ kind: 'allow' }))
    expect(result).toEqual({ kind: 'allow' })
    expect(h.llmCalls).toHaveLength(1)
    expect(h.llmCalls[0]?.provider).toBe('p1')
    expect(h.llmCalls[0]?.model).toBe('m1')
    expect(h.llmCalls[0]?.purpose).toBe('auto-review')
    expect(h.llmCalls[0]?.system).toContain('REVIEW_POLICY')
  })
  it('routes the reviewer through the scoped llm face (route swap happens upstream)', async () => {
    const h = harness()
    await h.dispatch(h.execOf(), async () => ({ kind: 'allow' }))
    expect(h.llmCalls[0]?.provider).toBe('p1')
  })
  it('denies finally under a never approval policy', async () => {
    const h = harness({ decisions: ['{"risk":"high","decision":"deny","reason":"secret"}'], approvalPolicy: 'never' })
    const result = await h.dispatch(h.execOf(), async () => ({ kind: 'allow' }))
    const denial = result as { kind: string; info?: { code?: string; reason?: string } }
    expect(denial.kind).toBe('deny')
    expect(denial.info?.code).toBe('AUTO_REVIEW_DENIED')
    expect(denial.info?.reason).toBe('secret')
  })
  it('asks the user when the reviewer denies under ask', async () => {
    const h = harness({ decisions: ['{"risk":"medium","decision":"deny","reason":"irreversible"}'], approvalPolicy: 'ask' })
    const result = await h.dispatch(h.execOf(), async () => ({ kind: 'allow' }))
    const ask = result as { kind: string; reason?: string; displayReason?: { en?: string; zh?: string } }
    expect(ask.kind).toBe('ask')
    expect(ask.reason).toContain('irreversible')
    expect(ask.displayReason?.en).toContain('denied')
    expect(ask.displayReason?.zh).toContain('拒绝')
  })
  it('fails closed when the reviewer errors', async () => {
    const h = harness({ decisions: ['not json'] })
    const result = await h.dispatch(h.execOf(), async () => ({ kind: 'allow' }))
    const failure = result as { kind: string; info?: { code?: string } }
    expect(failure.kind).toBe('deny')
    expect(failure.info?.code).toBe('AUTO_REVIEW_FAILED')
  })
  it('skips review and counts once for an allowlisted tool', async () => {
    const h = harness({ allowlisted: true })
    const result = await h.dispatch(h.execOf(), async () => ({ kind: 'allow' }))
    expect(result).toEqual({ kind: 'allow' })
    expect(h.llmCalls).toHaveLength(0)
    expect(h.skips).toBe(1)
  })
  it('stays inert when isActive is false (clean host or switch off)', async () => {
    const h = harness({ isActive: () => false })
    const result = await h.dispatch(h.execOf(), async () => ({ kind: 'allow' }))
    expect(result).toEqual({ kind: 'allow' })
    expect(h.llmCalls).toHaveLength(0)
    expect(h.skips).toBe(0)
  })
  it('defers when the official gate already engaged this call', async () => {
    const h = harness()
    const result = await h.dispatch(h.execOf(), async () => ({ kind: 'allow' }), { officialEngaged: true })
    expect(result).toEqual({ kind: 'allow' })
    expect(h.llmCalls).toHaveLength(0)
  })
  it('defers when another listener already handled this call', async () => {
    const h = harness()
    const result = await h.dispatch(h.execOf(), async () => ({ kind: 'allow' }), { handled: true })
    expect(result).toEqual({ kind: 'allow' })
    expect(h.llmCalls).toHaveLength(0)
    expect(h.skips).toBe(0)
  })
  it('skips run_code transport calls (official parity)', async () => {
    const h = harness()
    const transport = { ...h.execOf(), name: 'run_code' }
    const result = await h.dispatch(transport as OwnGateExecution, async () => ({ kind: 'allow' }))
    expect(result).toEqual({ kind: 'allow' })
    expect(h.llmCalls).toHaveLength(0)
  })
  it('marks the ambient handled after its own review', async () => {
    const h = harness()
    await h.dispatch(h.execOf(), async () => ({ kind: 'allow' }))
    expect(h.lastStore?.handled).toBe(true)
  })
})

describe('preset shadow coordination', () => {
  it('answers custom when the ambient call is already handled', () => {
    const store: { current(session: unknown): string } = { current: () => 'auto' }
    const ambient = new AsyncLocalStorage<OwnGateAmbient | undefined>()
    let counted = 0
    const shadow = defensivePermissionPresets(
      () => store as never,
      { warn: () => undefined },
      () => '',
      { ambient: () => ambient.getStore(), allows: () => false },
    )
    const result = ambient.run({ session: {} as never, tool: 'pwsh', handled: true, officialEngaged: false }, () => shadow.current({} as never))
    expect(result).toBe('custom')
    expect(counted).toBe(0)
    counted = 0
  })
  it('marks officialEngaged when passing a non-allowlisted call through as auto', () => {
    const store: { current(session: unknown): string } = { current: () => 'auto' }
    const ambient = new AsyncLocalStorage<OwnGateAmbient | undefined>()
    const shadow = defensivePermissionPresets(
      () => store as never,
      { warn: () => undefined },
      () => '',
      { ambient: () => ambient.getStore(), allows: () => false },
    )
    let seen: OwnGateAmbient | undefined
    const result = ambient.run({ session: {} as never, tool: 'pwsh', handled: false, officialEngaged: false }, () => {
      const answer = shadow.current({} as never)
      seen = ambient.getStore()
      return answer
    })
    expect(result).toBe('auto')
    expect((seen as OwnGateAmbient | undefined)?.officialEngaged).toBe(true)
  })
  it('still counts and handles allowlisted calls once', () => {
    const store: { current(session: unknown): string } = { current: () => 'auto' }
    const ambient = new AsyncLocalStorage<OwnGateAmbient | undefined>()
    const shadow = defensivePermissionPresets(
      () => store as never,
      { warn: () => undefined },
      () => '',
      { ambient: () => ambient.getStore(), allows: () => true },
    )
    const before = autoReviewStatus.skippedReadOnly
    let seen: OwnGateAmbient | undefined
    const result = ambient.run({ session: {} as never, tool: 'read', handled: false, officialEngaged: false }, () => {
      const answer = shadow.current({} as never)
      seen = ambient.getStore()
      return answer
    })
    expect(result).toBe('custom')
    expect(autoReviewStatus.skippedReadOnly).toBe(before + 1)
    expect((seen as OwnGateAmbient | undefined)?.handled).toBe(true)
    autoReviewStatus.skippedReadOnly = before
  })
})

describe('ownGateEngaged', () => {
  it('is false while no purge bundle is recorded', () => {
    const before = autoReviewStatus.purgeInstalled
    autoReviewStatus.purgeInstalled = false
    expect(ownGateEngaged()).toBe(false)
    autoReviewStatus.purgeInstalled = before
  })
  it('defaults to armed once the purge bundle is recorded and no reader refuses', () => {
    const beforePurge = autoReviewStatus.purgeInstalled
    autoReviewStatus.purgeInstalled = true
    expect(ownGateEngaged()).toBe(true)
    autoReviewStatus.purgeInstalled = beforePurge
  })
})
