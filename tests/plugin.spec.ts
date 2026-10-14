import { describe, expect, it, vi } from 'vitest'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import ModelSwitchRuntime, { Config, readConfig, RUNTIME_CAPABILITIES, mainDefaultPort, name } from '../src/index.js'

describe('Host runtime surface', () => {
  it('preserves package identity and released injection contract', () => {
    expect(name).toBe('dsh-model-switch')
    expect(ModelSwitchRuntime.inject).toEqual(['agentDefaultModel'])
  })
  it('defaults Subagent to follow-main and retains unavailable choices in volatile config', () => {
    expect(readConfig(Config({}))).toEqual({ subagentMode: 'follow-main', compactOnSwitch: true })
    expect(readConfig(Config({ subagentMode: 'fixed', subagentProvider: 'not-installed', subagentModel: 'remember-me' }))).toMatchObject({
      subagentMode: 'fixed', subagentProvider: 'not-installed', subagentModel: 'remember-me',
    })
    expect(() => Config({ subagentMode: 'other' } as never)).toThrow()
  })
  it('exposes saved provider groups and omits them when none exist', () => {
    expect(readConfig(Config({})).providerGroups).toBeUndefined()
    expect(readConfig(Config({ providerGroups: [{ provider: 'codex', compactProvider: 'codex', compactModel: 'gpt' }] })).providerGroups).toEqual({
      codex: { compactProvider: 'codex', compactModel: 'gpt' },
    })
    // A stored entry arrives with blank defaults; normalization drops them but keeps the group.
    expect(readConfig(Config({ providerGroups: [{ provider: 'codex', compactProvider: '' }] })).providerGroups).toEqual({ codex: {} })
    // An entry without a owning provider cannot be keyed and is dropped.
    expect(readConfig(Config({ providerGroups: [{ compactProvider: 'orphan' }] })).providerGroups).toBeUndefined()
    expect(() => Config({ providerGroups: [{ provider: 42 }] } as never)).toThrow()
  })
  it('adapts the public Main service without changing picker/global state', async () => {
    let selection = { provider: 'deepseek', model: 'chat', reasoningEffort: ReasoningEffortId('max') }
    const service = { currentSelection: vi.fn(() => selection), saveSelection: vi.fn(async (next) => { selection = next }) }
    const port = mainDefaultPort(service as never)
    expect(port.currentSelection()).toEqual(selection)
    await port.saveSelection({ provider: 'codex', model: 'gpt', reasoningEffort: ReasoningEffortId('high') })
    expect(service.saveSelection).toHaveBeenCalledOnce()
    expect(port.currentSelection().provider).toBe('codex')
  })
  it('reports available routing and remaining Alpha.4 gaps', () => {
    expect(RUNTIME_CAPABILITIES.mainDefaults.available).toBe(true)
    expect(RUNTIME_CAPABILITIES.settings.available).toBe(true)
    expect(RUNTIME_CAPABILITIES.centralSubagentRouting.available).toBe(true)
    expect(RUNTIME_CAPABILITIES.packagedPresetRoots).toEqual({ available: false, reason: 'packaged-preset-roots' })
    expect(RUNTIME_CAPABILITIES.toolOwnerSuppression.available).toBe(false)
    expect(RUNTIME_CAPABILITIES.searchProviderAdapters).toEqual({ available: false, reason: 'search-provider-adapters', providers: [] })
    expect(RUNTIME_CAPABILITIES.imageProviderAdapters).toEqual({ available: true, providers: ['codex', 'grok'] })
    expect(RUNTIME_CAPABILITIES.visionProviderAdapters).toEqual({ available: false, reason: 'vision-provider-adapters' })
    expect(Object.isFrozen(RUNTIME_CAPABILITIES)).toBe(true)
  })
})
