import { describe, expect, it } from 'vitest'
import {
  AUTO_SESSION_STATE_MAX_AGE_MS,
  decodeAutoSessionState,
  encodeAutoSessionState,
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
