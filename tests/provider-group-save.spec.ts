import { describe, expect, it, vi } from 'vitest'
import {
  PROVIDER_GROUP_SAVE_ATTEMPTS,
  saveProviderGroupFenced,
  type ProviderGroupForm,
} from '../src/client/provider-group-save.js'
import { entryOf, type ProviderGroupEntry } from '../src/provider-group.js'

/** A settings form that refuses the first `refusals` writes and accepts later ones. */
function bench(options: {
  revision?: number
  groups?: readonly ProviderGroupEntry[] | undefined
  refusals?: number
} = {}) {
  let revision = options.revision ?? 7
  let groups = options.groups
  let refusals = options.refusals ?? 0
  const mutate = vi.fn(async (ops: readonly { op: string; path: readonly string[]; value?: unknown }[], expectedRevision?: number) => {
    if (expectedRevision !== revision) return false
    if (refusals > 0) {
      refusals -= 1
      revision += 1
      return false
    }
    revision += 1
    for (const op of ops) {
      if (op.op === 'set') groups = op.value as readonly ProviderGroupEntry[]
      if (op.op === 'unset') groups = undefined
    }
    return true
  })
  const form: ProviderGroupForm = {
    getSnapshot: () => ({ revision, value: groups === undefined ? undefined : { providerGroups: groups } }),
    mutate: mutate as unknown as ProviderGroupForm['mutate'],
  }
  return { form, mutate, groups: () => groups, revision: () => revision }
}

describe('saveProviderGroupFenced', () => {
  it('writes one group atomically under the revision it read', async () => {
    const b = bench()
    await saveProviderGroupFenced(b.form, 'codex', { compactProvider: 'codex', compactModel: 'gpt-5' })
    expect(b.mutate).toHaveBeenCalledTimes(1)
    expect(b.mutate.mock.calls[0]?.[1]).toBe(7)
    expect(b.groups()).toEqual([entryOf('codex', { compactProvider: 'codex', compactModel: 'gpt-5' })])
  })

  it('re-reads the fence and retries after the host refuses once', async () => {
    const b = bench({ refusals: 1 })
    await saveProviderGroupFenced(b.form, 'codex', { compactProvider: 'codex', compactModel: 'gpt-5' })
    expect(b.mutate).toHaveBeenCalledTimes(2)
    expect(b.mutate.mock.calls[0]?.[1]).toBe(7)
    expect(b.mutate.mock.calls[1]?.[1]).toBe(8)
    expect(b.groups()).toEqual([entryOf('codex', { compactProvider: 'codex', compactModel: 'gpt-5' })])
  })

  it('reports settings-rejected only after every attempt was refused', async () => {
    const b = bench({ refusals: PROVIDER_GROUP_SAVE_ATTEMPTS })
    await expect(saveProviderGroupFenced(b.form, 'codex', { compactProvider: 'codex' })).rejects.toThrow('settings-rejected')
    expect(b.mutate).toHaveBeenCalledTimes(PROVIDER_GROUP_SAVE_ATTEMPTS)
  })

  it('clears the field when the last group is deleted', async () => {
    const b = bench({ groups: [entryOf('codex', { compactProvider: 'codex' })] })
    await saveProviderGroupFenced(b.form, 'codex', undefined)
    expect(b.mutate).toHaveBeenCalledTimes(1)
    expect(b.mutate.mock.calls[0]?.[0]).toEqual([{ op: 'unset', path: ['providerGroups'] }])
    expect(b.groups()).toBeUndefined()
  })

  it('skips the write when there is nothing to clear', async () => {
    const b = bench()
    await saveProviderGroupFenced(b.form, 'codex', undefined)
    expect(b.mutate).not.toHaveBeenCalled()
  })
})
