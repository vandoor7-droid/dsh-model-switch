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
   * the test exactly like the official model-selection projection, and the
   * form spies record every settings write the picker would attempt.
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
    const disposers: Array<() => void> = []
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
      // Install-time effects may hand back a teardown; collect it so the bench can run the dispose path.
      effect: (register: () => unknown) => {
        const dispose = register()
        if (typeof dispose === 'function') disposers.push(dispose as () => void)
        return dispose
      },
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
    /** Flush async seat work before asserting on writes. */
    const settle = async (): Promise<void> => {
      for (let round = 0; round < 3; round += 1) await new Promise(resolve => setTimeout(resolve, 0))
    }
    /** Release every install-time resource, innermost first, like an injected scope teardown. */
    const dispose = (): void => {
      for (const stop of disposers.splice(0).reverse()) stop()
    }
    return { face, directory, project, settle, groupSet, groupUnset, listeners, dispose }
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

  it('installs with no group watcher and writes no settings when the session provider changes', async () => {
    const { face, project, settle, groupSet, groupUnset, listeners } = selectBench(
      { value: { provider: 'deepseek', model: 'deep-chat' } },
      [{ provider: 'codex', compactProvider: 'codex', compactModel: 'gpt-compact' }],
    )

    // Routes now derive on the Host from the session's own provider, so the
    // seat subscribes no write-through watcher on the directory projection.
    expect(listeners.size).toBe(0)
    // A provider landing from another surface (e.g. a TUI switch) writes nothing,
    // even though the stored table holds a group for that exact provider.
    project({ provider: 'codex', model: 'gpt-switched' })
    await settle()
    expect(groupSet).not.toHaveBeenCalled()
    expect(groupUnset).not.toHaveBeenCalled()
    // This plugin's own switch surface stays write-free as well.
    await expect(face.select({ provider: 'codex', model: 'gpt-switched' })).resolves.toEqual(COMMITTED)
    await settle()
    expect(groupSet).not.toHaveBeenCalled()
    expect(groupUnset).not.toHaveBeenCalled()
  })

  it('disposes cleanly with no watcher subscription to unwind', async () => {
    const { project, settle, groupSet, groupUnset, listeners, dispose } = selectBench(
      { value: { provider: 'deepseek', model: 'deep-chat' } },
      [{ provider: 'codex', compactProvider: 'codex', compactModel: 'gpt-compact' }],
    )

    dispose()
    expect(listeners.size).toBe(0)
    // A provider change observed after teardown must not resurrect a write.
    project({ provider: 'codex', model: 'gpt-switched' })
    await settle()
    expect(groupSet).not.toHaveBeenCalled()
    expect(groupUnset).not.toHaveBeenCalled()
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
