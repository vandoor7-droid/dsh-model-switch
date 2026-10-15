//#region lib/types/auto-review.js
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
/** Cordis plugin name used by loader diagnostics. */
const name = "model-switch-auto-review";
/** The official gate's host services plus Model Switch's settings owner. */
const inject = [
	"modelSwitch",
	"approval",
	"llm",
	"permissionPresets",
	"sessions",
	"tools"
];
/** Optional bundle whose composition opts a profile into Auto review. */
const AUTO_REVIEW_BUNDLE = "@deepseek-ai/dsh-experimental-auto-review";
/**
* Resolve the pinned reviewer route from live settings.
* @param settings - Model Switch settings carrying the optional reviewer pair.
* @returns Both identifiers trimmed and non-empty, or undefined (follow session).
*/
function autoReviewRouteOf(settings) {
	const provider = settings?.autoReviewProvider?.trim();
	const model = settings?.autoReviewModel?.trim();
	if (provider === void 0 || provider === "" || model === void 0 || model === "") return void 0;
	return {
		provider,
		model
	};
}
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
function reviewLlm(real, route) {
	return new Proxy(real, { get(target, property, _receiver) {
		if (property === "stream") return (options) => {
			const pinned = route();
			return pinned === void 0 ? target.stream(options) : target.stream({
				...options,
				provider: pinned.provider,
				model: pinned.model
			});
		};
		const value = Reflect.get(target, property, target);
		return typeof value === "function" ? value.bind(target) : value;
	} });
}
/**
* Build the scoped context the official gate runs under.
* @param ctx - host context whose modelSwitch settings pin the reviewer route.
* @returns A child context shadowing only the llm service.
*/
function reviewScope(ctx) {
	return ctx.extend({ llm: reviewLlm(ctx.llm, () => autoReviewRouteOf(ctx.modelSwitch.currentSettings())) });
}
/** Structural read of launcher-provided profile facts (the app-boot seam). */
function autoReviewBundleActive(ctx) {
	let profile;
	try {
		profile = ctx.get("profileContext", false);
	} catch {
		return false;
	}
	if (profile === null || typeof profile !== "object") return false;
	const bundles = profile.startedBundles;
	return Array.isArray(bundles) && bundles.includes(AUTO_REVIEW_BUNDLE);
}
/**
* Mount the official gate under the reviewer-route scope.
*
* A profile that never enabled the optional bundle keeps no Auto preset and no
* reviewer; a deployment missing the official package reports the lost
* capability explicitly instead of guessing another path.
*/
async function apply(ctx) {
	if (!autoReviewBundleActive(ctx)) {
		ctx.logger.info("model-switch: auto-review bundle is not active in this profile; the reviewer route override stays unmounted");
		return;
	}
	let official;
	try {
		official = await import("@deepseek-ai/dsh-experimental-auto-review");
	} catch (cause) {
		ctx.logger.error("model-switch: @deepseek-ai/dsh-experimental-auto-review is unavailable; the Auto reviewer cannot run at all");
		ctx.logger.error(cause);
		return;
	}
	try {
		official.apply(reviewScope(ctx));
	} catch (cause) {
		ctx.logger.error("model-switch: the official auto-review row is already active; the reviewer route override is unavailable");
		ctx.logger.error(cause);
	}
}
//#endregion
export { apply, autoReviewRouteOf, inject, name, reviewLlm, reviewScope };
