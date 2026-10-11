import { expect, it, vi } from 'vitest'
import { ModelSwitchAdapterRegistry } from '../src/adapter-registry.js'
import { capabilitiesRpc, installCapabilitiesRpc } from '../src/capabilities-rpc.js'
import { RUNTIME_CAPABILITIES } from '../src/runtime-capabilities.js'

it('delivers registration changes through the Host RPC and closes subscriptions on abort', async () => {
  const registry = new ModelSwitchAdapterRegistry()
  const lifetime = new AbortController()
  const request = new AbortController()
  const rpc = capabilitiesRpc(registry, () => ({ ...RUNTIME_CAPABILITIES, searchProviderAdapters: { available: true, catalog: registry.searchCatalog() } }), lifetime.signal)
  expect(await rpc('capabilities', {}, request.signal)).toMatchObject({ ok: true, value: { revision: 0, capabilities: { searchProviderAdapters: { catalog: [] } } } })
  const pending = rpc('capabilities', { revision: 0 }, request.signal)
  const dispose = registry.register({ provider: 'late', search: { provider: 'late', models: [{ id: 'search', name: 'Search' }], supportsModel: () => true, search: async () => ({ sources: [], truncated: false }) } })
  expect(await pending).toMatchObject({ ok: true, value: { revision: 1, capabilities: { searchProviderAdapters: { catalog: [{ id: 'late' }] } } } })
  const removed = rpc('capabilities', { revision: 1 }, request.signal)
  dispose()
  expect(await removed).toMatchObject({ ok: true, value: { revision: 2, capabilities: { searchProviderAdapters: { catalog: [] } } } })
  const cancelled = rpc('capabilities', { revision: 2 }, request.signal)
  request.abort()
  expect(await cancelled).toMatchObject({ ok: false, error: { code: 'cancelled' } })
  const stopped = rpc('capabilities', { revision: 2 }, new AbortController().signal)
  lifetime.abort()
  expect(await stopped).toMatchObject({ ok: false, error: { code: 'cancelled' } })
  expect(await rpc('capabilities', { revision: -1 }, request.signal)).toMatchObject({ ok: false, error: { code: 'invalid-request' } })
  expect(await rpc('search', {}, request.signal)).toMatchObject({ ok: false, error: { code: 'unknown-endpoint' } })
})

it('advances the wire revision when a provider changes its model declaration in place', async () => {
  vi.useFakeTimers()
  const registry = new ModelSwitchAdapterRegistry()
  const lifetime = new AbortController()
  let model = 'before'
  registry.register({ provider: 'dynamic', search: { provider: 'dynamic', get models() { return [{ id: model, name: model }] }, supportsModel: () => true, search: async () => ({ sources: [], truncated: false }) } })
  const rpc = capabilitiesRpc(registry, () => ({ ...RUNTIME_CAPABILITIES, searchProviderAdapters: { available: true, catalog: registry.searchCatalog() } }), lifetime.signal)
  try {
    const first = await rpc('capabilities', {}, lifetime.signal)
    if (!first.ok) throw new Error(first.error.code)
    const revision = (first.value as { revision: number }).revision
    const next = rpc('capabilities', { revision }, lifetime.signal)
    model = 'after'
    await vi.advanceTimersByTimeAsync(20_000)
    const result = await next
    expect(result).toMatchObject({ ok: true, value: { revision: revision + 1, capabilities: { searchProviderAdapters: { catalog: [{ models: [{ id: 'after' }] }] } } } })
  } finally { lifetime.abort(); vi.useRealTimers() }
})
it('uses the authenticated Fetch path and accepts an omitted JSON payload field', async () => {
  const registry = new ModelSwitchAdapterRegistry()
  const unregister = vi.fn()
  let registration: { path: string; methods: readonly string[]; requestBody: string } | undefined
  let fetchRoute: ((request: Request) => Promise<Response>) | undefined
  let dispose: (() => Promise<void>) | undefined
  const scope = {
    connection: {
      operator: {},
      fetch: {
        register(options: { path: string; methods: readonly string[]; requestBody: string; fetch: (request: Request) => Promise<Response> }) {
          registration = options
          fetchRoute = options.fetch
          return unregister
        },
      },
    },
    effect(factory: () => () => Promise<void>) { dispose = factory() },
  }
  const ctx = { inject: (_dependencies: string[], attach: (scope: unknown) => unknown) => attach(scope) }
  installCapabilitiesRpc(ctx as never, registry, () => RUNTIME_CAPABILITIES)
  expect(registration).toEqual({
    path: '/api/plugin-rpc/model-switch', methods: ['POST'], requestBody: 'buffered', fetch: expect.any(Function),
  })
  const fetch = fetchRoute
  if (fetch === undefined) throw new Error('Fetch route was not installed')
  const response = await fetch(new Request('http://host/api/plugin-rpc/model-switch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request', rpcId: 'client-1', method: 'plugin-rpc/model-switch',
      payload: { endpoint: 'capabilities' },
    }),
  }))
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    type: 'server-response', rpcId: 'client-1', result: { ok: false, error: { code: 'invalid-request' } },
  })
  await dispose?.()
  expect(unregister).toHaveBeenCalledOnce()
})

it('dispatches plan-compact payloads to the injected runner and back', async () => {
  const registry = new ModelSwitchAdapterRegistry()
  const lifetime = new AbortController()
  const runner = vi.fn(async (request: { sessionId: string; provider: string; model: string }) => ({
    status: 'compacted' as const,
    threshold: 200_000,
    estimate: 260_000 + request.sessionId.length,
  }))
  const rpc = capabilitiesRpc(registry, () => RUNTIME_CAPABILITIES, lifetime.signal, runner)

  const ok = await rpc('plan-compact', { sessionId: 's1', provider: 'p2', model: 'm2' }, new AbortController().signal)
  expect(ok).toMatchObject({ ok: true, value: { status: 'compacted', threshold: 200_000, estimate: 260_002 } })
  expect(runner).toHaveBeenCalledExactlyOnceWith(
    { sessionId: 's1', provider: 'p2', model: 'm2' },
    expect.any(AbortSignal),
  )

  expect(await rpc('plan-compact', { sessionId: '', provider: 'p', model: 'm' }, new AbortController().signal))
    .toMatchObject({ ok: false, error: { code: 'invalid-request' } })
  expect(await rpc('plan-compact', { sessionId: 's' }, new AbortController().signal))
    .toMatchObject({ ok: false, error: { code: 'invalid-request' } })
  expect(await rpc('plan-compact', 'not-an-object', new AbortController().signal))
    .toMatchObject({ ok: false, error: { code: 'invalid-request' } })
  lifetime.abort()
})

it('reports a missing runner and folds thrown failures into an error verdict', async () => {
  const registry = new ModelSwitchAdapterRegistry()
  const lifetime = new AbortController()
  const unmounted = capabilitiesRpc(registry, () => RUNTIME_CAPABILITIES, lifetime.signal)
  expect(await unmounted('plan-compact', { sessionId: 's', provider: 'p', model: 'm' }, new AbortController().signal))
    .toMatchObject({ ok: false, error: { code: 'unavailable' } })

  const throwing = capabilitiesRpc(registry, () => RUNTIME_CAPABILITIES, lifetime.signal, async () => {
    throw new Error('engine exploded')
  })
  expect(await throwing('plan-compact', { sessionId: 's', provider: 'p', model: 'm' }, new AbortController().signal))
    .toMatchObject({ ok: true, value: { status: 'error', message: 'engine exploded' } })
  lifetime.abort()
})
