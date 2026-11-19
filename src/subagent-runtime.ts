import { symbols, type Context } from '@deepseek-ai/cordis'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { AgentOptions } from '@deepseek-ai/dsh-agent'
import type { SubagentStartRequest } from '@deepseek-ai/dsh-subagent'
import type { ModelSwitchSettings } from './host-settings.js'
import type { Session } from '@deepseek-ai/dsh-session'
import { groupRoute, sessionProviderOf, sessionSubagentRouteOf, type SubagentRoute } from './session-route.js'

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

/**
 * The public activation shape used by tools and Agent Teams. 0.2.1 through
 * 0.2.2-rc.1 nest the SubagentStartRequest under a request field; 0.2.2-rc.2+
 * flatten those fields onto the spec itself, so the request field is absent
 * there and the spec's own parent/agentOptions carry the same meaning.
 */
export interface SubagentActivationSpecLike extends RoutableSubagentRequest {
  readonly provider: string
  readonly request?: RoutableSubagentRequest & Record<string, unknown>
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

/**
 * Route one activation spec under either released shape. 0.2.1 through
 * 0.2.2-rc.1 nest the SubagentStartRequest under spec.request; 0.2.2-rc.2
 * flattens those fields onto the spec itself. Unknown shapes pass through
 * untouched, so an unanticipated future shape keeps the official route.
 */
function routedSpecOf<T extends object>(spec: T, provider: string, state: WrapperState): T {
  const nested = Reflect.get(spec, 'request') as unknown
  if (typeof nested === 'object' && nested !== null && isRequest(nested)) {
    const request = routeFor(state, provider, nested as RoutableSubagentRequest)
    return request === nested ? spec : ({ ...spec, request } as T)
  }
  if (isRequest(spec)) {
    const request = routeFor(state, provider, spec)
    if (request === spec) return spec
    return { ...spec, agentOptions: request.agentOptions } as T
  }
  return spec
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
          if (typeof spec.provider !== 'string') return Reflect.apply(original, this, args)
          return Reflect.apply(original, this, [routedSpecOf(spec, spec.provider, current), ...args.slice(1)])
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

//#region Subagent model discovery hint

/** The official tool that lists routes available for explicit child selection. */
const SUBAGENT_MODEL_DISCOVERY_TOOL = 'list_subagent_models'

/**
 * Live state of the discovery-hint adapter, surfaced through the capabilities
 * RPC next to the other adapter states.
 */
export const subagentDiscoveryHintStatus = {
  /** The tools registry was reachable and the adapter installed. */
  installed: false,
  /** The discovery tool was found and its execute wrapped. */
  toolWrapped: false,
}

/** Marker so a re-sweep never wraps a wrapper. */
const discoveryHintMarker = Symbol('modelSwitchSubagentDiscoveryHint')

/** Minimal tools-registry face this row reads; the Host provides the service. */
interface ToolsRegistrySurface {
  get(name: string): { readonly execute?: unknown } | undefined
}

/** The calling agent's session handle, as discovery executions carry it. */
function sessionOfExec(exec: unknown): Session | undefined {
  const agent = (exec as { agent?: { session?: unknown } } | undefined)?.agent
  const session = agent === null || typeof agent !== 'object' ? undefined : (agent as { session?: unknown }).session
  return session === null || typeof session !== 'object' ? undefined : session as Session
}

/**
 * Compose the route footer appended to the discovery tool's text output.
 *
 * Pure so the copy and the source attribution stay unit-testable.
 *
 * @param route - the route an unnamed spawn from this session would use.
 * @param pinnedByGroup - whether a provider group (not the flat card) pinned it.
 * @returns the footer line; undefined routes are stated as official inherit.
 */
export function subagentDiscoveryFooter(route: SubagentRoute | undefined, pinnedByGroup: boolean): string {
  if (route === undefined) {
    return 'Default route for spawns that name no provider/model (Model Switch): official inherit (nothing pinned).'
  }
  const source = pinnedByGroup ? 'provider group pin' : 'fixed card'
  const effort = route.reasoningEffort === undefined ? '' : `, effort ${route.reasoningEffort}`
  return `Default route for spawns that name no provider/model (Model Switch, ${source}): ${route.provider}/${route.model}${effort}`
}

/** Read the effective route and its source for one discovery execution. */
function discoveryRouteOf(ctx: Context, exec: unknown): { route: SubagentRoute | undefined; pinnedByGroup: boolean } {
  const session = sessionOfExec(exec)
  let settings: ModelSwitchSettings | undefined
  try {
    const modelSwitch = ctx.get('modelSwitch') as ModelSwitchSurface | undefined
    settings = typeof modelSwitch?.currentSettings === 'function' ? modelSwitch.currentSettings() : undefined
  } catch { settings = undefined }
  const route = sessionSubagentRouteOf(ctx, session, settings)
  const pinnedByGroup = route !== undefined
    && groupRoute(settings, sessionProviderOf(ctx, session), 'subagent') !== undefined
  return { route, pinnedByGroup }
}

/**
 * Wrap the official discovery tool's execute so its text output also states the
 * route an unnamed spawn would actually take — the one piece the
 * authorized-route listing cannot know.
 *
 * The wrap is in place on the registered definition (the registry resolves
 * tools per call), idempotent across re-sweeps, and re-applied when the
 * registry changes so a re-registered tool is covered too. Unknown result
 * shapes pass through untouched; unload restores the official execute.
 *
 * @param ctx - this row's context.
 * @returns a disposer that detaches the listener and restores the execute.
 */
export function installSubagentDiscoveryHint(ctx: Context): () => void {
  const tools = ctx.get('tools', false) as ToolsRegistrySurface | undefined
  if (tools === undefined || typeof tools.get !== 'function') {
    warn(ctx, 'model-switch: the tools registry is unavailable; list_subagent_models keeps its official output')
    return () => {}
  }
  subagentDiscoveryHintStatus.installed = true
  const restores: Array<() => void> = []
  let announced = false
  const wrapExecute = (definition: object): boolean => {
    const current = (definition as { execute?: unknown }).execute
    if (typeof current !== 'function' || Reflect.get(current, discoveryHintMarker) === true) return false
    const restore = wrapMethod(definition, 'execute', original => {
      const wrapped = function (this: unknown, ...args: unknown[]): unknown {
        const returned = Reflect.apply(original as RuntimeMethod, this, args)
        const append = (value: unknown): unknown => {
          if (typeof value !== 'string') return value
          const { route, pinnedByGroup } = discoveryRouteOf(ctx, args[1])
          return `${value}\n${subagentDiscoveryFooter(route, pinnedByGroup)}`
        }
        if (returned !== null && (typeof returned === 'object' || typeof returned === 'function')
          && typeof (returned as { then?: unknown }).then === 'function') {
          return (returned as Promise<unknown>).then(append)
        }
        return append(returned)
      } as RuntimeMethod
      Object.defineProperty(wrapped, discoveryHintMarker, { value: true })
      return wrapped
    })
    if (restore === undefined) return false
    restores.push(restore)
    return true
  }
  const announce = (): void => {
    if (announced) return
    announced = true
    subagentDiscoveryHintStatus.toolWrapped = true
    try { ctx.logger.info('model-switch: list_subagent_models now states the effective default route for unnamed spawns') } catch { /* diagnostics only */ }
  }
  // The Web surface composes the discovery tool per agent preset, in the
  // session's own scope layer, which SHADOWS the global registration a sweep
  // can see. Hooking register itself covers every registration path: the host
  // row, each preset layer, and any future seam — the definition passes here
  // before any layer stores it.
  const registerRestore = wrapMethod(tools as object, 'register', original => {
    const wrapped = function (this: unknown, ...args: unknown[]): unknown {
      const definition = args[0] as { name?: unknown } | undefined
      if (definition !== null && typeof definition === 'object' && definition.name === SUBAGENT_MODEL_DISCOVERY_TOOL
        && wrapExecute(definition)) announce()
      return Reflect.apply(original as RuntimeMethod, this, args)
    } as RuntimeMethod
    return wrapped
  })
  if (registerRestore !== undefined) restores.push(registerRestore)
  // A host-plane registration may predate this row (or land while it loads):
  // sweep the global view for it, retrying briefly and on registry changes.
  const sweep = (): void => {
    const definition = tools.get(SUBAGENT_MODEL_DISCOVERY_TOOL)
    if (definition !== undefined && wrapExecute(definition as object)) announce()
  }
  sweep()
  let attempts = 0
  const retry = setInterval(() => {
    attempts += 1
    sweep()
    if (announced || attempts >= 15) clearInterval(retry)
  }, 1_000)
  const off = ctx.on('tools/change', sweep)
  return () => {
    off()
    clearInterval(retry)
    for (const restore of restores.reverse()) restore()
    restores.length = 0
    subagentDiscoveryHintStatus.installed = false
    subagentDiscoveryHintStatus.toolWrapped = false
  }
}

//#endregion

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
  ctx.inject(['tools'], scope => {
    scope.effect(() => installSubagentDiscoveryHint(scope), 'Model Switch: annotate the subagent model discovery tool')
  })
}

export default profileSubagentRuntime
