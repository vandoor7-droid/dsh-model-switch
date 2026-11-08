import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context, Service, symbols } from '@deepseek-ai/cordis'
import OfficialSubagentRuntime from '@deepseek-ai/dsh-subagent'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { installSubagentRouteWrappers, profileSubagentRuntime } from '../src/subagent-runtime.js'

const contexts: Context[] = []
afterEach(async () => {
  for (const context of contexts.splice(0).reverse()) await context.fiber.dispose()
  vi.restoreAllMocks()
})

function context(): Context {
  const ctx = new Context()
  contexts.push(ctx)
  return ctx
}

function raw<T extends object>(value: T): T {
  return Reflect.get(value, symbols.original) ?? value
}

class ModelSwitchStub extends Service {
  static inject = []
  settings: Record<string, unknown> = { subagentMode: 'fixed', subagentProvider: 'route-provider', subagentModel: 'route-model' }
  constructor(ctx: Context) { super(ctx, 'modelSwitch') }
  currentSettings(): Record<string, unknown> { return { ...this.settings } }
}

const spec = () => ({
  provider: 'spawn', childId: 'reserved-child', label: 'child', delivery: 'parent',
  signal: new AbortController().signal,
  request: { parent: { options: {}, session: { requestHeader: () => undefined } }, prompt: [], cwd: 'child-directory' },
})

function captureRuntime() {
  return {
    getProvider: vi.fn(() => ({ capabilities: { agentOptions: true } })),
    startActivation: vi.fn(async function (this: unknown, value: ReturnType<typeof spec>, extra?: unknown) { return { value, receiver: this, extra } }),
    start: vi.fn(async (provider: string, request: unknown) => ({ provider, request })),
    startContinuable: vi.fn(async (value: ReturnType<typeof spec>) => value),
    prompt: vi.fn(), interrupt: vi.fn(), interruptByParent: vi.fn(),
    typertRemote: { serviceKey: 'subagents' },
  }
}

async function bench(withSettings = true) {
  const ctx = context()
  const runtime = captureRuntime()
  await ctx.plugin((scope: Context) => { scope.provide('subagents', runtime) })
  const settings = withSettings ? await ctx.plugin(ModelSwitchStub) : undefined
  return { ctx, runtime, settings }
}

describe('official Subagent service route adapter', () => {
  it('keeps the exact official instance, prototype, Typert binding and all stop descriptors', async () => {
    const ctx = context()
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(ModelSwitchStub)
    await ctx.plugin(OfficialSubagentRuntime)
    const service = raw(ctx.subagents)
    const prototype = Object.getPrototypeOf(service)
    const binding = service.typertRemote
    const descriptors = ['prompt', 'interrupt', 'interruptByParent'].map(key => [key, Object.getOwnPropertyDescriptor(service, key), Reflect.get(service, key)] as const)
    const originalStart = service.start
    const adapter = await ctx.plugin(profileSubagentRuntime)

    expect(raw(ctx.subagents) === service).toBe(true)
    expect(Object.getPrototypeOf(service) === prototype).toBe(true)
    expect(service.typertRemote === binding).toBe(true)
    expect(binding.serviceKey).toBe('subagents')
    expect(service.start === originalStart).toBe(false)
    for (const [key, descriptor, value] of descriptors) {
      expect(Object.getOwnPropertyDescriptor(service, key)).toEqual(descriptor)
      expect(Reflect.get(service, key) === value).toBe(true)
    }
    await adapter.dispose()
    expect(service.start === originalStart).toBe(true)
    expect(raw(ctx.subagents) === service).toBe(true)
  })

  it('loads before the official runtime and works without Model Switch', async () => {
    const ctx = context()
    const adapter = await ctx.plugin(profileSubagentRuntime)
    expect(adapter.state).toBe(2)
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(OfficialSubagentRuntime)
    expect(raw(ctx.subagents) instanceof OfficialSubagentRuntime).toBe(true)
    expect(typeof ctx.subagents.interruptByParent).toBe('function')
  })

  it('preserves receiver, arguments and metadata, then restores exact method descriptors', async () => {
    const { ctx, runtime } = await bench()
    const original = Object.getOwnPropertyDescriptors(runtime)
    const dispose = installSubagentRouteWrappers(ctx)
    const value = spec()
    const result = await runtime.startActivation(value, 'extra')
    expect(result.receiver === runtime).toBe(true)
    expect(result.extra).toBe('extra')
    expect(result.value).toEqual({ ...value, request: { ...value.request, agentOptions: { provider: 'route-provider', model: 'route-model' } } })
    expect(result.value.signal === value.signal).toBe(true)
    expect(result.value.request.parent === value.request.parent).toBe(true)
    expect(value.request).not.toHaveProperty('agentOptions')
    dispose()
    dispose()
    expect(Object.getOwnPropertyDescriptors(runtime)).toEqual(original)
  })

  it.each([false, true])('shares one wrapper and releases overlapping installs in either order (reverse=%s)', async reverse => {
    const { ctx, runtime } = await bench()
    const original = runtime.startActivation
    const first = installSubagentRouteWrappers(ctx)
    const wrapped = runtime.startActivation
    const second = installSubagentRouteWrappers(ctx)
    expect(runtime.startActivation === wrapped).toBe(true)
    const releases = reverse ? [second, first] : [first, second]
    releases[0]!()
    const result = await runtime.startActivation(spec())
    expect(result.value.request).toHaveProperty('agentOptions.model', 'route-model')
    expect(runtime.startActivation === wrapped).toBe(true)
    releases[1]!()
    expect(runtime.startActivation === original).toBe(true)
  })

  it('keeps a later extension replacement when its lease is released', async () => {
    const { ctx, runtime } = await bench()
    const dispose = installSubagentRouteWrappers(ctx)
    const laterOwner = vi.fn()
    runtime.startActivation = laterOwner as never
    dispose()
    expect(runtime.startActivation === laterOwner).toBe(true)
  })

  it('rereads Model Switch after settings updates, absence, unload and replacement', async () => {
    const { ctx, runtime, settings } = await bench(false)
    const adapter = await ctx.plugin(profileSubagentRuntime)
    expect((await runtime.startActivation(spec())).value.request).not.toHaveProperty('agentOptions')
    const first = await ctx.plugin(ModelSwitchStub)
    expect((await runtime.startActivation(spec())).value.request).toHaveProperty('agentOptions.model', 'route-model')
    const service = raw(ctx.get('modelSwitch')!) as unknown as ModelSwitchStub
    service.settings = { subagentMode: 'fixed', subagentProvider: 'new', subagentModel: 'new-model' }
    expect((await runtime.startActivation(spec())).value.request).toHaveProperty('agentOptions.model', 'new-model')
    await first.dispose()
    expect((await runtime.startActivation(spec())).value.request).not.toHaveProperty('agentOptions')
    const second = await ctx.plugin(ModelSwitchStub)
    expect((await runtime.startActivation(spec())).value.request).toHaveProperty('agentOptions.model', 'route-model')
    await second.dispose()
    await adapter.dispose()
    expect(settings).toBeUndefined()
  })

  it('rebinds to a replacement Subagent runtime and releases the old instance', async () => {
    const ctx = context()
    await ctx.plugin(ModelSwitchStub)
    const first = captureRuntime()
    const original = first.startActivation
    const mount = (runtime: ReturnType<typeof captureRuntime>) => (scope: Context) => { scope.provide('subagents', runtime) }
    const firstFiber = await ctx.plugin(mount(first))
    const adapter = await ctx.plugin(profileSubagentRuntime)
    expect(first.startActivation === original).toBe(false)
    await firstFiber.dispose()
    expect(first.startActivation === original).toBe(true)
    const second = captureRuntime()
    const secondOriginal = second.startActivation
    await ctx.plugin(mount(second))
    expect(second.startActivation === secondOriginal).toBe(false)
    expect((await second.startActivation(spec())).value.request).toHaveProperty('agentOptions.model', 'route-model')
    await adapter.dispose()
    expect(second.startActivation === secondOriginal).toBe(true)
  })

  it('rolls back partial installation on a sealed entry without damaging the official service', async () => {
    const { ctx, runtime } = await bench()
    Object.defineProperty(runtime, 'startContinuable', { configurable: false, writable: false, value: runtime.startContinuable })
    const original = Object.getOwnPropertyDescriptors(runtime)
    const dispose = installSubagentRouteWrappers(ctx)
    expect(Object.getOwnPropertyDescriptors(runtime)).toEqual(original)
    expect((await runtime.startActivation(spec())).value.request).not.toHaveProperty('agentOptions')
    dispose()
  })
})
