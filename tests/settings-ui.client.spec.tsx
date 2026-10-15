import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ModelSwitchSettings } from '../src/client/ModelSwitchSettings.js'
import { en, zh } from '../src/client/locales.js'
import { entryOf, type ProviderGroupConfig, type ProviderGroupsStorage } from '../src/provider-group.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * The catalog state the settings page reads. A test that simulates the real
 * load race flips `emptyCatalog` on: the settings snapshot arrives before the
 * async model catalog, so catalog-seeded controls must stay disabled instead of
 * silently dropping the click.
 */
const catalogState = {
  emptyCatalog: false,
  groups: [{ id: 'codex', name: 'Codex', models: [{ id: 'gpt-subagent', name: 'GPT Subagent' }] }],
  catalogError: undefined as string | undefined,
}

vi.mock('../src/client/main-row-controller.js', () => ({
  deriveRouteChoices: () => ({ providers: [{ id: 'codex', name: 'Codex' }], models: [{ id: 'gpt-subagent', name: 'GPT Subagent' }] }),
  selectRouteModel: () => ({ provider: 'codex', model: 'gpt-subagent' }),
  useSettingsCatalog: () => ({
    groups: catalogState.emptyCatalog ? [] : catalogState.groups,
    catalogError: catalogState.catalogError,
  }),
}))

function snapshot<T>(value: T) {
  return { status: 'ready' as const, value, base: {}, user: {}, revision: 1, writable: true, mode: 'host' as const }
}

function face(options?: {
  subagent?: { mode: 'follow-main' | 'fixed'; provider?: string; model?: string; reasoningEffort?: string }
  memoryOnly?: true
  autoReview?: { provider?: string; model?: string }
  compaction?: { provider?: string; model?: string }
  title?: { provider?: string; model?: string }
  saveSubagent?: ReturnType<typeof vi.fn>
  saveCapability?: ReturnType<typeof vi.fn>
  saveProviderGroup?: ReturnType<typeof vi.fn>
  providerGroups?: ProviderGroupsStorage
}) {
  const subagent = options?.subagent ?? { mode: 'fixed', provider: 'codex', model: 'gpt-subagent' }
  // Render-stable hook snapshot: a fresh object per render would reset drafts forever.
  const subagentSnapshot = snapshot(subagent)
  const switchSettings = options?.memoryOnly
    ? { status: 'unavailable' as const, value: undefined, base: undefined, user: {}, revision: undefined, writable: false, mode: 'memory' as const }
    : snapshot({
        ...(options?.providerGroups === undefined ? {} : { providerGroups: options.providerGroups }),
      })
  const searchSettings = snapshot({ provider: 'codex', model: 'gpt-search' })
  const imageSettings = snapshot({ provider: 'grok', model: 'grok-imagine-image-quality' })
  // Unset reviewer fields = the shipped default: reviews follow the session model.
  const autoReviewSettings = snapshot(options?.autoReview ?? {})
  // Unset compaction fields = the official default: compaction follows the conversation target.
  const compactionSettings = snapshot(options?.compaction ?? {})
  // Unset naming fields = the official default: naming follows the session model.
  const titleSettings = snapshot(options?.title ?? {})
  return {
    t: (key: string) => key,
    capabilities: {
      centralSubagentRouting: { available: true },
      searchProviderAdapters: { available: true, providers: ['codex'] },
      imageProviderAdapters: { available: true, providers: ['codex', 'grok'] },
    },
    useSearchSettings: () => searchSettings,
    useImageSettings: () => imageSettings,
    useAutoReviewSettings: () => autoReviewSettings,
    useCompactionSettings: () => compactionSettings,
    useTitleSettings: () => titleSettings,
    useSwitchSettings: () => switchSettings,
    useSubagentSettings: () => subagentSnapshot,
    saveSubagent: options?.saveSubagent ?? vi.fn(async () => undefined),
    saveCapability: options?.saveCapability ?? vi.fn(),
    saveProviderGroup: options?.saveProviderGroup ?? vi.fn(async () => undefined),
  } as never
}

function renderSettings(options?: Parameters<typeof face>[0]) {
  return renderToStaticMarkup(<ModelSwitchSettings {...face(options)} />)
}

function instanceText(node: { children?: readonly unknown[] }): string {
  return (node.children ?? []).map(child => typeof child === 'string' ? child : instanceText(child as { children?: readonly unknown[] })).join('')
}

function mountSettings(options?: Parameters<typeof face>[0]) {
  const saveSubagent = options?.saveSubagent ?? vi.fn(async () => undefined)
  const saveCapability = options?.saveCapability ?? vi.fn()
  const saveProviderGroup = options?.saveProviderGroup ?? vi.fn(async () => undefined)
  const props = face({ ...options, saveSubagent, saveCapability, saveProviderGroup })
  let renderer!: ReactTestRenderer
  act(() => {
    renderer = create(<ModelSwitchSettings {...props} />)
  })
  /**
   * Render again with a fresh face, the way an accepted snapshot from the Host
   * (or another tab) reaches the mounted component.
   */
  const rerender = (next: Parameters<typeof face>[0] = {}): void => {
    const nextProps = face({ ...options, saveSubagent, saveCapability, saveProviderGroup, ...next })
    act(() => {
      renderer.update(<ModelSwitchSettings {...nextProps} />)
    })
  }
  return { renderer, rerender, saveSubagent, saveCapability, saveProviderGroup }
}

/**
 * The op list of the last Subagent row save, which keeps it in argument 0.
 *
 * One row save is one atomic write, so the op list IS the whole change: a test
 * can assert that both halves of a pinned pair travel together, which is what
 * stops a refused write from leaving a half-written route behind.
 */
function subagentOps(mock: ReturnType<typeof vi.fn>): readonly { field: string; value?: unknown }[] {
  return (mock.mock.calls.at(-1)?.[0] ?? []) as readonly { field: string; value?: unknown }[]
}

/** The op list of the last capability save, which keeps it in argument 1 after the row id. */
function capabilityOps(mock: ReturnType<typeof vi.fn>): readonly { field: string; value?: unknown }[] {
  return (mock.mock.calls.at(-1)?.[1] ?? []) as readonly { field: string; value?: unknown }[]
}

describe('Model Switch settings menu', () => {
  it('shows Subagent and Capability RouteCards without Send protection or a follow-main select', () => {
    const markup = renderSettings()

    expect(markup).not.toContain('>main<')
    expect(markup).toContain('>subagent<')
    expect(markup).toContain('>search<')
    expect(markup).not.toContain('>vision<')
    expect(markup).toContain('>image<')
    expect(markup).not.toContain('sendProtection')
    expect(markup).not.toContain('compactOnSwitch')
    expect(markup).toContain('role="switch"')
    expect(markup).toContain('aria-label="subagent"')
    expect(markup).not.toContain('type="checkbox"')
    expect(markup).not.toContain('>save<')
    expect(markup).not.toContain('aria-expanded="true"')
    expect(markup).not.toContain('subagentMode')
    expect(markup).not.toContain('follow-main')
    expect(markup).not.toContain('subagentFollowMain')
  })
  it('shows a final unavailable state instead of controls or endless loading under the official remote memory policy', () => {
    const markup = renderSettings({ memoryOnly: true })
    expect(markup).toContain('role="status"')
    expect(markup).toContain('>remoteSettingsUnavailable<')
    expect(markup).not.toContain('>loading<')
    expect(markup).not.toContain('settingsSynced')
    expect(markup).not.toContain('role="switch"')
    expect(markup).not.toContain('<select')
    expect(zh.remoteSettingsUnavailable).toContain('非本机')
    expect(en.remoteSettingsUnavailable).toContain('non-loopback')
  })


  it('keeps the Subagent card collapsed, labelled Official inherit, and shows the Allowlist hint when the default is off', () => {
    const markup = renderSettings({ subagent: { mode: 'follow-main', provider: 'codex', model: 'gpt-subagent' } })
    expect(markup).toContain('>subagentOff<')
    expect(markup).toContain('>subagentHelp<')
    expect(markup).not.toContain('aria-expanded="true"')
    expect(markup).not.toContain('>provider<')
    expect(markup).toContain('role="switch"')
  })

  it('keeps zh/en copy for the Subagent Allowlist hint and omits removed Send protection keys', () => {
    expect(zh).not.toHaveProperty('sendProtection')
    expect(en).not.toHaveProperty('sendProtection')
    expect(zh).not.toHaveProperty('compactOnSwitch')
    expect(en).not.toHaveProperty('compactOnSwitch')
    expect(zh.subagentHelp).toContain('白名单')
    expect(en.subagentHelp).toContain('Allowlist')
    expect(zh.subagentHelp).not.toMatch(/href=|settings\./)
    expect(en.subagentHelp).not.toMatch(/href=|settings\./)
    expect(zh).not.toHaveProperty('subagentFollowMain')
    expect(en).not.toHaveProperty('subagentFollowMain')
  })

  it('writes follow-main on Subagent off without clearing the stored route', async () => {
    const { renderer, saveSubagent } = mountSettings({ subagent: { mode: 'fixed', provider: 'codex', model: 'gpt-subagent' } })
    const toggle = renderer.root.findAllByType('button').find(button => button.props['aria-label'] === 'subagent')
    expect(toggle?.props['aria-checked']).toBe(true)
    await act(async () => {
      toggle?.props.onClick()
    })
    // Turning the capability off writes the mode alone: the stored pair stays
    // as the row left it, ready for the next switch-on.
    expect(subagentOps(saveSubagent)).toEqual([{ field: 'mode', value: 'follow-main' }])
  })

  it('writes fixed on Subagent on and keeps last provider/model', async () => {
    const { renderer, saveSubagent } = mountSettings({ subagent: { mode: 'follow-main', provider: 'codex', model: 'gpt-subagent' } })
    const toggle = renderer.root.findAllByType('button').find(button => button.props['aria-label'] === 'subagent')
    expect(toggle?.props['aria-checked']).toBe(false)
    await act(async () => {
      toggle?.props.onClick()
    })
    expect(subagentOps(saveSubagent)).toEqual([{ field: 'mode', value: 'fixed' }])
  })

  it('expands provider, model, and effort when the Default Subagent route is on', () => {
    const { renderer } = mountSettings({ subagent: { mode: 'fixed', provider: 'codex', model: 'gpt-subagent' } })
    const header = renderer.root.findAllByType('button').find(button => button.props['aria-expanded'] === false && instanceText(button).includes('subagent'))
    act(() => {
      header?.props.onClick()
    })
    const labels = renderer.root.findAllByType('span').map(node => instanceText(node))
    expect(labels).toContain('provider')
    expect(labels).toContain('model')
    expect(labels).toContain('effort')
    expect(renderer.root.findAllByType('select').length).toBeGreaterThanOrEqual(3)
    expect(JSON.stringify(renderer.toJSON())).not.toContain('follow-main')
  })

  it('shows the Auto review card collapsed and following the session model by default', () => {
    const markup = renderSettings()
    expect(markup).toContain('>autoReview<')
    expect(markup).toContain('>autoReviewFollow<')
    expect(markup).toContain('>autoReviewHelp<')
    const toggle = markup.match(/<button[^>]*aria-label="autoReview"[^>]*>/)?.[0]
    expect(toggle).toContain('aria-checked="false"')
    // No route fields while following the session model.
    expect(markup).not.toContain('aria-expanded="true"')
  })

  it('expands the pinned reviewer route when the Auto review route is set', () => {
    const { renderer } = mountSettings({ autoReview: { provider: 'codex', model: 'gpt-main' } })
    const toggle = renderer.root.findAllByType('button').find(button => button.props['aria-label'] === 'autoReview')
    expect(toggle?.props['aria-checked']).toBe(true)
    const header = renderer.root.findAllByType('button').find(button => button.props['aria-expanded'] === false && instanceText(button).includes('autoReview'))
    act(() => {
      header?.props.onClick()
    })
    const labels = renderer.root.findAllByType('span').map(node => instanceText(node))
    expect(labels).toContain('provider')
    expect(labels).toContain('model')
    const selects = renderer.root.findAllByType('select')
    expect(selects.some(select => String(select.props.value) === 'codex')).toBe(true)
  })

  it('unsets both reviewer fields on Auto review off', async () => {
    const { renderer, saveCapability } = mountSettings({ autoReview: { provider: 'codex', model: 'gpt-main' } })
    const toggle = renderer.root.findAllByType('button').find(button => button.props['aria-label'] === 'autoReview')
    await act(async () => {
      toggle?.props.onClick()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    expect(saveCapability.mock.calls.at(-1)?.[0]).toBe('autoReview')
    expect(capabilityOps(saveCapability)).toEqual([{ field: 'provider', value: undefined }, { field: 'model', value: undefined }])
  })

  it('seeds the reviewer route to the catalog head when Auto review is switched on', async () => {
    const { renderer, saveCapability } = mountSettings()
    const toggle = renderer.root.findAllByType('button').find(button => button.props['aria-label'] === 'autoReview')
    expect(toggle?.props['aria-checked']).toBe(false)
    await act(async () => {
      toggle?.props.onClick()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    expect(saveCapability.mock.calls.at(-1)?.[0]).toBe('autoReview')
    expect(capabilityOps(saveCapability)).toEqual([{ field: 'provider', value: 'codex' }, { field: 'model', value: 'gpt-subagent' }])
    // Both fields are pinned as one decision; partial writes never ship.
    expect(saveCapability).toHaveBeenCalledTimes(1)
  })

  it('keeps zh/en copy for the Auto review card', () => {
    expect(zh.autoReview).toBe('自动审查模型')
    expect(en.autoReview).toBe('Auto review model')
    expect(zh.autoReviewFollow).toContain('跟随会话模型')
    expect(en.autoReviewFollow).toContain('session model')
    expect(zh.autoReviewHelp).toContain('auto-review')
    expect(en.autoReviewHelp).toContain('Auto permission preset')
  })

  it('shows the Compaction card collapsed and following the conversation model by default', () => {
    const markup = renderSettings()
    expect(markup).toContain('>compaction<')
    expect(markup).toContain('>compactionFollow<')
    expect(markup).toContain('>compactionHelp<')
    const toggle = markup.match(/<button[^>]*aria-label="compaction"[^>]*>/)?.[0]
    expect(toggle).toContain('aria-checked="false"')
    // No route fields while compaction follows the conversation target.
    expect(markup).not.toContain('aria-expanded="true"')
  })

  it('expands the pinned compaction route when the Compaction route is set', () => {
    const { renderer } = mountSettings({ compaction: { provider: 'codex', model: 'gpt-main' } })
    const toggle = renderer.root.findAllByType('button').find(button => button.props['aria-label'] === 'compaction')
    expect(toggle?.props['aria-checked']).toBe(true)
    const header = renderer.root.findAllByType('button').find(button => button.props['aria-expanded'] === false && instanceText(button).includes('compaction'))
    act(() => {
      header?.props.onClick()
    })
    const labels = renderer.root.findAllByType('span').map(node => instanceText(node))
    expect(labels).toContain('provider')
    expect(labels).toContain('model')
    const selects = renderer.root.findAllByType('select')
    expect(selects.some(select => String(select.props.value) === 'codex')).toBe(true)
  })

  it('unsets both compaction fields on Compaction off', async () => {
    const { renderer, saveCapability } = mountSettings({ compaction: { provider: 'codex', model: 'gpt-main' } })
    const toggle = renderer.root.findAllByType('button').find(button => button.props['aria-label'] === 'compaction')
    await act(async () => {
      toggle?.props.onClick()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    expect(saveCapability.mock.calls.at(-1)?.[0]).toBe('compaction')
    expect(capabilityOps(saveCapability)).toEqual([{ field: 'provider', value: undefined }, { field: 'model', value: undefined }])
  })

  it('seeds the compaction route to the catalog head when Compaction is switched on', async () => {
    const { renderer, saveCapability } = mountSettings()
    const toggle = renderer.root.findAllByType('button').find(button => button.props['aria-label'] === 'compaction')
    expect(toggle?.props['aria-checked']).toBe(false)
    await act(async () => {
      toggle?.props.onClick()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    expect(saveCapability.mock.calls.at(-1)?.[0]).toBe('compaction')
    expect(capabilityOps(saveCapability)).toEqual([{ field: 'provider', value: 'codex' }, { field: 'model', value: 'gpt-subagent' }])
    // Both fields are pinned as one decision; partial writes never ship.
    expect(saveCapability).toHaveBeenCalledTimes(1)
  })

  it('gates Compaction save on a complete route', () => {
    const { renderer } = mountSettings({ compaction: { provider: 'codex', model: 'gpt-main' } })
    const header = renderer.root.findAllByType('button').find(button => button.props['aria-expanded'] === false && instanceText(button).includes('compaction'))
    act(() => {
      header?.props.onClick()
    })
    const save = () => renderer.root.findAllByType('button').find(button => instanceText(button) === 'save')
    expect(save()?.props.disabled).toBe(false)
    const providerSelect = renderer.root.findAllByType('select')[0]
    act(() => {
      providerSelect.props.onChange({ target: { value: '' } })
    })
    // An incomplete pair cannot save; the pin stays as stored until a full route exists.
    expect(save()?.props.disabled).toBe(true)
  })

  it('keeps zh/en copy for the Compaction card', () => {
    expect(zh.compaction).toBe('压缩模型')
    expect(en.compaction).toBe('Compaction model')
    expect(zh.compactionFollow).toContain('跟随会话模型')
    expect(en.compactionFollow).toContain('conversation model')
    expect(zh.compactionHelp).toContain('/compact')
    expect(en.compactionHelp).toContain('/compact')
    expect(zh.compactionRouteHelp).toContain('Provider')
  })

  it('shows the Session title card collapsed and following the session model by default', () => {
    const markup = renderSettings()
    expect(markup).toContain('>sessionTitle<')
    expect(markup).toContain('>titleFollow<')
    expect(markup).toContain('>titleHelp<')
    const toggle = markup.match(/<button[^>]*aria-label="sessionTitle"[^>]*>/)?.[0]
    expect(toggle).toContain('aria-checked="false"')
    // No route fields while naming follows the session model.
    expect(markup).not.toContain('aria-expanded="true"')
  })

  it('expands the pinned naming route when the Session title route is set', () => {
    const { renderer } = mountSettings({ title: { provider: 'codex', model: 'gpt-main' } })
    const toggle = renderer.root.findAllByType('button').find(button => button.props['aria-label'] === 'sessionTitle')
    expect(toggle?.props['aria-checked']).toBe(true)
    const header = renderer.root.findAllByType('button').find(button => button.props['aria-expanded'] === false && instanceText(button).includes('sessionTitle'))
    act(() => {
      header?.props.onClick()
    })
    const labels = renderer.root.findAllByType('span').map(node => instanceText(node))
    expect(labels).toContain('provider')
    expect(labels).toContain('model')
    // Naming carries no reasoning effort field.
    expect(labels).not.toContain('effort')
    const selects = renderer.root.findAllByType('select')
    expect(selects.some(select => String(select.props.value) === 'codex')).toBe(true)
  })

  it('unsets both naming fields on Session title off', async () => {
    const { renderer, saveCapability } = mountSettings({ title: { provider: 'codex', model: 'gpt-main' } })
    const toggle = renderer.root.findAllByType('button').find(button => button.props['aria-label'] === 'sessionTitle')
    await act(async () => {
      toggle?.props.onClick()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    expect(saveCapability.mock.calls.at(-1)?.[0]).toBe('title')
    expect(capabilityOps(saveCapability)).toEqual([{ field: 'provider', value: undefined }, { field: 'model', value: undefined }])
  })

  it('seeds the naming route to the catalog head when Session title is switched on', async () => {
    const { renderer, saveCapability } = mountSettings()
    const toggle = renderer.root.findAllByType('button').find(button => button.props['aria-label'] === 'sessionTitle')
    expect(toggle?.props['aria-checked']).toBe(false)
    await act(async () => {
      toggle?.props.onClick()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    expect(saveCapability.mock.calls.at(-1)?.[0]).toBe('title')
    expect(capabilityOps(saveCapability)).toEqual([{ field: 'provider', value: 'codex' }, { field: 'model', value: 'gpt-subagent' }])
    // Both fields are pinned as one decision; partial writes never ship.
    expect(saveCapability).toHaveBeenCalledTimes(1)
  })

  it('keeps zh/en copy for the Session title card', () => {
    expect(zh.sessionTitle).toBe('会话命名模型')
    expect(en.sessionTitle).toBe('Session title model')
    expect(zh.titleFollow).toBe('跟随会话模型')
    expect(en.titleFollow).toContain('session model')
    expect(zh.titleHelp).toContain('新会话')
    expect(en.titleHelp).toContain('first prompt')
    expect(zh.titleRouteHelp).toContain('Provider')
    expect(en.titleRouteHelp).toContain('no reasoning effort')
  })

  it('renders the provider groups section with a configured-count badge', () => {
    const markup = renderSettings({ providerGroups: [entryOf('codex', { compactProvider: 'codex', compactModel: 'gpt' })] })
    expect(markup).toContain('>providerGroups<')
    expect(markup).toContain('>providerGroupsCard<')
    expect(markup).toContain('>providerGroupsSummary<')
    expect(markup).toContain('>providerGroupsHelp<')
    expect(markup).toContain('>1<')
    // A badge appears only once a provider actually has a saved group.
    expect(renderSettings()).not.toContain('>1<')
  })

  it('opens the group editor on the first configured provider and saves the draft as one storage write', async () => {
    const { renderer, saveProviderGroup } = mountSettings()
    const header = renderer.root.findAllByType('button').find(button => button.props['aria-expanded'] === false && instanceText(button).includes('providerGroupsCard'))
    expect(header).toBeDefined()
    act(() => {
      header?.props.onClick()
    })
    // The editor opens pre-filled: first saved group, else the catalog head.
    const providerSelect = renderer.root.findAllByType('select').find(select => String(select.props.value) === 'codex')
    expect(providerSelect).toBeDefined()
    expect(JSON.stringify(renderer.toJSON())).toContain('providerGroupsBodyHelp')
    const save = () => renderer.root.findAllByType('button').find(button => instanceText(button) === 'save')
    expect(save()?.props.disabled).toBe(false)
    await act(async () => {
      save?.()?.props.onClick()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    expect(saveProviderGroup).toHaveBeenCalledTimes(1)
    const [provider, group] = (saveProviderGroup as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(provider).toBe('codex')
    // Seed: the active Subagent route only; compaction and review stay at their defaults.
    expect(group).toEqual<ProviderGroupConfig>({ subagentProvider: 'codex', subagentModel: 'gpt-subagent' })
  })

  it('toggles a capability row off to the default and back on with the live route', async () => {
    const { renderer, saveProviderGroup } = mountSettings({ title: { provider: 'codex', model: 'gpt-main' } })
    const header = renderer.root.findAllByType('button').find(button => button.props['aria-expanded'] === false && instanceText(button).includes('providerGroupsCard'))
    act(() => {
      header?.props.onClick()
    })
    const rowToggles = () => renderer.root.findAllByType('button').filter(button => button.props['aria-label'] === 'sessionTitle')
    // First is the Session title card switch, second is the group row switch.
    // The row opens seeded from the active naming route.
    expect(rowToggles()).toHaveLength(2)
    expect(rowToggles()[1]?.props['aria-checked']).toBe(true)
    const save = () => renderer.root.findAllByType('button').find(button => instanceText(button) === 'save')

    // Switch the row off: both halves clear to the capability default.
    await act(async () => {
      rowToggles()[1]?.props.onClick()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    await act(async () => {
      save?.()?.props.onClick()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    let [provider, group] = (saveProviderGroup as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(provider).toBe('codex')
    expect(group).toMatchObject<ProviderGroupConfig>({ titleProvider: '', titleModel: '' })

    // Switch it back on: the row re-seeds from the live naming route.
    await act(async () => {
      rowToggles()[1]?.props.onClick()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    await act(async () => {
      save?.()?.props.onClick()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    ;[, group] = (saveProviderGroup as ReturnType<typeof vi.fn>).mock.calls[1]
    expect(group).toMatchObject<ProviderGroupConfig>({ titleProvider: 'codex', titleModel: 'gpt-main' })
  })

  it('gates the delete button on a saved group and removes it on click', async () => {
    const { renderer, saveProviderGroup } = mountSettings({ providerGroups: [entryOf('codex', { compactProvider: 'codex', compactModel: 'gpt' })] })
    const header = renderer.root.findAllByType('button').find(button => button.props['aria-expanded'] === false && instanceText(button).includes('providerGroupsCard'))
    act(() => {
      header?.props.onClick()
    })
    const remove = () => renderer.root.findAllByType('button').find(button => instanceText(button) === 'providerGroupDelete')
    expect(remove()?.props.disabled).toBe(false)
    await act(async () => {
      remove?.()?.props.onClick()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    expect(saveProviderGroup).toHaveBeenCalledWith('codex', undefined)
  })

  it('disables the delete button when the selected provider has no group', () => {
    const { renderer } = mountSettings()
    const header = renderer.root.findAllByType('button').find(button => button.props['aria-expanded'] === false && instanceText(button).includes('providerGroupsCard'))
    act(() => {
      header?.props.onClick()
    })
    const remove = renderer.root.findAllByType('button').find(button => instanceText(button) === 'providerGroupDelete')
    expect(remove?.props.disabled).toBe(true)
  })

  it('follows an accepted snapshot only while the row draft is pristine', () => {
    const { renderer, rerender } = mountSettings({ title: { provider: 'codex', model: 'gpt-main' } })
    const header = () => renderer.root.findAllByType('button').find(button => button.props['aria-expanded'] === false && instanceText(button).includes('sessionTitle'))
    act(() => {
      header()?.props.onClick()
    })
    const selectWith = (value: string) => renderer.root.findAllByType('select').find(select => String(select.props.value) === value)

    // A pristine draft adopts whatever the Host accepted.
    rerender({ title: { provider: 'codex', model: 'gpt-subagent' } })
    expect(selectWith('gpt-subagent')).toBeDefined()

    // Once the user has edited the row, an incoming snapshot must not discard it.
    act(() => {
      selectWith('gpt-subagent')?.props.onChange({ target: { value: 'gpt-main' } })
    })
    rerender({ title: { provider: 'codex', model: 'gpt-subagent' } })
    expect(selectWith('gpt-main')).toBeDefined()
    expect(selectWith('gpt-subagent')).toBeUndefined()
  })

  it('clears the busy latch and reports a refused row save', async () => {
    const refused = vi.fn(async () => { throw new Error('requestFailed') })
    const { renderer } = mountSettings({ compaction: { provider: 'codex', model: 'gpt-main' }, saveCapability: refused })
    const header = renderer.root.findAllByType('button').find(button => button.props['aria-expanded'] === false && instanceText(button).includes('compaction'))
    act(() => {
      header?.props.onClick()
    })
    const save = () => renderer.root.findAllByType('button').find(button => instanceText(button) === 'save')
    await act(async () => {
      save?.()?.props.onClick()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    expect(refused).toHaveBeenCalledTimes(1)
    // The page is not latched on "保存中…", and the failure is visible.
    expect(renderer.root.findAllByType('button').some(button => instanceText(button) === 'saving')).toBe(false)
    expect(renderer.root.findAllByType('p').some(node => instanceText(node) === 'requestFailed')).toBe(true)
  })

  it('keeps zh/en copy for the provider groups card across all four capabilities', () => {
    expect(zh.providerGroups).toBe('供应商配置组')
    expect(en.providerGroups).toBe('Provider groups')
    expect(zh.providerGroupsSummary).toContain('使用该供应商')
    expect(en.providerGroupsSummary).toContain('using that provider')
    expect(zh.providerGroupsBodyHelp).toContain('互不影响')
    expect(en.providerGroupsBodyHelp).toContain('never affect each other')
    expect(zh.providerGroupDelete).toBe('删除该组')
    // A group covers all four per-session capabilities.
    expect(zh.providerGroupsHelp).toContain('压缩')
    expect(zh.providerGroupsHelp).toContain('自动审查')
    expect(zh.providerGroupsHelp).toContain('命名')
    expect(zh.providerGroupsHelp).toContain('子代理')
    expect(en.providerGroupsHelp).toContain('compaction')
    expect(en.providerGroupsHelp).toContain('auto-review')
    expect(en.providerGroupsHelp).toContain('session-naming')
    expect(en.providerGroupsHelp).toContain('subagent')
    // The stalled-save report the row shows has copy in both languages.
    expect(zh.saveTimeout).toBe('保存超时，请重试')
    expect(en.saveTimeout).toBe('The save timed out; try again')
  })

  it('edits all four capability rows (compaction, autoReview, sessionTitle, subagent) inside a provider group and seeds from active cards', async () => {
    const { renderer, saveProviderGroup } = mountSettings({
      compaction: { provider: 'codex', model: 'gpt-compact' },
      autoReview: { provider: 'codex', model: 'gpt-review' },
      title: { provider: 'codex', model: 'gpt-title' },
      subagent: { mode: 'fixed', provider: 'codex', model: 'gpt-subagent', reasoningEffort: 'high' },
    })
    const header = renderer.root.findAllByType('button').find(button => button.props['aria-expanded'] === false && instanceText(button).includes('providerGroupsCard'))
    act(() => {
      header?.props.onClick()
    })
    const togglesFor = (label: string) => renderer.root.findAllByType('button').filter(button => button.props['aria-label'] === label)
    expect(togglesFor('compaction')).toHaveLength(2)
    expect(togglesFor('autoReview')).toHaveLength(2)
    expect(togglesFor('sessionTitle')).toHaveLength(2)
    expect(togglesFor('subagent')).toHaveLength(2)
    expect(togglesFor('compaction')[1]?.props['aria-checked']).toBe(true)
    expect(togglesFor('autoReview')[1]?.props['aria-checked']).toBe(true)
    expect(togglesFor('sessionTitle')[1]?.props['aria-checked']).toBe(true)
    expect(togglesFor('subagent')[1]?.props['aria-checked']).toBe(true)

    const save = () => renderer.root.findAllByType('button').find(button => instanceText(button) === 'save')
    await act(async () => {
      save?.()?.props.onClick()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    expect((saveProviderGroup as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]).toEqual<ProviderGroupConfig>({
      compactProvider: 'codex',
      compactModel: 'gpt-compact',
      autoReviewProvider: 'codex',
      autoReviewModel: 'gpt-review',
      titleProvider: 'codex',
      titleModel: 'gpt-title',
      subagentProvider: 'codex',
      subagentModel: 'gpt-subagent',
      subagentReasoningEffort: 'high',
    })

    // Toggle compaction and autoReview off, then save.
    await act(async () => {
      togglesFor('compaction')[1]?.props.onClick()
      togglesFor('autoReview')[1]?.props.onClick()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    await act(async () => {
      save?.()?.props.onClick()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    expect((saveProviderGroup as ReturnType<typeof vi.fn>).mock.calls[1]?.[1]).toMatchObject<ProviderGroupConfig>({
      compactProvider: '',
      compactModel: '',
      autoReviewProvider: '',
      autoReviewModel: '',
      titleProvider: 'codex',
      titleModel: 'gpt-title',
    })
  })

  it('disables off capability switches while the model catalog is still loading and enables them once loaded', async () => {
    catalogState.emptyCatalog = true
    try {
      const { renderer, rerender, saveCapability } = mountSettings()
      const findSwitch = (label: string) => renderer.root.findAllByType('button').find(button => button.props['aria-label'] === label)
      expect(findSwitch('sessionTitle')?.props.disabled).toBe(true)
      expect(findSwitch('autoReview')?.props.disabled).toBe(true)
      expect(findSwitch('compaction')?.props.disabled).toBe(true)

      await act(async () => {
        findSwitch('sessionTitle')?.props.onClick()
        await new Promise(resolve => setTimeout(resolve, 0))
      })
      expect(saveCapability).not.toHaveBeenCalled()

      catalogState.emptyCatalog = false
      rerender()
      expect(findSwitch('sessionTitle')?.props.disabled).toBe(false)
      expect(findSwitch('autoReview')?.props.disabled).toBe(false)
      expect(findSwitch('compaction')?.props.disabled).toBe(false)

      await act(async () => {
        findSwitch('sessionTitle')?.props.onClick()
        await new Promise(resolve => setTimeout(resolve, 0))
      })
      expect(saveCapability).toHaveBeenCalledWith('title', [
        { field: 'provider', value: 'codex' },
        { field: 'model', value: 'gpt-subagent' },
      ])
    } finally {
      catalogState.emptyCatalog = false
    }
  })

  it('disables other card switches while any save is in flight', async () => {
    let resolveSave!: () => void
    const pendingSave = vi.fn(() => new Promise<void>(resolve => { resolveSave = resolve }))
    const { renderer } = mountSettings({ saveCapability: pendingSave })
    const findSwitch = (label: string) => renderer.root.findAllByType('button').find(button => button.props['aria-label'] === label)

    act(() => {
      findSwitch('autoReview')?.props.onClick()
    })
    expect(findSwitch('sessionTitle')?.props.disabled).toBe(true)
    expect(findSwitch('compaction')?.props.disabled).toBe(true)
    expect(findSwitch('subagent')?.props.disabled).toBe(true)

    await act(async () => {
      resolveSave()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    expect(findSwitch('sessionTitle')?.props.disabled).toBe(false)
    expect(findSwitch('compaction')?.props.disabled).toBe(false)
    expect(findSwitch('subagent')?.props.disabled).toBe(false)
  })

  it('edits the naming row inside a provider group and clears it back to the default', async () => {
    const { renderer, saveProviderGroup } = mountSettings()
    const header = renderer.root.findAllByType('button').find(button => button.props['aria-expanded'] === false && instanceText(button).includes('providerGroupsCard'))
    act(() => {
      header?.props.onClick()
    })
    const rows = () => renderer.root.findAllByType('button').filter(button => button.props['aria-label'] === 'sessionTitle')
    // First is the Session title card switch, second is the group row switch.
    expect(rows()).toHaveLength(2)
    expect(rows()[1]?.props['aria-checked']).toBe(false)
    const save = () => renderer.root.findAllByType('button').find(button => instanceText(button) === 'save')

    // Switch the row on: it seeds to the catalog head because no naming route is pinned.
    await act(async () => {
      rows()[1]?.props.onClick()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    await act(async () => {
      save?.()?.props.onClick()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    let [, group] = (saveProviderGroup as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(group).toMatchObject<ProviderGroupConfig>({ titleProvider: 'codex', titleModel: 'gpt-subagent' })

    // Switch the row off: both halves clear so naming falls back to the session model.
    await act(async () => {
      rows()[1]?.props.onClick()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    await act(async () => {
      save?.()?.props.onClick()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    ;[, group] = (saveProviderGroup as ReturnType<typeof vi.fn>).mock.calls[1]
    expect(group).toMatchObject<ProviderGroupConfig>({ titleProvider: '', titleModel: '' })
  })

  it('labels the subagent effort as pinned only when one is stored', () => {
    expect(renderSettings({ subagent: { mode: 'fixed', provider: 'codex', model: 'gpt-subagent', reasoningEffort: 'high' } }))
      .toContain('effortPinned · high')
    expect(renderSettings()).toContain('providerDefaultShort')
  })
})
