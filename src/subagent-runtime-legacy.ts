import OfficialSubagentRuntime, {
  type ContinuableStart,
  type ContinuableStartSpec,
  type SubagentRun,
  type SubagentStartRequest,
} from '@deepseek-ai/dsh-subagent'
import { routeSubagentRequest, type SubagentActivationSpecLike } from './subagent-runtime.js'
import { sessionSubagentRouteOf } from './session-route.js'

/** Previously published startup error; retained for consumers of this module. */
export class StartupIncompatibilityError extends Error {
  override readonly name = 'StartupIncompatibilityError'
  readonly surface: string
  constructor(surfaceOrMessage: string, message?: string) {
    super(message ?? surfaceOrMessage)
    this.surface = message === undefined ? 'startup' : surfaceOrMessage
  }
}

export type StartupDisposer = () => void | PromiseLike<void>
export type StartupCleanupTracker = (dispose: StartupDisposer) => void
export interface MountedStartup<T> {
  readonly value: T
  readonly dispose: () => Promise<void>
}
export type SubagentSurfaceLine = 'activation' | 'start'

/** Classify the two published start API generations without version guessing. */
export function subagentSurfaceOf(value: unknown): SubagentSurfaceLine | undefined {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return undefined
  if (typeof Reflect.get(value, 'startActivation') === 'function') return 'activation'
  return typeof Reflect.get(value, 'start') === 'function' && typeof Reflect.get(value, 'startContinuable') === 'function' ? 'start' : undefined
}

function once(dispose: StartupDisposer): () => Promise<void> {
  let pending: Promise<void> | undefined
  return () => {
    pending ??= Promise.resolve().then(() => dispose()).then(() => undefined)
    return pending
  }
}

class CleanupLedger {
  private readonly attempts: Array<() => Promise<void>> = []
  add(dispose: StartupDisposer): void { this.attempts.push(once(dispose)) }
  async disposeAll(): Promise<unknown[]> {
    const failures: unknown[] = []
    for (const dispose of [...this.attempts].reverse()) {
      try { await dispose() } catch (error) { failures.push(error) }
    }
    return failures
  }
}

function startupFailure(error: unknown, failures: readonly unknown[]): never {
  if (failures.length === 0) throw error
  throw new AggregateError([error, ...failures], 'Subagent runtime startup and cleanup failed', { cause: error })
}

function cleanupDisposer(ledger: CleanupLedger): () => Promise<void> {
  return async () => {
    const failures = await ledger.disposeAll()
    if (failures.length > 0) throw new AggregateError(failures, 'Subagent runtime cleanup failed')
  }
}

/** Retain the typed-only startup fallback and reverse, idempotent cleanup contract. */
export async function mountWithStartupFallback<T>(
  candidate: (track: StartupCleanupTracker) => Promise<T>,
  fallback: (track: StartupCleanupTracker) => Promise<T>,
): Promise<MountedStartup<T>> {
  const ledger = new CleanupLedger()
  try {
    return { value: await candidate(dispose => ledger.add(dispose)), dispose: cleanupDisposer(ledger) }
  } catch (error) {
    const failures = await ledger.disposeAll()
    if (!(error instanceof StartupIncompatibilityError) || failures.length > 0) startupFailure(error, failures)
  }
  try {
    return { value: await fallback(dispose => ledger.add(dispose)), dispose: cleanupDisposer(ledger) }
  } catch (error) {
    startupFailure(error, await ledger.disposeAll())
  }
}

export function routedRuntimeUnavailableNotice(error: StartupIncompatibilityError): string {
  return `model-switch: the routed Subagent runtime is unavailable on this DSH Host (${error.message}); delegation follows the official route instead`
}

/** @deprecated Only the legacy subclass needs a mirrored dependency list. */
export function subagentRuntimeInject(officialInject: readonly string[] | undefined): string[] {
  return [...new Set([...(officialInject ?? []), 'modelSwitch'])]
}

function publicMethod(method: string): (this: unknown, ...args: unknown[]) => unknown {
  const value = Reflect.get(OfficialSubagentRuntime.prototype, method) as unknown
  if (typeof value !== 'function') throw new StartupIncompatibilityError('OfficialSubagentRuntime', `OfficialSubagentRuntime must expose public ${method}()`)
  return value as (this: unknown, ...args: unknown[]) => unknown
}

/**
 * @deprecated Kept importable for existing consumers, not mounted by the bundle.
 * Install profileSubagentRuntime around the official service instead: the
 * official Loader row must remain enabled to own its strict Typert definitions.
 */
export class ModelSwitchSubagentRuntime extends OfficialSubagentRuntime {
  static inject = subagentRuntimeInject((OfficialSubagentRuntime as unknown as { inject?: readonly string[] }).inject)

  private routed<T extends Pick<SubagentStartRequest, 'parent' | 'agentOptions'>>(name: string, request: T): T {
    const provider = this.ctx.subagents.getProvider(name)
    if (provider !== undefined && provider.capabilities.agentOptions !== true) return request
    return routeSubagentRequest(request, sessionSubagentRouteOf(this.ctx, request.parent.session, this.ctx.modelSwitch.currentSettings()))
  }

  override start(name: string, request: SubagentStartRequest): Promise<SubagentRun> {
    return Reflect.apply(publicMethod('start'), this, [name, this.routed(name, request)]) as Promise<SubagentRun>
  }
  override startContinuable(spec: ContinuableStartSpec): Promise<ContinuableStart> {
    return Reflect.apply(publicMethod('startContinuable'), this, [{ ...spec, request: this.routed(spec.provider, spec.request) }]) as Promise<ContinuableStart>
  }
  startActivation(spec: SubagentActivationSpecLike): Promise<unknown> {
    const request = spec.request ?? spec
    return Reflect.apply(publicMethod('startActivation'), this, [{ ...spec, request: this.routed(spec.provider, request) }]) as Promise<unknown>
  }
}
