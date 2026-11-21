import { c as canonicalGroupProvider } from "./session-route-CRfpxarI.js";
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
/**
* The chain prime-memory should use, given the route Model Switch wants.
*
* The chosen route goes first; the entries prime-memory already had follow in
* their own order, minus any route that duplicates the chosen one (a duplicate
* is a guaranteed second failure, not a fallback). An empty chosen route leaves
* the existing chain untouched.
* @param primary - the route Model Switch wants first, if any.
* @param existing - prime-memory's current chain, as read from its settings.
* @returns The chain to write; empty when neither side has a complete route.
*/
function planDistillChain(primary, existing) {
	const chain = [];
	const seen = /* @__PURE__ */ new Set();
	const push = (entry) => {
		const key = `${entry.provider}\u0000${entry.model}`;
		if (seen.has(key)) return;
		seen.add(key);
		chain.push(entry);
	};
	if (primary !== void 0 && present(primary.provider) && present(primary.model)) {
		const effort = primary.reasoningEffort;
		push(present(effort) ? {
			provider: primary.provider,
			model: primary.model,
			reasoningEffort: effort
		} : {
			provider: primary.provider,
			model: primary.model
		});
	}
	for (const entry of existing ?? []) {
		if (!present(entry.provider) || !present(entry.model)) continue;
		push(present(entry.reasoningEffort) ? {
			provider: entry.provider,
			model: entry.model,
			reasoningEffort: entry.reasoningEffort
		} : {
			provider: entry.provider,
			model: entry.model
		});
	}
	return chain;
}
/**
* The settings patch that writes one distillation chain.
*
* Only the `distillChain` key is produced: prime-memory's `live` section carries
* unrelated switches (capture, trace, embedding, memory mutation), and a patch
* naming them would rewrite the user's choices.
* @param chain - the chain to write.
* @returns The `live` patch to pass to `ctx.settings.update`.
*/
function distillChainPatch(chain) {
	return { live: { distillChain: chain } };
}
/** A non-blank string. */
function nonBlank(value) {
	return typeof value === "string" && value.trim() !== "";
}
/**
* The deployment default provider, canonicalized for group keying.
*
* The `agent-default-model` row names the provider new sessions start on; a
* deployment whose default is a dsh-vision-router twin (`${provider}-vision`)
* keys its deployment-wide groups under the base provider, so the twin suffix
* is stripped here.
* @param loader - the loader service, when present.
* @returns The base provider id, or undefined when the row or its provider is absent.
*/
function deploymentDefaultProviderOf(loader) {
	if (typeof loader?.entries !== "function") return void 0;
	for (const entry of loader.entries()) {
		if (entry?.options?.id !== "agent-default-model") continue;
		const config = entry.options.config;
		const provider = config !== null && typeof config === "object" && !Array.isArray(config) ? config.provider : void 0;
		if (nonBlank(provider)) return canonicalGroupProvider(provider);
	}
}
//#endregion
export { planDistillChain as i, distillChainPatch as n, isPrimeMemoryRow as r, deploymentDefaultProviderOf as t };
