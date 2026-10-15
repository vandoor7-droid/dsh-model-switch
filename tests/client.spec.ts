import { describe, expect, it, vi } from 'vitest'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { MODEL_SWITCH_CONFIG_ID, PROVIDERS_CONFIG_ID, subagentModeForEnabled, type ModelSwitchSettingsView } from '../src/client-contract.js'
import { entryOf, type ProviderGroupConfig } from '../src/provider-group.js'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const Stub = () => null
  return {
    Button: Stub, Input: Stub, Toast: Stub, MarkdownText: Stub,
    extractMarkdownPlainText: Stub,
    IconCheckOutlineRegular: Stub, IconChevronDownOutlineRegular: Stub, IconChevronLeftOutlineRegular: Stub,
    IconChevronRightOutlineRegular: Stub, IconCloseOutlineRegular: Stub, IconSearchOutlineRegular: Stub, IconWarningOutlineRegular: Stub,
  }
})

vi.mock('../src/client/picker/install.tsx', async importOriginal => ({
  ...await importOriginal<typeof import('../src/client/picker/install.tsx')>(), installComposerPicker: vi.fn(),
}))

import { apply, inject, name } from '../src/client/index.js'
import { installComposerPicker } from '../src/client/picker/install.tsx'

function form<T>(value: T, revision = 7) {
  let snapshot: ConfigFormSnapshot<T> = { status: 'ready', value, base: {}, user: {}, revision, writable: true, mode: 'host' }
  const listeners = new Set<() => void>()
  const set = vi.fn(async (_field: string, _value: unknown) => true)
  const unset = vi.fn(async (_field: string) => true)
  const result: ConfigForm<T> = {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    set,
    unset,
    async mutate(...args: Parameters<ConfigForm<T>['mutate']>) {
      snapshot = { ...snapshot, revision: (snapshot.revision ?? 0) + 1 }
      for (const listener of listeners) listener()
      return true
    },
  }
  return { form: result, set, unset }
}

function ctxWith(ownedValue: ModelSwitchSettingsView = { subagentMode: 'follow-main' }) {
  let registration: Record<string, unknown> | undefined
  const directoryMounts: Array<(scope: unknown) => unknown> = []
  const owned = form<ModelSwitchSettingsView>(ownedValue)
  const providers = form<{ order: string[] }>({ order: ['native-card', 'llm-codex'] })
  const rpc = { call: vi.fn(async () => ({ ok: true as const, value: { revision: 0, capabilities: { searchProviderAdapters: { available: true, providers: [], catalog: [] } } } })) }
  const ctx = {
    inject: (_deps: string[], callback: (scope: unknown) => unknown) => { directoryMounts.push(callback) },
    effect(factory: () => unknown) { factory() },
    locale: { register: vi.fn(() => vi.fn()), bind: vi.fn(() => (key: string) => key) },
    remote: { session: { modelCatalog: vi.fn(async () => ({ ok: true, value: { groups: [{ id: 'codex', name: 'Codex', models: [] }, { id: 'new-native', name: 'Native', models: [] }] } })) } },
    configForms: {
      get: vi.fn((id: string) => id === MODEL_SWITCH_CONFIG_ID ? owned.form : providers.form),
    },
    slots: { inject(_name: string, factory: () => unknown) { factory() }, register(options: Record<string, unknown>) { registration = options; return vi.fn() } },
    get: vi.fn((name: string) => name === 'connection' ? { rpc } : undefined),
  }
  apply(ctx as never)
  return { registration, ctx, directoryMounts, owned, rpc }
}

describe('Client ConfigForms surface', () => {
  it('refreshes catalog order and role when the optional directory mounts and unmounts', async () => {
    const { registration, directoryMounts } = ctxWith()
    const face = (registration!.inject as () => {
      loadCatalog(): Promise<Array<{ id: string }>>
      providerRoleOf(key: string): string
      subscribeProviderOrder(listener: () => void): () => void
    })()
    expect((await face.loadCatalog()).map(group => group.id)).toEqual(['codex', 'new-native'])
    const changed = vi.fn()
    const stop = face.subscribeProviderOrder(changed)
    const disposers: Array<() => void> = []
    const listeners = new Set<() => void>()
    const directory = {
      roleOf: (key: string) => key === 'native-card' ? 'agent' : 'llm',
      catalogRoutes: () => ({ codex: 'llm-codex', 'new-native': 'native-card' }),
      subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    }
    for (const mount of directoryMounts) mount({
      get: () => directory,
      effect: (register: () => () => void) => { disposers.push(register()) },
    })
    expect(changed).toHaveBeenCalledOnce()
    expect((await face.loadCatalog()).map(group => group.id)).toEqual(['new-native', 'codex'])
    expect(face.providerRoleOf('new-native')).toBe('agent')
    for (const dispose of disposers.reverse()) dispose()
    expect(listeners.size).toBe(0)
    expect(changed).toHaveBeenCalledTimes(2)
    expect((await face.loadCatalog()).map(group => group.id)).toEqual(['codex', 'new-native'])
    expect(face.providerRoleOf('new-native')).toBe('llm')
    stop()
  })

  it('keeps catalog loading available with an older directory lacking catalogRoutes', async () => {
    const { registration, directoryMounts } = ctxWith()
    const face = (registration!.inject as () => { loadCatalog(): Promise<Array<{ id: string }>> })()
    const directory = { roleOf: () => 'llm', subscribe: () => () => undefined }
    const disposers: Array<() => void> = []
    for (const mount of directoryMounts) mount({
      get: () => directory,
      effect: (register: () => () => void) => { disposers.push(register()) },
    })
    expect((await face.loadCatalog()).map(group => group.id)).toEqual(['codex', 'new-native'])
    for (const dispose of disposers.reverse()) dispose()
  })

  it('preserves the Client entry dependencies and uses actual Loader entry ids', () => {
    const { ctx } = ctxWith()
    expect(name).toBe('dsh-model-switch-client')
    expect(inject).toEqual(['slots', 'locale', 'sessions', 'modelDirectories', 'configForms', 'remote', 'remote.session'])
    expect(ctx.configForms.get).toHaveBeenCalledWith(MODEL_SWITCH_CONFIG_ID)
    expect(ctx.configForms.get).toHaveBeenCalledWith(PROVIDERS_CONFIG_ID)
  })

  it('exposes no Main-default editing surface on the settings face', () => {
    const { registration } = ctxWith()
    expect(installComposerPicker).toHaveBeenCalled()
    expect(registration).toMatchObject({ name: 'settings.section', id: 'model-switch', order: 9 })
    const face = (registration?.inject as () => Record<string, unknown>)()
    expect(face.saveMain).toBeUndefined()
    expect((face.hooks as Record<string, unknown>).mainSettings).toBeUndefined()
  })

  it('maps capability edits over the connection rpc through loadCapabilities', async () => {
    const { registration, rpc } = ctxWith()
    const face = (registration?.inject as () => {
      loadCapabilities(revision?: number, signal?: AbortSignal): Promise<unknown>
    })()
    await face.loadCapabilities(4)
    expect(rpc.call).toHaveBeenCalledWith('/api', 'plugin-rpc/model-switch', { endpoint: 'capabilities', payload: { revision: 4 } }, undefined)
  })

  it('omits removed send-time compaction controls and maps subagent mode toggle helpers', () => {
    const { registration } = ctxWith()
    const face = (registration?.inject as () => Record<string, unknown>)()
    expect(face.setCompactOnSwitch).toBeUndefined()
    expect(subagentModeForEnabled(true)).toBe('fixed')
    expect(subagentModeForEnabled(false)).toBe('follow-main')
  })

  it('writes a provider group through the owned ConfigForm and maps refusal', async () => {
    const { registration, owned } = ctxWith()
    const face = (registration?.inject as () => {
      saveProviderGroup(provider: string, group: ProviderGroupConfig | undefined): Promise<void>
    })()
    const group: ProviderGroupConfig = { compactProvider: 'codex', compactModel: 'gpt' }
    await expect(face.saveProviderGroup('codex', group)).resolves.toBeUndefined()
    expect(owned.set).toHaveBeenCalledWith('providerGroups', [entryOf('codex', group)])
    owned.set.mockResolvedValue(false)
    await expect(face.saveProviderGroup('codex', group)).rejects.toThrow('settings-rejected')
  })

  it('unsets the storage when the last group is removed and no-ops without stored groups', async () => {
    const { registration, owned } = ctxWith({
      subagentMode: 'follow-main',
      providerGroups: [entryOf('codex', { compactProvider: 'codex', compactModel: 'gpt' })],
    })
    const face = (registration?.inject as () => {
      saveProviderGroup(provider: string, group: ProviderGroupConfig | undefined): Promise<void>
    })()
    await expect(face.saveProviderGroup('codex', undefined)).resolves.toBeUndefined()
    expect(owned.unset).toHaveBeenCalledWith('providerGroups')

    const pristine = ctxWith()
    const pristineFace = (pristine.registration?.inject as () => {
      saveProviderGroup(provider: string, group: ProviderGroupConfig | undefined): Promise<void>
    })()
    await expect(pristineFace.saveProviderGroup('codex', undefined)).resolves.toBeUndefined()
    expect(pristine.owned.set).not.toHaveBeenCalled()
    expect(pristine.owned.unset).not.toHaveBeenCalled()
  })
})
