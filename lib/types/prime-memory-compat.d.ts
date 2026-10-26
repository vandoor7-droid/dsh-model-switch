/**
 * Adapt `dsh-prime-memory`'s distillation route to this plugin's route.
 *
 * The memory plugin resolves its distillation route as
 * `config.llm.provider/model` → its own runtime chain → the deployment default
 * model. Model Switch owns the deployment's per-provider routes, so this adapter
 * fills the FIRST tier with the route this plugin resolved — but only while that
 * row is still following its own default:
 *
 * - a deliberate `provider`/`model` in the row's config is never overwritten
 *   (`user-set`), and neither is a route this adapter wrote earlier unless it
 *   matches what it wrote (`adopted`);
 * - an empty Model Switch route means "leave it alone" (`no-route`);
 * - nothing is persisted: the row's live config object is patched in memory, so
 *   the memory plugin's own settings page keeps showing "follow the default
 *   model" and a restart simply re-applies this adapter.
 *
 * The route itself is provider-group based: the group of the deployment default
 * provider (read from the `agent-default-model` row), falling back to the flat
 * memory pair.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Entry } from '@deepseek-ai/cordis-plugin-loader';
import { type CapabilityRoute } from './session-route.js';
/** Why the adapter stayed out of the way. */
export type PrimeMemoryRouteSkip = 'user-set' | 'no-route';
/** Row name and dependencies, mirroring the sibling adapter row. */
export declare const name = "model-switch-prime-memory-compat";
export declare const inject: string[];
/** Live adapter state, surfaced next to the settings card. */
export interface PrimeMemoryCompatStatus {
    /** Whether at least one memory row was seen and adapted. */
    installed: boolean;
    /** The `provider/model` written on the last pass. */
    route?: string | undefined;
    /** Why the route was not written, when it was not. */
    routeSkipped?: PrimeMemoryRouteSkip | undefined;
}
/** The state the settings page reads. */
export declare const primeMemoryCompatStatus: PrimeMemoryCompatStatus;
/** One row's config, read/written structurally so a bad shape never throws. */
type UnknownConfig = Record<string, unknown>;
/** The route one plan installs, or why it installs nothing. */
export interface PrimeMemoryPlan {
    /** The config to install (unchanged when `changed` is false). */
    readonly config: UnknownConfig;
    /** Whether the config differs from the input. */
    readonly changed: boolean;
    /** The `provider/model` written on this pass. */
    readonly route?: string | undefined;
    /** Why nothing was written. */
    readonly skipped?: PrimeMemoryRouteSkip | undefined;
}
/**
 * Decide the config one memory row should run with.
 *
 * Pure and side-effect free so the policy is unit-testable.
 * @param config - the row's current config (any JSON-ish value).
 * @param route - this plugin's distillation route; an incomplete pair counts as unset.
 * @param adoptedRoute - a `provider/model` this adapter wrote on an earlier pass.
 * @returns The config to install, whether it changed, and what was applied.
 */
export declare function planPrimeMemoryRoute(config: unknown, route: CapabilityRoute | undefined, adoptedRoute?: string): PrimeMemoryPlan;
/** What the adapter needs from the loader. */
interface Loader {
    entries?(): Iterable<Entry>;
}
/**
 * Install the adapter for the whole profile.
 *
 * Adapts on activation, on every `loader/patch-context`, and again whenever this
 * plugin's settings change, so a saved route reaches a row that is already live.
 * @param ctx - this row's context.
 * @param loader - the loader service, when present.
 * @param routeOf - resolves this plugin's distillation route for one settings snapshot.
 * @returns The disposer and a replay hook.
 */
export declare function installPrimeMemoryCompat(ctx: Context, loader: Loader | undefined, routeOf: () => CapabilityRoute | undefined): {
    dispose: () => void;
    replay: () => boolean;
};
/**
 * Row entry point: adapt the memory plugin on activation and on remount.
 * @param ctx - this row's context.
 */
export declare function apply(ctx: Context): void;
export {};
