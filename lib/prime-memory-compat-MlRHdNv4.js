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
//#endregion
//#region lib/types/prime-memory-compat.js
/**
* Adapt `dsh-prime-memory`'s distillation route to this plugin's route.
*
* The memory plugin resolves its distillation route from its own runtime
* settings section (`live.distillChain`, legacy `live.distillProvider/Model`,
* else the deployment default model), and it WRITES that section through the
* host's settings-forms service:
*
*   await forms.update('dsh-memory', { live: next })
*
* Its row config is read once at plugin init, so patching
* `entry.options.config.llm.*` afterwards has no effect (verified on 0.2.1-rc.3:
* the model kept being the deployment default). This adapter therefore writes
* the same section the plugin itself writes, and only that key:
*
* - a chain that is already set and is not the one this adapter wrote counts as
*   user intent and is left alone (`user-set`);
* - an empty Model Switch route means "leave it alone" (`no-route`);
* - nothing is persisted by us beyond that section, and no other `live` key
*   (capture, trace, embedding, memory mutation) is touched.
*
* The route itself is provider-group based: the group of the deployment default
* provider (read from the `agent-default-model` row), falling back to the flat
* memory pair.
*/
/** Row name and dependencies, mirroring the sibling adapter row. */
const name = "model-switch-prime-memory-compat";
const inject = ["loader", "settings"];
/** The loader row id prime-memory is composed under (fixed by its bundle patch). */
const MEMORY_ENTRY_ID = "dsh-memory";
/** The state the settings page reads. */
const primeMemoryCompatStatus = {
	installed: false,
	replays: 0
};
/**
* Write the memory row's static route into the profile patch itself.
*
* `settings.update` only accepts the entry's *live* schema fields, so the static
* `llm` pin never survives that call. The pin is what `resolveModelRoute` returns
* first, and it is the only key every distillation layer honours — so it has to be
* written where the next start reads it: the row config in the profile document.
* @param documentPath - the profile patch file.
* @param provider - route provider to pin.
* @param model - route model to pin.
* @returns whether the document changed.
*/
/**
* Remove this plugin's own static pin from the memory row.
*
* `effectiveCfg` (dsh-prime-memory `pipeline/runner.js`) treats a non-empty
* `cfg.llm.provider + cfg.llm.model` pair as "pinned" and then ignores *both* the runtime
* chain and the legacy `distillProvider`/`distillModel` pair. A pin written earlier — for a
* host whose live RPC was not ready yet — is therefore not harmless: it keeps winning over
* every later live push, which is exactly the "the card changed, the calls did not" report.
* Once a live push is confirmed, the pin has to go.
*
* @param documentPath - the profile patch document that holds the memory row.
* @returns what happened, so the caller can log it without guessing.
*/
async function clearStaticPin(documentPath) {
	const { readFile, writeFile } = await import("node:fs/promises");
	let text;
	try {
		text = await readFile(documentPath, "utf8");
	} catch {
		return "missing";
	}
	const rows = text.split(/(?=^- id: )/m);
	const index = rows.findIndex((row) => /^- id: dsh-memory\r?\n/.test(row));
	if (index < 0) return "missing";
	const row = rows[index];
	const trimmed = row.replace(/^ {4}llm:\r?\n(?: {6}.*\r?\n)*/m, "");
	if (trimmed === row) return "absent";
	rows[index] = trimmed;
	try {
		await writeFile(documentPath, rows.join(""), "utf8");
	} catch {
		return "missing";
	}
	return "cleared";
}
async function writeStaticPin(documentPath, provider, model) {
	const { readFile, writeFile } = await import("node:fs/promises");
	let text;
	try {
		text = await readFile(documentPath, "utf8");
	} catch {
		return "missing";
	}
	const rows = text.split(/(?=^- id: )/m);
	const index = rows.findIndex((row) => /^- id: dsh-memory\r?\n/.test(row));
	if (index < 0) return "missing";
	const row = rows[index];
	const desired = `    llm:\n      provider: ${provider}\n      model: ${model}\n`;
	let next;
	if (/^ {4}llm:\r?\n(?: {6}.*\r?\n)*/m.test(row)) next = row.replace(/^ {4}llm:\r?\n(?: {6}.*\r?\n)*/m, desired);
	else if (/^ {2}config:\r?\n/m.test(row)) next = row.replace(/^ {2}config:\r?\n/m, `  config:\n${desired}`);
	else next = row.replace(/^- id: dsh-memory\r?\n/m, `- id: dsh-memory\n  config:\n${desired}`);
	if (next === row) return "unchanged";
	rows[index] = next;
	try {
		await writeFile(documentPath, rows.join(""), "utf8");
	} catch {
		return "missing";
	}
	return "written";
}
/** A non-blank string. */
function text(value) {
	return typeof value === "string" ? value.trim() : "";
}
/** Read a value as a plain record. */
function asRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
/**
* The distillation chain a settings section currently carries.
*
* Accepts the chain form and the legacy provider/model pair, so a user who set
* the old two fields is still recognised as user intent.
* @param section - the `live` section (or a whole settings view) to read.
* @returns The chain entries; empty when nothing is set.
*/
function chainOf(section) {
	const live = asRecord(section);
	if (live === void 0) return [];
	const chain = live.distillChain;
	if (Array.isArray(chain)) {
		const entries = [];
		for (const item of chain) {
			const entry = asRecord(item);
			const provider = text(entry?.provider);
			const model = text(entry?.model);
			if (provider === "" || model === "") continue;
			const effort = text(entry?.reasoningEffort);
			entries.push(effort === "" ? {
				provider,
				model
			} : {
				provider,
				model,
				reasoningEffort: effort
			});
		}
		return entries;
	}
	const provider = text(live.distillProvider);
	const model = text(live.distillModel);
	return provider === "" || model === "" ? [] : [{
		provider,
		model
	}];
}
/**
* Decide the route config one memory row would run with from its config alone.
*
* Kept for the settings-free path (a profile that pins `config.llm.*`): the
* runtime path writes the settings section instead, because the plugin reads its
* config only at init.
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
/** The endpoint the memory plugin registers for its own runtime settings writes. */
const MEMORY_RPC_PATH = "/dsh-memory/rpc/settings-set";
/**
* Whether the memory row's live section already carries exactly our route.
*
* The RPC write path persists the live section to the profile document on every
* call, and a document change reloads the composition — so pushing an unchanged
* route re-triggers this adapter forever (a ~6 s recompose loop, observed with
* `dsh-prime-memory@0.26.10`). Comparing first is what makes the push idempotent
* across reloads.
*
* @param value - the memory row's live settings object, as the forms describe it.
* @param provider - route provider to compare against.
* @param model - route model to compare against.
* @returns true when a push would change nothing.
*/
function memoryLiveMatchesRoute(value, provider, model) {
	const outer = value === null || typeof value !== "object" ? void 0 : value;
	if (outer === void 0) return false;
	const inner = outer.live;
	const live = inner !== null && typeof inner === "object" ? inner : outer;
	if (live.distillProvider !== provider || live.distillModel !== model) return false;
	const chain = live.distillChain;
	if (Array.isArray(chain) && chain.length !== 0) return false;
	const layers = live.distillLayerChains;
	if (layers === null || typeof layers !== "object") return false;
	for (const key of [
		"l1",
		"l2",
		"l3"
	]) {
		const layer = layers[key];
		if (!Array.isArray(layer) || layer.length !== 1) return false;
		const first = layer[0];
		if (first === void 0 || first.provider !== provider || first.model !== model) return false;
	}
	return true;
}
/**
* Hand the route to the memory plugin through the RPC it registers for its own
* settings page.
*
* Writing the config document (what `settings.update` does) only changes what the
* next start reads; the plugin resolves its route from the runtime settings object
* it built at `apply`. This endpoint is the documented runtime write path — the
* same one its own "distillation parameters" panel posts to — so it takes effect
* without a restart, which is exactly what a provider switch needs.
*/
async function pushMemoryRoute(ctx, route) {
	const server = ctx.get("webServer", false);
	const port = server?.port ?? server?.address?.port;
	if (typeof port !== "number" || port <= 0) return "absent";
	try {
		const response = await fetch(`http://127.0.0.1:${port}${MEMORY_RPC_PATH}`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				distillChain: [],
				distillLayerChains: {
					l1: [{
						provider: route.provider,
						model: route.model
					}],
					l2: [{
						provider: route.provider,
						model: route.model
					}],
					l3: [{
						provider: route.provider,
						model: route.model
					}]
				},
				distillProvider: route.provider,
				distillModel: route.model,
				reasoningEffort: ""
			})
		});
		if (response.status === 404 || response.status === 405 || response.status === 403) return "absent";
		return response.ok ? "pushed" : "rejected";
	} catch {
		return "absent";
	}
}
/** The endpoint the memory plugin registers for its own runtime settings reads. */
const MEMORY_RPC_GET_PATH = "/dsh-memory/rpc/settings-get";
/**
* Read the memory plugin's live settings through the RPC its panel posts to.
*
* The `settings` forms descriptors are an internal detail of the plugin: on
* `dsh-prime-memory@0.26.16` this row could not observe them, which skipped every
* push and left the plugin on its own deployment default. Its RPC is the surface
* its own panel uses, so reading there keeps the adapter working across plugin
* releases — and it is what makes the push idempotent across document reloads.
* @param ctx - this row's context; the host web server supplies the port.
* @returns The live settings object, or undefined when the seam is unreachable.
*/
async function readMemoryLive(ctx) {
	const server = ctx.get("webServer", false);
	const port = server?.port ?? server?.address?.port;
	if (typeof port !== "number" || port <= 0) return void 0;
	try {
		const response = await fetch(`http://127.0.0.1:${port}${MEMORY_RPC_GET_PATH}`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ method: "settings-get" })
		});
		if (!response.ok) return void 0;
		return (await response.json())?.value?.settings;
	} catch {
		return;
	}
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
/** The `settings` service the memory plugin itself writes through. */
function formsOf(ctx) {
	try {
		return ctx.get("settings", false);
	} catch {
		return;
	}
}
/** Live attempts to spend before falling back to the static pin. */
const PIN_AFTER_ATTEMPTS = 4;
/**
* Install the adapter for the whole profile.
*
* Writes the memory plugin's own `live` section on activation, on every
* `loader/patch-context`, on `loader/entry-init`, once more after a short delay
* (a bundle-inserted row is often composed after this one), and again whenever
* this plugin's settings change.
* @param ctx - this row's context.
* @param loader - the loader service, when present.
* @param routeOf - resolves this plugin's distillation route for one settings snapshot.
* @returns The disposer and a replay hook.
*/
function installPrimeMemoryCompat(ctx, loader, routeOf) {
	/** The route this adapter wrote last, so it may replace its own value only. */
	let adoptedRoute;
	let pending;
	let attempt = 0;
	const timers = [];
	const primeMemoryEntry = () => {
		for (const entry of loader?.entries?.() ?? []) if (isPrimeMemoryRow(entry)) return entry;
	};
	const memoryRowPresent = () => primeMemoryEntry() !== void 0;
	/** The live section the memory plugin registered, read back through the host. */
	const sectionOf = (forms) => {
		try {
			return (forms.describe?.({ redactSecrets: true }) ?? []).find((item) => item.ns === MEMORY_ENTRY_ID);
		} catch {
			return;
		}
	};
	const scheduleRetry = () => {
		if (attempt >= 8) return;
		const delay = Math.min(4e3, 200 * 2 ** attempt);
		attempt += 1;
		const timer = setTimeout(() => {
			run();
		}, delay);
		timer.unref?.();
		timers.push(timer);
	};
	/**
	* Last resort for a host whose live seams never accept the route.
	*
	* Writing the static pin disables every live form (`pinned` in `effectiveCfg`), so it must
	* not happen while the live attempts still have a chance: a pin written on a slow start is
	* what kept overriding later pushes. It therefore waits for the retry budget to run out.
	*
	* @param forms - the settings service describing the memory row.
	* @param provider - route provider to pin.
	* @param model - route model to pin.
	* @param wanted - `provider/model`, for the log line.
	*/
	const pinAsFallback = async (forms, provider, model, wanted) => {
		if (attempt < PIN_AFTER_ATTEMPTS) {
			scheduleRetry();
			return;
		}
		const documentPath = forms.documentPath;
		if (typeof documentPath !== "string" || documentPath === "") return;
		try {
			if (await writeStaticPin(documentPath, provider, model) === "written") ctx.logger.info(`model-switch: pinned the dsh-prime-memory distillation route to ${wanted} after ${attempt} live attempts (applies from the next start)`);
		} catch (cause) {
			ctx.logger.warn(`model-switch: could not pin the dsh-prime-memory route (${String(cause)})`);
		}
	};
	/**
	* Drop a pin left over from an earlier release.
	*
	* A static `llm.provider/model` pin sets `pinned`, which makes the plugin's
	* `effectiveCfg` ignore the chain *and* the live pair, so the live route decides
	* nothing on that host until the pin is gone.
	* @param forms - the settings seam, when this host exposes it.
	*/
	const clearStalePin = async (forms) => {
		const pinnedDocument = forms?.documentPath;
		if (typeof pinnedDocument !== "string" || pinnedDocument === "") return;
		try {
			if (await clearStaticPin(pinnedDocument) === "cleared") ctx.logger.info("model-switch: removed the stale dsh-prime-memory static pin; the live route decides now");
		} catch (cause) {
			ctx.logger.warn(`model-switch: could not clear the dsh-prime-memory static pin (${String(cause)})`);
		}
	};
	/**
	*
	* The plugin builds that section inside its own `apply` (`settings.register`), so
	* a write issued before that point lands in a section nobody reads — the reason
	* an unverified "write once at mount" pass left it on the deployment default.
	* Writing only once the section is visible, and verifying by reading the chain
	* back, is what makes this measurable instead of hopeful.
	*/
	const run = async () => {
		if (pending !== void 0) return pending;
		if (!memoryRowPresent()) {
			primeMemoryCompatStatus.routeSkipped = "no-row";
			return;
		}
		const route = routeOf();
		const provider = text(route?.provider);
		const model = text(route?.model);
		if (provider === "" || model === "") {
			primeMemoryCompatStatus.routeSkipped = "no-route";
			return;
		}
		const wanted = `${provider}/${model}`;
		const forms = formsOf(ctx);
		const live = await readMemoryLive(ctx);
		if (live === void 0) {
			primeMemoryCompatStatus.routeSkipped = "no-route";
			scheduleRetry();
			return;
		}
		if (memoryLiveMatchesRoute(live, provider, model)) {
			adoptedRoute = wanted;
			primeMemoryCompatStatus.installed = true;
			primeMemoryCompatStatus.route = wanted;
			delete primeMemoryCompatStatus.routeSkipped;
			await clearStalePin(forms);
			return;
		}
		const declared = chainOf(live);
		const declaredRoute = declared.length > 0 ? `${text(declared[0]?.provider)}/${text(declared[0]?.model)}` : "";
		if (declaredRoute !== "" && declaredRoute !== wanted && declaredRoute !== adoptedRoute) {
			primeMemoryCompatStatus.routeSkipped = "user-set";
			primeMemoryCompatStatus.route = void 0;
			return;
		}
		if (await pushMemoryRoute(ctx, {
			provider,
			model
		}) === "pushed") {
			const after = await readMemoryLive(ctx);
			if (after !== void 0 && memoryLiveMatchesRoute(after, provider, model)) {
				adoptedRoute = wanted;
				attempt = 0;
				primeMemoryCompatStatus.installed = true;
				primeMemoryCompatStatus.route = wanted;
				delete primeMemoryCompatStatus.routeSkipped;
				await clearStalePin(forms);
				return;
			}
			primeMemoryCompatStatus.routeSkipped = "live-rejected";
		}
		if (forms === void 0 || forms.update === void 0 || forms.describe === void 0) {
			primeMemoryCompatStatus.routeSkipped = "no-route";
			scheduleRetry();
			return;
		}
		const section = sectionOf(forms);
		if (section === void 0 || asRecord(section.value) === void 0) {
			await pinAsFallback(forms, provider, model, wanted);
			return;
		}
		const chain = planDistillChain({
			provider,
			model
		}, chainOf(section.value));
		pending = forms.update(MEMORY_ENTRY_ID, distillChainPatch(chain), section.revision).then(async () => {
			const applied = chainOf(sectionOf(forms)?.value);
			if ((applied.length > 0 ? `${text(applied[0]?.provider)}/${text(applied[0]?.model)}` : "") !== wanted) {
				await pinAsFallback(forms, provider, model, wanted);
				return;
			}
			adoptedRoute = wanted;
			attempt = 0;
			primeMemoryCompatStatus.installed = true;
			primeMemoryCompatStatus.route = wanted;
			delete primeMemoryCompatStatus.routeSkipped;
		}).catch(async (cause) => {
			primeMemoryCompatStatus.routeSkipped = "no-route";
			ctx.logger.warn(`model-switch: could not write the dsh-prime-memory distillation route (${String(cause)})`);
			await pinAsFallback(forms, provider, model, wanted);
		}).finally(() => {
			pending = void 0;
		});
		return pending;
	};
	const replay = () => {
		run();
		return true;
	};
	run();
	const offPatch = ctx.on("loader/patch-context", function(first, second) {
		const nextFn = typeof first === "function" ? first : second;
		if (isPrimeMemoryRow(typeof first === "function" ? this : first)) run();
		return nextFn === void 0 ? void 0 : nextFn();
	});
	const offInit = ctx.on("loader/entry-init", function(first) {
		const candidate = this ?? first;
		if (candidate !== void 0 && isPrimeMemoryRow(candidate)) run();
	});
	const offService = ctx.on("internal/service", (name) => {
		if (name === "settings") run();
	});
	const lateSweep = setTimeout(() => {
		run();
	}, 1500);
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
* Row entry point: adapt the memory plugin on activation and on remount.
* @param ctx - this row's context.
*/
function apply(ctx) {
	ctx.inject(["modelSwitch"], (withProvider) => {
		withProvider.inject(["webServer"], (scope) => scope.effect(() => {
			const runtime = scope.modelSwitch;
			const loader = scope.get("loader", false);
			const routeOf = () => memoryRouteOf(runtime.currentSettings(), defaultProviderOf(loader));
			const adapter = installPrimeMemoryCompat(scope, loader, routeOf);
			const off = scope.on("model-switch/settings-update", () => {
				if (adapter.replay()) scope.logger.info("model-switch: re-applied the dsh-prime-memory distillation route after a settings change");
			});
			return () => {
				off();
				adapter.dispose();
			};
		}, "model-switch: keep the dsh-prime-memory route aligned with the settings"));
	});
}
//#endregion
export { installPrimeMemoryCompat as a, planPrimeMemoryRoute as c, readMemoryLive as d, writeStaticPin as f, inject as i, primeMemoryCompatStatus as l, chainOf as n, memoryLiveMatchesRoute as o, clearStaticPin as r, name as s, apply as t, pushMemoryRoute as u };
