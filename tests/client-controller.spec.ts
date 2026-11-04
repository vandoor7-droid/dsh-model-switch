import { describe, expect, it, vi } from 'vitest'
import { CATALOG_LOAD_ATTEMPTS, deriveRouteChoices, groupProviderChoices, loadCatalogWithRetry, selectRouteModel, withCatalogFailures } from '../src/client/main-row-controller.js'

describe('Model Switch Settings route helpers', () => {
  const groups = [{ id: 'codex', name: 'Codex', models: [
    { id: 'gpt-a', name: 'GPT A', reasoning: { efforts: [{ id: 'low', name: 'Low' }], defaultEffort: 'low' } },
    { id: 'gpt-b', name: 'GPT B' },
  ] }]
  it('appends configured providers missing from the catalog, so their groups stay reachable', () => {
    expect(groupProviderChoices(groups, ['codex', 'retired'], 'codex')).toEqual([
      { id: 'codex', name: 'Codex' },
      { id: 'retired', name: 'retired', unavailable: true },
    ])
  })
  it('lists the edited provider even before it has a group, without duplicating it', () => {
    expect(groupProviderChoices(groups, [], 'gone')).toEqual([
      { id: 'codex', name: 'Codex' },
      { id: 'gone', name: 'gone', unavailable: true },
    ])
    expect(groupProviderChoices(groups, ['gone'], 'gone')).toEqual([
      { id: 'codex', name: 'Codex' },
      { id: 'gone', name: 'gone', unavailable: true },
    ])
  })
  it('ignores blank provider ids and keeps catalog order first', () => {
    const catalog = [{ id: 'b', name: 'B', models: [] }, { id: 'a', name: 'A', models: [] }]
    expect(groupProviderChoices(catalog, ['', '  ', 'z', 'b'], undefined)).toEqual([
      { id: 'b', name: 'B' },
      { id: 'a', name: 'A' },
      { id: 'z', name: 'z', unavailable: true },
    ])
  })
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

describe('settings catalog resilience', () => {
  it('merges host failures as model-less providers without duplicating live ids', () => {
    const live = [{ id: 'codex', name: 'Codex', models: [{ id: 'gpt-a', name: 'GPT A' }] }]
    expect(withCatalogFailures(live, [
      { id: 'codex', name: 'Codex', message: 'duplicate' },
      { id: 'apigoto', name: 'Apigoto', message: 'boom' },
      { id: ' ', name: 'Blank', message: 'ignored' },
    ])).toEqual([
      { id: 'codex', name: 'Codex', models: [{ id: 'gpt-a', name: 'GPT A' }] },
      { id: 'apigoto', name: 'Apigoto', models: [] },
    ])
  })
  it('falls back to the provider id when the failure carries no name', () => {
    expect(withCatalogFailures([], [{ id: 'p', name: '  ', message: 'x' }])).toEqual([{ id: 'p', name: 'p', models: [] }])
  })
  it('keeps a failed provider selectable in the group editor instead of marking it deleted', () => {
    // A provider the Host still knows must not degrade to an all-⚠ list: the
    // transient failure would otherwise lock every stored group away.
    const merged = withCatalogFailures([], [{ id: 'apigoto', name: 'Apigoto', message: 'boom' }])
    expect(groupProviderChoices(merged, ['apigoto'], 'apigoto')).toEqual([{ id: 'apigoto', name: 'Apigoto' }])
    expect(groupProviderChoices(merged, ['retired'], undefined)).toEqual([
      { id: 'apigoto', name: 'Apigoto' },
      { id: 'retired', name: 'retired', unavailable: true },
    ])
  })
})

describe('catalog load retry', () => {
  const payload = { groups: [{ id: 'codex', name: 'Codex', models: [] }], failures: [] }
  it('resolves on the first successful attempt without waiting', async () => {
    const load = vi.fn(async () => payload)
    const sleeps: number[] = []
    await expect(loadCatalogWithRetry(load, { sleep: async ms => { sleeps.push(ms) } })).resolves.toBe(payload)
    expect(load).toHaveBeenCalledTimes(1)
    expect(sleeps).toEqual([])
  })
  it('retries with the documented backoff and recovers from a transient failure', async () => {
    let calls = 0
    const load = vi.fn(async () => { calls += 1; if (calls < 3) throw new Error('busy'); return payload })
    const sleeps: number[] = []
    await expect(loadCatalogWithRetry(load, { sleep: async ms => { sleeps.push(ms) } })).resolves.toBe(payload)
    expect(load).toHaveBeenCalledTimes(3)
    expect(sleeps).toEqual([400, 1200])
  })
  it('gives up after the attempt budget and rethrows the last error', async () => {
    const load = vi.fn(async () => { throw new Error('down') })
    await expect(loadCatalogWithRetry(load, { sleep: async () => {} })).rejects.toThrow('down')
    expect(load).toHaveBeenCalledTimes(CATALOG_LOAD_ATTEMPTS)
  })
  it('stops retrying a cancelled load', async () => {
    const load = vi.fn(async () => { throw new Error('down') })
    let cancelled = false
    await expect(loadCatalogWithRetry(load, { attempts: 5, sleep: async () => { cancelled = true }, cancelled: () => cancelled })).rejects.toThrow('down')
    expect(load).toHaveBeenCalledTimes(1)
  })
})
