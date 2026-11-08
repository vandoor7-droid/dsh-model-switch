import { type Context } from '@deepseek-ai/cordis';
import type { SubagentStartRequest } from '@deepseek-ai/dsh-subagent';
import { type SubagentRoute } from './session-route.js';
export { ModelSwitchSubagentRuntime, StartupIncompatibilityError, mountWithStartupFallback, routedRuntimeUnavailableNotice, subagentRuntimeInject, subagentSurfaceOf, } from './subagent-runtime-legacy.js';
export type { MountedStartup, StartupCleanupTracker, StartupDisposer, SubagentSurfaceLine, } from './subagent-runtime-legacy.js';
type RoutableSubagentRequest = Pick<SubagentStartRequest, 'parent' | 'agentOptions'>;
interface SubagentProviderSurface {
    readonly capabilities?: {
        readonly agentOptions?: boolean;
    };
}
interface SubagentRuntimeSurface {
    getProvider?(name: string): SubagentProviderSurface | undefined;
    readonly startActivation?: unknown;
    readonly start?: unknown;
    readonly startContinuable?: unknown;
}
/** The public 0.2.1+ activation shape used by tools and Agent Teams. */
export interface SubagentActivationSpecLike {
    readonly provider: string;
    readonly request: RoutableSubagentRequest & Record<string, unknown>;
    readonly [field: string]: unknown;
}
/** Structural form of the pre-0.2.1 continuation start API. */
export interface ContinuableStartSpecLike {
    readonly provider: string;
    readonly request: RoutableSubagentRequest & Record<string, unknown>;
    readonly [field: string]: unknown;
}
/**
 * Inject a parent-session route only when the caller named no provider, model,
 * or reasoning effort. All other request and Agent options pass through.
 */
export declare function routeSubagentRequest<T extends RoutableSubagentRequest>(request: T, route: SubagentRoute | undefined): T;
/** Resolve the current public route surface, never retaining a disposed service. */
export declare function routedSubagentRequest<T extends RoutableSubagentRequest>(ctx: Context, runtime: SubagentRuntimeSurface, providerName: string, request: T): T;
/**
 * Wrap the official service's start entries only. Its identity, prototype,
 * registry, manager, Typert binding and prompt/interrupt methods are untouched.
 * Disposers are idempotent and safe when overlapping adapter fibers unload in
 * either order. Unsupported or sealed surfaces leave the official route usable.
 */
export declare function installSubagentRouteWrappers(ctx: Context): () => void;
/**
 * Wait for the official service without replacing it or copying its dependency
 * list. Model Switch is read optionally per call, so its absence cannot hold a
 * startup fiber or retain a stale settings service. Cordis rebinds this effect
 * when the official service is recreated.
 */
export declare function profileSubagentRuntime(ctx: Context): void;
export default profileSubagentRuntime;
