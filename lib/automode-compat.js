import { t as DEFAULT_READ_ONLY_TOOLS } from "./tool-allowlist-DlzB5GlQ.js";
//#region lib/types/automode-compat.js
/** Cordis plugin identity; matches the `cordis.patch.yml` insert row id. */
const name = "model-switch-automode-compat";
/** The loader is the only seam this row needs besides this plugin's settings. */
const inject = ["loader", "modelSwitch"];
/** Third-party package this row adapts (strict package identity, never a prefix). */
const AUTOMODE_PACKAGE = "@log.li/dsh-automode";
/** Live adapter state, surfaced next to the allowlist editor. */
const automodeCompatStatus = {
	/** A `@log.li/dsh-automode` row exists in this Host. */
	installed: false,
	/** `provider/model` this adapter wrote, when it wrote one. */
	route: void 0,
	/** Why the route was skipped, when it was. */
	routeSkipped: void 0,
	/** Tools merged into the row's `readOnlyTools`. */
	added: [],
	/** Pattern-shaped entries that cannot transfer. */
	skipped: [],
	/** How many rows were rewritten (remounts included). */
	applied: 0
};
/** Plain-object guard: arrays and `null` are not config objects. */
function asRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
/** Trimmed string or empty, so whitespace-only config reads as "unset". */
function text(value) {
	return typeof value === "string" ? value.trim() : "";
}
/**
* Whether one loader entry is the third-party auto-mode row.
* @param entry - anything the loader hands over (an entry, or an event payload).
* @returns true only for the exact package name.
*/
function isAutomodeEntry(entry) {
	const row = entry?.options;
	return typeof row?.name === "string" && row.name === "@log.li/dsh-automode";
}
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
function planAutomodeCompat(config, route, allowlist, adoptedRoute) {
	const base = asRecord(config);
	if (base === void 0) return {
		config: {},
		changed: false,
		applied: {
			added: [],
			skipped: []
		}
	};
	const next = { ...base };
	let changed = false;
	const provider = text(route.provider);
	const model = text(route.model);
	const classifier = asRecord(base.classifier) ?? {};
	const declaredProvider = text(classifier.provider);
	const declaredModel = text(classifier.model);
	const declaredRoute = declaredProvider !== "" && declaredModel !== "" ? `${declaredProvider}/${declaredModel}` : void 0;
	const ours = declaredRoute !== void 0 && adoptedRoute !== void 0 && declaredRoute === adoptedRoute;
	let routeApplied;
	let routeSkipped;
	if (!ours && (declaredProvider !== "" || declaredModel !== "")) routeSkipped = "user-set";
	else if (provider === "" || model === "") routeSkipped = "no-route";
	else {
		next.classifier = {
			...classifier,
			provider,
			model
		};
		routeApplied = `${provider}/${model}`;
		changed = true;
	}
	const existing = Array.isArray(base.readOnlyTools) ? base.readOnlyTools.filter((item) => typeof item === "string") : [];
	const added = [];
	const skipped = [];
	for (const candidate of allowlist) {
		const tool = text(candidate);
		if (tool === "") continue;
		if (tool.includes("*")) {
			if (!skipped.includes(tool)) skipped.push(tool);
			continue;
		}
		if (!existing.includes(tool) && !added.includes(tool)) added.push(tool);
	}
	if (added.length > 0) {
		next.readOnlyTools = [...existing, ...added];
		changed = true;
	}
	return {
		config: next,
		changed,
		applied: {
			route: routeApplied,
			routeSkipped,
			added,
			skipped
		}
	};
}
/** The Auto-review route this plugin is configured to use. */
function routeOf(settings) {
	return {
		provider: text(settings.autoReviewProvider),
		model: text(settings.autoReviewModel)
	};
}
/** Tools to merge into the third-party row, honouring the skip switch. */
function allowlistOf(settings) {
	if (settings.autoReviewSkipReadOnly !== true) return [];
	const saved = settings.autoReviewAllowlist;
	return saved !== void 0 && saved.length > 0 ? saved : DEFAULT_READ_ONLY_TOOLS;
}
/** Record one applied plan on the shared status object. */
function reflect(plan) {
	automodeCompatStatus.installed = true;
	if (plan.applied.route !== void 0) {
		automodeCompatStatus.route = plan.applied.route;
		automodeCompatStatus.routeSkipped = void 0;
	} else if (automodeCompatStatus.route === void 0) automodeCompatStatus.routeSkipped = plan.applied.routeSkipped;
	for (const tool of plan.applied.added) if (!automodeCompatStatus.added.includes(tool)) automodeCompatStatus.added.push(tool);
	for (const tool of plan.applied.skipped) if (!automodeCompatStatus.skipped.includes(tool)) automodeCompatStatus.skipped.push(tool);
}
/** Read one entry's live config object, if it has one. */
function configOf(entry) {
	return entry.options.config;
}
/** Assign the adapted config back onto the entry's live options. */
function writeConfig(entry, config) {
	entry.options.config = config;
}
/**
* Adapt one row in memory, containing every failure.
*
* @param entry - the loader entry to adapt.
* @param settings - current plugin settings, read per application.
* @param log - row logger for the one-line report.
* @param adoptedRoute - the route this adapter already wrote, when it wrote one.
* @returns the plan that was applied, or undefined when nothing ran.
*/
function adaptEntry(entry, settings, log, adoptedRoute) {
	try {
		const current = settings();
		const plan = planAutomodeCompat(configOf(entry), routeOf(current), allowlistOf(current), adoptedRoute);
		automodeCompatStatus.installed = true;
		if (!plan.changed) {
			reflect(plan);
			return plan;
		}
		writeConfig(entry, plan.config);
		automodeCompatStatus.applied += 1;
		reflect(plan);
		return plan;
	} catch (error) {
		log.warn(`model-switch: could not adapt the dsh-automode row (${String(error)}); its own route and read-only list stay as configured`);
		return;
	}
}
/** One-line human summary of a plan, for the startup log. */
function describeAutomodePlan(plan) {
	const parts = [];
	parts.push(plan.applied.route === void 0 ? `route ${plan.applied.routeSkipped ?? "unset"}` : `route ${plan.applied.route}`);
	parts.push(`+${plan.applied.added.length} read-only tools`);
	if (plan.applied.skipped.length > 0) parts.push(`${plan.applied.skipped.length} pattern entries skipped`);
	return parts.join(", ");
}
/** Last adaptation summary, reused when a settings change replays the adapter. */
let lastSummary = "";
/**
* Snapshot for the RPC/UI layer.
* @returns the view, or undefined when this Host has no automode row.
*/
function automodeCompatView() {
	if (!automodeCompatStatus.installed) return void 0;
	return {
		installed: true,
		route: automodeCompatStatus.route,
		routeSkipped: automodeCompatStatus.routeSkipped,
		added: automodeCompatStatus.added.length,
		skipped: automodeCompatStatus.skipped.length
	};
}
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
function installAutomodeCompat(ctx, loader, settings) {
	const log = ctx.logger;
	/** Entry → last plan applied, so remounts only log when the outcome changes. */
	const applied = /* @__PURE__ */ new Map();
	/** Entry → the route this adapter wrote, so a replay may rewrite its own value. */
	const adopted = /* @__PURE__ */ new Map();
	const applying = (entry) => {
		const plan = adaptEntry(entry, settings, log, adopted.get(entry));
		if (plan === void 0) return;
		if (plan.applied.route !== void 0) adopted.set(entry, plan.applied.route);
		else if (plan.applied.routeSkipped === "user-set") adopted.delete(entry);
		const summary = describeAutomodePlan(plan);
		lastSummary = summary;
		if (!plan.changed) return;
		if (applied.get(entry) === summary) return;
		applied.set(entry, summary);
		log.info(`model-switch: adapted dsh-automode (${summary})`);
	};
	if (loader !== void 0 && typeof loader.entries === "function") {
		for (const entry of loader.entries()) if (isAutomodeEntry(entry)) applying(entry);
	}
	const dispose = ctx.on("loader/patch-context", function(first, second) {
		const nextFn = typeof first === "function" ? first : second;
		const candidate = typeof first === "function" ? this : first;
		if (isAutomodeEntry(candidate)) applying(candidate);
		return nextFn === void 0 ? void 0 : nextFn();
	});
	/** Re-adapt every live row (settings changed under us). */
	const replay = () => {
		let any = false;
		for (const entry of loader?.entries?.() ?? []) {
			if (!isAutomodeEntry(entry)) continue;
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
* Row entry point: adapt the third-party row on activation and on remount.
* @param ctx - this row's context.
*/
function apply(ctx) {
	const loader = ctx.get("loader", false);
	const settings = () => ctx.modelSwitch.currentSettings();
	const adapter = installAutomodeCompat(ctx, loader, settings);
	ctx.effect(function* () {
		yield adapter.dispose;
		yield ctx.on("model-switch/settings-update", () => {
			if (adapter.replay()) ctx.logger.info(`model-switch: re-applied the dsh-automode adaptation after a settings change (${lastSummary})`);
		});
	}, "model-switch: keep the dsh-automode adapter aligned with the settings");
}
//#endregion
export { AUTOMODE_PACKAGE, apply, automodeCompatStatus, automodeCompatView, describeAutomodePlan, inject, installAutomodeCompat, isAutomodeEntry, name, planAutomodeCompat };
