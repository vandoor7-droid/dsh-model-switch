import { s as visionRouteOf } from "./session-route-CRfpxarI.js";
import { t as deploymentDefaultProviderOf } from "./prime-memory-route-DGUVfogE.js";
//#region lib/types/vision-router-route.js
/**
* Model Switch's adapter to `dsh-vision-router`'s backend chain.
*
* dsh-vision-router owns the vision backend chain: an ordered `providers` list
* of `{ provider, model, fallbacks }` rows in its `vision-router` row config,
* each row a host llm provider/model the chain tries in order. This module only
* builds the chain Model Switch offers; it never runs a vision call, never
* rewrites another row, and never touches a route the user did not ask to
* change.
*
* Managed-head semantics: a configured route owns the chain's FIRST row (the
* primary backend); the rows the user already had stay below in their own order
* as fallbacks. Unlike the memory adapter there is no `user-set` skip: the
* chain is an ordered fallback table that is never empty (the built-in free
* endpoint is the runtime's last resort), so the head is the routing decision
* and a user-set head is exactly what a configured route replaces.
*
* All functions here are pure.
*/
/** The loader row id dsh-vision-router is composed under (fixed by its bundle patch). */
const VISION_ROUTER_ENTRY_ID = "vision-router";
/** The package name that identifies the row; the authoritative identity. */
const VISION_ROUTER_PACKAGE = "dsh-vision-router";
/** A non-blank string within dsh-vision-router's identifier budget. */
function validIdentifier(value) {
	return typeof value === "string" && value.length > 0 && value.length <= 512;
}
/**
* Whether one loader entry is dsh-vision-router.
*
* The package name wins over the row id: a profile layer may rename the row,
* while an unrelated row could recycle the id.
* @param entry - the loader entry to test.
* @returns True for dsh-vision-router's row.
*/
function isVisionRouterRow(entry) {
	const name = entry?.options?.name;
	if (typeof name === "string" && name.trim() !== "") return name === VISION_ROUTER_PACKAGE;
	return entry?.options?.id === VISION_ROUTER_ENTRY_ID;
}
/**
* Strip a raw providers value to well-formed chain rows.
*
* Mirrors dsh-vision-router's own runtime normalization: entries without a
* valid provider and model are dropped, fallbacks are kept as strings, and the
* chain is capped at the plugin's row limit.
* @param value - the raw `providers` config value, when present.
* @returns The valid rows, in stored order.
*/
function normalizeVisionProviderEntries(value) {
	if (!Array.isArray(value)) return [];
	const rows = [];
	for (const entry of value) {
		if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
		const source = entry;
		if (!validIdentifier(source.provider) || !validIdentifier(source.model)) continue;
		const fallbacks = Array.isArray(source.fallbacks) ? source.fallbacks.filter((item) => validIdentifier(item)) : [];
		rows.push({
			provider: source.provider,
			model: source.model,
			fallbacks
		});
		if (rows.length >= 32) break;
	}
	return rows;
}
/**
* The backend chain dsh-vision-router should run, given the route Model Switch wants.
*
* The chosen route goes first; the entries the plugin already had follow in
* their own order, minus any duplicate of the chosen pair (a duplicate is a
* guaranteed second failure, not a fallback) and minus the entry this adapter
* wrote on an earlier pass (identified by `adopted`, so a route change
* replaces in place instead of accumulating). An empty chosen route leaves the
* existing chain untouched.
* @param existing - the raw `providers` config value as currently stored.
* @param route - the route Model Switch wants first, if any.
* @param adopted - the `provider/model` this adapter wrote on an earlier pass.
* @returns The chain to write, whether it changed, and what was applied.
*/
function planVisionProviders(existing, route, adopted) {
	const chain = normalizeVisionProviderEntries(existing);
	const provider = typeof route?.provider === "string" ? route.provider.trim() : "";
	const model = typeof route?.model === "string" ? route.model.trim() : "";
	if (provider === "" || model === "") return {
		providers: chain,
		changed: false,
		skipped: "no-route"
	};
	const head = chain[0];
	if (head !== void 0 && head.provider === provider && head.model === model) return {
		providers: chain,
		changed: false,
		route: `${provider}/${model}`
	};
	const rest = chain.filter((entry) => {
		if (entry.provider === provider && entry.model === model) return false;
		if (adopted !== void 0 && `${entry.provider}/${entry.model}` === adopted) return false;
		return true;
	});
	return {
		providers: [{
			provider,
			model,
			fallbacks: []
		}, ...rest].slice(0, 32),
		changed: true,
		route: `${provider}/${model}`
	};
}
//#endregion
//#region lib/types/vision-router-compat.js
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
/** Row name and dependencies, mirroring the sibling adapter rows. */
const name = "model-switch-vision-router-compat";
const inject = ["loader"];
/** The state the settings page reads. */
const visionRouterCompatStatus = {
	installed: false,
	replays: 0
};
/** A non-blank string. */
function text(value) {
	return typeof value === "string" ? value.trim() : "";
}
/** Read a value as a plain record. */
function asRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
/** The config one loader entry currently runs with. */
function configOf(entry) {
	return asRecord(entry?.options?.config);
}
/** The ConfigEditor service, when this Host exposes the released seam. */
function editorOf(ctx) {
	try {
		return ctx.get("configEditor", false);
	} catch {
		return;
	}
}
/** The vision plugin's addressable row, as currently composed. */
function visionRouterEntryOf(editor) {
	for (const candidate of editor.entries?.() ?? []) if (isVisionRouterRow(candidate)) return candidate;
}
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
function installVisionRouterCompat(ctx, routeOf) {
	/** The route this adapter wrote last, so it may replace its own value only. */
	let adoptedRoute;
	let pending;
	let attempt = 0;
	const timers = [];
	const scheduleRetry = () => {
		if (attempt >= 16) return;
		const delay = Math.min(1e4, 200 * 2 ** attempt);
		attempt += 1;
		const timer = setTimeout(() => {
			run();
		}, delay);
		timer.unref?.();
		timers.push(timer);
	};
	const run = async () => {
		if (pending !== void 0) return pending;
		const editor = editorOf(ctx);
		if (editor === void 0 || typeof editor.entries !== "function" || typeof editor.edit !== "function") {
			visionRouterCompatStatus.routeSkipped = "no-seam";
			return;
		}
		const entry = visionRouterEntryOf(editor);
		if (entry === void 0) {
			visionRouterCompatStatus.routeSkipped = "no-row";
			scheduleRetry();
			return;
		}
		const editRow = editor.edit.bind(editor);
		const route = routeOf();
		const provider = text(route?.provider);
		const model = text(route?.model);
		if (provider === "" || model === "") {
			visionRouterCompatStatus.routeSkipped = "no-route";
			return;
		}
		const preview = planVisionProviders(configOf(entry)?.providers, route, adoptedRoute);
		if (!preview.changed) {
			adoptedRoute = preview.route ?? adoptedRoute;
			if (preview.route !== void 0) {
				visionRouterCompatStatus.installed = true;
				visionRouterCompatStatus.route = preview.route;
				delete visionRouterCompatStatus.routeSkipped;
			}
			return;
		}
		const wanted = `${provider}/${model}`;
		pending = (async () => {
			try {
				await editRow(entry, (current) => {
					const base = asRecord(current) ?? {};
					const plan = planVisionProviders(base.providers, route, adoptedRoute);
					return {
						...base,
						providers: plan.providers
					};
				});
				const verify = planVisionProviders(configOf(visionRouterEntryOf(editor))?.providers, route, adoptedRoute);
				if (!verify.changed) {
					adoptedRoute = verify.route ?? wanted;
					attempt = 0;
					visionRouterCompatStatus.installed = true;
					visionRouterCompatStatus.route = wanted;
					delete visionRouterCompatStatus.routeSkipped;
				} else visionRouterCompatStatus.routeSkipped = "rejected";
			} catch (cause) {
				visionRouterCompatStatus.routeSkipped = "rejected";
				ctx.logger.warn(`model-switch: could not write the dsh-vision-router backend chain (${String(cause)})`);
				scheduleRetry();
			} finally {
				pending = void 0;
			}
		})();
		return pending;
	};
	const replay = () => {
		visionRouterCompatStatus.replays += 1;
		run();
		return true;
	};
	run();
	const offPatch = ctx.on("loader/patch-context", function(first, second) {
		const nextFn = typeof first === "function" ? first : second;
		if (isVisionRouterRow(typeof first === "function" ? this : first)) run();
		return nextFn === void 0 ? void 0 : nextFn();
	});
	const offInit = ctx.on("loader/entry-init", function(first) {
		const candidate = this ?? first;
		if (candidate !== void 0 && isVisionRouterRow(candidate)) run();
	});
	const offService = ctx.on("internal/service", (name) => {
		if (name === "configEditor") run();
	});
	const lateSweep = setTimeout(() => {
		run();
	}, 1500);
	lateSweep.unref?.();
	return {
		dispose: () => {
			offPatch();
			offInit();
			offService();
			clearTimeout(lateSweep);
			for (const timer of timers) clearTimeout(timer);
		},
		replay
	};
}
/**
* Row entry point: adapt the vision plugin on activation and on remount.
* @param ctx - this row's context.
*/
function apply(ctx) {
	ctx.inject(["modelSwitch"], (withProvider) => {
		withProvider.inject(["configEditor"], (scope) => scope.effect(() => {
			const runtime = scope.modelSwitch;
			const loader = scope.get("loader", false);
			const routeOf = () => visionRouteOf(runtime.currentSettings(), deploymentDefaultProviderOf(loader));
			const adapter = installVisionRouterCompat(scope, routeOf);
			const off = scope.on("model-switch/settings-update", () => {
				if (adapter.replay()) scope.logger.info("model-switch: re-applied the dsh-vision-router backend chain after a settings change");
			});
			return () => {
				off();
				adapter.dispose();
			};
		}, "model-switch: keep the dsh-vision-router route aligned with the settings"));
	});
}
//#endregion
export { visionRouterCompatStatus as a, name as i, inject as n, installVisionRouterCompat as r, apply as t };
