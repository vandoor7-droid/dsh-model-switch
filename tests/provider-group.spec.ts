import { describe, expect, it } from 'vitest'
import {
  canonicalGroupProvider,
  entryOf,
  groupOf,
  groupOfCanonical,
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
      memoryProvider: '',
      memoryModel: '',
      memoryReasoningEffort: '',
      visionProvider: '',
      visionModel: '',
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
      memoryProvider: '',
      memoryModel: '',
      memoryReasoningEffort: '',
      visionProvider: '',
      visionModel: '',
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

describe('canonicalGroupProvider', () => {
  it('strips one trailing -vision when the base is non-empty', () => {
    expect(canonicalGroupProvider('yijia925-vision')).toBe('yijia925')
    expect(canonicalGroupProvider('a-b-vision')).toBe('a-b')
  })

  it('keeps ids without the twin suffix and a bare suffix', () => {
    expect(canonicalGroupProvider('apigoto')).toBe('apigoto')
    expect(canonicalGroupProvider('-vision')).toBe('-vision')
  })
})

describe('twin group folding', () => {
  it('folds a twin group into its base, base fields winning', () => {
    const groups = normalizeProviderGroups([
      { provider: 'yijia925', compactProvider: 'yijia925', compactModel: 'glm-5.3-flash' },
      { provider: 'yijia925-vision', compactProvider: 'other', titleProvider: 'yijia925', titleModel: 'glm-5.3' },
    ])
    expect(groups).toEqual({
      yijia925: { compactProvider: 'yijia925', compactModel: 'glm-5.3-flash', titleProvider: 'yijia925', titleModel: 'glm-5.3' },
    })
  })

  it('rekeys a twin group whose base has no entry', () => {
    expect(normalizeProviderGroups([{ provider: 'yijia925-vision', memoryProvider: 'yijia925', memoryModel: 'glm-5.3-flash' }])).toEqual({
      yijia925: { memoryProvider: 'yijia925', memoryModel: 'glm-5.3-flash' },
    })
  })

  it('leaves providers without the suffix untouched', () => {
    expect(normalizeProviderGroups([{ provider: 'codex' }, { provider: 'grok' }])).toEqual({ codex: {}, grok: {} })
  })
})

describe('groupOfCanonical', () => {
  it('resolves a twin key to the base group first', () => {
    const groups = normalizeProviderGroups([{ provider: 'yijia925', compactProvider: 'yijia925', compactModel: 'glm-5.3-flash' }])
    expect(groupOfCanonical(groups, 'yijia925-vision')).toEqual({ compactProvider: 'yijia925', compactModel: 'glm-5.3-flash' })
    expect(groupOfCanonical(groups, 'yijia925')).toEqual({ compactProvider: 'yijia925', compactModel: 'glm-5.3-flash' })
  })

  it('falls back to the raw key for a twin-only stored group', () => {
    // Hand-written storage that normalization has not folded yet.
    const groups = { 'yijia925-vision': { compactProvider: 'yijia925' } } as never
    expect(groupOfCanonical(groups, 'yijia925-vision')).toEqual({ compactProvider: 'yijia925' })
  })

  it('returns undefined for blank or unknown providers', () => {
    const groups = normalizeProviderGroups([{ provider: 'codex' }])
    expect(groupOfCanonical(groups, '')).toBeUndefined()
    expect(groupOfCanonical(groups, 'deepseek')).toBeUndefined()
    expect(groupOfCanonical(undefined, 'codex')).toBeUndefined()
  })
})
