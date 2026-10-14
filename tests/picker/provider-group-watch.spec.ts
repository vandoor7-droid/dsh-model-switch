import { describe, expect, it, vi } from 'vitest'
import type { ModelSelection } from '@deepseek-ai/dsh-api-session-controller/types'
import { createProviderGroupWatch, type DirectoryWatchSource } from '../../src/client/picker/provider-group-watch.js'

function store(initial: ModelSelection | null) {
  let snapshot: { current: ModelSelection | null } = { current: initial }
  const listeners = new Set<() => void>()
  const source: DirectoryWatchSource = {
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    getSnapshot: () => snapshot,
  }
  const emit = (next: ModelSelection | null): void => {
    snapshot = { current: next }
    for (const listener of listeners) listener()
  }
  const size = (): number => listeners.size
  return { source, emit, size }
}

const selection = (provider: string, model = 'm'): ModelSelection => ({ provider, model })
const settle = async (rounds = 3): Promise<void> => {
  for (let round = 0; round < rounds; round += 1) await new Promise(resolve => setTimeout(resolve, 0))
}

describe('provider group watch', () => {
  it('applies the target provider group once per provider change', async () => {
    const apply = vi.fn(async () => undefined)
    const { source, emit } = store(selection('deepseek'))
    createProviderGroupWatch({ source, apply })

    await settle()
    expect(apply).not.toHaveBeenCalled()
    emit(selection('codex'))
    await settle()
    expect(apply).toHaveBeenCalledExactlyOnceWith('codex')
    // A model-only change inside one provider never writes routes.
    emit(selection('codex', 'other-model'))
    await settle()
    expect(apply).toHaveBeenCalledOnce()
    emit(selection('grok'))
    await settle()
    expect(apply).toHaveBeenLastCalledWith('grok')
  })

  it('treats the first loaded provider as the baseline and ignores null snapshots', async () => {
    const apply = vi.fn(async () => undefined)
    const { source, emit } = store(null)
    createProviderGroupWatch({ source, apply })

    // Initial load lands after subscribe: baseline, not a switch.
    emit(selection('deepseek'))
    await settle()
    expect(apply).not.toHaveBeenCalled()
    // A catalog reload flicker is not a switch either.
    emit(null)
    emit(selection('codex'))
    await settle()
    expect(apply).toHaveBeenCalledExactlyOnceWith('codex')
  })

  it('serializes applies and coalesces to the latest target', async () => {
    const order: string[] = []
    let releaseFirst: () => void = () => undefined
    const firstGate = new Promise<void>(resolve => { releaseFirst = resolve })
    let calls = 0
    const apply = vi.fn(async (provider: string) => {
      calls += 1
      order.push('start:' + provider)
      if (calls === 1) await firstGate
      order.push('end:' + provider)
    })
    const { source, emit } = store(selection('a'))
    const watch = createProviderGroupWatch({ source, apply })

    emit(selection('b'))
    emit(selection('c'))
    await settle(1)
    expect(order).toEqual(['start:b'])
    releaseFirst()
    await settle()
    // c arrived while b was running; it runs once, after b completed.
    expect(order).toEqual(['start:b', 'end:b', 'start:c', 'end:c'])
    watch.dispose()
  })

  it('reports a failed apply without disturbing the watch', async () => {
    const onFailure = vi.fn()
    const apply = vi.fn(async () => { throw new Error('rpc down') })
    const { source, emit } = store(selection('a'))
    const watch = createProviderGroupWatch({ source, apply, onFailure })

    emit(selection('b'))
    await settle()
    expect(onFailure).toHaveBeenCalledExactlyOnceWith(expect.any(Error))
    emit(selection('c'))
    await settle()
    expect(onFailure).toHaveBeenCalledTimes(2)
    watch.dispose()
  })

  it('warns by default when no failure reporter is given', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const { source, emit } = store(selection('a'))
      createProviderGroupWatch({ source, apply: async () => { throw new Error('boom') } })
      emit(selection('b'))
      await settle()
      expect(warn).toHaveBeenCalledWith('dsh-model-switch: provider group apply failed', expect.any(Error))
    } finally {
      warn.mockRestore()
    }
  })

  it('stops observing after dispose', async () => {
    const apply = vi.fn(async () => undefined)
    const { source, emit, size } = store(selection('a'))
    const watch = createProviderGroupWatch({ source, apply })
    expect(size()).toBe(1)
    watch.dispose()
    expect(size()).toBe(0)
    emit(selection('b'))
    await settle()
    expect(apply).not.toHaveBeenCalled()
  })
})
