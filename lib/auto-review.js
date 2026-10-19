import { i as sessionProviderOf, r as resolveCapabilityRoute } from "./session-route-BjNPlliu.js";
import { AsyncLocalStorage } from "node:async_hooks";
//#region lib/types/auto-review.js
/**
* Model Switch-owned Auto reviewer row.
*
* The official `@deepseek-ai/dsh-experimental-auto-review` gate hardwires its
* reviewer to the session's own request route (`header.config`). This row runs
* the official `apply` under a scoped child context whose `llm` service is
* shadowed by a wrapper that rewrites only `stream()`'s provider/model — and
* only when the reviewing session's derived route (its provider group's
* reviewer pair, else the deployment-wide reviewer card) pins one. With no
* route pinned the wrapper passes options through by identity, so the reviewer
* follows the session model exactly.
*
* Although the official gate omits `sessionId` and `purpose` from its frozen
* `GenerateOptions`, its `tools/pre-execute` waterfall listener receives
* `exec.agent` (`exec.agent.session`). After running `official.apply(scope)`,
* this module registers a `{ prepend: true }` `tools/pre-execute` listener on
* the same scope — which Cordis places ahead of the official gate's listener in
* the waterfall — and binds `exec.agent?.session` in an `AsyncLocalStorage`
* scope around `next()`. Every `scope.llm.stream()` call from `classifyRisk`
* therefore resolves the exact session being reviewed, with zero cross-session
* interference when multiple sessions review tool calls concurrently.
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
/**
* Only the services this row's own code touches.
*
* The official gate used to run inside this row's fiber, so this list had to
* mirror every service the official `apply` reads. DSH 0.2.1 added
* `workingDirectory` to the official gate and the mirror went stale, which made
* every tool call fail with `cannot get property "workingDirectory" without
* inject`. The gate is now mounted as its own plugin (see {@link autoReviewGate}),
* so cordis resolves the official dependency list — including future additions —
* and this row declares only what it reads itself.
*/
const inject = ["llm", "modelSwitch"];
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
* Resolve the reviewer route for one session (or deployment-wide when no session is bound).
*
* @param ctx - host context whose modelSwitch settings and sessionProjections derive the route.
* @param session - the session whose tool call is being reviewed, when known.
* @returns The derived reviewer route, or undefined to follow the session model.
*/
function resolveSessionAutoReviewRoute(ctx, session) {
	let settings;
	try {
		settings = ctx.modelSwitch.currentSettings();
	} catch {
		settings = void 0;
	}
	const provider = sessionProviderOf(ctx, session);
	return resolveCapabilityRoute(settings, provider, "autoReview");
}
/**
* Install the outer `tools/pre-execute` correlation listener ahead of the official gate.
*
* Because Cordis `on(..., { prepend: true })` unshifts onto the event hook list,
* registering this listener AFTER `official.apply(scope)` places it at index 0
* — directly ahead of the official gate's own prepended listener — so
* `activeSession.run(exec.agent?.session, next)` wraps the entire official
* review execution.
*
* @param scope - the review scope context where the gate is mounted.
* @param activeSession - AsyncLocalStorage holding the session under review.
*/
function bindAutoReviewSessionCorrelation(scope, activeSession) {
	scope.effect(function* () {
		yield scope.on("tools/pre-execute", (exec, next) => activeSession.run(exec.agent?.session, next), { prepend: true });
	}, "model-switch: auto-review session correlation");
}
/**
* Build the scoped context the official gate runs under.
* @param ctx - host context whose modelSwitch settings pin the reviewer route.
* @param activeSession - optional AsyncLocalStorage correlating each `tools/pre-execute` call to its session.
* @returns A child context shadowing the llm service and, when the permission
* preset service is reachable, that service too.
*/
function reviewScope(ctx, activeSession = new AsyncLocalStorage()) {
	const permissionPresets = permissionPresetsOf(ctx);
	const shadows = { llm: reviewLlm(ctx.llm, () => resolveSessionAutoReviewRoute(ctx, activeSession.getStore())) };
	if (permissionPresets !== void 0) shadows.permissionPresets = defensivePermissionPresets(permissionPresets, ctx.logger);
	return ctx.extend(shadows);
}
/** The preset name the service reports when no configured preset matches. */
const CUSTOM_PRESET = "custom";
/** Read the live permission-preset service without requiring an injection. */
function permissionPresetsOf(ctx) {
	try {
		const face = ctx.get("permissionPresets", false);
		return face !== null && typeof face === "object" ? face : void 0;
	} catch {
		return;
	}
}
/**
* Wrap the permission-preset service so the official gate's per-call probe can
* never fail a tool call.
*
* DSH's Auto gate starts every `tools/pre-execute` with
* `permissionPresets.current(session)`, and that method resolves the presets
* service's own `sessionProjections` injection. When the presets fiber has
* turned inactive the probe throws `cannot get required service
* "sessionProjections" in inactive context` outside the gate's reviewer error
* wrapper, so every tool call dies. This wrapper degrades the probe to
* `custom` (the gate then skips review and calls `next()`), reports the lost
* capability once, and keeps the tool backend alive; the registration and
* teardown paths degrade the same way instead of throwing.
*
* @param real - the host's permission-preset service.
* @param log - the row logger used for the single degradation report.
* @returns A structurally compatible preset face.
*/
function defensivePermissionPresets(real, log) {
	let reported = false;
	const degrade = (operation, error) => {
		if (reported) return;
		reported = true;
		log.warn(`model-switch: the permission-preset service refused ${operation} (${String(error)}); the Auto reviewer passes tool calls through instead of blocking them`);
	};
	return {
		current(session) {
			try {
				return real.current(session);
			} catch (error) {
				degrade("current()", error);
				return CUSTOM_PRESET;
			}
		},
		set(session, preset) {
			try {
				return real.set(session, preset);
			} catch (error) {
				degrade("set()", error);
				return;
			}
		},
		registerAuto(admit) {
			try {
				return real.registerAuto(admit);
			} catch (error) {
				log.warn(`model-switch: the Auto preset integration was not registered (${String(error)}); review keeps the existing integration`);
				return () => Promise.resolve();
			}
		}
	};
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
* Wrap the official gate as a plugin that declares its own dependencies.
*
* Directly calling `official.apply(scope)` ran the gate's code on this row's
* fiber, so every service the gate reads had to be mirrored in this row's
* `inject`. Mounting it instead lets cordis resolve the official list, which is
* what keeps a released Host's new dependency (0.2.1's `workingDirectory`) from
* breaking every tool call. The hooks let the caller observe whether the gate
* actually ran before it binds the session-correlation listener.
*
* @param gate - the official module (or an equivalent structural gate).
* @param hooks - applied/failure observers; the failure is rethrown.
* @returns A cordis plugin mounting the official gate unchanged.
*/
function autoReviewGate(gate, hooks = {}) {
	return {
		name: gate.name ?? "experimental-auto-review",
		...gate.inject === void 0 ? {} : { inject: [...gate.inject] },
		apply(gateCtx) {
			try {
				gate.apply(gateCtx);
			} catch (error) {
				hooks.onFailure?.(error);
				throw error;
			}
			hooks.onApplied?.();
		}
	};
}
/**
* The gate fiber mounted by the current row instance.
*
* `registerAuto` is a single live registration owned by the gate's effect
* lifetime, and its disposer is what clears the Auto preset. A re-applied row
* must await the previous gate's unloading before the next registration runs,
* otherwise the new `registerAuto` throws `already registered` and its effect
* cleanup leaves the catalog without Auto.
*/
let lastGateFiber;
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
	const previous = lastGateFiber;
	lastGateFiber = void 0;
	if (previous !== void 0) try {
		await previous.dispose();
	} catch (cause) {
		ctx.logger.info("model-switch: the previous auto-review gate had already unloaded; continuing with the new one");
		ctx.logger.info(String(cause));
	}
	const activeSession = new AsyncLocalStorage();
	const scope = reviewScope(ctx, activeSession);
	let failure;
	let applied = false;
	const fiber = scope.plugin(autoReviewGate(official, {
		onApplied: () => {
			applied = true;
		},
		onFailure: (error) => {
			failure = error;
		}
	}));
	try {
		await fiber;
	} catch (cause) {
		failure ??= cause;
	}
	if (failure !== void 0) {
		ctx.logger.error("model-switch: the official auto-review row is already active; the reviewer route override is unavailable");
		ctx.logger.error(failure);
		return;
	}
	if (!applied) {
		ctx.logger.info("model-switch: the official auto-review gate is waiting for its host services; the reviewer route override is not bound yet");
		return;
	}
	lastGateFiber = fiber;
	bindAutoReviewSessionCorrelation(scope, activeSession);
}
//#endregion
export { apply, autoReviewGate, autoReviewRouteOf, bindAutoReviewSessionCorrelation, defensivePermissionPresets, inject, name, resolveSessionAutoReviewRoute, reviewLlm, reviewScope };
