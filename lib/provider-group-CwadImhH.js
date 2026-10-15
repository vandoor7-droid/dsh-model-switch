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
	"titleModel"
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
function present(value) {
	return typeof value === "string" && value.trim() !== "";
}
/** Normalize one raw entry to its owning provider and route view; undefined for non-object junk. */
function normalizeEntry(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return void 0;
	const source = value;
	const group = {};
	for (const field of ROUTE_FIELDS) {
		const item = source[field];
		if (present(item)) group[field] = item;
	}
	return {
		provider: present(source.provider) ? source.provider : "",
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
export { normalizeProviderGroups as n, groupOf as t };
