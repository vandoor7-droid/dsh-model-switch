import { r as memoryRouteOf } from "./session-route-D8izd8Zd.js";
//#region lib/types/prime-memory-route.js
/**
* Model Switch's adapter to `dsh-prime-memory`'s distillation route.
*
* prime-memory owns its distillation route: a `distillChain` in the volatile
* `live` settings section (`distillProvider`/`distillModel` before 0.x chains
* existed), read through its own settings handle and committed with
* `ctx.settings.update('dsh-memory', { live })` — a volatile-only commit that
* does not remount the plugin. This module only builds the write Model Switch
* offers; it never runs a distillation call, never rewrites the plugin, and
* never changes a route the user did not ask to change.
*
* All functions here are pure.
*/
/** The loader row id prime-memory is composed under (fixed by its bundle patch). */
const PRIME_MEMORY_ENTRY_ID = "dsh-memory";
/** The package name that identifies the row; the authoritative identity. */
const PRIME_MEMORY_PACKAGE = "dsh-prime-memory";
/** A non-blank string; blank values behave exactly like an absent field. */
function present(value) {
	return typeof value === "string" && value.trim() !== "";
}
/**
* Whether one loader entry is prime-memory.
*
* The package name wins over the row id: a profile layer may rename the row,
* while an unrelated row could recycle the id.
* @param entry - the loader entry to test.
* @returns True for prime-memory's row.
*/
function isPrimeMemoryRow(entry) {
	const name = entry?.options?.name;
	if (present(name)) return name === PRIME_MEMORY_PACKAGE;
	return entry?.options?.id === PRIME_MEMORY_ENTRY_ID;
}
//#endregion
//#region lib/types/prime-memory-compat.js
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
/** The state the settings page reads. */
const primeMemoryCompatStatus = { installed: false };
/** Read a value as a plain record. */
function asRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
/** A non-blank string. */
function text(value) {
	return typeof value === "string" ? value.trim() : "";
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
function planPrimeMemoryRoute(config, route, adoptedRoute) {
	const base = asRecord(config);
	if (base === void 0) return {
		config: {},
		changed: false,
		skipped: "no-route"
	};
	const llm = asRecord(base.llm) ?? {};
	const declaredProvider = text(llm.provider);
	const declaredModel = text(llm.model);
	const declaredRoute = declaredProvider !== "" && declaredModel !== "" ? `${declaredProvider}/${declaredModel}` : void 0;
	if (!(declaredRoute !== void 0 && adoptedRoute !== void 0 && declaredRoute === adoptedRoute) && (declaredProvider !== "" || declaredModel !== "")) return {
		config: base,
		changed: false,
		skipped: "user-set"
	};
	const provider = text(route?.provider);
	const model = text(route?.model);
	if (provider === "" || model === "") return {
		config: base,
		changed: false,
		skipped: "no-route"
	};
	return {
		config: {
			...base,
			llm: {
				...llm,
				provider,
				model
			}
		},
		changed: true,
		route: `${provider}/${model}`
	};
}
/** The `agent-default-model` row's provider: the deployment default. */
function defaultProviderOf(loader) {
	if (typeof loader?.entries !== "function") return void 0;
	for (const entry of loader.entries()) {
		if (entry.options?.id !== "agent-default-model") continue;
		const provider = text(asRecord(entry.options?.config)?.provider);
		if (provider !== "") return provider;
	}
}
/** Replace the row's route-consuming config in memory (never a profile write). */
function install(entry, config) {
	const options = entry.options;
	Object.defineProperty(options, "config", {
		value: config,
		enumerable: true,
		writable: true,
		configurable: true
	});
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
function installPrimeMemoryCompat(ctx, loader, routeOf) {
	/** What this adapter wrote per row, so it may rewrite its own value only. */
	const adopted = /* @__PURE__ */ new WeakMap();
	const applying = (entry) => {
		const route = routeOf();
		const plan = planPrimeMemoryRoute(entry.options?.config, route, adopted.get(entry));
		primeMemoryCompatStatus.installed = true;
		if (plan.route !== void 0) {
			install(entry, plan.config);
			adopted.set(entry, plan.route);
			primeMemoryCompatStatus.route = plan.route;
			delete primeMemoryCompatStatus.routeSkipped;
			return;
		}
		primeMemoryCompatStatus.routeSkipped = plan.skipped;
		if (plan.skipped === "user-set") primeMemoryCompatStatus.route = void 0;
	};
	if (typeof loader?.entries === "function") {
		for (const entry of loader.entries()) if (isPrimeMemoryRow(entry)) applying(entry);
	}
	const dispose = ctx.on("loader/patch-context", function(first, second) {
		const nextFn = typeof first === "function" ? first : second;
		const candidate = typeof first === "function" ? this : first;
		if (isPrimeMemoryRow(candidate)) applying(candidate);
		return nextFn === void 0 ? void 0 : nextFn();
	});
	/** Re-adapt every live row (settings changed under us). */
	const replay = () => {
		let any = false;
		for (const entry of loader?.entries?.() ?? []) {
			if (!isPrimeMemoryRow(entry)) continue;
			any = true;
			applying(entry);
		}
		return any;
	};
	return {
		dispose,
		replay
	};
}
/**
* Row entry point: adapt the memory plugin on activation and on remount.
* @param ctx - this row's context.
*/
function apply(ctx) {
	const loader = ctx.get("loader", false);
	const routeOf = () => memoryRouteOf(ctx.modelSwitch.currentSettings(), defaultProviderOf(loader));
	const adapter = installPrimeMemoryCompat(ctx, loader, routeOf);
	ctx.effect(function* () {
		yield adapter.dispose;
		yield ctx.on("model-switch/settings-update", () => {
			if (adapter.replay()) ctx.logger.info("model-switch: re-applied the dsh-prime-memory distillation route after a settings change");
		});
	}, "model-switch: keep the dsh-prime-memory route aligned with the settings");
}
//#endregion
export { apply, installPrimeMemoryCompat, planPrimeMemoryRoute, primeMemoryCompatStatus };
