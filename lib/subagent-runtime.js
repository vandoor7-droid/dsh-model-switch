import { o as sessionSubagentRouteOf } from "./session-route-D8izd8Zd.js";
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
		return Reflect.apply(publicMethod("startActivation"), this, [{
			...spec,
			request: this.routed(spec.provider, spec.request)
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
				if (typeof spec.provider !== "string" || !isRequest(spec.request)) return Reflect.apply(original, this, args);
				const request = routeFor(current, spec.provider, spec.request);
				return Reflect.apply(original, this, [request === spec.request ? spec : {
					...spec,
					request
				}, ...args.slice(1)]);
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
}
//#endregion
export { ModelSwitchSubagentRuntime, StartupIncompatibilityError, profileSubagentRuntime as default, profileSubagentRuntime, installSubagentRouteWrappers, mountWithStartupFallback, routeSubagentRequest, routedRuntimeUnavailableNotice, routedSubagentRequest, subagentRuntimeInject, subagentSurfaceOf };
