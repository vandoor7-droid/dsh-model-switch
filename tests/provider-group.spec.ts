import { describe, expect, it } from 'vitest'
import {
  entryOf,
  groupOf,
  normalizeProviderGroups,
  withProviderGroup,
} from '../src/provider-group.js'

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
  it('drops blank record keys and blank fields as if they were absent', () => {
    expect(normalizeProviderGroups({ '  ': { compactProvider: 'x' }, codex: { subagentModel: '   ' } })).toEqual({ codex: {} })
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
      titleProvider: '',
      titleModel: '',
    })
  })
  it('stores a pinned naming route alongside the other capabilities', () => {
    expect(entryOf('deepseek', { titleProvider: 'deepseek', titleModel: 'deep-mini' })).toEqual({
      provider: 'deepseek',
      compactProvider: '',
      compactModel: '',
      autoReviewProvider: '',
      autoReviewModel: '',
      subagentProvider: '',
      subagentModel: '',
      subagentReasoningEffort: '',
      titleProvider: 'deepseek',
      titleModel: 'deep-mini',
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
