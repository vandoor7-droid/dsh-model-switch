import OfficialSubagentRuntime, { type ContinuableStart, type ContinuableStartSpec, type SubagentRun, type SubagentStartRequest } from '@deepseek-ai/dsh-subagent';
import { type SubagentActivationSpecLike } from './subagent-runtime.js';
/** Previously published startup error; retained for consumers of this module. */
export declare class StartupIncompatibilityError extends Error {
    readonly name = "StartupIncompatibilityError";
    readonly surface: string;
    constructor(surfaceOrMessage: string, message?: string);
}
export type StartupDisposer = () => void | PromiseLike<void>;
export type StartupCleanupTracker = (dispose: StartupDisposer) => void;
export interface MountedStartup<T> {
    readonly value: T;
    readonly dispose: () => Promise<void>;
}
export type SubagentSurfaceLine = 'activation' | 'start';
/** Classify the two published start API generations without version guessing. */
export declare function subagentSurfaceOf(value: unknown): SubagentSurfaceLine | undefined;
/** Retain the typed-only startup fallback and reverse, idempotent cleanup contract. */
export declare function mountWithStartupFallback<T>(candidate: (track: StartupCleanupTracker) => Promise<T>, fallback: (track: StartupCleanupTracker) => Promise<T>): Promise<MountedStartup<T>>;
export declare function routedRuntimeUnavailableNotice(error: StartupIncompatibilityError): string;
/** @deprecated Only the legacy subclass needs a mirrored dependency list. */
export declare function subagentRuntimeInject(officialInject: readonly string[] | undefined): string[];
/**
 * @deprecated Kept importable for existing consumers, not mounted by the bundle.
 * Install profileSubagentRuntime around the official service instead: the
 * official Loader row must remain enabled to own its strict Typert definitions.
 */
export declare class ModelSwitchSubagentRuntime extends OfficialSubagentRuntime {
    static inject: string[];
    private routed;
    start(name: string, request: SubagentStartRequest): Promise<SubagentRun>;
    startContinuable(spec: ContinuableStartSpec): Promise<ContinuableStart>;
    startActivation(spec: SubagentActivationSpecLike): Promise<unknown>;
}
