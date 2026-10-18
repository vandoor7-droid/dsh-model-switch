import { a as sessionSubagentRouteOf } from "./session-route-BjNPlliu.js";
import { ReasoningEffortId } from "@deepseek-ai/dsh-llm";
import OfficialSubagentRuntime from "@deepseek-ai/dsh-subagent";
//#region lib/types/subagent-runtime.js
/** Raised only when an explicit startup check finds an unsupported public surface. */
var StartupIncompatibilityError = class extends Error {
	name = "StartupIncompatibilityError";
	surface;
	/**
	* @param surfaceOrMessage - the incompatible public surface, or the error message.
	* @param message - the missing or incompatible requirement.
	*/
	constructor(surfaceOrMessage, message) {
		super(message ?? surfaceOrMessage);
		this.surface = message === void 0 ? "startup" : surfaceOrMessage;
	}
};
function present(value) {
	return typeof value === "string" && value.trim() !== "";
}
function spawnHasAnyRouteField(options) {
	return present(options?.provider) || present(options?.model) || options?.reasoningEffort !== void 0;
}
/**
* Inject one resolved route into a spawn that names none.
*
* A spawn that already names a provider, model, or effort keeps it: the caller's
* explicit selection outranks any profile policy. The route itself is derived
* from the DELEGATING session (its provider selects a saved group, else the flat
* Subagent card in `fixed` mode), so two sessions on different providers route
* their own spawns and neither can rewrite the other's policy.
* @param request - the caller's spawn request.
* @param route - the delegating session's resolved route, or undefined for official inherit.
* @returns The request to hand the official runtime.
*/
function routeSubagentRequest(request, route) {
	if (spawnHasAnyRouteField(request.agentOptions)) return request;
	if (route === void 0) return request;
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
function assertPublicMethod(value, surface, method) {
	if (value === null || typeof value !== "object" && typeof value !== "function" || typeof Reflect.get(value, method) !== "function") throw new StartupIncompatibilityError(surface, surface + " must expose public " + method + "()");
}
/**
* Classify the runtime surface this Host publishes.
*
* DSH 0.2.1 replaced `start()` / `startContinuable()` with the activation API
* (`startActivation`), so a version-agnostic adapter has to recognize both
* lines instead of hard-coding one.
*
* @param value - a runtime class's prototype or a mounted runtime instance.
* @returns `activation` (0.2.1+), `start` (0.1.7/0.2.0), or undefined when neither is published.
*/
function subagentSurfaceOf(value) {
	if (value === null || typeof value !== "object" && typeof value !== "function") return void 0;
	if (typeof Reflect.get(value, "startActivation") === "function") return "activation";
	const hasStart = typeof Reflect.get(value, "start") === "function";
	const hasContinuable = typeof Reflect.get(value, "startContinuable") === "function";
	return hasStart && hasContinuable ? "start" : void 0;
}
/** Read one public method, failing with the typed startup error when it is absent. */
function publicMethod(prototype, surface, method) {
	if (prototype === null || typeof prototype !== "object" && typeof prototype !== "function") throw new StartupIncompatibilityError(surface, surface + " must expose public " + method + "()");
	const value = Reflect.get(prototype, method);
	if (typeof value !== "function") throw new StartupIncompatibilityError(surface, surface + " must expose public " + method + "()");
	return value;
}
function constructible(value) {
	if (typeof value !== "function") return false;
	try {
		Reflect.construct(Object, [], value);
		return true;
	} catch (error) {
		if (error instanceof TypeError) return false;
		throw error;
	}
}
function assertOfficialRuntimeSurface() {
	const runtime = OfficialSubagentRuntime;
	if (!constructible(runtime)) throw new StartupIncompatibilityError("OfficialSubagentRuntime", "OfficialSubagentRuntime must be constructible");
	const line = subagentSurfaceOf(Reflect.get(runtime, "prototype"));
	if (line === void 0) throw new StartupIncompatibilityError("OfficialSubagentRuntime", "OfficialSubagentRuntime must expose public startActivation() (0.2.1+) or start()/startContinuable()");
	return line;
}
function assertRoutingSurface(ctx) {
	const modelSwitch = ctx.modelSwitch;
	assertPublicMethod(modelSwitch, "Model Switch runtime", "currentSettings");
}
function routingSurface(ctx) {
	return ctx.modelSwitch;
}
function assertMountedSurface(ctx) {
	const service = ctx.subagents;
	assertPublicMethod(service, "mounted Subagent runtime", "resolveMaxDepth");
	if (subagentSurfaceOf(service) === void 0) throw new StartupIncompatibilityError("mounted Subagent runtime", "mounted Subagent runtime must expose public startActivation() (0.2.1+) or start()/startContinuable()");
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
function startupFailure(error, cleanupFailures) {
	if (cleanupFailures.length === 0) throw error;
	throw new AggregateError([error, ...cleanupFailures], "Subagent runtime startup and cleanup failed", { cause: error });
}
function cleanupDisposer(ledger) {
	return async () => {
		const failures = await ledger.disposeAll();
		if (failures.length > 0) throw new AggregateError(failures, "Subagent runtime cleanup failed");
	};
}
/**
* Mount a candidate and use the fallback only for typed startup incompatibility.
*
* Every resource registered by an attempt is disposed in reverse order before a
* fallback starts and again when the mounted result is disposed. Cleanup keeps
* running after failures, and a startup error stays first in any aggregate.
*
* @param candidate - startup callback for the routed candidate.
* @param fallback - startup callback for the untouched official runtime.
* @returns the selected value and an idempotent disposer.
* @throws the candidate error unless it is a StartupIncompatibilityError.
* @throws the fallback startup error when fallback startup fails.
*/
async function mountWithStartupFallback(candidate, fallback) {
	const ledger = new CleanupLedger();
	try {
		return {
			value: await candidate((dispose) => ledger.add(dispose)),
			dispose: cleanupDisposer(ledger)
		};
	} catch (error) {
		const cleanupFailures = await ledger.disposeAll();
		if (!(error instanceof StartupIncompatibilityError)) startupFailure(error, cleanupFailures);
		if (cleanupFailures.length > 0) startupFailure(error, cleanupFailures);
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
/**
* Operator-facing notice for a Host whose Subagent runtime cannot be routed.
*
* DSH 0.2.1 replaced `start()`/`startContinuable()` with the activation API, so
* this adapter's override point is gone; the row then mounts the untouched
* official runtime instead of guessing a new seam.
* @param error - the typed startup incompatibility that rejected the candidate.
* @returns The notice logged once at startup.
*/
function routedRuntimeUnavailableNotice(error) {
	return `model-switch: the routed Subagent runtime is unavailable on this DSH Host (${error.message}); delegation follows the official route instead`;
}
/** Log one notice without letting a missing logger service fail the startup. */
function reportNotice(ctx, message) {
	try {
		ctx.logger.warn(message);
	} catch {}
}
async function mountProfileRuntime(ctx) {
	return (await mountWithStartupFallback(async (track) => {
		try {
			assertOfficialRuntimeSurface();
		} catch (error) {
			if (error instanceof StartupIncompatibilityError) reportNotice(ctx, routedRuntimeUnavailableNotice(error));
			throw error;
		}
		assertRoutingSurface(ctx);
		const candidate = ctx.plugin(ModelSwitchSubagentRuntime);
		track(() => candidate.dispose());
		await candidate;
		const surface = ctx.inject(["subagents"], (surfaceCtx) => {
			assertMountedSurface(surfaceCtx);
		});
		track(() => surface.dispose());
		await surface;
		return candidate;
	}, async (track) => {
		const official = ctx.plugin(OfficialSubagentRuntime);
		track(() => official.dispose());
		await official;
		return official;
	})).dispose;
}
/** Profile replacement that selects the routed runtime or the untouched official runtime. */
const profileSubagentRuntime = Object.assign(async (ctx) => mountProfileRuntime(ctx), { inject: ["modelSwitch"] });
/** Official runtime with only a pre-descriptor route-selection adapter. */
var ModelSwitchSubagentRuntime = class extends OfficialSubagentRuntime {
	static inject = ["modelSwitch"];
	routed(name, request) {
		const provider = this.ctx.subagents.getProvider(name);
		if (provider !== void 0 && provider.capabilities.agentOptions !== true) return request;
		const modelSwitch = routingSurface(this.ctx);
		return routeSubagentRequest(request, sessionSubagentRouteOf(this.ctx, request.parent.session, modelSwitch.currentSettings()));
	}
	start(name, request) {
		return publicMethod(OfficialSubagentRuntime.prototype, "OfficialSubagentRuntime", "start").call(this, name, this.routed(name, request));
	}
	startContinuable(spec) {
		return publicMethod(OfficialSubagentRuntime.prototype, "OfficialSubagentRuntime", "startContinuable").call(this, {
			...spec,
			request: this.routed(spec.provider, spec.request)
		});
	}
	/**
	* 0.2.1+ activation entry: delegation tools call this instead of
	* `start()`/`startContinuable()`, and its spec carries the same
	* `request.agentOptions` this adapter already rewrites. Every other spec
	* field (label, childId, signal, delivery) passes through untouched.
	*
	* @param spec - the activation spec published by the installed Host.
	* @returns The official activation result.
	*/
	startActivation(spec) {
		return publicMethod(OfficialSubagentRuntime.prototype, "OfficialSubagentRuntime", "startActivation").call(this, {
			...spec,
			request: this.routed(spec.provider, spec.request)
		});
	}
};
//#endregion
export { ModelSwitchSubagentRuntime, StartupIncompatibilityError, profileSubagentRuntime as default, profileSubagentRuntime, mountWithStartupFallback, routeSubagentRequest, routedRuntimeUnavailableNotice, subagentSurfaceOf };
