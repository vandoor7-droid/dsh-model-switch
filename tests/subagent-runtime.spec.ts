import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import OfficialSubagentRuntime, { type SubagentStartRequest } from '@deepseek-ai/dsh-subagent'
import { ModelSwitchSubagentRuntime, routeSubagentRequest } from '../src/subagent-runtime.js'

afterEach(() => {
  vi.restoreAllMocks()
})

function request(agentOptions?: { provider?: string; model?: string; reasoningEffort?: ReturnType<typeof ReasoningEffortId>; maxTokens?: number }) {
  return {
    parent: { options: {}, session: { requestHeader: () => undefined } },
    ...(agentOptions === undefined ? {} : { agentOptions }),
  } as never
}

describe('routeSubagentRequest', () => {
  it('injects the delegating session route when the spawn names none', () => {
    const routed = routeSubagentRequest(
      request(),
      { provider: 'fixed-provider', model: 'fixed-model', reasoningEffort: 'high' },
    )
    expect(routed.agentOptions).toEqual({
      provider: 'fixed-provider',
      model: 'fixed-model',
      reasoningEffort: ReasoningEffortId('high'),
    })
  })

  it('omits the effort when the resolved route carries none', () => {
    const routed = routeSubagentRequest(request(), { provider: 'p', model: 'm' })
    expect(routed.agentOptions).toEqual({ provider: 'p', model: 'm' })
    expect(Object.prototype.hasOwnProperty.call(routed.agentOptions, 'reasoningEffort')).toBe(false)
  })

  it('returns the request untouched when the session resolved no route', () => {
    const spawn = request()
    expect(routeSubagentRequest(spawn, undefined)).toBe(spawn)
  })

  it('never overrides a spawn that already names a route', () => {
    const spawn = request({ provider: 'named-provider', model: 'named-model', reasoningEffort: ReasoningEffortId('low') })
    expect(routeSubagentRequest(spawn, { provider: 'fixed-provider', model: 'fixed-model', reasoningEffort: 'high' })).toBe(spawn)
  })

  it('leaves an effort-only spawn unchanged so official inherit can fill provider and model', () => {
    const spawn = request({ reasoningEffort: ReasoningEffortId('low') })
    expect(routeSubagentRequest(spawn, { provider: 'p', model: 'm' })).toBe(spawn)
  })

  it('leaves a partial spawn unchanged so official inherit can fill it', () => {
    expect(routeSubagentRequest(request({ provider: 'only-provider' }), { provider: 'p', model: 'm' }).agentOptions)
      .toEqual({ provider: 'only-provider' })
  })

  it('keeps unrelated spawn options and the parent by identity', () => {
    const spawn = { parent: { options: {}, session: { requestHeader: () => undefined } }, agentOptions: { maxTokens: 123 } } as never
    const routed = routeSubagentRequest(spawn, { provider: 'p', model: 'm' })
    expect(routed.agentOptions).toEqual({ maxTokens: 123, provider: 'p', model: 'm' })
    expect(routed.parent).toBe((spawn as { parent: unknown }).parent)
  })
})

/** What one delegating session reports through the public route reads. */
function sessionOf(provider?: string): Session {
  return {
    requestContext: () => provider === undefined ? undefined : { provider, model: 'session-model' },
    requestHeader: () => undefined,
  } as unknown as Session
}

/** A spawn whose parent is the given session, mirroring the official start request shape. */
function spawnOf(session: Session, agentOptions?: Record<string, unknown>): SubagentStartRequest {
  return {
    parent: { options: {}, session },
    ...(agentOptions === undefined ? {} : { agentOptions }),
  } as unknown as SubagentStartRequest
}

interface ProviderStub {
  readonly capabilities: { readonly agentOptions: boolean }
}

/**
 * A runtime instance wired to a structural bench instead of a mounted profile.
 *
 * The official `start()` is stubbed on the prototype so each test observes the
 * routed request the adapter hands the official runtime, without mounting the
 * real descriptor machinery.
 */
function runtimeBench(options: {
  settings: Record<string, unknown>
  providers?: Record<string, ProviderStub | undefined>
}) {
  const started: Array<{ name: string; request: SubagentStartRequest }> = []
  vi.spyOn(OfficialSubagentRuntime.prototype, 'start').mockImplementation(async (name, req) => {
    started.push({ name, request: req })
    return {} as never
  })
  const ctx = {
    get: () => undefined,
    subagents: { getProvider: (name: string) => options.providers?.[name] },
    modelSwitch: { currentSettings: () => ({ ...options.settings }) },
  }
  const runtime = Object.create(ModelSwitchSubagentRuntime.prototype) as ModelSwitchSubagentRuntime
  Reflect.set(runtime, 'ctx', ctx as unknown as Context)
  return { runtime, started }
}

const routedProvider: ProviderStub = { capabilities: { agentOptions: true } }
const processWorker: ProviderStub = { capabilities: { agentOptions: false } }

describe('ModelSwitchSubagentRuntime per-spawn routing', () => {
  it('routes two delegating sessions on different providers through their own route', async () => {
    const { runtime, started } = runtimeBench({
      settings: {
        subagentMode: 'fixed',
        subagentProvider: 'flat-provider',
        subagentModel: 'flat-model',
        providerGroups: { codex: { subagentProvider: 'grok', subagentModel: 'grok-fast', subagentReasoningEffort: 'low' } },
      },
      providers: { capture: routedProvider },
    })
    await runtime.start('capture', spawnOf(sessionOf('codex')))
    await runtime.start('capture', spawnOf(sessionOf('deepseek')))
    expect(started[0]?.request.agentOptions).toEqual({ provider: 'grok', model: 'grok-fast', reasoningEffort: ReasoningEffortId('low') })
    expect(started[1]?.request.agentOptions).toEqual({ provider: 'flat-provider', model: 'flat-model' })
  })

  it('falls back to the fixed flat pair only in fixed mode', async () => {
    const fixed = runtimeBench({
      settings: { subagentMode: 'fixed', subagentProvider: 'flat-provider', subagentModel: 'flat-model' },
      providers: { capture: routedProvider },
    })
    await fixed.runtime.start('capture', spawnOf(sessionOf('provider-without-group')))
    expect(fixed.started[0]?.request.agentOptions).toEqual({ provider: 'flat-provider', model: 'flat-model' })

    const follow = runtimeBench({
      settings: { subagentMode: 'follow-main', subagentProvider: 'flat-provider', subagentModel: 'flat-model' },
      providers: { capture: routedProvider },
    })
    await follow.runtime.start('capture', spawnOf(sessionOf('provider-without-group')))
    expect(follow.started[0]?.request.agentOptions).toBeUndefined()
  })

  it('never overrides a spawn that already names a route', async () => {
    const { runtime, started } = runtimeBench({
      settings: { subagentMode: 'fixed', subagentProvider: 'flat-provider', subagentModel: 'flat-model' },
      providers: { capture: routedProvider },
    })
    const named = spawnOf(sessionOf('codex'), { provider: 'workflow-provider', model: 'workflow-model', maxTokens: 123 })
    await runtime.start('capture', named)
    expect(started[0]?.request.agentOptions).toEqual({ provider: 'workflow-provider', model: 'workflow-model', maxTokens: 123 })
  })

  it('never reinterprets a provider whose capabilities reject agent options', async () => {
    const { runtime, started } = runtimeBench({
      settings: { subagentMode: 'fixed', subagentProvider: 'flat-provider', subagentModel: 'flat-model' },
      providers: { capture: processWorker },
    })
    const spawn = spawnOf(sessionOf('codex'))
    await runtime.start('capture', spawn)
    expect(started[0]?.request.agentOptions).toBeUndefined()
  })

  it('falls back to the fixed flat default when the session reports no provider', async () => {
    const { runtime, started } = runtimeBench({
      settings: { subagentMode: 'fixed', subagentProvider: 'flat-provider', subagentModel: 'flat-model' },
      providers: { capture: routedProvider },
    })
    await runtime.start('capture', spawnOf(sessionOf(undefined)))
    expect(started[0]?.request.agentOptions).toEqual({ provider: 'flat-provider', model: 'flat-model' })
  })
})
