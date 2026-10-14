import { describe, expect, it } from 'vitest'
import {
  applyProviderGroupTo,
  entryOf,
  groupOf,
  normalizeProviderGroups,
  providerGroupWrites,
  withProviderGroup,
  type ProviderGroupConfig,
  type ProviderGroupSink,
} from '../src/provider-group.js'

function sink() {
  const calls: Array<{ op: 'set' | 'unset'; field: string; value?: string }> = []
  const mock: ProviderGroupSink = {
    set: async (field, value) => { calls.push({ op: 'set', field, value }) },
    unset: async field => { calls.push({ op: 'unset', field }) },
  }
  return { calls, mock }
}

describe('normalizeProviderGroups', () => {
  it('returns an empty map for every non-object input', () => {
    expect(normalizeProviderGroups(undefined)).toEqual({})
    expect(normalizeProviderGroups(null)).toEqual({})
    expect(normalizeProviderGroups('[]')).toEqual({})
    expect(normalizeProviderGroups(42)).toEqual({})
    expect(normalizeProviderGroups(true)).toEqual({})
    expect(normalizeProviderGroups([])).toEqual({})
    expect(normalizeProviderGroups([null, 42, 'x', []])).toEqual({})
  })
  it('reads stored entries, stripping blank fields, unknown fields, and blank providers', () => {
    expect(normalizeProviderGroups([
      { provider: 'codex', compactProvider: 'codex', compactModel: 'gpt', subagentModel: '   ', autoReviewProvider: 7, searchProvider: 'leak' },
      { provider: '   ' },
      { provider: 'deepseek' },
      'junk',
    ])).toEqual({
      codex: { compactProvider: 'codex', compactModel: 'gpt' },
      deepseek: {},
    })
  })
  it('keeps a later duplicate provider and rejects a record value that is not an object', () => {
    expect(normalizeProviderGroups([
      { provider: 'codex', compactProvider: 'old' },
      { provider: 'codex', compactProvider: 'new' },
    ])).toEqual({ codex: { compactProvider: 'new' } })
    expect(normalizeProviderGroups({ codex: 'junk', grok: { compactProvider: 'grok' } })).toEqual({ grok: { compactProvider: 'grok' } })
  })
  it('treats a literal __proto__ provider id as data, never as a prototype', () => {
    const raw: unknown = JSON.parse('{"__proto__": {"compactProvider": "x"}, "codex": {}}')
    const groups = normalizeProviderGroups(raw)
    expect(Object.getPrototypeOf(groups)).toBe(Object.prototype)
    expect(Object.prototype.hasOwnProperty.call(groups, '__proto__')).toBe(true)
    expect(groupOf(groups, '__proto__')).toEqual({ compactProvider: 'x' })
  })
})

describe('groupOf', () => {
  it('distinguishes no group from a group pinned to every default', () => {
    const groups = normalizeProviderGroups([{ provider: 'codex' }])
    expect(groupOf(undefined, 'codex')).toBeUndefined()
    expect(groupOf(groups, '')).toBeUndefined()
    expect(groupOf(groups, 'deepseek')).toBeUndefined()
    expect(groupOf(groups, 'codex')).toEqual({})
  })
})

describe('providerGroupWrites', () => {
  it('emits an ordered full-replacement sequence with the mode write last', () => {
    expect(providerGroupWrites({
      compactProvider: 'deepseek', compactModel: 'deep-chat',
      autoReviewProvider: 'codex', autoReviewModel: 'gpt-review',
      subagentProvider: 'grok', subagentModel: 'grok-fast', subagentReasoningEffort: 'low',
    })).toEqual([
      { field: 'compactProvider', value: 'deepseek' },
      { field: 'compactModel', value: 'deep-chat' },
      { field: 'autoReviewProvider', value: 'codex' },
      { field: 'autoReviewModel', value: 'gpt-review' },
      { field: 'subagentProvider', value: 'grok' },
      { field: 'subagentModel', value: 'grok-fast' },
      { field: 'subagentReasoningEffort', value: 'low' },
      { field: 'subagentMode', mode: 'fixed' },
    ])
  })
  it('reverts every capability to its default when the group pins nothing', () => {
    expect(providerGroupWrites({})).toEqual([
      { field: 'compactProvider', value: undefined },
      { field: 'compactModel', value: undefined },
      { field: 'autoReviewProvider', value: undefined },
      { field: 'autoReviewModel', value: undefined },
      { field: 'subagentProvider', value: undefined },
      { field: 'subagentModel', value: undefined },
      { field: 'subagentReasoningEffort', value: undefined },
      { field: 'subagentMode', mode: 'follow-main' },
    ])
  })
  it('drops half pairs instead of writing them', () => {
    const writes = providerGroupWrites({ compactProvider: 'codex', autoReviewModel: 'gpt', subagentProvider: 'grok', subagentModel: 'grok-fast' })
    expect(writes).toEqual([
      { field: 'compactProvider', value: undefined },
      { field: 'compactModel', value: undefined },
      { field: 'autoReviewProvider', value: undefined },
      { field: 'autoReviewModel', value: undefined },
      { field: 'subagentProvider', value: 'grok' },
      { field: 'subagentModel', value: 'grok-fast' },
      { field: 'subagentReasoningEffort', value: undefined },
      { field: 'subagentMode', mode: 'fixed' },
    ])
  })
  it('drops the effort with its subagent pair when the pair is incomplete', () => {
    const writes = providerGroupWrites({ subagentProvider: 'grok', subagentReasoningEffort: 'low' })
    expect(writes.find(write => write.field === 'subagentReasoningEffort')).toEqual({ field: 'subagentReasoningEffort', value: undefined })
    expect(writes.at(-1)).toEqual({ field: 'subagentMode', mode: 'follow-main' })
  })
  it('keeps a blank effort as the provider default while the pair stays fixed', () => {
    const writes = providerGroupWrites({ subagentProvider: 'grok', subagentModel: 'grok-fast', subagentReasoningEffort: '  ' })
    expect(writes.find(write => write.field === 'subagentReasoningEffort')).toEqual({ field: 'subagentReasoningEffort', value: undefined })
    expect(writes.at(-1)).toEqual({ field: 'subagentMode', mode: 'fixed' })
  })
})

describe('entryOf', () => {
  it('produces a complete storage entry with blanks for absent fields', () => {
    expect(entryOf('codex', { compactProvider: 'codex', compactModel: 'gpt' })).toEqual({
      provider: 'codex',
      compactProvider: 'codex',
      compactModel: 'gpt',
      autoReviewProvider: '',
      autoReviewModel: '',
      subagentProvider: '',
      subagentModel: '',
      subagentReasoningEffort: '',
    })
  })
})

describe('withProviderGroup', () => {
  it('adds a group to an empty storage without mutating the input', () => {
    const storage: unknown = undefined
    expect(withProviderGroup(storage, 'codex', { compactProvider: 'codex', compactModel: 'gpt' })).toEqual([
      entryOf('codex', { compactProvider: 'codex', compactModel: 'gpt' }),
    ])
    expect(storage).toBeUndefined()
  })
  it('replaces one provider and re-normalizes every other entry', () => {
    const storage = [
      { provider: 'deepseek', compactProvider: 'deepseek', compactModel: 'deep-chat', subagentModel: '' },
      { provider: 'codex', compactProvider: 'old' },
      'junk' as never,
    ]
    const next = withProviderGroup(storage, 'codex', {})
    expect(next).toEqual([
      entryOf('deepseek', { compactProvider: 'deepseek', compactModel: 'deep-chat' }),
      entryOf('codex', {}),
    ])
    expect(storage[2]).toBe('junk')
  })
  it('removes only the requested provider', () => {
    const storage = [entryOf('codex', {}), entryOf('deepseek', { compactProvider: 'deepseek', compactModel: 'deep-chat' })]
    expect(withProviderGroup(storage, 'codex', undefined)).toEqual([
      entryOf('deepseek', { compactProvider: 'deepseek', compactModel: 'deep-chat' }),
    ])
  })
  it('only normalizes on a blank provider', () => {
    expect(withProviderGroup([{ provider: 'codex', compactProvider: 'codex' }], '  ', {})).toEqual([
      entryOf('codex', { compactProvider: 'codex' }),
    ])
  })
  it('accepts a hand-written record form when replacing', () => {
    expect(withProviderGroup({ codex: { compactProvider: 'codex' } }, 'grok', { compactProvider: 'grok', compactModel: 'fast' })).toEqual([
      entryOf('codex', { compactProvider: 'codex' }),
      entryOf('grok', { compactProvider: 'grok', compactModel: 'fast' }),
    ])
  })
})

describe('applyProviderGroupTo', () => {
  it('writes nothing and reports false when the provider has no group', async () => {
    const probe = sink()
    await expect(applyProviderGroupTo(probe.mock, normalizeProviderGroups([]), 'codex')).resolves.toBe(false)
    expect(probe.calls).toEqual([])
    await expect(applyProviderGroupTo(probe.mock, undefined, 'codex')).resolves.toBe(false)
    expect(probe.calls).toEqual([])
  })
  it('applies a saved group as ordered set/unset writes ending on subagentMode', async () => {
    const probe = sink()
    const groups = normalizeProviderGroups([
      { provider: 'codex', compactProvider: 'codex', compactModel: 'gpt', subagentProvider: 'codex', subagentModel: 'gpt-sub', subagentReasoningEffort: '' },
    ])
    await expect(applyProviderGroupTo(probe.mock, groups, 'codex')).resolves.toBe(true)
    expect(probe.calls).toEqual([
      { op: 'set', field: 'compactProvider', value: 'codex' },
      { op: 'set', field: 'compactModel', value: 'gpt' },
      { op: 'unset', field: 'autoReviewProvider' },
      { op: 'unset', field: 'autoReviewModel' },
      { op: 'set', field: 'subagentProvider', value: 'codex' },
      { op: 'set', field: 'subagentModel', value: 'gpt-sub' },
      { op: 'unset', field: 'subagentReasoningEffort' },
      { op: 'set', field: 'subagentMode', value: 'fixed' },
    ])
  })
  it('propagates a rejected write', async () => {
    const group: ProviderGroupConfig = { compactProvider: 'codex', compactModel: 'gpt' }
    const rejecting: ProviderGroupSink = { set: async () => { throw new Error('rpc down') }, unset: async () => undefined }
    await expect(applyProviderGroupTo(rejecting, { codex: group }, 'codex')).rejects.toThrow('rpc down')
  })
  it('settles only after every write, in order', async () => {
    const order: string[] = []
    const slow: ProviderGroupSink = {
      set: async field => { order.push('set:' + field) },
      unset: async field => { order.push('unset:' + field) },
    }
    await applyProviderGroupTo(slow, { codex: { subagentProvider: 'codex', subagentModel: 'gpt' } }, 'codex')
    expect(order.at(-1)).toBe('set:subagentMode')
  })
})
