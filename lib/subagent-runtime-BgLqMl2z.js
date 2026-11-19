import { a as sessionProviderOf, n as groupRoute, o as sessionSubagentRouteOf } from "./session-route-D8izd8Zd.js";
import { symbols } from "@deepseek-ai/cordis";
import { ReasoningEffortId } from "@deepseek-ai/dsh-llm";
import OfficialSubagentRuntime from "@deepseek-ai/dsh-subagent";
//#region lib/types/subagent-runtime-legacy.js
/** Previously published startup error; retained for consumers of this module. */
var StartupIncompatibilityError = class extends Error {
	name = "StartupIncompatibilityError";
	surface;
	constructor(surfaceOrMessage, message) {
		super(message ?? surfaceOrMessage);
		this.surface = message === void 0 ? "startup" : surfaceOrMessage;
	}
};
/** Classify the two published start API generations without version guessing. */
function subagentSurfaceOf(value) {
	if (value === null || typeof value !== "object" && typeof value !== "function") return void 0;
	if (typeof Reflect.get(value, "startActivation") === "function") return "activation";
	return typeof Reflect.get(value, "start") === "function" && typeof Reflect.get(value, "startContinuable") === "function" ? "start" : void 0;
}
function once(dispose) {
	let pending;
	return () => {
		pending ??= Promise.resolve().then(() => dispose()).then(() => void 0);
		return pending;
	};
}
var CleanupLedger = class {
	attempts = [];
	add(dispose) {
		this.attempts.push(once(dispose));
	}
	async disposeAll() {
		const failures = [];
		for (const dispose of [...this.attempts].reverse()) try {
			await dispose();
		} catch (error) {
			failures.push(error);
		}
		return failures;
	}
};
function startupFailure(error, failures) {
	if (failures.length === 0) throw error;
	throw new AggregateError([error, ...failures], "Subagent runtime startup and cleanup failed", { cause: error });
}
function cleanupDisposer(ledger) {
	return async () => {
		const failures = await ledger.disposeAll();
		if (failures.length > 0) throw new AggregateError(failures, "Subagent runtime cleanup failed");
	};
}
/** Retain the typed-only startup fallback and reverse, idempotent cleanup contract. */
async function mountWithStartupFallback(candidate, fallback) {
	const ledger = new CleanupLedger();
	try {
		return {
			value: await candidate((dispose) => ledger.add(dispose)),
			dispose: cleanupDisposer(ledger)
		};
	} catch (error) {
		const failures = await ledger.disposeAll();
		if (!(error instanceof StartupIncompatibilityError) || failures.length > 0) startupFailure(error, failures);
	}
	try {
		return {
			value: await fallback((dispose) => ledger.add(dispose)),
			dispose: cleanupDisposer(ledger)
		};
	} catch (error) {
		startupFailure(error, await ledger.disposeAll());
	}
}
function routedRuntimeUnavailableNotice(error) {
	return `model-switch: the routed Subagent runtime is unavailable on this DSH Host (${error.message}); delegation follows the official route instead`;
}
/** @deprecated Only the legacy subclass needs a mirrored dependency list. */
function subagentRuntimeInject(officialInject) {
	return [.../* @__PURE__ */ new Set([...officialInject ?? [], "modelSwitch"])];
}
function publicMethod(method) {
	const value = Reflect.get(OfficialSubagentRuntime.prototype, method);
	if (typeof value !== "function") throw new StartupIncompatibilityError("OfficialSubagentRuntime", `OfficialSubagentRuntime must expose public ${method}()`);
	return value;
}
/**
* @deprecated Kept importable for existing consumers, not mounted by the bundle.
* Install profileSubagentRuntime around the official service instead: the
* official Loader row must remain enabled to own its strict Typert definitions.
*/
var ModelSwitchSubagentRuntime = class extends OfficialSubagentRuntime {
	static inject = subagentRuntimeInject(OfficialSubagentRuntime.inject);
	routed(name, request) {
		const provider = this.ctx.subagents.getProvider(name);
		if (provider !== void 0 && provider.capabilities.agentOptions !== true) return request;
		return routeSubagentRequest(request, sessionSubagentRouteOf(this.ctx, request.parent.session, this.ctx.modelSwitch.currentSettings()));
	}
	start(name, request) {
		return Reflect.apply(publicMethod("start"), this, [name, this.routed(name, request)]);
	}
	startContinuable(spec) {
		return Reflect.apply(publicMethod("startContinuable"), this, [{
			...spec,
			request: this.routed(spec.provider, spec.request)
		}]);
	}
	startActivation(spec) {
		const request = spec.request ?? spec;
		return Reflect.apply(publicMethod("startActivation"), this, [{
			...spec,
			request: this.routed(spec.provider, request)
		}]);
	}
};
//#endregion
//#region lib/types/subagent-runtime.js
function present(value) {
	return typeof value === "string" && value.trim() !== "";
}
function spawnHasAnyRouteField(options) {
	return present(options?.provider) || present(options?.model) || options?.reasoningEffort !== void 0;
}
/**
* Inject a parent-session route only when the caller named no provider, model,
* or reasoning effort. All other request and Agent options pass through.
*/
function routeSubagentRequest(request, route) {
	if (spawnHasAnyRouteField(request.agentOptions) || route === void 0) return request;
	return {
		...request,
		agentOptions: {
			...request.agentOptions,
			provider: route.provider,
			model: route.model,
			...route.reasoningEffort === void 0 ? {} : { reasoningEffort: ReasoningEffortId(route.reasoningEffort) }
		}
	};
}
/** Resolve the current public route surface, never retaining a disposed service. */
function routedSubagentRequest(ctx, runtime, providerName, request) {
	if (spawnHasAnyRouteField(request.agentOptions)) return request;
	const provider = runtime.getProvider?.(providerName);
	if (provider !== void 0 && provider.capabilities?.agentOptions !== true) return request;
	let modelSwitch;
	try {
		modelSwitch = ctx.get("modelSwitch");
	} catch {
		return request;
	}
	if (typeof modelSwitch?.currentSettings !== "function") return request;
	return routeSubagentRequest(request, sessionSubagentRouteOf(ctx, request.parent.session, modelSwitch.currentSettings()));
}
/** A tracing proxy is for calls, not method ownership or descriptor restoration. */
function originalService(value) {
	const original = Reflect.get(value, symbols.original);
	return original !== null && (typeof original === "object" || typeof original === "function") ? original : value;
}
function isRequest(value) {
	if (typeof value !== "object" || value === null) return false;
	const parent = Reflect.get(value, "parent");
	return typeof parent === "object" && parent !== null && Reflect.get(parent, "session") !== void 0;
}
/**
* Route one activation spec under either released shape. 0.2.1 through
* 0.2.2-rc.1 nest the SubagentStartRequest under spec.request; 0.2.2-rc.2
* flattens those fields onto the spec itself. Unknown shapes pass through
* untouched, so an unanticipated future shape keeps the official route.
*/
function routedSpecOf(spec, provider, state) {
	const nested = Reflect.get(spec, "request");
	if (typeof nested === "object" && nested !== null && isRequest(nested)) {
		const request = routeFor(state, provider, nested);
		return request === nested ? spec : {
			...spec,
			request
		};
	}
	if (isRequest(spec)) {
		const request = routeFor(state, provider, spec);
		if (request === spec) return spec;
		return {
			...spec,
			agentOptions: request.agentOptions
		};
	}
	return spec;
}
function warn(ctx, message) {
	try {
		ctx.logger.warn(message);
	} catch {}
}
const wrappers = /* @__PURE__ */ new WeakMap();
function routeFor(state, provider, request) {
	const ctx = [...state.leases].at(-1)?.ctx;
	return ctx === void 0 ? request : routedSubagentRequest(ctx, state.runtime, provider, request);
}
function wrapMethod(target, key, factory) {
	const original = Reflect.get(target, key);
	if (typeof original !== "function") return void 0;
	const previous = Object.getOwnPropertyDescriptor(target, key);
	const wrapped = factory(original);
	Object.defineProperty(target, key, {
		configurable: true,
		enumerable: previous?.enumerable ?? false,
		writable: true,
		value: wrapped
	});
	return () => {
		if (Object.getOwnPropertyDescriptor(target, key)?.value !== wrapped) return;
		if (previous === void 0) Reflect.deleteProperty(target, key);
		else Object.defineProperty(target, key, previous);
	};
}
/**
* Wrap the official service's start entries only. Its identity, prototype,
* registry, manager, Typert binding and prompt/interrupt methods are untouched.
* Disposers are idempotent and safe when overlapping adapter fibers unload in
* either order. Unsupported or sealed surfaces leave the official route usable.
*/
function installSubagentRouteWrappers(ctx) {
	const service = ctx.get("subagents");
	if (service === void 0) {
		warn(ctx, "model-switch: subagents service is unavailable; delegation keeps the official route");
		return () => {};
	}
	const runtime = originalService(service);
	let state = wrappers.get(runtime);
	if (state === void 0) {
		state = {
			runtime,
			leases: /* @__PURE__ */ new Set(),
			restores: []
		};
		const current = state;
		const wrap = (key, factory) => {
			const restore = wrapMethod(runtime, key, factory);
			if (restore !== void 0) current.restores.push(restore);
		};
		try {
			for (const key of ["startActivation", "startContinuable"]) wrap(key, (original) => function(...args) {
				const rawSpec = args[0];
				if (typeof rawSpec !== "object" || rawSpec === null) return Reflect.apply(original, this, args);
				const spec = rawSpec;
				if (typeof spec.provider !== "string") return Reflect.apply(original, this, args);
				return Reflect.apply(original, this, [routedSpecOf(spec, spec.provider, current), ...args.slice(1)]);
			});
			wrap("start", (original) => function(...args) {
				const [provider, request] = args;
				if (typeof provider !== "string" || !isRequest(request)) return Reflect.apply(original, this, args);
				return Reflect.apply(original, this, [
					provider,
					routeFor(current, provider, request),
					...args.slice(2)
				]);
			});
		} catch (error) {
			for (const restore of current.restores.reverse()) restore();
			warn(ctx, `model-switch: Subagent starts cannot be wrapped (${String(error)}); delegation keeps the official route`);
			return () => {};
		}
		if (current.restores.length === 0) {
			warn(ctx, "model-switch: no supported public Subagent start entry; delegation keeps the official route");
			return () => {};
		}
		wrappers.set(runtime, state);
	}
	const lease = { ctx };
	state.leases.add(lease);
	const owned = state;
	return () => {
		if (!owned.leases.delete(lease) || owned.leases.size > 0) return;
		for (const restore of [...owned.restores].reverse()) restore();
		wrappers.delete(runtime);
	};
}
/** The official tool that lists routes available for explicit child selection. */
const SUBAGENT_MODEL_DISCOVERY_TOOL = "list_subagent_models";
/**
* Live state of the discovery-hint adapter, surfaced through the capabilities
* RPC next to the other adapter states.
*/
const subagentDiscoveryHintStatus = {
	/** The tools registry was reachable and the adapter installed. */
	installed: false,
	/** The discovery tool was found and its execute wrapped. */
	toolWrapped: false
};
/** Marker so a re-sweep never wraps a wrapper. */
const discoveryHintMarker = Symbol("modelSwitchSubagentDiscoveryHint");
/** The calling agent's session handle, as discovery executions carry it. */
function sessionOfExec(exec) {
	const agent = exec?.agent;
	const session = agent === null || typeof agent !== "object" ? void 0 : agent.session;
	return session === null || typeof session !== "object" ? void 0 : session;
}
/**
* Compose the route footer appended to the discovery tool's text output.
*
* Pure so the copy and the source attribution stay unit-testable.
*
* @param route - the route an unnamed spawn from this session would use.
* @param pinnedByGroup - whether a provider group (not the flat card) pinned it.
* @returns the footer line; undefined routes are stated as official inherit.
*/
function subagentDiscoveryFooter(route, pinnedByGroup) {
	if (route === void 0) return "Default route for spawns that name no provider/model (Model Switch): official inherit (nothing pinned).";
	const source = pinnedByGroup ? "provider group pin" : "fixed card";
	const effort = route.reasoningEffort === void 0 ? "" : `, effort ${route.reasoningEffort}`;
	return `Default route for spawns that name no provider/model (Model Switch, ${source}): ${route.provider}/${route.model}${effort}`;
}
/** Read the effective route and its source for one discovery execution. */
function discoveryRouteOf(ctx, exec) {
	const session = sessionOfExec(exec);
	let settings;
	try {
		const modelSwitch = ctx.get("modelSwitch");
		settings = typeof modelSwitch?.currentSettings === "function" ? modelSwitch.currentSettings() : void 0;
	} catch {
		settings = void 0;
	}
	const route = sessionSubagentRouteOf(ctx, session, settings);
	return {
		route,
		pinnedByGroup: route !== void 0 && groupRoute(settings, sessionProviderOf(ctx, session), "subagent") !== void 0
	};
}
/**
* Wrap the official discovery tool's execute so its text output also states the
* route an unnamed spawn would actually take — the one piece the
* authorized-route listing cannot know.
*
* The wrap is in place on the registered definition (the registry resolves
* tools per call), idempotent across re-sweeps, and re-applied when the
* registry changes so a re-registered tool is covered too. Unknown result
* shapes pass through untouched; unload restores the official execute.
*
* @param ctx - this row's context.
* @returns a disposer that detaches the listener and restores the execute.
*/
function installSubagentDiscoveryHint(ctx) {
	const tools = ctx.get("tools", false);
	if (tools === void 0 || typeof tools.get !== "function") {
		warn(ctx, "model-switch: the tools registry is unavailable; list_subagent_models keeps its official output");
		return () => {};
	}
	subagentDiscoveryHintStatus.installed = true;
	const restores = [];
	let announced = false;
	const wrapExecute = (definition) => {
		const current = definition.execute;
		if (typeof current !== "function" || Reflect.get(current, discoveryHintMarker) === true) return false;
		const restore = wrapMethod(definition, "execute", (original) => {
			const wrapped = function(...args) {
				const returned = Reflect.apply(original, this, args);
				const append = (value) => {
					if (typeof value !== "string") return value;
					const { route, pinnedByGroup } = discoveryRouteOf(ctx, args[1]);
					return `${value}\n${subagentDiscoveryFooter(route, pinnedByGroup)}`;
				};
				if (returned !== null && (typeof returned === "object" || typeof returned === "function") && typeof returned.then === "function") return returned.then(append);
				return append(returned);
			};
			Object.defineProperty(wrapped, discoveryHintMarker, { value: true });
			return wrapped;
		});
		if (restore === void 0) return false;
		restores.push(restore);
		return true;
	};
	const announce = () => {
		if (announced) return;
		announced = true;
		subagentDiscoveryHintStatus.toolWrapped = true;
		try {
			ctx.logger.info("model-switch: list_subagent_models now states the effective default route for unnamed spawns");
		} catch {}
	};
	const registerRestore = wrapMethod(tools, "register", (original) => {
		const wrapped = function(...args) {
			const definition = args[0];
			if (definition !== null && typeof definition === "object" && definition.name === SUBAGENT_MODEL_DISCOVERY_TOOL && wrapExecute(definition)) announce();
			return Reflect.apply(original, this, args);
		};
		return wrapped;
	});
	if (registerRestore !== void 0) restores.push(registerRestore);
	const sweep = () => {
		const definition = tools.get(SUBAGENT_MODEL_DISCOVERY_TOOL);
		if (definition !== void 0 && wrapExecute(definition)) announce();
	};
	sweep();
	let attempts = 0;
	const retry = setInterval(() => {
		attempts += 1;
		sweep();
		if (announced || attempts >= 15) clearInterval(retry);
	}, 1e3);
	const off = ctx.on("tools/change", sweep);
	return () => {
		off();
		clearInterval(retry);
		for (const restore of restores.reverse()) restore();
		restores.length = 0;
		subagentDiscoveryHintStatus.installed = false;
		subagentDiscoveryHintStatus.toolWrapped = false;
	};
}
/**
* Wait for the official service without replacing it or copying its dependency
* list. Model Switch is read optionally per call, so its absence cannot hold a
* startup fiber or retain a stale settings service. Cordis rebinds this effect
* when the official service is recreated.
*/
function profileSubagentRuntime(ctx) {
	ctx.inject(["subagents"], (scope) => {
		scope.effect(() => installSubagentRouteWrappers(scope), "Model Switch: route official Subagent starts");
	});
	ctx.inject(["tools"], (scope) => {
		scope.effect(() => installSubagentDiscoveryHint(scope), "Model Switch: annotate the subagent model discovery tool");
	});
}
//#endregion
export { routedSubagentRequest as a, ModelSwitchSubagentRuntime as c, routedRuntimeUnavailableNotice as d, subagentRuntimeInject as f, routeSubagentRequest as i, StartupIncompatibilityError as l, installSubagentRouteWrappers as n, subagentDiscoveryFooter as o, subagentSurfaceOf as p, profileSubagentRuntime as r, subagentDiscoveryHintStatus as s, installSubagentDiscoveryHint as t, mountWithStartupFallback as u };
