import { Context } from '@deepseek-ai/cordis'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { AgentOptions } from '@deepseek-ai/dsh-agent'
import OfficialSubagentRuntime, {
  type ContinuableStart,
  type ContinuableStartSpec,
  type SubagentRun,
  type SubagentStartRequest,
} from '@deepseek-ai/dsh-subagent'
import type { ModelSwitchSettings } from './host-settings.js'
import { sessionSubagentRouteOf, type SubagentRoute } from './session-route.js'

/** Raised only when an explicit startup check finds an unsupported public surface. */
export class StartupIncompatibilityError extends Error {
  override readonly name = 'StartupIncompatibilityError'
  readonly surface: string

  /**
   * @param surfaceOrMessage - the incompatible public surface, or the error message.
   * @param message - the missing or incompatible requirement.
   */
  constructor(surfaceOrMessage: string, message?: string) {
    super(message ?? surfaceOrMessage)
    this.surface = message === undefined ? 'startup' : surfaceOrMessage
  }
}

/** One idempotent cleanup operation tracked during runtime startup. */
export type StartupDisposer = () => void | PromiseLike<void>

/** Register one cleanup operation for a startup attempt. */
export type StartupCleanupTracker = (dispose: StartupDisposer) => void

/** A successfully mounted runtime and its idempotent cleanup operation. */
export interface MountedStartup<T> {
  readonly value: T
  readonly dispose: () => Promise<void>
}

interface ModelSwitchSurface {
  currentSettings(): ModelSwitchSettings
}
type RoutableSubagentRequest = Pick<SubagentStartRequest, 'parent' | 'agentOptions'>

/**
 * The 0.2.1+ activation spec, declared structurally.
 *
 * The pinned dependency typings predate the activation API, so the modern entry
 * is described here and delegated through the base prototype. `request` carries
 * the same `parent`/`agentOptions` pair the legacy start request does, which is
 * why one route adapter serves both lines.
 */
export interface SubagentActivationSpecLike {
  readonly provider: string
  readonly request: Pick<SubagentStartRequest, 'parent' | 'agentOptions'> & Record<string, unknown>
  readonly [field: string]: unknown
}

interface ProfileContext {
  readonly modelSwitch?: unknown
  readonly subagents?: unknown
}

function present(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function spawnHasAnyRouteField(options: AgentOptions | undefined): boolean {
  return present(options?.provider) || present(options?.model) || options?.reasoningEffort !== undefined
}

/**
 * Inject one resolved route into a spawn that names none.
 *
 * A spawn that already names a provider, model, or effort keeps it: the caller's
 * explicit selection outranks any profile policy. The route itself is derived
 * from the DELEGATING session (its provider selects a saved group, else the flat
 * Subagent card in `fixed` mode), so two sessions on different providers route
 * their own spawns and neither can rewrite the other's policy.
 * @param request - the caller's spawn request.
 * @param route - the delegating session's resolved route, or undefined for official inherit.
 * @returns The request to hand the official runtime.
 */
export function routeSubagentRequest<T extends RoutableSubagentRequest>(request: T, route: SubagentRoute | undefined): T {
  if (spawnHasAnyRouteField(request.agentOptions)) return request
  if (route === undefined) return request
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

function assertPublicMethod(value: unknown, surface: string, method: string): void {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function') || typeof Reflect.get(value, method) !== 'function') {
    throw new StartupIncompatibilityError(surface, surface + ' must expose public ' + method + '()')
  }
}

/** The public start surface one installed Subagent runtime publishes. */
export type SubagentSurfaceLine = 'activation' | 'start'

/**
 * Classify the runtime surface this Host publishes.
 *
 * DSH 0.2.1 replaced `start()` / `startContinuable()` with the activation API
 * (`startActivation`), so a version-agnostic adapter has to recognize both
 * lines instead of hard-coding one.
 *
 * @param value - a runtime class's prototype or a mounted runtime instance.
 * @returns `activation` (0.2.1+), `start` (0.1.7/0.2.0), or undefined when neither is published.
 */
export function subagentSurfaceOf(value: unknown): SubagentSurfaceLine | undefined {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return undefined
  if (typeof Reflect.get(value, 'startActivation') === 'function') return 'activation'
  const hasStart = typeof Reflect.get(value, 'start') === 'function'
  const hasContinuable = typeof Reflect.get(value, 'startContinuable') === 'function'
  return hasStart && hasContinuable ? 'start' : undefined
}

/** Read one public method, failing with the typed startup error when it is absent. */
function publicMethod(prototype: unknown, surface: string, method: string): (...args: unknown[]) => unknown {
  if (prototype === null || (typeof prototype !== 'object' && typeof prototype !== 'function')) {
    throw new StartupIncompatibilityError(surface, surface + ' must expose public ' + method + '()')
  }
  const value = Reflect.get(prototype, method)
  if (typeof value !== 'function') {
    throw new StartupIncompatibilityError(surface, surface + ' must expose public ' + method + '()')
  }
  return value as (...args: unknown[]) => unknown
}

function constructible(value: unknown): value is Function {
  if (typeof value !== 'function') return false
  try {
    Reflect.construct(Object, [], value)
    return true
  } catch (error) {
    if (error instanceof TypeError) return false
    throw error
  }
}

function assertOfficialRuntimeSurface(): SubagentSurfaceLine {
  const runtime = OfficialSubagentRuntime as unknown
  if (!constructible(runtime)) {
    throw new StartupIncompatibilityError('OfficialSubagentRuntime', 'OfficialSubagentRuntime must be constructible')
  }
  const line = subagentSurfaceOf(Reflect.get(runtime, 'prototype'))
  if (line === undefined) {
    throw new StartupIncompatibilityError(
      'OfficialSubagentRuntime',
      'OfficialSubagentRuntime must expose public startActivation() (0.2.1+) or start()/startContinuable()',
    )
  }
  return line
}

function assertRoutingSurface(ctx: Context): void {
  const modelSwitch = (ctx as ProfileContext).modelSwitch
  assertPublicMethod(modelSwitch, 'Model Switch runtime', 'currentSettings')
}

function routingSurface(ctx: Context): ModelSwitchSurface {
  return (ctx as ProfileContext).modelSwitch as ModelSwitchSurface
}

function assertMountedSurface(ctx: Context): void {
  const service = (ctx as ProfileContext).subagents
  assertPublicMethod(service, 'mounted Subagent runtime', 'resolveMaxDepth')
  if (subagentSurfaceOf(service) === undefined) {
    throw new StartupIncompatibilityError(
      'mounted Subagent runtime',
      'mounted Subagent runtime must expose public startActivation() (0.2.1+) or start()/startContinuable()',
    )
  }
}

function once(dispose: StartupDisposer): () => Promise<void> {
  let pending: Promise<void> | undefined
  return () => {
    pending ??= Promise.resolve().then(() => dispose()).then(() => undefined)
    return pending
  }
}

class CleanupLedger {
  private readonly attempts: (() => Promise<void>)[] = []

  add(dispose: StartupDisposer): void {
    this.attempts.push(once(dispose))
  }

  async disposeAll(): Promise<unknown[]> {
    const failures: unknown[] = []
    for (const dispose of [...this.attempts].reverse()) {
      try {
        await dispose()
      } catch (error) {
        failures.push(error)
      }
    }
    return failures
  }
}

function startupFailure(error: unknown, cleanupFailures: readonly unknown[]): never {
  if (cleanupFailures.length === 0) throw error
  throw new AggregateError([error, ...cleanupFailures], 'Subagent runtime startup and cleanup failed', { cause: error })
}

function cleanupDisposer(ledger: CleanupLedger): () => Promise<void> {
  return async () => {
    const failures = await ledger.disposeAll()
    if (failures.length > 0) throw new AggregateError(failures, 'Subagent runtime cleanup failed')
  }
}

/**
 * Mount a candidate and use the fallback only for typed startup incompatibility.
 *
 * Every resource registered by an attempt is disposed in reverse order before a
 * fallback starts and again when the mounted result is disposed. Cleanup keeps
 * running after failures, and a startup error stays first in any aggregate.
 *
 * @param candidate - startup callback for the routed candidate.
 * @param fallback - startup callback for the untouched official runtime.
 * @returns the selected value and an idempotent disposer.
 * @throws the candidate error unless it is a StartupIncompatibilityError.
 * @throws the fallback startup error when fallback startup fails.
 */
export async function mountWithStartupFallback<T>(
  candidate: (track: StartupCleanupTracker) => Promise<T>,
  fallback: (track: StartupCleanupTracker) => Promise<T>,
): Promise<MountedStartup<T>> {
  const ledger = new CleanupLedger()
  try {
    const value = await candidate(dispose => ledger.add(dispose))
    return { value, dispose: cleanupDisposer(ledger) }
  } catch (error) {
    const cleanupFailures = await ledger.disposeAll()
    if (!(error instanceof StartupIncompatibilityError)) startupFailure(error, cleanupFailures)
    if (cleanupFailures.length > 0) startupFailure(error, cleanupFailures)
  }

  try {
    const value = await fallback(dispose => ledger.add(dispose))
    return { value, dispose: cleanupDisposer(ledger) }
  } catch (error) {
    startupFailure(error, await ledger.disposeAll())
  }
}

/**
 * Operator-facing notice for a Host whose Subagent runtime cannot be routed.
 *
 * DSH 0.2.1 replaced `start()`/`startContinuable()` with the activation API, so
 * this adapter's override point is gone; the row then mounts the untouched
 * official runtime instead of guessing a new seam.
 * @param error - the typed startup incompatibility that rejected the candidate.
 * @returns The notice logged once at startup.
 */
export function routedRuntimeUnavailableNotice(error: StartupIncompatibilityError): string {
  return `model-switch: the routed Subagent runtime is unavailable on this DSH Host (${error.message}); delegation follows the official route instead`
}

/** Log one notice without letting a missing logger service fail the startup. */
function reportNotice(ctx: Context, message: string): void {
  try {
    ctx.logger.warn(message)
  } catch {
    // A Host that exposes no logger service must still boot.
  }
}

async function mountProfileRuntime(ctx: Context): Promise<() => Promise<void>> {
  const mounted = await mountWithStartupFallback(
    async track => {
      try {
        assertOfficialRuntimeSurface()
      } catch (error) {
        // DSH 0.2.1 replaced the start surface with the activation API. The row
        // stays mounted on the official runtime (fail-closed); the operator sees
        // exactly why the route override is not applied.
        if (error instanceof StartupIncompatibilityError) reportNotice(ctx, routedRuntimeUnavailableNotice(error))
        throw error
      }
      assertRoutingSurface(ctx)
      const candidate = ctx.plugin(ModelSwitchSubagentRuntime)
      track(() => candidate.dispose())
      await candidate
      const surface = ctx.inject(['subagents'], (surfaceCtx: Context) => { assertMountedSurface(surfaceCtx) })
      track(() => surface.dispose())
      await surface
      return candidate
    },
    async track => {
      const official = ctx.plugin(OfficialSubagentRuntime)
      track(() => official.dispose())
      await official
      return official
    },
  )
  return mounted.dispose
}

/** Profile replacement that selects the routed runtime or the untouched official runtime. */
export const profileSubagentRuntime = Object.assign(
  async (ctx: Context): Promise<() => Promise<void>> => mountProfileRuntime(ctx),
  { inject: ['modelSwitch'] },
)

/** Official runtime with only a pre-descriptor route-selection adapter. */
export class ModelSwitchSubagentRuntime extends OfficialSubagentRuntime {
  static inject = ['modelSwitch']

  private routed<T extends RoutableSubagentRequest>(name: string, request: T): T {
    const provider = this.ctx.subagents.getProvider(name)
    // External Product Workers are one-shot process adapters. They do not
    // accept DSH Agent options, so Model Switch must not reinterpret them as
    // Native continuable Subagents or inject a provider/model route.
    if (provider !== undefined && provider.capabilities.agentOptions !== true) return request
    const modelSwitch = routingSurface(this.ctx)
    return routeSubagentRequest(request, sessionSubagentRouteOf(this.ctx, request.parent.session, modelSwitch.currentSettings()))
  }

  override start(name: string, request: SubagentStartRequest): Promise<SubagentRun> {
    const base = publicMethod(OfficialSubagentRuntime.prototype, 'OfficialSubagentRuntime', 'start')
    return base.call(this, name, this.routed(name, request)) as Promise<SubagentRun>
  }

  override startContinuable(spec: ContinuableStartSpec): Promise<ContinuableStart> {
    const base = publicMethod(OfficialSubagentRuntime.prototype, 'OfficialSubagentRuntime', 'startContinuable')
    return base.call(this, { ...spec, request: this.routed(spec.provider, spec.request) }) as Promise<ContinuableStart>
  }

  /**
   * 0.2.1+ activation entry: delegation tools call this instead of
   * `start()`/`startContinuable()`, and its spec carries the same
   * `request.agentOptions` this adapter already rewrites. Every other spec
   * field (label, childId, signal, delivery) passes through untouched.
   *
   * @param spec - the activation spec published by the installed Host.
   * @returns The official activation result.
   */
  startActivation(spec: SubagentActivationSpecLike): Promise<unknown> {
    const base = publicMethod(OfficialSubagentRuntime.prototype, 'OfficialSubagentRuntime', 'startActivation')
    return base.call(this, { ...spec, request: this.routed(spec.provider, spec.request) }) as Promise<unknown>
  }
}

export default profileSubagentRuntime
