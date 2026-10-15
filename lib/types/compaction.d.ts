import type { Context } from '@deepseek-ai/cordis';
import type { Entry, Loader } from '@deepseek-ai/cordis-plugin-loader';
import type { BasicCompactionConfig } from '@deepseek-ai/dsh-compaction-basic';
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
/** Cordis plugin identity; matches the cordis.patch.yml insert row id. */
export declare const name = "model-switch-compaction";
/** The loader is awaited at row activation; settings and the official row are still read structurally so stock compaction survives a disabled Model Switch row. */
export declare const inject: string[];
/**
 * Both identifiers trimmed and non-empty; undefined means "official default".
 *
 * Each summarization call derives its route per session (the session's provider
 * group → the flat compaction card → the official row's `modelPolicies` /
 * conversation-target fallback) and mutates `options.provider`/`options.model`
 * in place before `ctx.llm.stream(options)` so the official `summarizeWithLlm`
 * returns and durably records the exact route that wrote the summary in
 * `compaction/summary`.
 */
export interface CompactionRoute {
    readonly provider: string;
    readonly model: string;
}
/** Public llm face the official compaction engine uses (`stream` + `resolveModelInfo`). */
export interface CompactionLlm {
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
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
 * Resolve the compaction summarization route for one session id.
 *
 * Looks up the session from `ctx.sessions` when available, derives its current
 * provider (`pending` selection preferred over `lastUsed`, then logged routes),
 * and resolves the provider group's compaction pair before falling back to the
 * deployment-wide compaction pair.
 * @param ctx - this row's context.
 * @param sessionId - the session id carried on `GenerateOptions.sessionId`.
 * @returns The derived compaction route, or undefined for the engine's own route.
 */
export declare function resolveSessionCompactionRoute(ctx: Context, sessionId: string | undefined): CompactionRoute | undefined;
/**
 * Wrap the real llm service so `purpose === 'compaction'` calls resolve their
 * summarization route per session while keeping `compaction/summary` truthful.
 *
 * `summarizeWithLlm` builds a mutable `options` literal with `purpose: 'compaction'`
 * and `sessionId: agent.session.id`, calls `ctx.llm.stream(options)`, and then
 * returns `{ provider: options.provider, model: options.model }` to `commitCompactionBody`.
 * Mutating `options.provider` and `options.model` in place before delegating to
 * `target.stream(options)` ensures the durable `compaction/summary` event
 * records the exact provider/model that wrote the summary. All other members
 * (such as `resolveModelInfo`) pass through bound to `real`.
 * @param real - the host's `ctx.llm`.
 * @param resolve - per-session route resolver; undefined keeps `options` untouched.
 * @param onError - optional error sink when the resolver throws.
 * @returns A transparent Proxy over `real`.
 */
export declare function compactionLlm<T extends CompactionLlm>(real: T, resolve: (sessionId: string) => CompactionRoute | undefined, onError?: (cause: unknown) => void): T;
/**
 * Build the child context the compaction engine mounts under.
 *
 * When `ctx.llm` is present, shadows it with {@link compactionLlm} on an
 * extended context so the child engine fiber resolves the per-session wrapper
 * while registering `ctx.compaction` on the shared context tree.
 * @param ctx - this row's context.
 * @returns A context shadowing `llm` when available, else `ctx`.
 */
export declare function compactionScope(ctx: Context): Context;
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
