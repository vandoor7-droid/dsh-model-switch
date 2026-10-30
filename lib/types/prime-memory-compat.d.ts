/**
 * Adapt `dsh-prime-memory`'s distillation route to this plugin's route.
 *
 * The memory plugin resolves its distillation route from its own runtime
 * settings section (`live.distillChain`, legacy `live.distillProvider/Model`,
 * else the deployment default model), and it WRITES that section through the
 * host's settings-forms service:
 *
 *   await forms.update('dsh-memory', { live: next })
 *
 * Its row config is read once at plugin init, so patching
 * `entry.options.config.llm.*` afterwards has no effect (verified on 0.2.1-rc.3:
 * the model kept being the deployment default). This adapter therefore writes
 * the same section the plugin itself writes, and only that key:
 *
 * - a chain that is already set and is not the one this adapter wrote counts as
 *   user intent and is left alone (`user-set`);
 * - an empty Model Switch route means "leave it alone" (`no-route`);
 * - nothing is persisted by us beyond that section, and no other `live` key
 *   (capture, trace, embedding, memory mutation) is touched.
 *
 * The route itself is provider-group based: the group of the deployment default
 * provider (read from the `agent-default-model` row), falling back to the flat
 * memory pair.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Entry } from '@deepseek-ai/cordis-plugin-loader';
import { type CapabilityRoute } from './session-route.js';
import { type DistillChainEntry } from './prime-memory-route.js';
/** Row name and dependencies, mirroring the sibling adapter row. */
export declare const name = "model-switch-prime-memory-compat";
export declare const inject: string[];
/** Why the adapter stayed out of the way. */
export type PrimeMemoryRouteSkip = 'user-set' | 'no-route';
/** Live adapter state, surfaced next to the settings card. */
export interface PrimeMemoryCompatStatus {
    /** Whether at least one write reached the memory plugin's settings. */
    installed: boolean;
    /** The `provider/model` written on the last pass. */
    route?: string | undefined;
    /** Why the route was not written, when it was not. */
    routeSkipped?: PrimeMemoryRouteSkip | undefined;
}
/** The state the settings page reads. */
export declare const primeMemoryCompatStatus: PrimeMemoryCompatStatus;
/**
 * Write the memory row's static route into the profile patch itself.
 *
 * `settings.update` only accepts the entry's *live* schema fields, so the static
 * `llm` pin never survives that call. The pin is what `resolveModelRoute` returns
 * first, and it is the only key every distillation layer honours — so it has to be
 * written where the next start reads it: the row config in the profile document.
 * @param documentPath - the profile patch file.
 * @param provider - route provider to pin.
 * @param model - route model to pin.
 * @returns whether the document changed.
 */
/**
 * Remove this plugin's own static pin from the memory row.
 *
 * `effectiveCfg` (dsh-prime-memory `pipeline/runner.js`) treats a non-empty
 * `cfg.llm.provider + cfg.llm.model` pair as "pinned" and then ignores *both* the runtime
 * chain and the legacy `distillProvider`/`distillModel` pair. A pin written earlier — for a
 * host whose live RPC was not ready yet — is therefore not harmless: it keeps winning over
 * every later live push, which is exactly the "the card changed, the calls did not" report.
 * Once a live push is confirmed, the pin has to go.
 *
 * @param documentPath - the profile patch document that holds the memory row.
 * @returns what happened, so the caller can log it without guessing.
 */
export declare function clearStaticPin(documentPath: string): Promise<'cleared' | 'absent' | 'missing'>;
export declare function writeStaticPin(documentPath: string, provider: string, model: string): Promise<'written' | 'unchanged' | 'missing'>;
/**
 * The distillation chain a settings section currently carries.
 *
 * Accepts the chain form and the legacy provider/model pair, so a user who set
 * the old two fields is still recognised as user intent.
 * @param section - the `live` section (or a whole settings view) to read.
 * @returns The chain entries; empty when nothing is set.
 */
export declare function chainOf(section: unknown): readonly DistillChainEntry[];
/** What one memory row's config decides, kept pure for the unit tests. */
export interface PrimeMemoryPlan {
    /** The config to install (unchanged when `changed` is false). */
    readonly config: Record<string, unknown>;
    /** Whether the config differs from the input. */
    readonly changed: boolean;
    /** The `provider/model` written on this pass. */
    readonly route?: string | undefined;
    /** Why nothing was written. */
    readonly skipped?: PrimeMemoryRouteSkip | undefined;
}
/**
 * Decide the route config one memory row would run with from its config alone.
 *
 * Kept for the settings-free path (a profile that pins `config.llm.*`): the
 * runtime path writes the settings section instead, because the plugin reads its
 * config only at init.
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
 * Whether the memory row's live section already carries exactly our route.
 *
 * The RPC write path persists the live section to the profile document on every
 * call, and a document change reloads the composition — so pushing an unchanged
 * route re-triggers this adapter forever (a ~6 s recompose loop, observed with
 * `dsh-prime-memory@0.26.10`). Comparing first is what makes the push idempotent
 * across reloads.
 *
 * @param value - the memory row's live settings object, as the forms describe it.
 * @param provider - route provider to compare against.
 * @param model - route model to compare against.
 * @returns true when a push would change nothing.
 */
export declare function memoryLiveMatchesRoute(value: unknown, provider: string, model: string): boolean;
/**
 * Hand the route to the memory plugin through the RPC it registers for its own
 * settings page.
 *
 * Writing the config document (what `settings.update` does) only changes what the
 * next start reads; the plugin resolves its route from the runtime settings object
 * it built at `apply`. This endpoint is the documented runtime write path — the
 * same one its own "distillation parameters" panel posts to — so it takes effect
 * without a restart, which is exactly what a provider switch needs.
 */
export declare function pushMemoryRoute(ctx: Context, route: {
    provider: string;
    model: string;
}): Promise<'pushed' | 'absent' | 'rejected'>;
/**
 * Install the adapter for the whole profile.
 *
 * Writes the memory plugin's own `live` section on activation, on every
 * `loader/patch-context`, on `loader/entry-init`, once more after a short delay
 * (a bundle-inserted row is often composed after this one), and again whenever
 * this plugin's settings change.
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
