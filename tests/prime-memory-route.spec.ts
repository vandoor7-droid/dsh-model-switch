import { describe, expect, it } from 'vitest'
import {
  distillChainPatch,
  isPrimeMemoryRow,
  planDistillChain,
  primeMemoryRows,
  PRIME_MEMORY_ENTRY_ID,
  PRIME_MEMORY_PACKAGE,
  type DistillChainEntry,
} from '../src/prime-memory-route.js'

/** One loader entry shaped like the composed prime-memory row. */
const row = (id: string, name: string) => ({ options: { id, name } })

describe('prime-memory row detection', () => {
  it('matches the package name even when the row id was renamed', () => {
    expect(isPrimeMemoryRow(row('renamed-memory', PRIME_MEMORY_PACKAGE))).toBe(true)
  })

  it('falls back to the conventional id only without a package name', () => {
    expect(isPrimeMemoryRow(row(PRIME_MEMORY_ENTRY_ID, undefined))).toBe(true)
    expect(isPrimeMemoryRow(row('memory', 'another-plugin'))).toBe(false)
    expect(isPrimeMemoryRow(undefined)).toBe(false)
  })

  it('collects every matching row and ignores the rest', () => {
    const rows = primeMemoryRows([
      row('dsh-memory', PRIME_MEMORY_PACKAGE),
      row('model-switch', 'dsh-model-switch'),
      row('dsh-memory-2', PRIME_MEMORY_PACKAGE),
    ])
    expect(rows).toHaveLength(2)
  })
})

describe('planDistillChain', () => {
  const existing: readonly DistillChainEntry[] = [
    { provider: 'apigoto', model: 'mimo-v2.6-flash' },
    { provider: 'ark', model: 'ark-code-latest', reasoningEffort: 'low' },
  ]

  it('puts the chosen route first and keeps the existing fallbacks', () => {
    expect(planDistillChain({ provider: 'apigoto', model: 'gpt-6-luna' }, existing)).toEqual([
      { provider: 'apigoto', model: 'gpt-6-luna' },
      { provider: 'apigoto', model: 'mimo-v2.6-flash' },
      { provider: 'ark', model: 'ark-code-latest', reasoningEffort: 'low' },
    ])
  })

  it('drops a fallback that duplicates the chosen route', () => {
    expect(planDistillChain({ provider: 'apigoto', model: 'mimo-v2.6-flash' }, existing)).toEqual([
      { provider: 'apigoto', model: 'mimo-v2.6-flash' },
      { provider: 'ark', model: 'ark-code-latest', reasoningEffort: 'low' },
    ])
  })

  it('leaves the existing chain alone when the chosen route is incomplete', () => {
    expect(planDistillChain({ provider: 'apigoto', model: '  ' }, existing)).toEqual(existing)
    expect(planDistillChain(undefined, existing)).toEqual(existing)
  })

  it('skips blank halves on either side', () => {
    expect(planDistillChain({ provider: 'apigoto', model: 'gpt-6-luna' }, [
      { provider: '', model: 'x' },
      { provider: 'y', model: '' },
    ])).toEqual([{ provider: 'apigoto', model: 'gpt-6-luna' }])
  })

  it('returns an empty chain when nothing is configured', () => {
    expect(planDistillChain(undefined, undefined)).toEqual([])
  })
})

describe('distillChainPatch', () => {
  it('writes only the chain key, never the rest of the live section', () => {
    expect(distillChainPatch([{ provider: 'apigoto', model: 'gpt-6-luna' }])).toEqual({
      live: { distillChain: [{ provider: 'apigoto', model: 'gpt-6-luna' }] },
    })
  })
})
