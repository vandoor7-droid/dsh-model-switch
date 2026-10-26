import { a as sessionProviderOf, i as resolveCapabilityRoute } from "./session-route-D8izd8Zd.js";
import { n as isAllowedByList } from "./tool-allowlist-DlzB5GlQ.js";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
//#region lib/types/auto-sessions-state.js
/**
* Durable snapshot of the sessions that were on the Auto preset when this row
* released the Auto registration.
*
* The official auto-review gate's teardown moves live `auto` sessions to the
* fallback preset (`danger-full-access`) by design. That teardown runs whenever
* a gate is disposed — including every hot recompose of this row, where nothing
* of ours stays mounted long enough to restore the selection. This module owns
* the pure encode/decode half of the workaround: the ids are written before the
* release and replayed on the next mount.
*/
/**
* How long a snapshot stays replayable. A flip caused by our own release is
* followed by a re-claim within seconds; anything older is a different restart
* and must not resurrect a preset the user may have chosen since.
*/
const AUTO_SESSION_STATE_MAX_AGE_MS = 9e5;
function uniqueIds(values) {
	const unique = [];
	if (!Array.isArray(values)) return unique;
	for (const value of values) if (typeof value === "string" && value !== "" && !unique.includes(value)) unique.push(value);
	return unique;
}
/** Serialize the session ids that were on Auto at `savedAt`. */
function encodeAutoSessionState(ids, savedAt) {
	const payload = {
		savedAt,
		ids: uniqueIds(ids)
	};
	return JSON.stringify(payload);
}
/**
* Decode a snapshot written by {@link encodeAutoSessionState}, keeping the
* timestamp so a partial replay can write the rest back with the original
* expiry instead of restarting the replay window.
*
* Every malformed or stale shape degrades to `undefined`: an unreadable state
* file must never stop the Auto registration from being released or re-claimed.
*/
function decodeAutoSessionStatePayload(raw, now, maxAgeMs = AUTO_SESSION_STATE_MAX_AGE_MS) {
	if (raw === void 0 || raw.trim() === "") return void 0;
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return;
	}
	if (typeof parsed !== "object" || parsed === null) return void 0;
	const { savedAt, ids } = parsed;
	if (typeof savedAt !== "number" || !Number.isFinite(savedAt)) return void 0;
	if (now - savedAt > maxAgeMs) return void 0;
	return {
		savedAt,
		ids: uniqueIds(ids)
	};
}
/**
* Union of two id lists, order-preserving and de-duplicated.
*
* A release-time snapshot merges what the live read sees with what the
* continuous record saw earlier, because the live read can run after the
* official teardown already moved the sessions off Auto — or fail outright.
*/
function mergeAutoSessionIds(primary, secondary) {
	return uniqueIds([...primary, ...secondary]);
}
/**
* Split a recorded id list into what one replay can restore now and what has
* to stay recorded.
*
* A recorded id counts as restorable as soon as a live session carries it; ids
* without a live session (not loaded yet, or already gone) remain in the file.
*/
function planAutoSnapshotReplay(ids, live) {
	const present = /* @__PURE__ */ new Set();
	for (const session of live) if (typeof session.id === "string" && session.id !== "") present.add(session.id);
	const restore = [];
	const remaining = [];
	for (const id of uniqueIds(ids)) if (present.has(id)) restore.push(id);
	else remaining.push(id);
	return {
		restore,
		remaining
	};
}
/**
* The official package identity — the only handle on the row this plugin
* trusts. Matching by id alone could reach a group or another plugin's row, and
* a matched row is disabled (its fiber disposed).
*/
const OFFICIAL_AUTO_REVIEW_PACKAGE = "@deepseek-ai/dsh-experimental-auto-review";
/**
* Delays for the late re-claims after the attempt loop gave up (ms).
*
* `Entry.update({ disabled: true })` starts the displaced fiber's disposal but
* the loader does not await it, and a disposal that tears down a mounted gate,
* restores permission presets and unwinds fibers can take longer than the
* attempt loop's budget. These re-claims keep trying for a few more seconds so a
* hot-swapped install converges instead of needing a restart.
*/
const TAKEOVER_LATE_RETRY_DELAYS_MS = [
	500,
	1e3,
	1500
];
/** Whether one loader entry is the official Auto-review row (strict package identity). */
function isOfficialAutoReviewRow(entry) {
	if (entry === void 0) return false;
	const pkg = entry.options?.name;
	return typeof pkg === "string" && pkg === "@deepseek-ai/dsh-experimental-auto-review";
}
/** The first composed official Auto-review row, if the profile declares one. */
function officialAutoReviewEntry(loader) {
	if (loader === void 0 || typeof loader.entries !== "function") return void 0;
	for (const entry of loader.entries()) if (isOfficialAutoReviewRow(entry)) return entry;
}
/** The id one entry is known by (the loader's leaf id, not a nested path). */
function leafId(entry) {
	const raw = entry.options?.id;
	return typeof raw === "string" ? raw : void 0;
}
/** A loader entry the loader has not created a fiber for yet. */
function alreadyDisabled(entry) {
	return entry.disabled === true;
}
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
async function reclaimOfficialAutoReviewRow(ctx, entry, seam) {
	const label = String(leafId(entry) ?? "auto-review");
	/** One disable-then-claim step; true once this row holds the registration. */
	const attempt = async () => {
		try {
			await entry.update({ disabled: true });
			ctx.logger.info(`model-switch: disabled the official auto-review row ${label} (${OFFICIAL_AUTO_REVIEW_PACKAGE}); Model Switch's auto-review row owns the reviewer seam (configurable reviewer route)`);
		} catch (cause) {
			ctx.logger.info("model-switch: the displaced auto-review row could not be persisted as disabled; the takeover repeats next startup");
			ctx.logger.info(String(cause));
		}
		return await seam.claim();
	};
	await seam.preserveAuto(async () => {
		for (let index = 0; index < 60; index += 1) {
			await new Promise((resolve) => setTimeout(resolve, index === 0 ? 0 : 50));
			if (await attempt()) {
				ctx.logger.info(`model-switch: displaced the official auto-review row ${label}; Auto review runs under the configurable reviewer route`);
				return;
			}
		}
		ctx.logger.error(`model-switch: the official auto-review row ${label} kept the Auto registration; the reviewer route override is unavailable this session`);
	});
	scheduleLateReclaims(ctx, label, seam);
}
/**
* Keep re-claiming for a few seconds after the attempt loop gave up.
*
* The displaced fiber's disposal starts on `Entry.update` but is not awaited by
* the loader, so it can outlast the attempt loop — which is exactly the hot-swap
* window where the official (unshielded) gate keeps serving. These bounded
* re-claims converge that window instead of leaving it to a restart. Timers are
* cleared when this row unloads.
*
* @param ctx - this row's context, used for logging and timer disposal.
* @param label - the official row's id, for diagnostics.
* @param seam - the Auto-registration seam to reclaim.
*/
function scheduleLateReclaims(ctx, label, seam) {
	let stopped = false;
	const timers = [];
	const stop = () => {
		stopped = true;
		for (const timer of timers.splice(0)) clearTimeout(timer);
	};
	ctx.effect(function* () {
		yield stop;
	}, "model-switch: auto-review late takeover retries");
	const run = (index) => {
		if (stopped || index >= TAKEOVER_LATE_RETRY_DELAYS_MS.length) return;
		const timer = setTimeout(() => {
			(async () => {
				if (stopped) return;
				if (await seam.claim()) {
					ctx.logger.info(`model-switch: reclaimed the Auto registration late from the official auto-review row ${label}; Auto review runs under the configurable reviewer route`);
					stop();
					return;
				}
				run(index + 1);
			})();
		}, TAKEOVER_LATE_RETRY_DELAYS_MS[index]);
		timers.push(timer);
	};
	run(0);
}
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
function installAutoReviewTakeover(ctx, seam) {
	/** Reclaims in flight, shared so two triggers for one entry join one cycle. */
	const reclaiming = /* @__PURE__ */ new Map();
	/** Disable the official row and take the registration back, once per entry. */
	const reclaim = (entry) => {
		const running = reclaiming.get(entry);
		if (running !== void 0) return running;
		const run = reclaimOfficialAutoReviewRow(ctx, entry, seam).finally(() => {
			reclaiming.delete(entry);
		});
		reclaiming.set(entry, run);
		return run;
	};
	/**
	* The row an event names.
	*
	* The loader hands the emitting entry as the event's `this`, but cordis does
	* not rebind `this` for listeners added through `ctx.on`, so a listener can
	* also receive the payload as its first argument. Both shapes are accepted;
	* the real Host always provides one of them.
	*/
	const entryOfEvent = (self, first) => {
		const candidate = self ?? first;
		return candidate !== null && typeof candidate === "object" && "options" in candidate ? candidate : void 0;
	};
	const listeners = [];
	const listen = (event, listener) => {
		const dispose = ctx.on?.(event, listener);
		if (dispose !== void 0) listeners.push(dispose);
	};
	listen("loader/patch-context", function(first, second) {
		const nextFn = typeof first === "function" ? first : second;
		const entry = entryOfEvent(this, typeof first === "function" ? void 0 : first);
		if (entry === void 0 || typeof nextFn !== "function" || !isOfficialAutoReviewRow(entry)) return nextFn === void 0 ? void 0 : nextFn();
		seam.yieldRegistration();
		reclaim(entry);
		return nextFn();
	});
	listen("loader/partial-dispose", function(first) {
		const entry = entryOfEvent(this, first);
		if (entry === void 0 || !isOfficialAutoReviewRow(entry)) return;
		seam.claim();
	});
	const loader = ctx.get("loader", false);
	if (loader !== void 0 && typeof loader.entries === "function") for (const candidate of loader.entries()) {
		if (!isOfficialAutoReviewRow(candidate)) continue;
		if (alreadyDisabled(candidate)) continue;
		reclaim(candidate);
	}
	const disposable = () => {
		for (const dispose of listeners.splice(0)) dispose();
	};
	const effect = ctx.effect;
	if (effect !== void 0) {
		const registration = effect(function* () {
			yield disposable;
		}, "model-switch: auto-review takeover");
		if (typeof registration === "function") listeners.push(registration);
	}
	return reclaim;
}
//#endregion
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
* the profile actually started with the experimental-auto-review bundle. Two
* rows cannot share the seam — `permissionPresets.registerAuto` is a single
* registration and the official probe is unshielded — so this row also
* **takes the seam over** (see `./auto-review-takeover.ts`): a composed or
* re-enabled official row is displaced through the released loader seams, the
* registration is handed over and reclaimed around that displacement, and the
* gate this row mounts keeps the defensive `permissionPresets` shadow so a
* degraded preset service can never fail a tool call again.
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
* and this row declares only what it reads itself (`loader` drives the
* takeover).
*/
const inject = [
	"llm",
	"modelSwitch",
	"loader"
];
/** Optional bundle whose composition opts a profile into Auto review. */
const AUTO_REVIEW_BUNDLE = "@deepseek-ai/dsh-experimental-auto-review";
/** The Auto preset name; `registerAuto` is what publishes it. */
const AUTO_PRESET = "auto";
/**
* Live Auto-reviewer takeover status, read by the runtime-capability snapshot.
*
* `held: false` means the official row kept the single `registerAuto` slot (or
* has not released it yet): the reviewer route is not configurable and the
* tool-call safety net allows unreviewed calls instead of failing them.
* `allowedCalls` counts the calls the net let through in that state, so the
* settings card can tell the human how much review was skipped.
* `skippedReadOnly` counts the calls the allowlist took off the reviewer, which
* is the number the settings card shows next to the switch.
*/
const autoReviewStatus = {
	held: false,
	allowedCalls: 0,
	skippedReadOnly: 0
};
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
* `activeSession.run({ session, tool }, next)` wraps the entire official review
* execution. The stored tool name is what lets the reviewer be skipped for an
* allowlisted read without the gate ever seeing a fake preset.
*
* @param scope - the review scope context where the gate is mounted.
* @param activeSession - AsyncLocalStorage holding the call under review.
*/
function bindAutoReviewSessionCorrelation(scope, activeSession) {
	scope.effect(function* () {
		yield scope.on("tools/pre-execute", (exec, next) => activeSession.run({
			session: exec.agent?.session,
			tool: exec.name
		}, next), { prepend: true });
	}, "model-switch: auto-review session correlation");
}
/**
* Signatures of a broken reviewer seam, never of a real denial.
*
* The official gate's `tools/pre-execute` probe resolves its own
* `sessionProjections` injection before anything can catch it; when that fiber
* chain breaks it throws `cannot get required service ... in inactive context`
* (or, on older lines, `cannot get property ... without inject`) straight into
* the tool call. `TRANSPORT` covers a reviewer that cannot reach its route at
* all. A denial is a *return* (`{ kind: 'deny' }`), so it never matches.
*/
const REVIEWER_INFRA_FAILURE_SIGNATURES = [
	"inactive context",
	"cannot get required service",
	"cannot get property",
	"without inject",
	"TRANSPORT"
];
/**
* Whether a reviewer-path throw is a broken seam rather than a real decision.
* @param cause - whatever the waterfall threw.
* @returns true when the reviewer itself could not run.
*/
function isReviewerInfrastructureFailure(cause) {
	const text = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
	return REVIEWER_INFRA_FAILURE_SIGNATURES.some((signature) => text.includes(signature));
}
/**
* Keep a broken reviewer seam from failing tool calls.
*
* Registered on this row's own context through `{ prepend: true }`, so it sits
* ahead of the official gate's listener and stays live even when the gate could
* not be mounted (the takeover lost `registerAuto`, or the displaced row has
* not released it yet). That is the one window the defensive
* `permissionPresets` shadow cannot cover: the shadow lives in this row's review
* scope, while the serving gate resolves the real service from the profile.
*
* The waterfall only decides whether the body runs; the body dispatches after
* it returns, so allowing here never masks a tool failure. Reviewer transport
* and quota errors keep failing closed — only seam breakage is allowed through.
*
* @param ctx - this row's context (the listener lives and dies with the plugin).
* @param options - diagnostics plus the degraded-state predicate.
*/
function installToolCallSafetyNet(ctx, options = {}) {
	let reported = false;
	const handler = async (_exec, next) => {
		try {
			return await next();
		} catch (cause) {
			if (!isReviewerInfrastructureFailure(cause)) throw cause;
			if (options.isDegraded !== void 0 && !options.isDegraded()) throw cause;
			if (!reported) {
				reported = true;
				const detail = options.fiberChain === void 0 ? "" : `; fiber chain: ${options.fiberChain()}`;
				ctx.logger.warn(`model-switch: the Auto reviewer path is broken (${String(cause)}); tool calls run unreviewed instead of failing${detail}`);
			}
			autoReviewStatus.allowedCalls += 1;
			return { kind: "allow" };
		}
	};
	ctx.effect(function* () {
		yield ctx.on("tools/pre-execute", handler, { prepend: true });
	}, "model-switch: reviewer-path safety net");
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
* A compact dump of the fiber chain a service resolution walks.
*
* `cannot get required service "sessionProjections" in inactive context` is
* thrown by the first fiber in the caller's chain that declares the service
* without a resolved snapshot; the chain names that fiber directly.
* @param ctx - the context whose chain is walked.
* @returns One `uid/state/name/inject` segment per fiber, outermost last.
*/
function fiberChainOf(ctx) {
	const parts = [];
	let node = ctx;
	for (let step = 0; step < 8; step += 1) {
		const fiber = node?.fiber;
		if (fiber === void 0) break;
		const injects = Object.keys(fiber.inject ?? {}).join("|");
		parts.push(`uid=${String(fiber.uid)} state=${String(fiber.state)} name=${String(fiber.name)} inject=[${injects}]`);
		node = fiber.parent;
	}
	return parts.length === 0 ? "no fiber chain" : parts.join(" -> ");
}
/**
* Wrap the permission-preset service so the official gate's per-call probe can
* never fail a tool call, and broker its single Auto registration.
*
* DSH's Auto gate starts every `tools/pre-execute` with
* `permissionPresets.current(session)`, and that method resolves the presets
* service's own `sessionProjections` injection. When the presets fiber has
* turned inactive the probe throws `cannot get required service
* "sessionProjections" in inactive context` outside the gate's reviewer error
* wrapper, so every tool call dies. This wrapper resolves the service lazily
* (so the shadow is in place even while the service is still activating),
* degrades the probe to `custom` (the gate then skips review and calls
* `next()`), and reports the lost capability once — with the fiber chain that
* failed resolution, so the next occurrence names the inactive fiber.
*
* `registerAuto` is **brokered**: the gate yields the disposer into its own
* effect, but the takeover must be able to hand the single registration to a
* displacing row and take it back without unmounting the gate (the gate's
* disposal would move live `auto` sessions to `danger-full-access`).
*
* `current()` also answers the read-only skip. The official gate's first line is
* `if (permissionPresets.current(session) !== 'auto') return next()`, so a call
* whose tool is allowlisted can be taken off the reviewer by answering with
* anything else — the gate itself then runs the normal `next()` path, leaving
* every later listener and guard in place. The answer is scoped to the call in
* flight through the async store, so outside a tool call this method reports the
* truth (`rememberAuto()` and the settings card read it for accounting).
*
* @param resolve - resolves the host's permission-preset service per call.
* @param log - the row logger used for the single degradation report.
* @param chain - diagnostic dump of the resolution chain; defaults to empty.
* @param bypass - optional read-only skip; absent when the feature is off.
* @returns A managed preset face.
*/
function defensivePermissionPresets(resolve, log, chain = () => "", bypass) {
	let reported = false;
	let admit;
	let release;
	const degrade = (operation, error) => {
		if (reported) return;
		reported = true;
		log.warn(`model-switch: the permission-preset service refused ${operation} (${String(error)}); the Auto reviewer passes tool calls through instead of blocking them [chain: ${chain()}]`);
	};
	const requireService = () => {
		const face = resolve();
		if (face === void 0) throw new Error("permission: the permission-preset service is unavailable");
		return face;
	};
	return {
		current(session) {
			let preset;
			try {
				preset = requireService().current(session);
			} catch (error) {
				degrade("current()", error);
				return CUSTOM_PRESET;
			}
			if (preset !== AUTO_PRESET || bypass === void 0) return preset;
			const ambient = bypass.ambient();
			if (ambient === void 0 || !bypass.allows(ambient.tool)) return preset;
			autoReviewStatus.skippedReadOnly += 1;
			return CUSTOM_PRESET;
		},
		set(session, preset) {
			try {
				return requireService().set(session, preset);
			} catch (error) {
				degrade("set()", error);
				return;
			}
		},
		registerAuto(next) {
			admit = next;
			release = requireService().registerAuto(next);
			return () => {
				admit = void 0;
				const dispose = release;
				release = void 0;
				return dispose?.();
			};
		},
		releaseForTakeover() {
			const dispose = release;
			release = void 0;
			dispose?.();
		},
		reclaimRegistration() {
			if (release !== void 0) return true;
			if (admit === void 0) return false;
			try {
				release = requireService().registerAuto(admit);
				return true;
			} catch {
				return false;
			}
		},
		get registered() {
			return release !== void 0;
		}
	};
}
/**
* Build the scoped context the official gate runs under.
* @param ctx - host context whose modelSwitch settings pin the reviewer route.
* @param activeSession - optional AsyncLocalStorage correlating each `tools/pre-execute` call to its session.
* @param presets - optional managed preset face shared with the row's takeover.
* @returns A child context shadowing the llm service and the permission-preset
* service (always: a gate that sees the raw service can fail a tool call).
*/
function reviewScope(ctx, activeSession = new AsyncLocalStorage(), presets = defensivePermissionPresets(() => permissionPresetsOf(ctx), ctx.logger, () => fiberChainOf(ctx))) {
	return ctx.extend({
		llm: reviewLlm(ctx.llm, () => resolveSessionAutoReviewRoute(ctx, activeSession.getStore()?.session)),
		permissionPresets: presets
	});
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
/** Structural read of the loader service the takeover drives. */
function loaderOf(ctx) {
	try {
		const loader = ctx.get("loader", false);
		return loader !== null && typeof loader === "object" ? loader : void 0;
	} catch {
		return;
	}
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
* Mount the official gate under the reviewer-route scope and own the seam.
*
* A profile that never enabled the optional bundle keeps no Auto preset and no
* reviewer; a deployment missing the official package reports the lost
* capability explicitly instead of guessing another path. A composed (or
* plugin-manager re-enabled) official row is displaced first — see
* `./auto-review-takeover.ts` for the choreography and why the yield is
* synchronous.
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
	const activeSession = new AsyncLocalStorage();
	/**
	* The read-only skip, read live so a settings change applies to the next call.
	*
	* Fails closed: an unreadable setting, a disabled switch, or an empty list all
	* mean "review it". The allowlist is the user's explicit opt-in, so a broken
	* read must never widen what runs unreviewed.
	*/
	const skipReadOnly = (tool) => {
		let settings;
		try {
			settings = ctx.modelSwitch.currentSettings();
		} catch {
			return false;
		}
		if (settings?.autoReviewSkipReadOnly !== true) return false;
		const list = settings.autoReviewAllowlist;
		if (!Array.isArray(list) || list.length === 0) return false;
		return isAllowedByList(tool, list);
	};
	const presets = defensivePermissionPresets(() => permissionPresetsOf(ctx), ctx.logger, () => fiberChainOf(ctx), {
		ambient: () => activeSession.getStore(),
		allows: skipReadOnly
	});
	const scope = reviewScope(ctx, activeSession, presets);
	installToolCallSafetyNet(ctx, {
		fiberChain: () => fiberChainOf(ctx),
		isDegraded: () => !presets.registered
	});
	let gateReady = false;
	let mountInFlight;
	/** The live session service, or `undefined` while it is not reachable. */
	const sessionsOf = () => {
		try {
			return ctx.get("sessions", false);
		} catch {
			return;
		}
	};
	const sessionIdOf = (session) => {
		const id = session.id;
		return typeof id === "string" ? id : "";
	};
	/**
	* Sessions currently on the Auto preset (best-effort).
	*
	* Returns `undefined` when the session service cannot be read at all, which
	* callers must treat as "unknown", never as "nothing is on Auto": an empty
	* result from an unreadable store is exactly how the pre-release snapshot
	* used to be destroyed (and the selection with it).
	*/
	const rememberAuto = () => {
		const sessions = sessionsOf();
		if (sessions?.list === void 0) return void 0;
		const remembered = [];
		try {
			for (const session of sessions.list()) if (presets.current(session) === AUTO_PRESET) remembered.push(session);
		} catch {
			return;
		}
		subscribePresetTracking();
		return remembered;
	};
	const restoreAuto = (remembered) => {
		for (const session of remembered) try {
			presets.set(session, AUTO_PRESET);
		} catch {}
	};
	/**
	* Run one displacement step without losing the sessions' Auto selection.
	*
	* Disposing a gate moves live `auto` sessions to `danger-full-access` by
	* design (the official teardown runs on both the displaced row and this
	* row's own re-mounts); the remembered selection is restored afterwards.
	*/
	const preserveAuto = async (action) => {
		const remembered = rememberAuto();
		await action();
		restoreAuto(remembered ?? []);
	};
	/** Where the pre-release Auto snapshot lives (host-wide, not per profile). */
	const autoStatePath = () => join(process.env.DSH_HOME ?? join(homedir(), ".dsh"), "model-switch", "auto-sessions.json");
	/** Read the recorded Auto ids; an absent, malformed or stale file is empty. */
	const readAutoState = () => {
		let raw;
		try {
			raw = readFileSync(autoStatePath(), "utf8");
		} catch {
			raw = void 0;
		}
		return decodeAutoSessionStatePayload(raw, Date.now()) ?? {
			savedAt: Date.now(),
			ids: []
		};
	};
	/** Write the recorded Auto ids; an empty list removes the file. */
	const writeAutoState = (ids, savedAt) => {
		try {
			const file = autoStatePath();
			if (ids.length === 0) {
				rmSync(file, { force: true });
				return;
			}
			mkdirSync(dirname(file), { recursive: true });
			writeFileSync(file, encodeAutoSessionState(ids, savedAt), "utf8");
		} catch {}
	};
	/** Sessions whose preset feed has already been wired to the record. */
	const tracked = /* @__PURE__ */ new WeakSet();
	/**
	* Record one preset change in the file.
	*
	* A change that lands while this row has released the Auto registration is
	* the official teardown flip — the gate moves `auto` sessions to the fallback
	* preset by design — and is not a user choice, so those ids must stay
	* recorded for the next claim. Anything else is the user's decision and wins:
	* the id leaves the record. This is what makes the record independent of the
	* teardown ordering that a plugin install's recompose reorders.
	*/
	const trackAutoSelection = (id, on) => {
		if (id === "") return;
		const state = readAutoState();
		const ids = on ? mergeAutoSessionIds(state.ids, [id]) : presets.registered ? state.ids.filter((existing) => existing !== id) : state.ids;
		writeAutoState(ids, Date.now());
	};
	/** Wire every live session's preset feed to {@link trackAutoSelection}. */
	const subscribePresetTracking = () => {
		const sessions = sessionsOf();
		if (sessions?.list === void 0) return;
		let list;
		try {
			list = sessions.list();
		} catch {
			return;
		}
		const pending = readAutoState();
		for (const session of list) {
			replayPendingFor(session, pending);
			const key = session;
			if (tracked.has(key)) continue;
			const emitter = session;
			if (typeof emitter.on !== "function") continue;
			tracked.add(key);
			try {
				emitter.on("permission/preset", (data) => {
					if (typeof data?.preset !== "string") return;
					trackAutoSelection(sessionIdOf(session), data.preset === AUTO_PRESET);
				});
			} catch {
				tracked.delete(key);
			}
		}
	};
	/**
	* Move a newly observed session back onto Auto while its id is recorded.
	*
	* A claim can run before the session service has loaded the session (the
	* web Host loads them lazily), which is exactly why a replay may leave ids
	* behind. Whenever a session then shows up — through the same observation
	* pass that wires its preset feed — its recorded selection is applied and
	* the id is consumed. A failed `set` keeps the id for a later pass.
	*/
	const replayPendingFor = (session, pending) => {
		if (!presets.registered) return;
		const id = sessionIdOf(session);
		if (id === "" || !pending.ids.includes(id)) return;
		try {
			if (presets.current(session) !== AUTO_PRESET) presets.set(session, AUTO_PRESET);
		} catch {
			return;
		}
		writeAutoState(pending.ids.filter((existing) => existing !== id), pending.savedAt);
	};
	/**
	* Snapshot the Auto selection to disk *before* the registration is released.
	*
	* A release can dispose the gate during a hot recompose — exactly when this
	* row is torn down and can no longer restore anything in memory. The next
	* mount replays the file (see `flushAutoSnapshot`), so the user does not have
	* to re-select 「自动审查」 after every reload.
	*
	* The live read merges into the continuous record instead of replacing it:
	* by the time a teardown runs, the official flip may already have moved the
	* sessions off Auto — or the session service may be unreadable from a fiber
	* that is going away — and an empty read must never destroy the recorded
	* selection (that deletion is what left `auto-sessions.json` absent and the
	* preset stuck on 完全权限 after a plugin install).
	*/
	const persistAutoSnapshot = () => {
		const ids = mergeAutoSessionIds((rememberAuto() ?? []).map(sessionIdOf).filter((id) => id !== ""), readAutoState().ids);
		writeAutoState(ids, Date.now());
	};
	/**
	* Replay (and consume) the snapshot written by a previous release.
	*
	* Only the ids a live session actually claims are consumed; anything else
	* stays in the file, with its original expiry, so an early claim cannot eat
	* the selection of sessions that load later (or that are still archived).
	*/
	const flushAutoSnapshot = () => {
		try {
			const state = readAutoState();
			if (state.ids.length === 0) {
				writeAutoState([], state.savedAt);
				return;
			}
			const sessions = sessionsOf();
			if (sessions?.list === void 0) return;
			subscribePresetTracking();
			const live = [];
			try {
				for (const session of sessions.list()) live.push(session);
			} catch {
				return;
			}
			const { restore, remaining } = planAutoSnapshotReplay(state.ids, live.map((session) => ({ id: sessionIdOf(session) })));
			const wanted = new Set(restore);
			for (const session of live) {
				if (!wanted.has(sessionIdOf(session))) continue;
				try {
					if (presets.current(session) !== AUTO_PRESET) presets.set(session, AUTO_PRESET);
				} catch {}
			}
			writeAutoState(remaining, state.savedAt);
		} catch {}
	};
	/** Mount this row's shielded gate exactly once; failures dispose and report. */
	const mountGate = () => {
		mountInFlight ??= (async () => {
			let outcome = "failed";
			await preserveAuto(async () => {
				const previous = lastGateFiber;
				lastGateFiber = void 0;
				gateReady = false;
				if (previous !== void 0) try {
					await previous.dispose();
				} catch (cause) {
					ctx.logger.info("model-switch: the previous auto-review gate had already unloaded; continuing with the new one");
					ctx.logger.info(String(cause));
				}
				let failure;
				let applied = false;
				const fiber = scope.plugin(autoReviewGate(official, {
					onApplied: () => {
						applied = true;
						bindAutoReviewSessionCorrelation(scope, activeSession);
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
					try {
						await fiber.dispose();
					} catch {}
					ctx.logger.warn(`model-switch: the Auto reviewer gate did not mount (${String(failure)}); the displaced registration may still be releasing`);
					outcome = "failed";
					return;
				}
				if (!applied) {
					ctx.logger.info("model-switch: the official auto-review gate is waiting for its host services; the reviewer route override is not bound yet");
					outcome = "waiting";
					return;
				}
				const gate = fiber;
				const disposeGate = gate.dispose.bind(gate);
				gate.dispose = () => {
					presets.releaseForTakeover();
					return disposeGate();
				};
				lastGateFiber = gate;
				gateReady = true;
				outcome = "applied";
			});
			return outcome;
		})().finally(() => {
			mountInFlight = void 0;
		});
		return mountInFlight;
	};
	/** Make this row's Auto registration live; true once it is held. */
	const claim = async () => {
		let held;
		if (presets.registered) held = true;
		else if (gateReady) held = presets.reclaimRegistration();
		else held = await mountGate() !== "failed";
		autoReviewStatus.held = held;
		subscribePresetTracking();
		if (held) flushAutoSnapshot();
		return held;
	};
	const reclaim = installAutoReviewTakeover(ctx, {
		yieldRegistration: () => {
			persistAutoSnapshot();
			presets.releaseForTakeover();
		},
		claim,
		preserveAuto
	});
	const entry = officialAutoReviewEntry(loaderOf(ctx));
	if (entry !== void 0 && entry.disabled !== true) await reclaim(entry);
	else await claim();
	if (!presets.registered) {
		autoReviewStatus.held = false;
		ctx.logger.error("model-switch: the Auto registration is not held by this row, so Auto review runs without the configurable reviewer route; the reviewer path is shielded instead of failing tool calls. Restart DSH to converge the reviewer row — a hot install cannot always displace the official row in time");
	}
	ctx.effect(function* () {
		yield ctx.on("tools/pre-execute", async (_exec, next) => {
			subscribePresetTracking();
			return next();
		});
	}, "model-switch: replay pending Auto selections as sessions appear");
	const sweep = setInterval(() => {
		if (readAutoState().ids.length === 0) return;
		subscribePresetTracking();
	}, 1e4);
	ctx.effect(function* () {
		yield () => clearInterval(sweep);
	}, "model-switch: sweep pending Auto selections until the record is empty");
	ctx.effect(function* () {
		yield () => {
			persistAutoSnapshot();
			presets.releaseForTakeover();
		};
	}, "model-switch: release the Auto registration before anything else");
}
//#endregion
export { bindAutoReviewSessionCorrelation as a, installToolCallSafetyNet as c, resolveSessionAutoReviewRoute as d, reviewLlm as f, autoReviewStatus as i, isReviewerInfrastructureFailure as l, autoReviewGate as n, defensivePermissionPresets as o, reviewScope as p, autoReviewRouteOf as r, inject as s, apply as t, name as u };
