import { Context } from '@deepseek-ai/cordis';
import OfficialSubagentRuntime, { type ContinuableStart, type ContinuableStartSpec, type SubagentRun, type SubagentStartRequest } from '@deepseek-ai/dsh-subagent';
import { type SubagentRoute } from './session-route.js';
/** Raised only when an explicit startup check finds an unsupported public surface. */
export declare class StartupIncompatibilityError extends Error {
    readonly name = "StartupIncompatibilityError";
    readonly surface: string;
    /**
     * @param surfaceOrMessage - the incompatible public surface, or the error message.
     * @param message - the missing or incompatible requirement.
     */
    constructor(surfaceOrMessage: string, message?: string);
}
/** One idempotent cleanup operation tracked during runtime startup. */
export type StartupDisposer = () => void | PromiseLike<void>;
/** Register one cleanup operation for a startup attempt. */
export type StartupCleanupTracker = (dispose: StartupDisposer) => void;
/** A successfully mounted runtime and its idempotent cleanup operation. */
export interface MountedStartup<T> {
    readonly value: T;
    readonly dispose: () => Promise<void>;
}
type RoutableSubagentRequest = Pick<SubagentStartRequest, 'parent' | 'agentOptions'>;
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
export declare function routeSubagentRequest<T extends RoutableSubagentRequest>(request: T, route: SubagentRoute | undefined): T;
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
export declare function mountWithStartupFallback<T>(candidate: (track: StartupCleanupTracker) => Promise<T>, fallback: (track: StartupCleanupTracker) => Promise<T>): Promise<MountedStartup<T>>;
/**
 * Operator-facing notice for a Host whose Subagent runtime cannot be routed.
 *
 * DSH 0.2.1 replaced `start()`/`startContinuable()` with the activation API, so
 * this adapter's override point is gone; the row then mounts the untouched
 * official runtime instead of guessing a new seam.
 * @param error - the typed startup incompatibility that rejected the candidate.
 * @returns The notice logged once at startup.
 */
export declare function routedRuntimeUnavailableNotice(error: StartupIncompatibilityError): string;
/** Profile replacement that selects the routed runtime or the untouched official runtime. */
export declare const profileSubagentRuntime: ((ctx: Context) => Promise<() => Promise<void>>) & {
    inject: string[];
};
/** Official runtime with only a pre-descriptor route-selection adapter. */
export declare class ModelSwitchSubagentRuntime extends OfficialSubagentRuntime {
    static inject: string[];
    private routed;
    start(name: string, request: SubagentStartRequest): Promise<SubagentRun>;
    startContinuable(spec: ContinuableStartSpec): Promise<ContinuableStart>;
}
export default profileSubagentRuntime;
