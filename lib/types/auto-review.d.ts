/**
 * Model Switch-owned Auto reviewer row.
 *
 * The official `@deepseek-ai/dsh-experimental-auto-review` gate hardwires its
 * reviewer to the session's own request route (`header.config`). This row runs
 * the official `apply` under a scoped child context whose `llm` service is
 * shadowed by a wrapper that rewrites only `stream()`'s provider/model — and
 * only while the profile has a complete reviewer route configured. With no
 * route configured the wrapper passes options through by identity, so the
 * reviewer follows the session model exactly.
 *
 * The reviewer route is deliberately DEPLOYMENT-WIDE. The official gate builds
 * its request with no session id and no purpose and closes over the single
 * context it was applied with, so this plugin has no public way to tell which
 * session a review serves; guessing one would attribute a review to the wrong
 * session and make the recorded reviewer route false. The unsupported
 * per-session reviewer route is recorded in `docs/seam-gap.md` with the public
 * seam it would need.
 *
 * The official gate stays an opt-in capability: the row mounts it only when
 * the profile actually started with the experimental-auto-review bundle.
 * `cordis.patch.yml` disables the official row (one `registerAuto` per
 * context), so this row is its replacement rather than a second registration.
 *
 * @module dsh-model-switch/auto-review
 */
import type { Context } from '@deepseek-ai/cordis';
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "model-switch-auto-review";
/** The official gate's host services plus Model Switch's settings owner. */
export declare const inject: string[];
/** Pinned reviewer route; both identifiers are non-empty. */
export interface AutoReviewRoute {
    readonly provider: string;
    readonly model: string;
}
/** Minimal public llm face the official gate uses (it calls exactly `stream`). */
export interface ReviewLlm {
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
/**
 * Resolve the pinned reviewer route from live settings.
 * @param settings - Model Switch settings carrying the optional reviewer pair.
 * @returns Both identifiers trimmed and non-empty, or undefined (follow session).
 */
export declare function autoReviewRouteOf(settings: {
    readonly autoReviewProvider?: string;
    readonly autoReviewModel?: string;
} | undefined): AutoReviewRoute | undefined;
/**
 * Wrap the real llm service so only `stream()` route fields are rewritten.
 *
 * Non-`stream` members pass through bound to the real service (Proxy reads
 * would otherwise hand methods the proxy as `this`). The route is re-read per
 * call so a settings change applies to the very next review without a reload.
 *
 * @param real - the host's `ctx.llm`.
 * @param route - live route resolver; undefined means "do not rewrite".
 * @returns A structurally compatible llm face for the scoped context.
 */
export declare function reviewLlm(real: ReviewLlm, route: () => AutoReviewRoute | undefined): ReviewLlm;
/**
 * Build the scoped context the official gate runs under.
 * @param ctx - host context whose modelSwitch settings pin the reviewer route.
 * @returns A child context shadowing only the llm service.
 */
export declare function reviewScope(ctx: Context): Context;
/**
 * Mount the official gate under the reviewer-route scope.
 *
 * A profile that never enabled the optional bundle keeps no Auto preset and no
 * reviewer; a deployment missing the official package reports the lost
 * capability explicitly instead of guessing another path.
 */
export declare function apply(ctx: Context): Promise<void>;
