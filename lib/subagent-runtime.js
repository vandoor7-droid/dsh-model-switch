import { r as sessionSubagentRouteOf } from "./session-route-BCQFzqRP.js";
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
	const prototype = Reflect.get(runtime, "prototype");
	assertPublicMethod(prototype, "OfficialSubagentRuntime", "start");
	assertPublicMethod(prototype, "OfficialSubagentRuntime", "startContinuable");
}
function assertRoutingSurface(ctx) {
	const modelSwitch = ctx.modelSwitch;
	assertPublicMethod(modelSwitch, "Model Switch runtime", "currentSettings");
}
function routingSurface(ctx) {
	return ctx.modelSwitch;
}
function assertMountedSurface(ctx) {
	assertPublicMethod(ctx.subagents, "mounted Subagent runtime", "start");
	assertPublicMethod(ctx.subagents, "mounted Subagent runtime", "startContinuable");
	assertPublicMethod(ctx.subagents, "mounted Subagent runtime", "resolveMaxDepth");
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
async function mountProfileRuntime(ctx) {
	return (await mountWithStartupFallback(async (track) => {
		assertOfficialRuntimeSurface();
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
		return super.start(name, this.routed(name, request));
	}
	startContinuable(spec) {
		return super.startContinuable({
			...spec,
			request: this.routed(spec.provider, spec.request)
		});
	}
};
//#endregion
export { ModelSwitchSubagentRuntime, StartupIncompatibilityError, profileSubagentRuntime as default, profileSubagentRuntime, mountWithStartupFallback, routeSubagentRequest };
