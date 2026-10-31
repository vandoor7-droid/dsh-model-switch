/**
 * Adapt the third-party `@log.li/dsh-automode` row to this plugin's routes.
 *
 * ## Why this exists
 *
 * `dsh-automode` owns a completely different decision pipeline: its own
 * `auto-mode` permission preset, a `tools/pre-execute` gate, and a two-stage
 * classifier that calls `ctx.llm.stream()` with
 * `classifier.provider` / `classifier.model` (`resolveRoute`, falling back to
 * the session header when both are empty). It reads the pure-read allowance from
 * `config.readOnlyTools` with an exact `includes()` match
 * (`src/pre-execute.ts`), so a call that hits it is allowed before the
 * classifier runs — still after the plugin's own hard-deny regex band.
 *
 * Both knobs live in that row's own config. There is no public seam to inject a
 * route or a tool list from outside, and the user asked for the adaptation to
 * happen inside the plugin layer: no profile editing, no second plugin. This
 * module is that adapter. It rewrites the automode row's **runtime** option
 * object right before the loader mounts it and on every remount:
 *
 * - `classifier.provider` / `classifier.model` are filled from this plugin's
 *   Auto-review route **only when the row leaves them empty**; an explicit route
 *   in the profile always wins.
 * - `readOnlyTools` is the union of the row's own list and this plugin's
 *   allowlist — but only while the "skip pure-read tools" switch is on. Entries
 *   that carry a `*` cannot transfer (the third-party check is exact-match) and
 *   are reported instead of silently dropped.
 *
 * Nothing is persisted: `entry.options` is the loader's live options object, and
 * `Entry.update()` (which writes the profile layer) is deliberately never called
 * here. Restarting the Host re-applies the same in-memory view.
 *
 * Every failure is contained. If the row shape or the loader internals change,
 * this adapter logs one warning and the rest of the plugin keeps working.
 *
 * @module
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Loader } from '@deepseek-ai/cordis-plugin-loader';
import type { ModelSwitchSettings } from './host-settings.js';
/** Cordis plugin identity; matches the `cordis.patch.yml` insert row id. */
export declare const name = "model-switch-automode-compat";
/** The loader is the only seam this row needs besides this plugin's settings. */
export declare const inject: string[];
/** Third-party package this row adapts (strict package identity, never a prefix). */
export declare const AUTOMODE_PACKAGE = "@log.li/dsh-automode";
/**
 * Why the route was not injected.
 *
 * - `user-set`: the row already names a provider and a model.
 * - `no-route`: this plugin has no Auto-review route configured right now.
 */
export type AutomodeRouteSkip = 'user-set' | 'no-route';
/** Result of adapting one row's config object. */
export interface AutomodeCompatApplied {
    /** `provider/model` written into the row, when it was empty before. */
    readonly route?: string | undefined;
    /** Set when the route was left alone. */
    readonly routeSkipped?: AutomodeRouteSkip | undefined;
    /** Allowlist entries merged into `readOnlyTools`. */
    readonly added: readonly string[];
    /** Allowlist entries that cannot transfer because they are pattern-shaped. */
    readonly skipped: readonly string[];
}
/** One adaptation result: the config to install plus what changed. */
export interface AutomodeCompatPlan {
    /** The config object to assign to the row. */
    readonly config: Record<string, unknown>;
    /** Whether `config` differs from the input (false means "leave it alone"). */
    readonly changed: boolean;
    /** What was applied, for the status line and the log. */
    readonly applied: AutomodeCompatApplied;
}
/** Live adapter state, surfaced next to the allowlist editor. */
export declare const automodeCompatStatus: {
    /** A `@log.li/dsh-automode` row exists in this Host. */
    installed: boolean;
    /** `provider/model` this adapter wrote, when it wrote one. */
    route: string | undefined;
    /** Why the route was skipped, when it was. */
    routeSkipped: AutomodeRouteSkip | undefined;
    /** Tools merged into the row's `readOnlyTools`. */
    added: string[];
    /** Pattern-shaped entries that cannot transfer. */
    skipped: string[];
    /** How many rows were rewritten (remounts included). */
    applied: number;
    /** Last hot-reload outcome, once a changed route was pushed into the live row. */
    hot: "applied" | "restart-required" | undefined;
    /** Why the last hot reload did not take, when it did not. */
    hotReason: string | undefined;
    /**
     * Whether the Host's `permission` row still carries the `auto-mode` preset the
     * third-party bundle patch inserts. A profile patch that restates
     * `permission.presets` replaces that whole config key, so the row keeps working
     * while the preset silently disappears from the permission picker.
     */
    preset: AutomodePresetState | undefined;
};
/** Where the `auto-mode` permission preset stands in the composed config. */
export type AutomodePresetState = 'present' | 'missing' | 'unknown';
/**
 * Read the composed `permission` row and look for the `auto-mode` preset.
 *
 * @param loader - the Host loader, when this row can read it.
 * @returns `missing` only when the row's `presets` map is readable and lacks the
 * key; anything this adapter cannot read stays `unknown` instead of guessing.
 */
export declare function permissionPresetState(loader: Loader | undefined): AutomodePresetState;
/**
 * Whether one loader entry is the third-party auto-mode row.
 * @param entry - anything the loader hands over (an entry, or an event payload).
 * @returns true only for the exact package name.
 */
export declare function isAutomodeEntry(entry: unknown): boolean;
/**
 * Decide the config one automode row should run with.
 *
 * Pure and side-effect free so the policy is unit-testable.
 *
 * @param config - the row's current config (any JSON-ish value).
 * @param route - this plugin's Auto-review route; empty strings mean "unset".
 * @param allowlist - tool names to merge into `readOnlyTools`; pass an empty
 *   list while the skip switch is off.
 * @param adoptedRoute - a `provider/model` this adapter wrote on an earlier
 *   pass; seeing it again means the row is still ours to rewrite.
 * @returns the config to install, whether it changed, and what was applied.
 */
export declare function planAutomodeCompat(config: unknown, route: {
    readonly provider?: string;
    readonly model?: string;
}, allowlist: readonly string[], adoptedRoute?: string): AutomodeCompatPlan;
/** One-line human summary of a plan, for the startup log. */
export declare function describeAutomodePlan(plan: AutomodeCompatPlan): string;
/** Shape the settings card renders for the third-party row, or undefined when absent. */
export interface AutomodeCompatView {
    readonly installed: boolean;
    /** `provider/model` written into the row, when one was. */
    readonly route?: string | undefined;
    /** Why no route was written, when none was. */
    readonly routeSkipped?: AutomodeRouteSkip | undefined;
    /** How many tools were merged in. */
    readonly added: number;
    /** How many pattern-shaped entries could not transfer. */
    readonly skipped: number;
    /** Last hot-reload outcome, when a changed route was pushed into the live row. */
    readonly hot?: 'applied' | 'restart-required' | undefined;
    /** Why the last hot reload did not take, when it did not. */
    readonly hotReason?: string | undefined;
    /** Whether the composed `permission` config still lists the `auto-mode` preset. */
    readonly preset?: AutomodePresetState | undefined;
}
/**
 * Snapshot for the RPC/UI layer.
 * @returns the view, or undefined when this Host has no automode row.
 */
export declare function automodeCompatView(): AutomodeCompatView | undefined;
/**
 * Install the adapter: adapt live rows now, and every row the loader mounts later.
 *
 * The loader applies the profile patch layer and mounts the entry's plugin right
 * after the `loader/patch-context` waterfall returns, so rewriting the entry's
 * `options.config` from that waterfall is what makes the adapted values the ones
 * the plugin activates with. No profile write happens here.
 *
 * @param ctx - this row's context.
 * @param loader - the loader service, when the Host provides it.
 * @param settings - reads the current plugin settings.
 * @returns a disposer that detaches the listeners, plus a replay for live rows.
 */
export declare function installAutomodeCompat(ctx: Context, loader: Loader | undefined, settings: () => ModelSwitchSettings): {
    dispose: () => void;
    replay: () => boolean;
};
/**
 * Row entry point: adapt the third-party row on activation and on remount.
 * @param ctx - this row's context.
 */
export declare function apply(outer: Context): void;
