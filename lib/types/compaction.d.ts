import type { Context } from '@deepseek-ai/cordis';
import type { Entry, Loader } from '@deepseek-ai/cordis-plugin-loader';
import type { BasicCompactionConfig } from '@deepseek-ai/dsh-compaction-basic';
/** Cordis plugin identity; matches the cordis.patch.yml insert row id. */
export declare const name = "model-switch-compaction";
/** The loader is awaited at row activation; settings and the official row are still read structurally so stock compaction survives a disabled Model Switch row. */
export declare const inject: string[];
/**
 * Both identifiers trimmed and non-empty; undefined means "official default".
 *
 * The summarization route stays deployment-wide on purpose. The official
 * compaction transaction durably records the provider/model that wrote the
 * summary, so a per-session rewrite of the summarization call would make that
 * record false; a deployment that needs provider-scoped summarization uses the
 * official exact-target `modelPolicies` table, which this row forwards
 * verbatim from the profile's `compaction-basic` row config.
 */
export interface CompactionRoute {
    readonly provider: string;
    readonly model: string;
}
/**
 * Resolve the configurable summarization route from live settings.
 * @param settings - Model Switch settings carrying the optional compaction pair.
 * @returns Both identifiers trimmed and non-empty, or undefined (official default).
 */
export declare function compactionRouteOf(settings: {
    readonly compactProvider?: string;
    readonly compactModel?: string;
} | undefined): CompactionRoute | undefined;
/**
 * Merge the resolved route over the official row's own config.
 * @param forwarded - config the official compaction-basic row was configured with.
 * @param route - resolved summarization route; undefined keeps official behavior.
 * @returns A detached config safe to hand to a fresh engine construction.
 */
export declare function composeCompactionConfig(forwarded: BasicCompactionConfig, route: CompactionRoute | undefined): BasicCompactionConfig;
/**
 * Locate the official compaction row in the loader tree.
 * Disabled entries stay in the tree, so a name-matched disable still matches.
 * @param loader - the host loader, when one is reachable.
 * @returns The official entry, or undefined when this profile has no such row.
 */
export declare function officialCompactionEntry(loader: Loader | undefined): Entry | undefined;
/**
 * Copy the official row's stored config, ignoring non-object payloads.
 * @param entry - the official compaction entry.
 * @returns A plain object spread; missing or invalid configs become `{}`.
 */
export declare function forwardedConfig(entry: Entry): BasicCompactionConfig;
/**
 * Whether the compaction capability is actually served from this context.
 *
 * Awaiting a plugin fiber settles even when the plugin's injections were never
 * satisfied, so the mount is confirmed through the public service instead of by
 * the absence of an error: an unactivated engine must never be recorded as the
 * live engine, or the row would stop retrying while `/compact` had no service.
 * @param ctx - this row's context.
 * @returns true when `ctx.compaction` exposes the engine's public entry points.
 */
export declare function engineActive(ctx: Context): boolean;
/**
 * Mount the Model Switch compaction engine for this profile.
 *
 * Installs a sibling row that replaces the official compaction-basic engine
 * with the same package under the configurable summarization route. Host
 * settings and the loader are read structurally so a disabled `model-switch`
 * row leaves official compaction untouched. Reconciles run on
 * `model-switch/settings-update` (emitted by the host at construction, on
 * volatile commits, and on ordinary saves) and read the settled settings, so one
 * save costs at most one remount; the listener is global so instances of this
 * row inside agent-preset realms still hear the host row's emission. The initial
 * reconcile is awaited so `/compact` resolves the service as soon as this row
 * completes.
 * @param ctx - this row's context.
 */
export declare function apply(ctx: Context): Promise<void>;
