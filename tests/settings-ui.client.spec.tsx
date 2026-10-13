import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ModelSwitchSettings } from '../src/client/ModelSwitchSettings.js'
import { useModelSwitchSettingsController } from '../src/client/main-row-controller.js'
import { en, zh } from '../src/client/locales.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../src/client/main-row-controller.js', () => ({
  deriveRouteChoices: () => ({ providers: [{ id: 'codex', name: 'Codex' }], models: [{ id: 'gpt-subagent', name: 'GPT Subagent' }] }),
  selectRouteModel: () => ({ provider: 'codex', model: 'gpt-subagent' }),
  useModelSwitchSettingsController: vi.fn(),
}))

function snapshot<T>(value: T) {
  return { status: 'ready' as const, value, base: {}, user: {}, revision: 1, writable: true, mode: 'host' as const }
}

const controller = (subagent: { mode: 'follow-main' | 'fixed'; provider?: string; model?: string }) => ({
  main: snapshot({ provider: 'codex', model: 'gpt-main' }),
  subagent: snapshot(subagent),
  draft: { provider: 'codex', model: 'gpt-main' },
  groups: [{ id: 'codex', name: 'Codex', models: [{ id: 'gpt-subagent', name: 'GPT Subagent' }] }],
  providers: [],
  models: [],
  efforts: [],
  busy: false,
  disabled: false,
  setProvider: vi.fn(),
  setModel: vi.fn(),
  setReasoningEffort: vi.fn(),
  reset: vi.fn(),
  save: vi.fn(),
})

function face(options?: {
  subagent?: { mode: 'follow-main' | 'fixed'; provider?: string; model?: string }
  compactOnSwitch?: boolean
  omitCompactOnSwitch?: true
  memoryOnly?: true
  autoReview?: { provider?: string; model?: string }
  compaction?: { provider?: string; model?: string }
  setSubagent?: ReturnType<typeof vi.fn>
  setCapability?: ReturnType<typeof vi.fn>
  setCompactOnSwitch?: ReturnType<typeof vi.fn>
}) {
  const subagent = options?.subagent ?? { mode: 'fixed', provider: 'codex', model: 'gpt-subagent' }
  const controllerState = controller(subagent)
  vi.mocked(useModelSwitchSettingsController).mockImplementation(() => controllerState as never)
  const switchSettings = options?.memoryOnly
    ? { status: 'unavailable' as const, value: undefined, base: undefined, user: {}, revision: undefined, writable: false, mode: 'memory' as const }
    : snapshot(options?.omitCompactOnSwitch === true ? {} : { compactOnSwitch: options?.compactOnSwitch !== false })
  const searchSettings = snapshot({ provider: 'codex', model: 'gpt-search' })
  const imageSettings = snapshot({ provider: 'grok', model: 'grok-imagine-image-quality' })
  // Unset reviewer fields = the shipped default: reviews follow the session model.
  const autoReviewSettings = snapshot(options?.autoReview ?? {})
  // Unset compaction fields = the official default: compaction follows the conversation target.
  const compactionSettings = snapshot(options?.compaction ?? {})
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
    useSwitchSettings: () => switchSettings,
    setSubagent: options?.setSubagent ?? vi.fn(async () => undefined),
    setCapability: options?.setCapability ?? vi.fn(),
    setCompactOnSwitch: options?.setCompactOnSwitch ?? vi.fn(async () => undefined),
    saveMain: vi.fn(),
  } as never
}

function renderSettings(options?: Parameters<typeof face>[0]) {
  return renderToStaticMarkup(<ModelSwitchSettings {...face(options)} />)
}

function instanceText(node: { children?: readonly unknown[] }): string {
  return (node.children ?? []).map(child => typeof child === 'string' ? child : instanceText(child as { children?: readonly unknown[] })).join('')
}

function mountSettings(options?: Parameters<typeof face>[0]) {
  const setSubagent = options?.setSubagent ?? vi.fn(async () => undefined)
  const setCapability = options?.setCapability ?? vi.fn()
  const setCompactOnSwitch = options?.setCompactOnSwitch ?? vi.fn(async () => undefined)
  const props = face({ ...options, setSubagent, setCapability, setCompactOnSwitch })
  let renderer!: ReactTestRenderer
  act(() => {
    renderer = create(<ModelSwitchSettings {...props} />)
  })
  return { renderer, setSubagent, setCapability, setCompactOnSwitch }
}

describe('Model Switch settings menu', () => {
  it('shows Send protection B-row and Subagent RouteCard without a follow-main select', () => {
    const markup = renderSettings()

    expect(markup).toContain('>main<')
    expect(markup).toContain('>subagent<')
    expect(markup).toContain('>search<')
    expect(markup).not.toContain('>vision<')
    expect(markup).toContain('>image<')
    expect(markup).toContain('>sendProtection<')
    expect(markup).toContain('compactOnSwitch')
    expect(markup).toContain('role="switch"')
    expect(markup).toContain('aria-label="compactOnSwitch"')
    expect(markup).toContain('aria-label="subagent"')
    expect(markup).not.toContain('type="checkbox"')
    expect(markup).not.toContain('>save<')
    expect(markup).not.toContain('aria-expanded="true"')
    expect(markup).not.toContain('subagentMode')
    expect(markup).not.toContain('follow-main')
    expect(markup).not.toContain('subagentFollowMain')
    expect(markup.indexOf('sendProtection')).toBeLessThan(markup.indexOf('conversationRoutes'))
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
    expect(markup).toContain('>sendProtection<')
    expect(markup).toContain('role="switch"')
  })

  it('treats missing compactOnSwitch as on in the Send protection switch', () => {
    const markup = renderSettings({ omitCompactOnSwitch: true })
    const compact = markup.match(/<button[^>]*aria-label="compactOnSwitch"[^>]*>/)?.[0]
    expect(compact).toContain('aria-checked="true"')
    expect(compact).toContain('role="switch"')
  })

  it('shows compact off when compactOnSwitch is false', () => {
    const markup = renderSettings({ compactOnSwitch: false })
    const compact = markup.match(/<button[^>]*aria-label="compactOnSwitch"[^>]*>/)?.[0]
    expect(compact).toContain('aria-checked="false"')
  })

  it('keeps zh/en copy for Send protection and the Subagent Allowlist hint', () => {
    expect(zh.sendProtection).toBe('发送保护')
    expect(en.sendProtection).toBe('Send protection')
    expect(zh.subagentHelp).toContain('白名单')
    expect(en.subagentHelp).toContain('Allowlist')
    expect(zh.subagentHelp).not.toMatch(/href=|settings\./)
    expect(en.subagentHelp).not.toMatch(/href=|settings\./)
    expect(zh.compactOnSwitchHelp).toContain('发送且换了模型')
    expect(en.compactOnSwitchHelp).toContain('/compact')
    expect(zh).not.toHaveProperty('subagentFollowMain')
    expect(en).not.toHaveProperty('subagentFollowMain')
  })

  it('writes compactOnSwitch immediately from the Send protection switch', async () => {
    const { renderer, setCompactOnSwitch } = mountSettings()
    const compact = renderer.root.findAllByType('button').find(button => button.props['aria-label'] === 'compactOnSwitch')
    expect(compact?.props['aria-checked']).toBe(true)
    await act(async () => {
      compact?.props.onClick()
    })
    expect(setCompactOnSwitch).toHaveBeenCalledWith(false)
    expect(setCompactOnSwitch).toHaveBeenCalledTimes(1)
  })

  it('writes follow-main on Subagent off without clearing the stored route', async () => {
    const { renderer, setSubagent } = mountSettings({ subagent: { mode: 'fixed', provider: 'codex', model: 'gpt-subagent' } })
    const toggle = renderer.root.findAllByType('button').find(button => button.props['aria-label'] === 'subagent')
    expect(toggle?.props['aria-checked']).toBe(true)
    await act(async () => {
      toggle?.props.onClick()
    })
    expect(setSubagent).toHaveBeenCalledWith('mode', 'follow-main')
    expect(setSubagent).not.toHaveBeenCalledWith('provider', undefined)
    expect(setSubagent).not.toHaveBeenCalledWith('model', undefined)
    expect(setSubagent).not.toHaveBeenCalledWith('effort', undefined)
  })

  it('writes fixed on Subagent on and keeps last provider/model', async () => {
    const { renderer, setSubagent } = mountSettings({ subagent: { mode: 'follow-main', provider: 'codex', model: 'gpt-subagent' } })
    const toggle = renderer.root.findAllByType('button').find(button => button.props['aria-label'] === 'subagent')
    expect(toggle?.props['aria-checked']).toBe(false)
    await act(async () => {
      toggle?.props.onClick()
    })
    expect(setSubagent).toHaveBeenCalledWith('mode', 'fixed')
    expect(setSubagent).not.toHaveBeenCalledWith('provider', undefined)
    expect(setSubagent).not.toHaveBeenCalledWith('model', undefined)
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
    const { renderer, setCapability } = mountSettings({ autoReview: { provider: 'codex', model: 'gpt-main' } })
    const toggle = renderer.root.findAllByType('button').find(button => button.props['aria-label'] === 'autoReview')
    await act(async () => {
      toggle?.props.onClick()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    expect(setCapability).toHaveBeenCalledWith('autoReview', 'provider', undefined)
    expect(setCapability).toHaveBeenCalledWith('autoReview', 'model', undefined)
  })

  it('seeds the reviewer route from Main when Auto review is switched on', async () => {
    const { renderer, setCapability } = mountSettings()
    const toggle = renderer.root.findAllByType('button').find(button => button.props['aria-label'] === 'autoReview')
    expect(toggle?.props['aria-checked']).toBe(false)
    await act(async () => {
      toggle?.props.onClick()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    expect(setCapability).toHaveBeenCalledWith('autoReview', 'provider', 'codex')
    expect(setCapability).toHaveBeenCalledWith('autoReview', 'model', 'gpt-main')
    // Both fields are pinned as one decision; partial writes never ship.
    expect(setCapability).toHaveBeenCalledTimes(2)
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
    const { renderer, setCapability } = mountSettings({ compaction: { provider: 'codex', model: 'gpt-main' } })
    const toggle = renderer.root.findAllByType('button').find(button => button.props['aria-label'] === 'compaction')
    await act(async () => {
      toggle?.props.onClick()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    expect(setCapability).toHaveBeenCalledWith('compaction', 'provider', undefined)
    expect(setCapability).toHaveBeenCalledWith('compaction', 'model', undefined)
  })

  it('seeds the compaction route from Main when Compaction is switched on', async () => {
    const { renderer, setCapability } = mountSettings()
    const toggle = renderer.root.findAllByType('button').find(button => button.props['aria-label'] === 'compaction')
    expect(toggle?.props['aria-checked']).toBe(false)
    await act(async () => {
      toggle?.props.onClick()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    expect(setCapability).toHaveBeenCalledWith('compaction', 'provider', 'codex')
    expect(setCapability).toHaveBeenCalledWith('compaction', 'model', 'gpt-main')
    // Both fields are pinned as one decision; partial writes never ship.
    expect(setCapability).toHaveBeenCalledTimes(2)
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
})
