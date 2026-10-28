import { describe, expect, it } from 'vitest'
import { planReviewTimeout, patchProviderIdleTimeout, readProviderIdleTimeout } from '../src/review-timeout.js'
import { UPSTREAM_MAX_IDLE_TIMEOUT_MS } from '../src/client-contract.js'
import type { ModelSwitchSettings } from '../src/host-settings.js'

const baseSettings = (overrides: Partial<ModelSwitchSettings> = {}): ModelSwitchSettings => ({
  subagentMode: 'follow-main',
  ...overrides,
})

describe('planReviewTimeout', () => {
  it('returns undefined timeout when setting is absent', () => {
    const plan = planReviewTimeout(baseSettings())
    expect(plan.timeoutMs).toBeUndefined()
  })

  it('passes positive values through unchanged', () => {
    const plan = planReviewTimeout(baseSettings({ autoReviewTimeoutMs: 60_000 }))
    expect(plan.timeoutMs).toBe(60_000)
  })

  it('maps zero (cancelled) to the upstream ceiling', () => {
    const plan = planReviewTimeout(baseSettings({ autoReviewTimeoutMs: 0 }))
    expect(plan.timeoutMs).toBe(UPSTREAM_MAX_IDLE_TIMEOUT_MS)
  })

  it('clamps values above the ceiling', () => {
    const plan = planReviewTimeout(baseSettings({ autoReviewTimeoutMs: UPSTREAM_MAX_IDLE_TIMEOUT_MS + 1 }))
    expect(plan.timeoutMs).toBe(UPSTREAM_MAX_IDLE_TIMEOUT_MS)
  })

  it('collects the global autoReviewProvider', () => {
    const plan = planReviewTimeout(baseSettings({ autoReviewProvider: 'apigoto', autoReviewModel: 'mimo-v2.6-flash' }))
    expect(plan.providers).toEqual(['apigoto'])
  })

  it('collects group autoReviewProviders and deduplicates', () => {
    const plan = planReviewTimeout(baseSettings({
      autoReviewProvider: 'apigoto',
      providerGroups: {
        apigoto: { provider: 'apigoto', compactProvider: '', compactModel: '', autoReviewProvider: 'apigoto', autoReviewModel: 'mimo-v2.6-flash', subagentProvider: '', subagentModel: '', subagentReasoningEffort: '', titleProvider: '', titleModel: '', memoryProvider: '', memoryModel: '' },
        xiaomi: { provider: 'xiaomi', compactProvider: '', compactModel: '', autoReviewProvider: 'xiaomi', autoReviewModel: 'mimo-v2.6-flash', subagentProvider: '', subagentModel: '', subagentReasoningEffort: '', titleProvider: '', titleModel: '', memoryProvider: '', memoryModel: '' },
      },
    }))
    expect(plan.providers.sort()).toEqual(['apigoto', 'xiaomi'])
  })
})

describe('patchProviderIdleTimeout', () => {
  const doc = [
    '- id: llm-pi-ai',
    '  name: "@deepseek-ai/dsh-llm-pi-ai"',
    '  config:',
    '    providers:',
    '      apigoto:',
    '        displayName: apigoto',
    '        baseURL: https://api.apigoto.com/v1',
    '        models:',
    '          - id: deepseek-flash',
    '            name: deepseek-flash',
    '      xiaomi:',
    '        displayName: xiaomi',
    '        baseURL: https://api.example.com/v1',
    '        models:',
    '          - id: mimo-v2.6-flash',
    '            name: mimo-v2.6-flash',
    '- id: other-row',
    '  name: something-else',
    '  config:',
    '    foo: bar',
    '',
  ].join('\n')

  it('inserts the key into a provider that lacks it', () => {
    const result = patchProviderIdleTimeout(doc, 'apigoto', 60_000)
    expect(result.outcome).toBe('written')
    expect(result.text).toContain('streamIdleTimeoutMs: 60000')
    // The key must be inside the apigoto block, not xiaomi.
    const apigotoBlock = result.text.slice(result.text.indexOf('apigoto:'), result.text.indexOf('xiaomi:'))
    expect(apigotoBlock).toContain('streamIdleTimeoutMs: 60000')
  })

  it('replaces an existing value', () => {
    const withKey = patchProviderIdleTimeout(doc, 'apigoto', 60_000).text
    const result = patchProviderIdleTimeout(withKey, 'apigoto', 30_000)
    expect(result.outcome).toBe('written')
    expect(result.text).toContain('streamIdleTimeoutMs: 30000')
    expect(result.text).not.toContain('streamIdleTimeoutMs: 60000')
  })

  it('removes the key when timeoutMs is undefined', () => {
    const withKey = patchProviderIdleTimeout(doc, 'apigoto', 60_000).text
    const result = patchProviderIdleTimeout(withKey, 'apigoto', undefined)
    expect(result.outcome).toBe('written')
    expect(result.text).not.toContain('streamIdleTimeoutMs')
  })

  it('reports unchanged when the value is already correct', () => {
    const withKey = patchProviderIdleTimeout(doc, 'apigoto', 60_000).text
    const result = patchProviderIdleTimeout(withKey, 'apigoto', 60_000)
    expect(result.outcome).toBe('unchanged')
    expect(result.text).toBe(withKey)
  })

  it('reports missing-provider for an unknown provider', () => {
    const result = patchProviderIdleTimeout(doc, 'nonexistent', 60_000)
    expect(result.outcome).toBe('missing-provider')
    expect(result.text).toBe(doc)
  })

  it('reports missing-row when the llm-pi-ai row is absent', () => {
    const result = patchProviderIdleTimeout('- id: other\n  name: x\n', 'apigoto', 60_000)
    expect(result.outcome).toBe('missing-row')
  })
})

describe('readProviderIdleTimeout', () => {
  const doc = [
    '- id: llm-pi-ai',
    '  name: "@deepseek-ai/dsh-llm-pi-ai"',
    '  config:',
    '    providers:',
    '      apigoto:',
    '        streamIdleTimeoutMs: 45000',
    '        baseURL: https://api.apigoto.com/v1',
    '      xiaomi:',
    '        baseURL: https://api.example.com/v1',
    '',
  ].join('\n')

  it('reads an existing value', () => {
    expect(readProviderIdleTimeout(doc, 'apigoto')).toBe(45_000)
  })

  it('returns null when the key is absent', () => {
    expect(readProviderIdleTimeout(doc, 'xiaomi')).toBeNull()
  })

  it('returns null for an unknown provider', () => {
    expect(readProviderIdleTimeout(doc, 'nonexistent')).toBeNull()
  })
})
