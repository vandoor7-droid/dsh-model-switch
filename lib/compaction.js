import { i as sessionProviderOf, r as resolveCapabilityRoute } from "./session-route-BjNPlliu.js";
//#region lib/types/compaction.js
/** Official compaction row this module supersedes. */
const OFFICIAL_COMPACTION_ROW = "compaction-basic";
/** Official compaction package this module mounts in its place. */
const OFFICIAL_COMPACTION_PACKAGE = "@deepseek-ai/dsh-compaction-basic";
/** Cordis plugin identity; matches the cordis.patch.yml insert row id. */
const name = "model-switch-compaction";
/** The loader is awaited at row activation; settings and the official row are still read structurally so stock compaction survives a disabled Model Switch row. */
const inject = ["loader"];
/**
* Resolve the configurable summarization route from live settings.
* @param settings - Model Switch settings carrying the optional compaction pair.
* @returns Both identifiers trimmed and non-empty, or undefined (official default).
*/
function compactionRouteOf(settings) {
	const provider = settings?.compactProvider?.trim();
	const model = settings?.compactModel?.trim();
	if (provider === void 0 || provider === "" || model === void 0 || model === "") return void 0;
	return {
		provider,
		model
	};
}
/**
* Merge the resolved route over the official row's own config.
* @param forwarded - config the official compaction-basic row was configured with.
* @param route - resolved summarization route; undefined keeps official behavior.
* @returns A detached config safe to hand to a fresh engine construction.
*/
function composeCompactionConfig(forwarded, route) {
	if (!route) return { ...forwarded };
	return {
		...forwarded,
		summarizationProvider: route.provider,
		summarizationModel: route.model
	};
}
/**
* Locate the official compaction row in the loader tree.
* Disabled entries stay in the tree, so a name-matched disable still matches.
* @param loader - the host loader, when one is reachable.
* @returns The official entry, or undefined when this profile has no such row.
*/
function officialCompactionEntry(loader) {
	if (!loader) return void 0;
	for (const entry of loader.entries()) {
		if (entry.id === OFFICIAL_COMPACTION_ROW) return entry;
		if (entry.options?.name === OFFICIAL_COMPACTION_PACKAGE) return entry;
	}
}
/**
* Copy the official row's stored config, ignoring non-object payloads.
* @param entry - the official compaction entry.
* @returns A plain object spread; missing or invalid configs become `{}`.
*/
function forwardedConfig(entry) {
	const raw = entry.options?.config;
	if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
	return {};
}
/**
* Read the live summarization route from the Model Switch host.
*
* The host is read structurally instead of injected so this row keeps mounting
* the official engine (on official defaults) when the `model-switch` row is
* disabled.
* @param ctx - this row's context.
* @returns The configured route, or undefined when unset or host-unavailable.
*/
function currentCompactionRoute(ctx) {
	let settings;
	try {
		settings = ctx.get("modelSwitch", false)?.currentSettings();
	} catch {
		settings = void 0;
	}
	if (!settings) {
		ctx.logger.info("model-switch: host settings unavailable; compaction uses the official summarization default");
		return;
	}
	return compactionRouteOf(settings);
}
/**
* Resolve the compaction summarization route for one session id.
*
* Looks up the session from `ctx.sessions` when available, derives its current
* provider (`pending` selection preferred over `lastUsed`, then logged routes),
* and resolves the provider group's compaction pair before falling back to the
* deployment-wide compaction pair.
* @param ctx - this row's context.
* @param sessionId - the session id carried on `GenerateOptions.sessionId`.
* @returns The derived compaction route, or undefined for the engine's own route.
*/
function resolveSessionCompactionRoute(ctx, sessionId) {
	if (typeof sessionId !== "string" || sessionId.trim() === "") return void 0;
	let settings;
	try {
		settings = ctx.get("modelSwitch", false)?.currentSettings();
	} catch {
		settings = void 0;
	}
	if (!settings) return void 0;
	let session;
	try {
		session = ctx.get("sessions", false)?.get?.(sessionId);
	} catch {
		session = void 0;
	}
	const provider = sessionProviderOf(ctx, session);
	return resolveCapabilityRoute(settings, provider, "compaction");
}
/**
* Wrap the real llm service so `purpose === 'compaction'` calls resolve their
* summarization route per session while keeping `compaction/summary` truthful.
*
* `summarizeWithLlm` builds a mutable `options` literal with `purpose: 'compaction'`
* and `sessionId: agent.session.id`, calls `ctx.llm.stream(options)`, and then
* returns `{ provider: options.provider, model: options.model }` to `commitCompactionBody`.
* Mutating `options.provider` and `options.model` in place before delegating to
* `target.stream(options)` ensures the durable `compaction/summary` event
* records the exact provider/model that wrote the summary. All other members
* (such as `resolveModelInfo`) pass through bound to `real`.
* @param real - the host's `ctx.llm`.
* @param resolve - per-session route resolver; undefined keeps `options` untouched.
* @param onError - optional error sink when the resolver throws.
* @returns A transparent Proxy over `real`.
*/
function compactionLlm(real, resolve, onError) {
	return new Proxy(real, { get(target, property, _receiver) {
		if (property === "stream") return (options) => {
			if (options.purpose === "compaction" && typeof options.sessionId === "string" && options.sessionId.trim() !== "") {
				let route;
				try {
					route = resolve(options.sessionId);
				} catch (cause) {
					onError?.(cause);
					route = void 0;
				}
				if (route !== void 0) {
					if (Object.isFrozen(options)) return target.stream({
						...options,
						provider: route.provider,
						model: route.model
					});
					options.provider = route.provider;
					options.model = route.model;
				}
			}
			return target.stream(options);
		};
		const value = Reflect.get(target, property, target);
		return typeof value === "function" ? value.bind(target) : value;
	} });
}
/**
* Build the child context the compaction engine mounts under.
*
* When `ctx.llm` is present, shadows it with {@link compactionLlm} on an
* extended context so the child engine fiber resolves the per-session wrapper
* while registering `ctx.compaction` on the shared context tree.
* @param ctx - this row's context.
* @returns A context shadowing `llm` when available, else `ctx`.
*/
function compactionScope(ctx) {
	let real;
	try {
		real = ctx.get("llm", false);
	} catch {
		real = void 0;
	}
	if (real === void 0) return ctx;
	return ctx.extend({ llm: compactionLlm(real, (sessionId) => resolveSessionCompactionRoute(ctx, sessionId), (cause) => {
		ctx.logger.error("model-switch: failed to resolve per-session compaction route; keeping the engine route");
		ctx.logger.error(cause);
	}) });
}
/**
* Whether the compaction capability is actually served from this context.
*
* Awaiting a plugin fiber settles even when the plugin's injections were never
* satisfied, so the mount is confirmed through the public service instead of by
* the absence of an error: an unactivated engine must never be recorded as the
* live engine, or the row would stop retrying while `/compact` had no service.
* @param ctx - this row's context.
* @returns true when `ctx.compaction` exposes the engine's public entry points.
*/
function engineActive(ctx) {
	try {
		const service = ctx.get("compaction", false);
		return service !== void 0 && typeof service.compactIfNeeded === "function";
	} catch {
		return false;
	}
}
/**
* Load and mount the official basic compaction engine under `config`.
* @param ctx - this row's context; the engine mounts unisolated so `/compact` sees it.
* @param config - composed engine config.
* @param label - which config attempt failed, for the error message.
* @returns The mounted fiber, or undefined with an explicit error log.
*/
async function mountEngine(ctx, config, label) {
	let loaded;
	try {
		loaded = await import("@deepseek-ai/dsh-compaction-basic");
	} catch (cause) {
		ctx.logger.error("model-switch: failed to load the official compaction engine package");
		ctx.logger.error(cause);
		return;
	}
	let fiber;
	try {
		fiber = compactionScope(ctx).plugin(loaded.default, config);
		await fiber;
	} catch (cause) {
		if (fiber) try {
			await fiber.dispose();
		} catch {}
		ctx.logger.error(`model-switch: failed to mount the compaction engine with ${label}`);
		ctx.logger.error(cause);
		return;
	}
	if (engineActive(ctx)) return fiber;
	ctx.logger.error(`model-switch: the compaction engine mounted with ${label} but never activated; unloading it so the next settings change retries`);
	try {
		await fiber.dispose();
	} catch (cause) {
		ctx.logger.error("model-switch: failed to unload the unactivated compaction engine");
		ctx.logger.error(cause);
	}
}
/**
* Dispose the live engine, keeping the ledger clean for the next mount.
* @param ctx - this row's context.
* @param state - the row's reconcile ledger.
*/
async function disposeEngine(ctx, state) {
	const previous = state.engine;
	state.engine = void 0;
	if (!previous) return;
	try {
		await previous.dispose();
	} catch (cause) {
		ctx.logger.error("model-switch: failed to dispose the previous compaction engine");
		ctx.logger.error(cause);
	}
}
/**
* Reconcile one compaction mount: remount only when the composed config changed.
*
* A settings change that leaves the composed config identical — every session
* naming, subagent, or provider-group save — returns after the signature check,
* so the engine is never unloaded for settings it does not read. A mount that
* fails to activate stays unmounted with an explicit error and the next settings
* change retries with a fresh read.
* @param ctx - this row's context.
* @param state - the row's reconcile ledger.
*/
async function runReconcile(ctx, state) {
	const entry = officialCompactionEntry(ctx.get("loader", false));
	if (!entry) {
		if (!state.missingRow) {
			state.missingRow = true;
			ctx.logger.info("model-switch: no official compaction-basic row in this profile; the compaction engine stays unmounted");
		}
		return;
	}
	state.missingRow = false;
	const config = composeCompactionConfig(forwardedConfig(entry), currentCompactionRoute(ctx));
	const signature = JSON.stringify(config);
	if (state.signature === signature && state.engine) return;
	await disposeEngine(ctx, state);
	state.signature = signature;
	const fiber = await mountEngine(ctx, config, "the configured summarization route");
	if (fiber) {
		state.engine = fiber;
		return;
	}
	ctx.logger.error("model-switch: compaction engine is unmounted; /compact and automatic compaction are unavailable until settings change");
}
/**
* Queue one reconcile behind the row's serialized chain, absorbing failures.
* @param ctx - this row's context.
* @param state - the row's reconcile ledger.
* @param coalesce - collapse a burst of triggers into the single pass that reads the settled settings.
* @returns The chain tail; never rejects.
*/
function scheduleReconcile(ctx, state, coalesce) {
	if (coalesce) {
		if (state.queued) return state.chain;
		state.queued = true;
	}
	state.chain = state.chain.then(async () => {
		state.queued = false;
		await runReconcile(ctx, state);
	}).catch((cause) => {
		state.queued = false;
		ctx.logger.error("model-switch: compaction engine reconcile failed");
		ctx.logger.error(cause);
	});
	return state.chain;
}
/**
* Mount the Model Switch compaction engine for this profile.
*
* Installs a sibling row that replaces the official compaction-basic engine
* with the same package under the configurable summarization route. Host
* settings and the loader are read structurally so a disabled `model-switch`
* row leaves official compaction untouched. Reconciles run on
* `model-switch/settings-update` (emitted by the host at construction, on
* volatile commits, and on ordinary saves) and read the settled settings, so one
* save costs at most one remount; the listener is global so instances of this
* row inside agent-preset realms still hear the host row's emission. The initial
* reconcile is awaited so `/compact` resolves the service as soon as this row
* completes.
* @param ctx - this row's context.
*/
async function apply(ctx) {
	const state = {
		chain: Promise.resolve(),
		queued: false,
		signature: null,
		engine: void 0,
		missingRow: false
	};
	ctx.on("model-switch/settings-update", () => {
		scheduleReconcile(ctx, state, true);
	}, { global: true });
	await scheduleReconcile(ctx, state, false);
}
//#endregion
export { apply, compactionLlm, compactionRouteOf, compactionScope, composeCompactionConfig, engineActive, forwardedConfig, inject, name, officialCompactionEntry, resolveSessionCompactionRoute };
