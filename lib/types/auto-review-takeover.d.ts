/**
 * Model Switch's takeover of the official Auto-review row.
 *
 * `permissionPresets.registerAuto` is a single registration, and the official
 * gate's `tools/pre-execute` probe is unshielded — it resolves the presets
 * service's `sessionProjections` injection on every tool call and dies with
 * `cannot get required service "sessionProjections" in inactive context` when
 * that chain breaks. Two live rows are therefore not survivable: the row that
 * loses `registerAuto` fails mid-effect (its probe listener half-applied, every
 * later tool call failing on the raw probe error), and the row that wins runs
 * unguarded. The plugin-manager toggle makes this reachable at runtime by
 * writing `disabled: false` for the official row into the profile patch layer.
 *
 * This module keeps exactly one row on the seam by taking the official row out
 * of the composition and letting this plugin's row claim the registration —
 * the same released-seam choreography the session-title takeover uses:
 * `loader/patch-context`, `Entry.update`, `loader/partial-dispose`.
 *
 * The yield is **synchronous** on purpose: `loader/patch-context` is a
 * synchronous waterfall whose `next()` returns straight into the entry's
 * `registry.plugin(...)` mount, so the official `registerAuto` runs in the same
 * turn. An awaited yield would still collide; a synchronous release hands the
 * registration over cleanly (the official row then applies in full and is
 * disposed cleanly, never half-applied).
 *
 * @module dsh-model-switch/auto-review-takeover
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Entry, Loader } from '@deepseek-ai/cordis-plugin-loader';
/** The loader row id the official Auto-review bundle declares. */
export declare const OFFICIAL_AUTO_REVIEW_ROW = "auto-review";
/**
 * The official package identity — the only handle on the row this plugin
 * trusts. Matching by id alone could reach a group or another plugin's row, and
 * a matched row is disabled (its fiber disposed).
 */
export declare const OFFICIAL_AUTO_REVIEW_PACKAGE = "@deepseek-ai/dsh-experimental-auto-review";
/** Bounded takeover attempts before the seam is reported lost. */
export declare const TAKEOVER_MAX_ATTEMPTS = 20;
/** Delay between takeover attempts; the first attempt is immediate. */
export declare const TAKEOVER_RETRY_DELAY_MS = 10;
/** The seam this row's gate owns; the takeover drives it around the official row. */
export interface AutoReviewSeam {
    /**
     * Synchronously free the Auto registration so a displacing row can register
     * cleanly. Keeping the admit callback is the seam's business; claiming puts
     * the registration back.
     */
    yieldRegistration(): void;
    /** Make this row's Auto registration live; true once it is held. */
    claim(): Promise<boolean>;
    /** Run one takeover step without losing the sessions' Auto selection. */
    preserveAuto(action: () => Promise<void>): Promise<void>;
}
/** Whether one loader entry is the official Auto-review row (strict package identity). */
export declare function isOfficialAutoReviewRow(entry: Entry | undefined): boolean;
/** The first composed official Auto-review row, if the profile declares one. */
export declare function officialAutoReviewEntry(loader: Loader | undefined): Entry | undefined;
/**
 * Displace the official Auto-review row and take the registration back.
 *
 * The official row is disabled through the public `Entry.update` (which starts
 * its fiber's disposal — the loader does not await it, so the claim retries
 * until the displaced registration actually released). The Auto selection of
 * live sessions is preserved around the displacement: the official gate's
 * disposal moves `auto` sessions to `danger-full-access` by design, and this
 * row's registration puts them back.
 *
 * @param ctx - this row's context, used only for logging.
 * @param entry - the official row to displace.
 * @param seam - the Auto-registration seam to yield and reclaim.
 * @returns a promise settling once the takeover attempt loop finished.
 */
export declare function reclaimOfficialAutoReviewRow(ctx: Context, entry: Entry, seam: AutoReviewSeam): Promise<void>;
/**
 * Install the takeover choreography for an official row that activates later.
 *
 * The plugin manager can re-enable the official row at any time (it writes
 * `disabled: false` into the profile patch layer, which applies after every
 * bundle layer). The `loader/patch-context` listener yields this row's
 * registration **synchronously** before the entry's plugin `apply` runs, so the
 * official row applies cleanly instead of colliding; the reclaim then disables
 * it and takes the registration back.
 *
 * @param ctx - this row's context.
 * @param seam - the Auto-registration seam to yield and reclaim.
 * @returns the guarded reclaim function, so the caller's startup takeover and
 * the listeners share one in-flight guard per entry.
 */
export declare function installAutoReviewTakeover(ctx: Context, seam: AutoReviewSeam): (entry: Entry) => Promise<void>;
