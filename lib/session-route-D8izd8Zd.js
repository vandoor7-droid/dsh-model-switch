//#region lib/types/provider-group.js
/**
* Provider configuration groups: per-provider presets for the compaction,
* auto-review, session-naming, and subagent routes.
*
* A group is a DERIVED policy, not a write: `src/session-route.ts` resolves the
* routes one session should use from its own provider plus this stored table, so
* switching a session's provider never rewrites deployment-wide settings and two
* sessions on different providers cannot overwrite each other. The field names
* below are the flat settings field names a group pins, which keeps the stored
* shape identical across releases.
*
* All functions here are pure and never throw on malformed storage.
*/
const ROUTE_FIELDS = Object.freeze([
	"compactProvider",
	"compactModel",
	"autoReviewProvider",
	"autoReviewModel",
	"subagentProvider",
	"subagentModel",
	"subagentReasoningEffort",
	"titleProvider",
	"titleModel",
	"memoryProvider",
	"memoryModel"
]);
/** Own data property, so a literal '__proto__' provider id can never touch a prototype. */
function setKey(target, key, value) {
	Object.defineProperty(target, key, {
		value,
		enumerable: true,
		writable: true,
		configurable: true
	});
}
/** A non-blank string. Blank values behave exactly like an absent field. */
function present$1(value) {
	return typeof value === "string" && value.trim() !== "";
}
/** Normalize one raw entry to its owning provider and route view; undefined for non-object junk. */
function normalizeEntry(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return void 0;
	const source = value;
	const group = {};
	for (const field of ROUTE_FIELDS) {
		const item = source[field];
		if (present$1(item)) group[field] = item;
	}
	return {
		provider: present$1(source.provider) ? source.provider : "",
		group
	};
}
/**
* Strip a raw stored value to well-formed groups; never throws. Both storage
* shapes are accepted: the stored entry array (keys live in each entry's
* `provider` field) and a hand-written provider → routes map (keys are the
* providers). All-empty entries stay: they pin a provider to every default.
*/
function normalizeProviderGroups(raw) {
	const groups = {};
	if (Array.isArray(raw)) {
		for (const entry of raw) {
			const view = normalizeEntry(entry);
			if (view === void 0 || view.provider === "") continue;
			setKey(groups, view.provider, view.group);
		}
		return groups;
	}
	if (raw !== null && typeof raw === "object") for (const [key, value] of Object.entries(raw)) {
		if (key.trim() === "") continue;
		const view = normalizeEntry(value);
		if (view === void 0) continue;
		setKey(groups, key, view.group);
	}
	return groups;
}
/**
* The saved group for a provider.
* @returns the normalized group, or undefined when the provider has no group —
* which is what leaves the live routes untouched during a switch.
*/
function groupOf(groups, provider) {
	if (groups === void 0 || provider.trim() === "") return void 0;
	if (!Object.prototype.hasOwnProperty.call(groups, provider)) return void 0;
	return groups[provider];
}
//#endregion
//#region lib/types/session-route.js
/**
* Per-session capability route derivation.
*
* Model Switch stores one deployment-wide route per capability (the flat
* settings fields) plus, per provider, a saved provider group. Nothing is
* written when a session changes provider: this module DERIVES the route a
* capability should use for one session from (a) the session's own provider and
* (b) the stored group table. Two sessions on different providers therefore
* resolve independently, and no session's actions rewrite another session's
* route.
*
* The session's provider is read from durable, official state in this order:
* the `modelSelection` session projection (`pending` before `lastUsed`, so a
* selection the user just made counts), then the latest logged request-context
* route, then the latest `request/header` route. Every read is optional: a
* session with no observable provider, an unregistered projection, or a
* profile without the projection package all resolve to the deployment default,
* which is exactly the pre-derivation behavior.
*
* All functions are pure except the readers, which never throw and never write.
*/
/** Flat deployment-default fields per capability, in group-storage field names. */
const CAPABILITY_FIELDS = Object.freeze({
	compaction: {
		provider: "compactProvider",
		model: "compactModel"
	},
	autoReview: {
		provider: "autoReviewProvider",
		model: "autoReviewModel"
	},
	title: {
		provider: "titleProvider",
		model: "titleModel"
	},
	subagent: {
		provider: "subagentProvider",
		model: "subagentModel"
	},
	memory: {
		provider: "memoryProvider",
		model: "memoryModel"
	}
});
/** A non-blank string; blank values behave exactly like an absent field. */
function present(value) {
	return typeof value === "string" && value.trim() !== "";
}
/** Read one capability's pair from a flat route record; undefined unless both halves are present. */
function pairOf(source, fields) {
	if (source === void 0) return void 0;
	const record = source;
	const provider = record[fields.provider];
	const model = record[fields.model];
	if (!present(provider) || !present(model)) return void 0;
	return {
		provider,
		model
	};
}
/**
* The deployment-wide route for one capability: the flat settings pair.
* @param settings - live Model Switch settings; undefined means none are reachable.
* @param capability - capability whose flat pair is read.
* @returns The complete pair, or undefined when the capability stays at its official/derived default.
*/
function deploymentRoute(settings, capability) {
	return pairOf(settings, CAPABILITY_FIELDS[capability]);
}
/**
* The distillation route one deployment should use.
*
* Distillation is a background pipeline with no session of its own, so the group
* key is the deployment default provider (the provider the profile starts
* sessions on) rather than a session's provider. A provider without a group falls
* back to the flat memory pair; an empty pair leaves the memory plugin at its own
* default.
* @param settings - live Model Switch settings.
* @param provider - the deployment default provider, when one is observable.
* @returns The complete pair, or undefined when nothing is pinned.
*/
function memoryRouteOf(settings, provider) {
	return groupRoute(settings, provider, "memory") ?? deploymentRoute(settings, "memory");
}
/**
* The route a subagent spawn should use for one parent-session provider.
*
* A saved group for that provider pins the spawn; otherwise the flat Subagent
* card pins it, but only in `fixed` mode — `follow-main` IS the official inherit
* path, expressed by leaving the request untouched rather than by naming it.
* @param settings - live Model Switch settings.
* @param provider - the delegating session's provider, when one is observable.
* @returns The complete route, or undefined for official inherit.
*/
function subagentRouteOf(settings, provider) {
	const group = groupRoute(settings, provider, "subagent");
	if (group !== void 0) {
		const effort = groupOf(settings?.providerGroups, provider ?? "")?.subagentReasoningEffort;
		return present(effort) ? {
			...group,
			reasoningEffort: effort
		} : group;
	}
	if (settings?.subagentMode !== "fixed") return void 0;
	const fixed = deploymentRoute(settings, "subagent");
	if (fixed === void 0) return void 0;
	return present(settings.subagentReasoningEffort) ? {
		...fixed,
		reasoningEffort: settings.subagentReasoningEffort
	} : fixed;
}
/**
* One provider's saved route for one capability.
* @param settings - live Model Switch settings carrying the group table.
* @param provider - the session's provider; blank or unknown resolves to undefined.
* @param capability - capability whose group pin is read.
* @returns The complete group pair, or undefined when the group pins nothing here.
*/
function groupRoute(settings, provider, capability) {
	if (!present(provider)) return void 0;
	return pairOf(groupOf(settings?.providerGroups, provider), CAPABILITY_FIELDS[capability]);
}
/**
* The route one capability should use for one session.
*
* A saved provider group for the session's provider wins; otherwise the flat
* deployment default applies. An unknown session provider skips every group, so
* a session Model Switch cannot attribute keeps the deployment default.
* @param settings - live Model Switch settings.
* @param provider - the session's provider, when one is observable.
* @param capability - capability being resolved.
* @returns The complete pair, or undefined for the capability's official default.
*/
function resolveCapabilityRoute(settings, provider, capability) {
	return groupRoute(settings, provider, capability) ?? deploymentRoute(settings, capability);
}
/**
* Read the provider from the durable model-selection projection.
* @param ctx - context that may expose `sessionProjections`.
* @param session - the session whose selection is read.
* @returns The pending provider, else the last-used provider, else undefined.
*/
function projectionProvider(ctx, session) {
	let state;
	try {
		state = ctx.get("sessionProjections", false)?.stateOf(session, "modelSelection");
	} catch {
		state = void 0;
	}
	if (state === void 0) return void 0;
	if (present(state.pending?.provider)) return state.pending.provider;
	if (present(state.lastUsed?.provider)) return state.lastUsed.provider;
}
/**
* The provider one session is using, from official durable state.
*
* Preferred source is the session's own model selection (it covers a switch the
* client has sent but no request has consumed yet); the logged request-context
* and request-header routes cover profiles without the projection package and
* replayed sessions that never emitted a selection.
* @param ctx - context used for the optional projection read.
* @param session - the session to resolve; undefined resolves to undefined.
* @returns The provider, or undefined when nothing durable names one.
*/
function sessionProviderOf(ctx, session) {
	if (session === void 0) return void 0;
	const selected = projectionProvider(ctx, session);
	if (selected !== void 0) return selected;
	try {
		const context = session.requestContext()?.provider;
		if (present(context)) return context;
		const header = session.requestHeader()?.config.provider;
		if (present(header)) return header;
	} catch {
		return;
	}
}
/**
* The subagent route one exact session's spawns should use.
* @param ctx - context used for the optional session reads.
* @param session - the delegating session; undefined keeps official inherit.
* @param settings - live Model Switch settings.
* @returns The complete route, or undefined for official inherit.
*/
function sessionSubagentRouteOf(ctx, session, settings) {
	return subagentRouteOf(settings, sessionProviderOf(ctx, session));
}
//#endregion
export { sessionProviderOf as a, resolveCapabilityRoute as i, groupRoute as n, sessionSubagentRouteOf as o, memoryRouteOf as r, normalizeProviderGroups as s, deploymentRoute as t };
