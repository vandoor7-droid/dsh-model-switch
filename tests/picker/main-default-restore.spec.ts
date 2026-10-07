import { describe, expect, it, vi } from 'vitest'
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { MainSettingsView } from '../../src/client-contract.ts'
import { mainDefaultOps, restoreMainDefault, type MainDefaultForm } from '../../src/client/picker/main-default-restore.ts'

const CHAT: MainSettingsView = { provider: 'deepseek', model: 'deep-chat' }
const SWITCHED: MainSettingsView = { provider: 'codex', model: 'gpt-switched' }

function snap(
  revision: number,
  value: MainSettingsView,
  overrides: Partial<ConfigFormSnapshot<MainSettingsView>> = {},
): ConfigFormSnapshot<MainSettingsView> {
  return { status: 'ready', value, base: {}, user: {}, revision, writable: true, mode: 'host', ...overrides }
}

/** A Main Settings namespace whose revision moves only when the test moves it. */
function bench(initial: { revision: number; value: MainSettingsView }) {
  let snapshot = snap(initial.revision, initial.value)
  const listeners = new Set<() => void>()
  // The Host accepts a write only when its fence is the revision it holds; a
  // stale fence is refused, which is what makes a guessed `captured + 1` fence
  // fail as soon as the default write has not landed yet.
  const mutate = vi.fn(async (_ops: unknown, expectedRevision?: number) => {
    return expectedRevision === undefined || expectedRevision === snapshot.revision
  })
  const advance = (value: MainSettingsView, revision: number): void => {
    snapshot = { ...snapshot, value, revision }
    for (const listener of listeners) listener()
  }
  const form: MainDefaultForm = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    mutate,
  }
  return { form, mutate, advance }
}

describe('Main default restoration across Host generations', () => {
  it('waits out a Host default write that is fired without being awaited', async () => {
    // 0.2.x ordering: the Session switch RPC resolves first, the deployment
    // default write lands afterwards, during the bounded wait.
    const { form, mutate, advance } = bench({ revision: 7, value: CHAT })
    const wait = vi.fn(async () => { advance(SWITCHED, 8) })

    await expect(restoreMainDefault(form, snap(7, CHAT), { wait })).resolves.toEqual({ restored: true, conflict: false })

    expect(wait).toHaveBeenCalledOnce()
    expect(mutate).toHaveBeenCalledExactlyOnceWith(mainDefaultOps(CHAT), 8)
  })

  it('resolves as soon as the Host write becomes visible instead of polling to the timeout', async () => {
    const { form, mutate, advance } = bench({ revision: 7, value: CHAT })
    const pending = restoreMainDefault(form, snap(7, CHAT), { wait: () => new Promise(() => {}) })

    advance(SWITCHED, 8)

    await expect(pending).resolves.toEqual({ restored: true, conflict: false })
    expect(mutate).toHaveBeenCalledExactlyOnceWith(mainDefaultOps(CHAT), 8)
  })

  it('fences on the already-advanced revision of an awaited Host write', async () => {
    // 0.1.x ordering: the default write settled before the switch RPC resolved,
    // so no waiting is needed and the captured + 1 fence is never assumed.
    const { form, mutate } = bench({ revision: 8, value: SWITCHED })
    const wait = vi.fn(async () => { throw new Error('must not wait') })

    await expect(restoreMainDefault(form, snap(7, CHAT), { wait })).resolves.toEqual({ restored: true, conflict: false })

    expect(wait).not.toHaveBeenCalled()
    expect(mutate).toHaveBeenCalledExactlyOnceWith(mainDefaultOps(CHAT), 8)
  })

  it('leaves the default alone when the Host persisted no default at all', async () => {
    const { form, mutate } = bench({ revision: 7, value: CHAT })

    await expect(restoreMainDefault(form, snap(7, CHAT), { wait: async () => {} }))
      .resolves.toEqual({ restored: true, conflict: false })

    expect(mutate).not.toHaveBeenCalled()
  })

  it('leaves the default alone when it already equals the captured selection', async () => {
    const { form, mutate } = bench({ revision: 8, value: CHAT })

    await expect(restoreMainDefault(form, snap(7, CHAT), { wait: async () => {} }))
      .resolves.toEqual({ restored: true, conflict: false })

    expect(mutate).not.toHaveBeenCalled()
  })

  it('retries once against a concurrent edit, which then wins the fence', async () => {
    const { form, mutate, advance } = bench({ revision: 8, value: SWITCHED })
    mutate.mockImplementationOnce(async () => {
      advance({ provider: 'grok', model: 'page-edit' }, 9)
      return false
    })

    await expect(restoreMainDefault(form, snap(7, CHAT), { wait: async () => {} }))
      .resolves.toEqual({ restored: true, conflict: false })

    expect(mutate).toHaveBeenCalledTimes(2)
    expect(mutate.mock.calls[0]?.[1]).toBe(8)
    expect(mutate.mock.calls[1]?.[1]).toBe(9)
  })

  it('reports a lost race without failing the caller', async () => {
    const { form, mutate, advance } = bench({ revision: 8, value: SWITCHED })
    let revision = 8
    mutate.mockImplementation(async () => {
      revision += 1
      advance({ provider: 'grok', model: `page-edit-${revision}` }, revision)
      return false
    })

    await expect(restoreMainDefault(form, snap(7, CHAT), { wait: async () => {} }))
      .resolves.toEqual({ restored: false, conflict: true })

    expect(mutate).toHaveBeenCalledTimes(2)
  })

  it('reports a refusal that moved no revision without retrying', async () => {
    const { form, mutate } = bench({ revision: 8, value: SWITCHED })
    mutate.mockImplementation(async () => false)

    await expect(restoreMainDefault(form, snap(7, CHAT), { wait: async () => {} }))
      .resolves.toEqual({ restored: false, conflict: false })

    expect(mutate).toHaveBeenCalledOnce()
  })

  it('takes no obligation when this client cannot fence the namespace', async () => {
    const { form, mutate } = bench({ revision: 7, value: CHAT })
    const wait = vi.fn(async () => {})

    await expect(restoreMainDefault(form, snap(7, CHAT, { mode: 'memory', writable: false }), { wait }))
      .resolves.toEqual({ restored: true, conflict: false })

    expect(wait).not.toHaveBeenCalled()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('writes provider, model, and a cleared effort as one complete section', () => {
    expect(mainDefaultOps({ provider: 'deepseek', model: 'deep-chat' })).toEqual([
      { op: 'set', path: ['provider'], value: 'deepseek' },
      { op: 'set', path: ['model'], value: 'deep-chat' },
      { op: 'unset', path: ['reasoningEffort'] },
    ])
    expect(mainDefaultOps({ provider: 'deepseek', model: 'deep-chat', reasoningEffort: 'max' })).toEqual([
      { op: 'set', path: ['provider'], value: 'deepseek' },
      { op: 'set', path: ['model'], value: 'deep-chat' },
      { op: 'set', path: ['reasoningEffort'], value: 'max' },
    ])
  })
})
