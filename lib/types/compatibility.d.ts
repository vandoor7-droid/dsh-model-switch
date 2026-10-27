interface CompatibilityLogger {
    warn(message: string): void;
}
/**
 * Order two DSH versions with prerelease semantics (`rc.2 < rc.3 < release`).
 * @param left - first version.
 * @param right - second version.
 * @returns -1/0/1, or undefined when either side is unparsable.
 */
export declare function compareDshVersions(left: string, right: string): number | undefined;
/**
 * Read the floor out of a declared runtime range.
 *
 * Only the open-ended `>=x.y.z` form is understood: the declaration promises
 * "this release and everything after it", so a bounded range is a different
 * statement and is ignored rather than half-honoured.
 *
 * @param range - the declared range text.
 * @returns the floor version, or undefined when absent/misunderstood.
 */
export declare function runtimeFloorOf(range: unknown): string | undefined;
export type DshRuntimeClassification = {
    kind: 'verified';
} | {
    kind: 'unverified';
} | {
    kind: 'blocked';
    reason: string;
};
/**
 * Classify one runtime without treating the verified table as an allowlist.
 *
 * Precedence: a blocked version wins over everything; a version named in the
 * evidence table is verified; otherwise a declared `dshRuntime` floor marks every
 * runtime at or above it verified. Anything else stays unverified, and the mount
 * path remains fail-open for it.
 *
 * @param version - Resolved DSH runtime version.
 * @param verified - Releases with direct compatibility evidence.
 * @param blocklist - Versions excluded after reproduced failures.
 * @param runtimeRange - Declared open-ended floor (`>=x.y.z`).
 * @returns The fail-open mount decision.
 */
export declare function classifyDshRuntime(version: string, verified: ReadonlySet<string>, blocklist?: Readonly<Record<string, unknown>>, runtimeRange?: unknown): DshRuntimeClassification;
/**
 * Apply the fail-open decision and emit at most one visible warning.
 * @param logger - Host logger receiving compatibility warnings.
 * @param pluginName - Plugin identifier used in diagnostics.
 * @param version - Resolved DSH runtime version.
 * @param verified - Releases with direct compatibility evidence.
 * @param blocklist - Versions excluded after reproduced failures.
 * @param runtimeRange - Declared open-ended floor (`>=x.y.z`).
 * @returns Whether the host mount should continue.
 */
export declare function shouldMountDshRuntime(logger: CompatibilityLogger, pluginName: string, version: string, verified: ReadonlySet<string>, blocklist?: Readonly<Record<string, unknown>>, runtimeRange?: unknown): boolean;
/**
 * Warn once for an unknown runtime while keeping the normal host mount path.
 * @param logger - Host logger receiving compatibility warnings.
 * @param pluginName - Plugin identifier used in diagnostics.
 * @param candidates - DSH peer packages used to resolve the host version.
 * @returns Whether the host mount should continue.
 */
export declare function allowDshRuntime(logger: CompatibilityLogger, pluginName: string, candidates: readonly string[]): boolean;
export {};
