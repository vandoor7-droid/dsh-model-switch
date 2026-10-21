import { describe, expect, it } from 'vitest'
import {
  AUTO_SESSION_STATE_MAX_AGE_MS,
  decodeAutoSessionState,
  decodeAutoSessionStatePayload,
  encodeAutoSessionState,
  mergeAutoSessionIds,
  planAutoSnapshotReplay,
} from '../src/auto-sessions-state.ts'

describe('auto-session state snapshot', () => {
  it('round-trips the ids that were on Auto', () => {
    const raw = encodeAutoSessionState(['s1', 's2'], 1_000)
    expect(decodeAutoSessionState(raw, 1_000)).toEqual(['s1', 's2'])
  })

  it('dedupes ids and drops empty or non-string entries', () => {
    const raw = encodeAutoSessionState(['s1', 's1', '', 's2', 42 as unknown as string], 0)
    expect(decodeAutoSessionState(raw, 0)).toEqual(['s1', 's2'])
  })

  it('degrades every malformed shape to an empty replay', () => {
    expect(decodeAutoSessionState(undefined, 0)).toEqual([])
    expect(decodeAutoSessionState('   ', 0)).toEqual([])
    expect(decodeAutoSessionState('not json', 0)).toEqual([])
    expect(decodeAutoSessionState('[]', 0)).toEqual([])
    expect(decodeAutoSessionState('{"ids":["s1"]}', 0)).toEqual([])
    expect(decodeAutoSessionState('{"savedAt":0,"ids":"s1"}', 0)).toEqual([])
    expect(decodeAutoSessionState('{"savedAt":"now","ids":["s1"]}', 0)).toEqual([])
  })

  it('ignores a snapshot older than the replay window', () => {
    const raw = encodeAutoSessionState(['s1'], 0)
    expect(decodeAutoSessionState(raw, AUTO_SESSION_STATE_MAX_AGE_MS)).toEqual(['s1'])
    expect(decodeAutoSessionState(raw, AUTO_SESSION_STATE_MAX_AGE_MS + 1)).toEqual([])
  })
})

describe('auto-session state record', () => {
  it('keeps the recorded timestamp so a partial replay can write the rest back with the original expiry', () => {
    const raw = encodeAutoSessionState(['s1', 's2'], 5_000)
    const payload = decodeAutoSessionStatePayload(raw, 6_000)
    expect(payload).toEqual({ savedAt: 5_000, ids: ['s1', 's2'] })
    expect(decodeAutoSessionStatePayload(raw, 5_000 + AUTO_SESSION_STATE_MAX_AGE_MS + 1)).toBeUndefined()
  })

  it('merges the live read into the record instead of replacing it', () => {
    // 乱序拆卸：官方 gate 先销毁（会话已被翻离 Auto），此时活体读到的是空，
    // 记录里已经写过的 id 必须原样保留 —— 这就是插件安装类重组丢预设的根因。
    expect(mergeAutoSessionIds([], ['s1', 's2'])).toEqual(['s1', 's2'])
    expect(mergeAutoSessionIds(['s2'], ['s1', 's2'])).toEqual(['s2', 's1'])
    expect(mergeAutoSessionIds(['s1'], [])).toEqual(['s1'])
    expect(mergeAutoSessionIds([], [])).toEqual([])
  })

  it('replays only what a live session claims and keeps the rest recorded', () => {
    // 空列表不丢快照：会话还没加载时，整份记录都不能被消费。
    expect(planAutoSnapshotReplay(['s1', 's2'], [])).toEqual({ restore: [], remaining: ['s1', 's2'] })
    // 一次只回来一个会话时，剩下的继续留在文件里。
    expect(planAutoSnapshotReplay(['s1', 's2'], [{ id: 's1' }])).toEqual({ restore: ['s1'], remaining: ['s2'] })
    // 全部到齐才允许整份消费。
    expect(planAutoSnapshotReplay(['s1', 's2'], [{ id: 's1' }, { id: 's2' }])).toEqual({ restore: ['s1', 's2'], remaining: [] })
  })

  it('survives repeated recomposes: each pass narrows the record until it is empty', () => {
    // 连续多次重组：第一轮只回放 s1，第二轮回放 s2，第三轮记录为空并被删除。
    const first = planAutoSnapshotReplay(['s1', 's2'], [{ id: 's1' }])
    expect(first.remaining).toEqual(['s2'])
    const second = planAutoSnapshotReplay(first.remaining, [{ id: 's2' }])
    expect(second).toEqual({ restore: ['s2'], remaining: [] })
    expect(planAutoSnapshotReplay(second.remaining, [])).toEqual({ restore: [], remaining: [] })
  })
})
