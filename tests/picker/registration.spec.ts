import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const Stub = () => null
  return {
    Button: Stub, Input: Stub, Toast: Stub, MarkdownText: Stub,
    extractMarkdownPlainText: Stub,
    IconCheckOutlineRegular: Stub, IconChevronDownOutlineRegular: Stub, IconChevronLeftOutlineRegular: Stub,
    IconChevronRightOutlineRegular: Stub, IconCloseOutlineRegular: Stub, IconSearchOutlineRegular: Stub, IconWarningOutlineRegular: Stub,
  }
})

import { installComposerPicker, providerOrderStore } from '../../src/client/picker/install.tsx'
import type { PlanCommitOutcome } from '../../src/picker/plan-review.ts'

const COMMITTED: PlanCommitOutcome = { committed: true }
const REFUSED: PlanCommitOutcome = { committed: false }
type SelectFace = { select(selection: { provider: string, model: string }): Promise<PlanCommitOutcome> }

function bench(strictOptionalLookup = false) {
  const entries: Array<{ spec: Record<string, unknown>, component: unknown }> = []
  const injections: string[][] = []
  const directory = {
    store: {
      subscribe: vi.fn(() => () => undefined),
      getSnapshot: vi.fn(() => ({ current: null as { provider: string, model: string } | null })),
    },
    load: vi.fn(async () => undefined),
    select: vi.fn(async () => ({ ok: true })),
  }
  const providerForm = {
    getSnapshot: () => ({ status: 'ready', value: { order: [] } }),
    subscribe: () => () => undefined,
  }
  const raw: Record<string, unknown> = {
    providerDirectory: {
      roleOf: (key: string) => ['antigravity', 'cursor-agent'].includes(key) ? 'agent' : 'llm',
      nativeBindings: () => [
        { provider: 'antigravity', channel: 'plugin-rpc/antigravity', endpoint: 'activity/binding' },
        { provider: 'cursor-agent', channel: 'plugin-rpc/cursor', endpoint: 'activity/binding' },
      ],
      catalogRoutes: () => ({ antigravity: 'antigravity', 'cursor-agent': 'cursor-agent' }),
      subscribe: () => () => undefined,
    },
    locale: { register: vi.fn(() => () => undefined) },
    slots: {
      inject: (_name: string, register: () => unknown) => register(),
      register: (spec: Record<string, unknown>, component: unknown) => {
        entries.push({ spec, component })
        return () => undefined
      },
      entries: vi.fn(() => []),
    },
    uiConversation: { views: { register: vi.fn(() => vi.fn()) }, events: { register: vi.fn(() => vi.fn()) } },
    modelDirectories: { directoryFor: vi.fn(() => directory) },
    sessions: { subagentAddress: vi.fn(() => undefined) },
    configForms: { get: () => providerForm },
    effect: (register: () => unknown) => register(),
    get: vi.fn(() => undefined),
  }
  let directInteractionReads = 0
  const ctx = strictOptionalLookup
    ? new Proxy(raw, {
        get(target, property, receiver) {
          if (property === 'interactionOperations') {
            directInteractionReads += 1
            throw new Error('cannot get property interactionOperations')
          }
          return Reflect.get(target, property, receiver)
        },
      })
    : raw
  ctx.inject = (services: string[], register: (scope: unknown) => unknown) => {
    injections.push([...services])
    return services.includes('providerDirectory')
      ? register({ ...ctx, get: (name: string) => name === 'providerDirectory' ? raw.providerDirectory : undefined })
      : register(ctx)
  }
  installComposerPicker(ctx as never)
  return { entries, injections, raw, directory, directInteractionReads: () => directInteractionReads }
}

describe('composer picker seat ownership', () => {
  it.each([['antigravity', 'codex'], ['codex', 'antigravity'], ['cursor-agent', 'codex'], ['codex', 'cursor-agent']])('rechecks pending first-turn state before %s to %s selection', async (current, target) => {
    const { entries, raw, directory } = bench()
    let session = { blank: true, running: false, awaitingFirstTurn: false }
    Object.assign(raw.sessions as object, { get: () => ({ getSnapshot: () => session }) })
    raw.get = (name: string) => name === 'connection'
      ? { rpc: { call: async () => ({ ok: true, value: { provider: null } }) } }
      : name === 'providerDirectory' ? { reader: () => ({}), roleOf: (key: string) => key === 'antigravity' ? 'agent' : 'llm' } : undefined
    directory.store.getSnapshot.mockReturnValue({ current: { provider: current, model: 'first' } })
    const model = entries.find(({ spec }) => spec.name === 'conversation.input.model')!
    const face = (model.spec.inject as (id: string) => SelectFace)('session-1')
    const choice = { provider: target, model: 'second' }
    await expect(face.select(choice)).resolves.toEqual(COMMITTED)
    directory.select.mockClear()
    session = { blank: true, running: false, awaitingFirstTurn: true }
    await expect(face.select(choice)).resolves.toEqual(REFUSED)
    session = { blank: true, running: true, awaitingFirstTurn: false }
    await expect(face.select(choice)).resolves.toEqual(REFUSED)
    session = { blank: true, running: false, awaitingFirstTurn: false, pendingSubmissions: [{ requestId: 'p1' }] }
    await expect(face.select(choice)).resolves.toEqual(REFUSED)
    expect(directory.select).not.toHaveBeenCalled()
    session = { blank: true, running: false, awaitingFirstTurn: false, pendingSubmissions: [] }
    await expect(face.select(choice)).resolves.toEqual(COMMITTED)
  })

  it('commits a session switch without any Main-default settings channel', async () => {
    const { entries, raw, directory } = bench()
    raw.get = (name: string) => name === 'connection'
      ? { rpc: { call: async () => ({ ok: true, value: { provider: null } }) } }
      : undefined
    directory.store.getSnapshot.mockReturnValue({ current: { provider: 'deepseek', model: 'deep-chat' } })
    const model = entries.find(({ spec }) => spec.name === 'conversation.input.model')!
    const face = (model.spec.inject as (id: string) => SelectFace)('session-1')
    await expect(face.select({ provider: 'codex', model: 'gpt-switched' })).resolves.toEqual(COMMITTED)
    expect(directory.select).toHaveBeenCalledWith({ provider: 'codex', model: 'gpt-switched' })
  })

  it('refuses a provider change when one declared native binding cannot be read', async () => {
    const { entries, raw, directory } = bench()
    directory.store.getSnapshot.mockReturnValue({ current: { provider: 'cursor-agent', model: 'm' } })
    raw.get = (name: string) => name === 'connection' ? { rpc: {
      call: async (_channel: string, method: string) => method === 'plugin-rpc/antigravity'
        ? { ok: true, value: { provider: null } } : { ok: false },
    } } : undefined
    const model = entries.find(({ spec }) => spec.name === 'conversation.input.model')!
    const face = (model.spec.inject as (id: string) => SelectFace)('s')
    await expect(face.select({ provider: 'codex', model: 'm' })).resolves.toEqual(REFUSED)
    expect(directory.select).not.toHaveBeenCalled()
  })

  it('treats an older ProviderDirectory without nativeBindings as unbound', async () => {
    const { entries, raw } = bench()
    delete (raw.providerDirectory as { nativeBindings?: unknown }).nativeBindings
    const model = entries.find(({ spec }) => spec.name === 'conversation.input.model')!
    const face = (model.spec.inject as (id: string) => {
      providerLockStore: { refresh(): Promise<{ provider: string | null; failed: boolean }> }
    })('s')
    await expect(face.providerLockStore.refresh()).resolves.toEqual({ provider: null, failed: false })
  })

  it('publishes a new stable snapshot when provider declarations change without a reorder', () => {
    const order = ['antigravity', 'llm-codex']
    const store = providerOrderStore({
      getSnapshot: () => ({ status: 'ready', value: { order }, base: {}, user: {}, revision: 1, writable: true, mode: 'host' }),
      subscribe: () => () => undefined,
      set: async () => true,
      unset: async () => true,
      mutate: async () => true,
    })
    const before = store.getSnapshot()
    const changed = vi.fn()
    const dispose = store.subscribe(changed)
    store.invalidate()
    const after = store.getSnapshot()
    expect(changed).toHaveBeenCalledOnce()
    expect(after).toEqual(before)
    expect(after).not.toBe(before)
    expect(store.getSnapshot()).toBe(after)
    dispose()
    store.invalidate()
    expect(changed).toHaveBeenCalledOnce()
  })

  it('uses the official model-seat service gate and an unambiguous winning priority', () => {
    const { entries, injections } = bench()
    expect(injections).toContainEqual(['slots', 'modelDirectories', 'configForms'])
    expect(entries.find(({ spec }) => spec.name === 'conversation.input.model')?.spec.priority).toBe(-10)
  })

  /**
   * Face-level bench for one Session switch: the directory store is driven by
   * the test exactly like the official model-selection projection, so a
   * provider change performed on ANY surface reaches the group watcher.
   */
  function selectBench(initial: { value: { provider: string, model: string } }, providerGroups?: readonly Record<string, unknown>[]) {
    let current: { provider: string, model: string } | null = initial.value
    const listeners = new Set<() => void>()
    const groupSet = vi.fn(async (_field: string, _value: unknown) => true)
    const groupUnset = vi.fn(async (_field: string) => true)
    const providerForm = {
      getSnapshot: () => ({ status: 'ready', value: { order: [], ...(providerGroups === undefined ? {} : { providerGroups }) } }),
      subscribe: () => () => undefined,
      set: groupSet,
      unset: groupUnset,
    }
    const directory = {
      store: {
        subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
        getSnapshot: () => ({ current }),
      },
      load: vi.fn(async () => undefined),
      select: vi.fn(async () => ({ ok: true })),
    }
    const entries: Array<{ spec: Record<string, unknown> }> = []
    const ctx = {
      locale: { register: vi.fn(() => () => undefined) },
      slots: {
        inject: (_name: string, register: () => unknown) => register(),
        register: (spec: Record<string, unknown>) => { entries.push({ spec }); return () => undefined },
        entries: vi.fn(() => []),
      },
      uiConversation: { views: { register: vi.fn(() => vi.fn()) }, events: { register: vi.fn(() => vi.fn()) } },
      modelDirectories: { directoryFor: vi.fn(() => directory) },
      sessions: { subagentAddress: vi.fn(() => undefined) },
      configForms: { get: () => providerForm },
      effect: (register: () => unknown) => register(),
      get: vi.fn(() => undefined),
      inject: (services: string[], register: (scope: unknown) => unknown) => services.includes('providerDirectory') ? undefined : register(ctx),
    }
    installComposerPicker(ctx as never)
    const model = entries.find(({ spec }) => spec.name === 'conversation.input.model')
    const face = (model?.spec.inject as (sessionId: string) => SelectFace)('session-1')
    /** The official projection landing a model selection from any surface. */
    const project = (next: { provider: string, model: string }): void => {
      current = next
      for (const listener of listeners) listener()
    }
    /** Flush the watcher's async apply chain. */
    const settle = async (): Promise<void> => {
      for (let round = 0; round < 3; round += 1) await new Promise(resolve => setTimeout(resolve, 0))
    }
    return { face, directory, project, settle, groupSet, groupUnset }
  }

  it('reports a refused Session switch as an uncommitted model change', async () => {
    const { face, directory } = selectBench({ value: { provider: 'deepseek', model: 'deep-chat' } })
    directory.select.mockImplementation(async () => ({
      ok: false,
      error: { code: 'session/writer-held', message: 'writer held', details: {} },
    }))

    await expect(face.select({ provider: 'codex', model: 'gpt-switched' })).resolves.toEqual(REFUSED)
    expect(directory.select).toHaveBeenCalledOnce()
  })

  it('adopts the saved group when the session provider switches on any surface', async () => {
    const { project, settle, groupSet, groupUnset } = selectBench(
      { value: { provider: 'deepseek', model: 'deep-chat' } },
      [{ provider: 'codex', compactProvider: 'codex', compactModel: 'gpt-compact' }],
    )

    // No plugin call involved: the projection alone (e.g. a TUI switch) drives the apply.
    project({ provider: 'codex', model: 'gpt-switched' })
    await settle()
    expect(groupSet).toHaveBeenCalledWith('compactProvider', 'codex')
    expect(groupSet).toHaveBeenCalledWith('compactModel', 'gpt-compact')
    // The group pins nothing else, so every other capability reverts to its default.
    expect(groupUnset).toHaveBeenCalledWith('autoReviewProvider')
    expect(groupUnset).toHaveBeenCalledWith('autoReviewModel')
    expect(groupSet).toHaveBeenCalledWith('subagentMode', 'follow-main')
  })

  it('stays silent on mount, on the baseline, and when the switch stays on one provider', async () => {
    const { project, settle, groupSet, groupUnset } = selectBench(
      { value: { provider: 'codex', model: 'gpt-old' } },
      [{ provider: 'codex', compactProvider: 'codex', compactModel: 'gpt-compact' }],
    )

    await settle()
    expect(groupSet).not.toHaveBeenCalled()
    expect(groupUnset).not.toHaveBeenCalled()
    project({ provider: 'codex', model: 'gpt-new' })
    await settle()
    expect(groupSet).not.toHaveBeenCalled()
    expect(groupUnset).not.toHaveBeenCalled()
  })

  it('leaves the routes untouched when the target provider has no group', async () => {
    const { project, settle, groupSet, groupUnset } = selectBench({ value: { provider: 'deepseek', model: 'deep-chat' } })

    project({ provider: 'codex', model: 'gpt-switched' })
    await settle()
    expect(groupSet).not.toHaveBeenCalled()
    expect(groupUnset).not.toHaveBeenCalled()
  })

  it('warns instead of throwing when a group write fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const { project, settle, groupSet } = selectBench(
        { value: { provider: 'deepseek', model: 'deep-chat' } },
        [{ provider: 'codex', compactProvider: 'codex', compactModel: 'gpt-compact' }],
      )
      groupSet.mockRejectedValue(new Error('rpc down'))

      project({ provider: 'codex', model: 'gpt-switched' })
      await settle()
      expect(warn).toHaveBeenCalledWith('dsh-model-switch: provider group apply failed', expect.any(Error))
    } finally {
      warn.mockRestore()
    }
  })

  it('applies a group exactly once when the projection lands during the switch RPC', async () => {
    const { face, directory, project, settle, groupSet } = selectBench(
      { value: { provider: 'deepseek', model: 'deep-chat' } },
      [{ provider: 'codex', compactProvider: 'codex', compactModel: 'gpt-compact' }],
    )
    // The official projection lands while the switch RPC is still in flight, so
    // the RPC path and the watcher both observe this one provider change.
    directory.select.mockImplementation(async () => {
      project({ provider: 'codex', model: 'gpt-switched' })
      return { ok: true }
    })

    await expect(face.select({ provider: 'codex', model: 'gpt-switched' })).resolves.toEqual(COMMITTED)
    await settle()
    // One writer only: the applier is the watcher, never a second inline apply.
    expect(groupSet.mock.calls.filter(([field]) => field === 'compactProvider')).toHaveLength(1)
    expect(groupSet.mock.calls.filter(([field]) => field === 'compactModel')).toHaveLength(1)
  })

  it('uses non-strict lookup for the optional interaction service', () => {
    const { entries, directInteractionReads } = bench(true)
    const model = entries.find(({ spec }) => spec.name === 'conversation.input.model')
    const face = (model?.spec.inject as (sessionId: string) => { resolveInteractionOperations(): unknown })('session-1')
    expect(() => face.resolveInteractionOperations()).not.toThrow()
    expect(face.resolveInteractionOperations()).toBeUndefined()
    expect(directInteractionReads()).toBe(0)
  })

  it('resolves the goal remote per render instead of injecting it', () => {
    const { entries, raw } = bench()
    const composer = entries.find(({ spec }) => spec.name === 'conversation.composer')!
    const face = (composer.spec.inject as (id: string) => { goalRemote(): unknown })('session-1')
    expect(typeof face.goalRemote).toBe('function')
    expect(face.goalRemote()).toBeUndefined()

    const stub = { create: async () => ({ ok: true, value: { ref: { id: 'goal-1', revision: 1 } } }) }
    raw.get = (name: string) => name === 'remote.goals' ? stub : undefined
    expect(face.goalRemote()).toBe(stub)
  })

  it('keeps the goal service out of the static client inject list', () => {
    // An inject on 'remote.goals' would block this whole client plugin on a
    // deployment that does not mount @deepseek-ai/dsh-goal.
    const source = readFileSync(new URL('../../src/client/index.tsx', import.meta.url), 'utf8')
    expect(source).toMatch(/export const inject = \[/u)
    expect(source).not.toContain('remote.goals')
  })
})
