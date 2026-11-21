/**
 * Adapt `dsh-vision-router`'s backend chain to this plugin's vision route.
 *
 * The vision plugin owns an ordered `providers` chain in its `vision-router`
 * row config and reads it live. The write crosses the same boundary the
 * plugin's own settings facade uses: `ctx.configEditor.edit(entry, change)` —
 * the released core ConfigEditor seam. The edit validates through the plugin's
 * own Config schema (`providers` is declared there), persists into the profile
 * patch row, and hot-reloads just that entry, so a provider switch applies
 * without a Host restart. The plugin's HTTP local-settings transport stays
 * unused: its BrowserAuth fence only admits an authenticated local browser,
 * not a plugin fiber.
 *
 * The route itself is provider-group based: the group of the deployment
 * default provider (canonicalized — a twin `${provider}-vision` default keys
 * its base), falling back to the flat vision pair. Chain semantics are the
 * managed head documented in `./vision-router-route.ts`: a configured route
 * owns the first row, the user's own rows stay below as fallbacks, and an
 * empty route leaves the chain untouched.
 */
import type { Context } from '@deepseek-ai/cordis';
import { type CapabilityRoute } from './session-route.js';
/** Row name and dependencies, mirroring the sibling adapter rows. */
export declare const name = "model-switch-vision-router-compat";
export declare const inject: string[];
/** Why the adapter stayed out of the way. */
export type VisionRouterRouteSkip = 'no-row' | 'no-route' | 'no-seam' | 'rejected';
/** Live adapter state, surfaced next to the settings card. */
export interface VisionRouterCompatStatus {
    /** Whether at least one write reached the vision plugin's row config. */
    installed: boolean;
    /** The `provider/model` written on the last pass. */
    route?: string | undefined;
    /** Why the route was not written, when it was not. */
    routeSkipped?: VisionRouterRouteSkip | undefined;
    /** How many settings-update replays this adapter has run (diagnostics). */
    replays: number;
}
/** The state the settings page reads. */
export declare const visionRouterCompatStatus: VisionRouterCompatStatus;
/**
 * Install the adapter for the whole profile.
 *
 * Runs on activation, on every `loader/patch-context` and `loader/entry-init`
 * that concerns the vision plugin's row, once more after a short delay (the
 * row is often composed after this one), when the `configEditor` service
 * appears, and whenever this plugin's settings change. Every pass compares
 * before writing: a ConfigEditor edit reconciles the profile and re-enters
 * this adapter, so an unchanged head must not produce another write.
 * @param ctx - this row's context.
 * @param routeOf - resolves this plugin's vision route for one settings snapshot.
 * @returns The disposer and a replay hook.
 */
export declare function installVisionRouterCompat(ctx: Context, routeOf: () => CapabilityRoute | undefined): {
    dispose: () => void;
    replay: () => boolean;
};
/**
 * Row entry point: adapt the vision plugin on activation and on remount.
 * @param ctx - this row's context.
 */
export declare function apply(ctx: Context): void;
