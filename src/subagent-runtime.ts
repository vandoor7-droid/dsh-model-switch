import { symbols, type Context } from '@deepseek-ai/cordis'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { AgentOptions } from '@deepseek-ai/dsh-agent'
import type { SubagentStartRequest } from '@deepseek-ai/dsh-subagent'
import type { ModelSwitchSettings } from './host-settings.js'
import { sessionSubagentRouteOf, type SubagentRoute } from './session-route.js'

// Keep the previously published startup helpers and subclass importable. The
// bundle no longer mounts the subclass; only the official service owns Typert.
export {
  ModelSwitchSubagentRuntime,
  StartupIncompatibilityError,
  mountWithStartupFallback,
  routedRuntimeUnavailableNotice,
  subagentRuntimeInject,
  subagentSurfaceOf,
} from './subagent-runtime-legacy.js'
export type {
  MountedStartup,
  StartupCleanupTracker,
  StartupDisposer,
  SubagentSurfaceLine,
} from './subagent-runtime-legacy.js'

interface ModelSwitchSurface {
  currentSettings(): ModelSwitchSettings
}

type RoutableSubagentRequest = Pick<SubagentStartRequest, 'parent' | 'agentOptions'>
type RuntimeMethod = (this: unknown, ...args: unknown[]) => unknown

interface SubagentProviderSurface {
  readonly capabilities?: { readonly agentOptions?: boolean }
}

interface SubagentRuntimeSurface {
  getProvider?(name: string): SubagentProviderSurface | undefined
  readonly startActivation?: unknown
  readonly start?: unknown
  readonly startContinuable?: unknown
}

/** The public 0.2.1+ activation shape used by tools and Agent Teams. */
export interface SubagentActivationSpecLike {
  readonly provider: string
  readonly request: RoutableSubagentRequest & Record<string, unknown>
  readonly [field: string]: unknown
}

/** Structural form of the pre-0.2.1 continuation start API. */
export interface ContinuableStartSpecLike {
  readonly provider: string
  readonly request: RoutableSubagentRequest & Record<string, unknown>
  readonly [field: string]: unknown
}

function present(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function spawnHasAnyRouteField(options: AgentOptions | undefined): boolean {
  return present(options?.provider) || present(options?.model) || options?.reasoningEffort !== undefined
}

/**
 * Inject a parent-session route only when the caller named no provider, model,
 * or reasoning effort. All other request and Agent options pass through.
 */
export function routeSubagentRequest<T extends RoutableSubagentRequest>(request: T, route: SubagentRoute | undefined): T {
  if (spawnHasAnyRouteField(request.agentOptions) || route === undefined) return request
  return {
    ...request,
    agentOptions: {
      ...request.agentOptions,
      provider: route.provider,
      model: route.model,
      ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: ReasoningEffortId(route.reasoningEffort) }),
    },
  }
}

/** Resolve the current public route surface, never retaining a disposed service. */
export function routedSubagentRequest<T extends RoutableSubagentRequest>(ctx: Context, runtime: SubagentRuntimeSurface, providerName: string, request: T): T {
  if (spawnHasAnyRouteField(request.agentOptions)) return request
  const provider = runtime.getProvider?.(providerName)
  if (provider !== undefined && provider.capabilities?.agentOptions !== true) return request
  let modelSwitch: ModelSwitchSurface | undefined
  try { modelSwitch = ctx.get('modelSwitch') as ModelSwitchSurface | undefined } catch { return request }
  if (typeof modelSwitch?.currentSettings !== 'function') return request
  return routeSubagentRequest(request, sessionSubagentRouteOf(ctx, request.parent.session, modelSwitch.currentSettings()))
}

/** A tracing proxy is for calls, not method ownership or descriptor restoration. */
function originalService<T extends object>(value: T): T {
  const original = Reflect.get(value, symbols.original) as unknown
  return original !== null && (typeof original === 'object' || typeof original === 'function') ? original as T : value
}

function isRequest(value: unknown): value is RoutableSubagentRequest {
  if (typeof value !== 'object' || value === null) return false
  const parent = Reflect.get(value, 'parent') as unknown
  return typeof parent === 'object' && parent !== null && Reflect.get(parent, 'session') !== undefined
}

function warn(ctx: Context, message: string): void {
  try { ctx.logger.warn(message) } catch { /* Missing optional diagnostics must not stop delegation. */ }
}

interface RouteLease { readonly ctx: Context }
interface WrapperState {
  readonly runtime: SubagentRuntimeSurface
  readonly leases: Set<RouteLease>
  readonly restores: Array<() => void>
}

// One physical wrapper per service, even when the Loader briefly overlaps two
// adapter fibers. A released lease cannot leave its context in a nested wrapper.
const wrappers = new WeakMap<object, WrapperState>()

function routeFor(state: WrapperState, provider: string, request: RoutableSubagentRequest): RoutableSubagentRequest {
  const leases = [...state.leases]
  const ctx = leases.at(-1)?.ctx
  return ctx === undefined ? request : routedSubagentRequest(ctx, state.runtime, provider, request)
}

function wrapMethod(target: object, key: string, factory: (original: RuntimeMethod) => RuntimeMethod): (() => void) | undefined {
  const original = Reflect.get(target, key) as unknown
  if (typeof original !== 'function') return undefined
  const previous = Object.getOwnPropertyDescriptor(target, key)
  const wrapped = factory(original as RuntimeMethod)
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: previous?.enumerable ?? false,
    writable: true,
    value: wrapped,
  })
  return () => {
    // Do not undo another extension's later method replacement.
    if (Object.getOwnPropertyDescriptor(target, key)?.value !== wrapped) return
    if (previous === undefined) Reflect.deleteProperty(target, key)
    else Object.defineProperty(target, key, previous)
  }
}

/**
 * Wrap the official service's start entries only. Its identity, prototype,
 * registry, manager, Typert binding and prompt/interrupt methods are untouched.
 * Disposers are idempotent and safe when overlapping adapter fibers unload in
 * either order. Unsupported or sealed surfaces leave the official route usable.
 */
export function installSubagentRouteWrappers(ctx: Context): () => void {
  const service = ctx.get('subagents') as SubagentRuntimeSurface | undefined
  if (service === undefined) {
    warn(ctx, 'model-switch: subagents service is unavailable; delegation keeps the official route')
    return () => {}
  }
  const runtime = originalService(service)
  let state = wrappers.get(runtime)
  if (state === undefined) {
    state = { runtime, leases: new Set(), restores: [] }
    const current = state
    const wrap = (key: string, factory: (original: RuntimeMethod) => RuntimeMethod): void => {
      const restore = wrapMethod(runtime, key, factory)
      if (restore !== undefined) current.restores.push(restore)
    }
    try {
      for (const key of ['startActivation', 'startContinuable']) {
        wrap(key, original => function (this: unknown, ...args: unknown[]): unknown {
          const rawSpec = args[0]
          if (typeof rawSpec !== 'object' || rawSpec === null) return Reflect.apply(original, this, args)
          const spec = rawSpec as SubagentActivationSpecLike
          if (typeof spec.provider !== 'string' || !isRequest(spec.request)) return Reflect.apply(original, this, args)
          const request = routeFor(current, spec.provider, spec.request)
          return Reflect.apply(original, this, [request === spec.request ? spec : { ...spec, request }, ...args.slice(1)])
        })
      }
      wrap('start', original => function (this: unknown, ...args: unknown[]): unknown {
        const [provider, request] = args
        if (typeof provider !== 'string' || !isRequest(request)) return Reflect.apply(original, this, args)
        return Reflect.apply(original, this, [provider, routeFor(current, provider, request), ...args.slice(2)])
      })
    } catch (error) {
      for (const restore of current.restores.reverse()) restore()
      warn(ctx, `model-switch: Subagent starts cannot be wrapped (${String(error)}); delegation keeps the official route`)
      return () => {}
    }
    if (current.restores.length === 0) {
      warn(ctx, 'model-switch: no supported public Subagent start entry; delegation keeps the official route')
      return () => {}
    }
    wrappers.set(runtime, state)
  }
  const lease: RouteLease = { ctx }
  state.leases.add(lease)
  const owned = state
  return () => {
    if (!owned.leases.delete(lease) || owned.leases.size > 0) return
    for (const restore of [...owned.restores].reverse()) restore()
    wrappers.delete(runtime)
  }
}

/**
 * Wait for the official service without replacing it or copying its dependency
 * list. Model Switch is read optionally per call, so its absence cannot hold a
 * startup fiber or retain a stale settings service. Cordis rebinds this effect
 * when the official service is recreated.
 */
export function profileSubagentRuntime(ctx: Context): void {
  ctx.inject(['subagents'], scope => {
    scope.effect(() => installSubagentRouteWrappers(scope), 'Model Switch: route official Subagent starts')
  })
}

export default profileSubagentRuntime
