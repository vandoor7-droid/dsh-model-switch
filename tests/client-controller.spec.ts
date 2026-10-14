import { describe, expect, it } from 'vitest'
import { deriveRouteChoices, selectRouteModel } from '../src/client/main-row-controller.js'

describe('Model Switch Settings route helpers', () => {
  const groups = [{ id: 'codex', name: 'Codex', models: [
    { id: 'gpt-a', name: 'GPT A', reasoning: { efforts: [{ id: 'low', name: 'Low' }], defaultEffort: 'low' } },
    { id: 'gpt-b', name: 'GPT B' },
  ] }]
  it('keeps an unavailable stored route visible while deriving choices', () => {
    expect(deriveRouteChoices(groups, { provider: 'missing', model: 'remember' }, ['codex'])).toEqual({
      providers: [{ id: 'codex', name: 'Codex' }, { id: 'missing', name: 'missing', unavailable: true }],
      models: [{ id: 'remember', name: 'remember', unavailable: true }],
    })
  })
  it('drops providers outside the allowed set', () => {
    expect(deriveRouteChoices(groups, undefined, ['nope']).providers).toEqual([])
    // The stored route stays visible even while its provider is not allowed.
    expect(deriveRouteChoices(groups, { provider: 'codex' }, ['nope']).providers).toEqual([
      { id: 'codex', name: 'codex', unavailable: true },
    ])
  })
  it('replaces the previous model effort with the selected model default', () => {
    const providerGroups = [
      { id: 'codex', name: 'Codex', models: [{ id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', reasoning: { efforts: [{ id: 'max', name: 'Max' }], defaultEffort: 'max' } }] },
      { id: 'opencode-go', name: 'OpenCode Go', models: [
        { id: 'muse-spark', name: 'Muse Spark 1.2 Contributor' },
        { id: 'reasoning-model', name: 'Reasoning Model', reasoning: { efforts: [{ id: 'xhigh', name: 'Xhigh' }], defaultEffort: 'xhigh' } },
      ] },
    ]

    expect(selectRouteModel(providerGroups, 'opencode-go', 'muse-spark')).toEqual({
      provider: 'opencode-go',
      model: 'muse-spark',
    })
    expect(selectRouteModel(providerGroups, 'opencode-go', 'reasoning-model')).toEqual({
      provider: 'opencode-go',
      model: 'reasoning-model',
      reasoningEffort: 'xhigh',
    })
  })
})
