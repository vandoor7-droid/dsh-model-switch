import { a as sessionProviderOf, n as groupRoute, t as deploymentRoute } from "./session-route-D8izd8Zd.js";
//#region lib/types/session-title.js
/**
* Model Switch-owned session-naming row.
*
* The official naming rows hardwire the naming route at registration time: the
* configured provider/model pair wins over the session's own logged route for
* every session in the profile. This row registers ONE provider of its own and
* resolves the route PER REQUEST instead, so a session whose provider has a
* saved group is named through that group's pair while every other session keeps
* following its own model.
*
* The call itself stays inside the official implementation: the auxiliary-LLM
* package records exactly the route that was called in `session/title-llm-request`,
* so the durable record and the actual request can never disagree. Nothing is
* remounted when settings change — the route is read through on every naming
* request — so a settings save can neither interrupt an in-flight naming request
* nor leave the profile without a registered provider.
*
* Two official auxiliary-LLM lines are supported, selected at runtime from the
* module surface, because the 0.2.1 release replaced the shared title call:
* - Up to DSH 0.2.0 (`generateSessionTitleWithLlm`): the module owns the system
*   prompt, input framing, and output validation; the shared policy carries the
*   title-length targets.
* - DSH 0.2.1+ (`executeSessionTitleLlm`): the provider owns the system prompt,
*   the input, the reasoning-effort selection, and the output interpretation;
*   the shared policy carries execution controls only. This row mirrors the
*   official provider's wording and interpretation so a configured route keeps
*   the official behavior.
*
* A naming request that fails is retried once with a widened output budget
* (max-token failures only) and then falls through the remaining route
* candidates — the session group's pair, the deployment-wide pair, the row's own
* pair, then the session's logged route — so one unavailable model or provider
* cannot leave the session on its deterministic fallback title forever.
*
* `cordis.patch.yml` disables the official rows (the seam allows one registered
* provider per context), and this row mirrors the cadence a disabled row
* declared, so a profile that restated the row as all-prompts keeps its cadence.
*
* @module dsh-model-switch/session-title
*/
var __rewriteRelativeImportExtension = function(path, preserveJsx) {
	if (typeof path === "string" && /^\.\.?\//.test(path)) return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function(m, tsx, d, ext, cm) {
		return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : d + ext + "." + cm.toLowerCase() + "js";
	});
	return path;
};
/** Official session-title provider row this module supersedes. */
const OFFICIAL_TITLE_ROW = "session-title-llm";
/** The auxiliary-LLM package carrying the shared naming policy and call. */
const TITLE_LLM_PACKAGE = "@deepseek-ai/dsh-session-title-llm";
/** Cordis plugin identity; matches the cordis.patch.yml insert row id. */
const name = "model-switch-session-title";
/** The loader names the disabled row, and the seam services the call needs are awaited before the first naming request. */
const inject = [
	"loader",
	"sessionTitle",
	"llm"
];
/** Both official cadence packages, in the order a profile may declare them. */
const TITLE_CADENCES = Object.freeze([Object.freeze({
	pkg: "@deepseek-ai/dsh-session-title-first-prompt-llm",
	id: "session-title-first-prompt-llm",
	automatic: "first-prompt",
	firstPromptOnly: true
}), Object.freeze({
	pkg: "@deepseek-ai/dsh-session-title-all-prompts-llm",
	id: "session-title-all-prompts-llm",
	automatic: "all-prompts",
	firstPromptOnly: false
})]);
/** Execution controls both official auxiliary-LLM lines validate; defaults mirror the shipped official rows. */
const EXECUTION_DEFAULTS = Object.freeze({
	maxInputBytes: 4096,
	maxOutputTokens: 64,
	timeoutMs: 6e4
});
/** Provider-owned title-length targets: required by the pre-0.2.1 line and moved into providers by 0.2.1. */
const TARGET_DEFAULTS = Object.freeze({
	targetWords: 5,
	targetCjkCharacters: 10
});
/** Execution keys accepted by both lines; provider-owned keys are excluded on purpose. */
const EXECUTION_KEYS = Object.freeze([
	"maxInputBytes",
	"maxOutputTokens",
	"timeoutMs",
	"provider",
	"model"
]);
/**
* Read one call entry point without assuming it exists.
*
* The module namespace of a host line that does not export the name can throw on
* access (mocked namespaces do), so a missing entry point reads as undefined
* instead of failing the row.
* @param module - the loaded auxiliary-LLM package.
* @param key - the call entry point to read.
* @returns The callable, or undefined when this line does not expose it.
*/
function titleCallOf(module, key) {
	try {
		const value = module[key];
		return typeof value === "function" ? value : void 0;
	} catch {
		return;
	}
}
/**
* The cadence one official package name declares.
* @param pkg - the disabled row's package name.
* @returns The matching cadence, or undefined for a row this row cannot mirror.
*/
function titleCadence(pkg) {
	if (pkg === void 0) return void 0;
	return TITLE_CADENCES.find((cadence) => cadence.pkg === pkg);
}
/**
* Overlay the session-resolved route over the row's own validated policy.
*
* A resolved route always names both halves. When nothing resolves, the row's
* own policy is returned unchanged: an explicit pair the profile configured on
* the official row stays the deployment default, and a row without one keeps
* following each session's logged route.
* @param config - policy validated from the disabled official row.
* @param route - session-resolved naming route, or undefined for the row's own policy.
* @returns A detached config for one naming request.
*/
function composeTitleRoute(config, route) {
	if (route === void 0) return config;
	return {
		...config,
		provider: route.provider,
		model: route.model
	};
}
/**
* Frame the exact human messages one naming revision represents.
* @param messages - every eligible human message of the revision.
* @param firstPromptOnly - cadence flag: true mirrors the first-prompt provider.
* @returns The selected messages, in order.
* @throws when a first-prompt cadence receives an empty revision — the official provider's own contract.
*/
function selectTitleMessages(messages, firstPromptOnly) {
	if (!firstPromptOnly) return messages;
	const first = messages[0];
	if (first === void 0) throw new Error("first-prompt title provider requires one human message");
	return [first];
}
/** The id the experimental session-titles bundle inserts for all-prompts naming. */
const ALL_PROMPTS_ROW = "optional-session-title-all-prompts";
/**
* Locate the official session-title provider row in the loader tree.
*
* Disabled entries stay in the tree, so a name-matched disable still matches.
* The all-prompts row wins when it is present: that row only exists while the
* experimental session-titles bundle is composed, and its presence is exactly
* the user's choice to update titles with every prompt. The default
* first-prompt row is the fallback when that bundle is off.
* @param loader - the host loader, when one is reachable.
* @returns The official entry to mirror, or undefined when this profile has no such row.
*/
function officialTitleEntry(loader) {
	if (!loader) return void 0;
	const allPrompts = TITLE_CADENCES[1];
	const firstPrompt = TITLE_CADENCES[0];
	let fallback;
	for (const entry of loader.entries()) {
		if (entry.id === ALL_PROMPTS_ROW) return entry;
		const pkg = entry.options?.name;
		if (typeof pkg === "string" && allPrompts !== void 0 && pkg === allPrompts.pkg) return entry;
		if (fallback === void 0 && entry.id === OFFICIAL_TITLE_ROW) fallback = entry;
		else if (fallback === void 0 && firstPrompt !== void 0 && pkg === firstPrompt.pkg) fallback = entry;
	}
	return fallback;
}
/**
* Copy the official row's stored config, ignoring non-object payloads.
* @param entry - the official session-title provider entry.
* @returns A plain object spread; missing or invalid configs become `{}`. The
* result is untrusted: the profile may be hand-edited, so the official policy
* validator runs over it before any naming request is served.
*/
function forwardedConfig(entry) {
	const raw = entry.options?.config;
	if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
	return {};
}
/**
* The official package name this row mounts (either cadence).
* @param entry - the official session-title provider entry.
* @returns The package name, or undefined when the row declares none.
*/
function officialTitlePackage(entry) {
	const pkg = entry.options?.name;
	if (typeof pkg !== "string" || pkg.trim() === "") return void 0;
	return pkg;
}
/** A positive integer, or undefined for anything else (blank, fractional, negative, non-number). */
function positiveInteger(value) {
	if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) return void 0;
	return value;
}
/**
* Split one untrusted stored policy into the halves both official lines accept.
*
* Execution controls pass through untouched (an invalid value still fails the
* official validator). Absent execution fields fall back to the shipped
* official defaults, because a profile that mounts no official row has no
* policy to forward and this row must still run. Title-length targets are read
* here for the system instruction: the pre-0.2.1 line wants them in its shared
* config, while 0.2.1 moved them into each provider.
* @param forwarded - the disabled official row's stored config.
* @returns The execution subset and the title-length targets.
*/
function splitTitlePolicy(forwarded) {
	const execution = {};
	for (const key of EXECUTION_KEYS) {
		const value = forwarded[key];
		if (value !== void 0) execution[key] = value;
	}
	for (const [key, fallback] of Object.entries(EXECUTION_DEFAULTS)) if (execution[key] === void 0) execution[key] = fallback;
	return {
		execution,
		targets: {
			targetWords: positiveInteger(forwarded.targetWords) ?? TARGET_DEFAULTS.targetWords,
			targetCjkCharacters: positiveInteger(forwarded.targetCjkCharacters) ?? TARGET_DEFAULTS.targetCjkCharacters
		}
	};
}
/**
* Detect the 0.2.1+ auxiliary-LLM line.
* @param module - the loaded auxiliary-LLM package.
* @returns Whether the module exposes the provider-prepared call.
*/
function isModernTitleModule(module) {
	return titleCallOf(module, "executeSessionTitleLlm") !== void 0;
}
/**
* Validate the stored policy through the official validator of the installed line.
* @param module - the loaded auxiliary-LLM package.
* @param forwarded - the disabled official row's stored config.
* @returns The validated execution config and title-length targets.
* @throws when the official validator rejects the stored policy.
*/
function resolveNamingPolicy(module, forwarded) {
	const split = splitTitlePolicy(forwarded);
	const resolve = module.resolveSessionTitleLlmConfig;
	if (isModernTitleModule(module)) return {
		config: resolve(split.execution),
		targets: split.targets
	};
	const config = resolve({
		...split.execution,
		...split.targets
	});
	return {
		config,
		targets: {
			targetWords: config.targetWords ?? split.targets.targetWords,
			targetCjkCharacters: config.targetCjkCharacters ?? split.targets.targetCjkCharacters
		}
	};
}
/**
* Candidate routes for one naming request, most specific first and deduplicated.
*
* The stored session group's pair wins, then the deployment-wide pair, then the
* row's own configured pair, then the session's logged route. The list is also
* the fallback order: a failing candidate falls through to the next one.
* @param settings - live Model Switch settings; undefined skips the stored pairs.
* @param provider - the delegating session's provider, when one is observable.
* @param policy - the validated row policy (its own pair is the third candidate).
* @param requestRoute - the session's logged main-request route, when one exists.
* @returns The ordered, deduplicated candidates; empty when only the row policy applies.
*/
function titleRouteCandidates(settings, provider, policy, requestRoute) {
	const candidates = [];
	const push = (route) => {
		if (route === void 0) return;
		if (candidates.some((candidate) => candidate.provider === route.provider && candidate.model === route.model)) return;
		candidates.push(route);
	};
	push(groupRoute(settings, provider, "title"));
	push(deploymentRoute(settings, "title"));
	if (policy.provider !== void 0 && policy.model !== void 0) push({
		provider: policy.provider,
		model: policy.model
	});
	push(requestRoute);
	return candidates;
}
/**
* Whether a failure may be retried on another candidate.
* A superseded or disposed request keeps no budget, and a deadline that fired is
* the caller's bound, not the route's fault: both end the attempt loop.
* @param error - the failure thrown by the auxiliary call.
* @param request - the service-owned request whose signal bounds the work.
* @returns Whether another candidate may be tried.
*/
function shouldTryNextCandidate(error, request) {
	if (request.signal.aborted) return false;
	return error?.code !== "SESSION_TITLE_TIMEOUT";
}
/**
* Whether the failure is the model filling its output budget before finishing.
* Official lines report this as `title output reached maxOutputTokens`; a widened
* budget is the only retry that can succeed for it.
* @param error - the failure thrown by the auxiliary call.
* @returns Whether one widened-budget retry is worth trying.
*/
function isMaxTokensFailure(error) {
	if (!(error instanceof Error)) return false;
	return /maxoutputtokens|max[-_ ]tokens/iu.test(error.message);
}
/**
* A widened output budget for the same route.
* @param maxOutputTokens - the policy's configured budget.
* @returns Four times the budget, capped at 4096 tokens.
*/
function widerTitleBudget(maxOutputTokens) {
	return Math.min(maxOutputTokens * 4, 4096);
}
/** Asterisk emphasis wrapping a whole line, such as `**Title**`. */
const EMPHASIS_WRAPPER = /^(?<marker>\*{1,3})(?<inner>\S(?:.*\S)?)\k<marker>$/u;
/** OSC control sequences, such as a title hyperlink. */
const OSC_SEQUENCE = /(?:\u001B\]|\u009D)(?:(?!\u0007|\u001B\\)[\s\S])*(?:\u0007|\u001B\\|$)/gu;
/** Control-sequence-introducer escapes such as SGR color codes. */
const CSI_SEQUENCE = /(?:\u001B\[|\u009B)[0-?]*[ -/]*[@-~]/gu;
/** Remaining two-byte ESC control sequences. */
const ESC_SEQUENCE = /\u001B[@-_]/gu;
/** Non-whitespace C0/C1 control characters. */
const CONTROL_CHARACTER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/gu;
/** Directional and invisible controls that can make a displayed title deceptive. */
const DIRECTIONAL_CONTROL = /[\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/gu;
/**
* Normalize one accepted title exactly like the official service.
* @param input - untrusted title text.
* @returns A terminal-safe, whitespace-normalized one-line title, possibly empty.
*/
function normalizeTitleText(input) {
	return input.replace(OSC_SEQUENCE, "").replace(CSI_SEQUENCE, "").replace(ESC_SEQUENCE, "").replace(CONTROL_CHARACTER, "").replace(DIRECTIONAL_CONTROL, "").replace(/\s+/gu, " ").trim();
}
/**
* Take the title from model output: the first non-empty line, without asterisk
* emphasis wrapping that whole line. Models that disregard the one-line
* instruction put the title first and commentary after it.
* @param text - joined text blocks of the auxiliary response.
* @returns The candidate title line.
*/
function titleFromOutput(text) {
	const line = text.split(/\r?\n/u).map((item) => item.trim()).find((item) => item.length > 0) ?? "";
	const groups = EMPHASIS_WRAPPER.exec(line)?.groups;
	const marker = groups?.["marker"];
	const inner = groups?.["inner"];
	return marker === void 0 || inner === void 0 || inner.includes(marker) ? line : inner;
}
/**
* Interpret one assembled 0.2.1+ response as a title.
* Rejects terminal tool-call and max-token outcomes exactly like the official
* provider, so the row keeps the official acceptance rules.
* @param response - the assembled auxiliary response.
* @returns A non-empty normalized title.
* @throws when the finish reason, a tool-call block, or empty text makes the response unusable.
*/
function titleFromResponse(response) {
	switch (response.finish.kind) {
		case "stop": break;
		case "tool-calls": throw new Error("session-title-llm: title output must contain text only");
		case "max-tokens": throw new Error("session-title-llm: title output reached maxOutputTokens");
		default: throw new Error(`session-title-llm: unsupported finish reason "${String(response.finish.kind)}"`);
	}
	if (response.blocks.some((block) => block.type === "tool-call")) throw new Error("session-title-llm: title output must contain text only");
	const title = normalizeTitleText(titleFromOutput(response.blocks.filter((block) => block.type === "text").map((block) => block.text ?? "").join(" ")));
	if (title.length === 0) throw new Error("session-title-llm: title model produced no text");
	return title;
}
/**
* Select the route's least supported reasoning effort for a title call, as the
* official 0.2.1 provider does: naming is a short auxiliary task, and a full
* reasoning budget can consume the whole output allowance.
* @param model - the prepared model metadata.
* @returns The first declared effort id, or undefined when the model has none.
*/
function selectTitleReasoningEffort(model) {
	return model.reasoning?.efforts?.[0]?.id;
}
/**
* The official 0.2.1+ system instruction, including the optional current-title anchor.
* @param targets - title-length targets.
* @param hasCurrentTitle - whether the request is anchored to an existing provider title.
* @returns The system prompt text.
*/
function titleSystemPrompt(targets, hasCurrentTitle) {
	return [
		"Create a concise title for an AI coding-assistant session from the supplied human messages.",
		"Return only the title on one line, **in plain text of natural language**, with no quotes, prefix, explanation, Markdown, XML, or terminal control codes. No code is allowed.",
		"Use the language of the messages.",
		`Aim for about ${targets.targetWords} words in non-CJK languages or ${targets.targetCjkCharacters} CJK characters.`,
		"If the messages give little to name, still return a short best-effort title, such as Greeting, instead of explaining.",
		...hasCurrentTitle ? [
			"An existing title is supplied as currentTitle. If it still accurately describes the main topic or task, return it exactly unchanged.",
			"Follow-up questions, additional details within the same topic, acknowledgements such as \"thanks\", and requests to continue do not by themselves justify a title change.",
			"Do not reword, polish, shorten, or replace synonyms in an adequate title. Keeping its exact wording takes priority over the target length.",
			"Change the title only when the messages materially change or expand the main topic or task so that the existing title is no longer accurate."
		] : []
	].join("\n");
}
/**
* Frame the exact messages as JSON so user text cannot break structural delimiters.
* @param messages - the selected human messages.
* @param currentTitle - the accepted provider title to anchor on, when there is one.
* @returns The framed user input.
*/
function frameTitleInput(messages, currentTitle) {
	if (currentTitle === void 0) return `Generate the session title from this JSON array of human messages:\n${JSON.stringify(messages)}`;
	return `Update the session title from this JSON object:\n${JSON.stringify({
		currentTitle,
		messages
	})}`;
}
/**
* The accepted provider title of one request, when the service supplied one.
* Only a provider-sourced title anchors an update; a fallback title does not.
* @param request - the service-owned naming request.
* @returns The current title, or undefined when there is nothing to anchor on.
*/
function currentProviderTitle(request) {
	const current = request.currentTitle;
	if (current === void 0 || current.source?.kind !== "provider" || typeof current.title !== "string") return void 0;
	return current.title;
}
/**
* Run one candidate through the auxiliary-LLM line the profile installed.
* @param ctx - this row's context, exposing `llm`.
* @param module - the loaded auxiliary-LLM package.
* @param plan - the profile's naming policy and cadence.
* @param request - service-owned session, message revision, and cancellation.
* @param attempt - one candidate route with its composed config.
* @returns The official provider result.
*/
async function runTitleCall(ctx, module, plan, request, attempt) {
	const messages = selectTitleMessages(request.messages, plan.cadence.firstPromptOnly);
	const execute = titleCallOf(module, "executeSessionTitleLlm");
	if (execute !== void 0) {
		const anchor = plan.cadence.firstPromptOnly ? void 0 : currentProviderTitle(request);
		const prepared = {
			system: titleSystemPrompt(plan.targets, anchor !== void 0),
			input: frameTitleInput(messages, anchor),
			messageSeqs: messages.map((message) => message.seq),
			selectReasoningEffort: selectTitleReasoningEffort
		};
		const response = await execute(ctx, attempt.config, request, plan.cadence.id, prepared);
		return {
			title: titleFromResponse(response),
			messageSeqs: prepared.messageSeqs,
			model: response.model
		};
	}
	const legacy = titleCallOf(module, "generateSessionTitleWithLlm");
	if (legacy === void 0) throw new Error(`model-switch: ${TITLE_LLM_PACKAGE} exposes no title call this row understands`);
	return legacy(ctx, {
		...plan.targets,
		...attempt.config
	}, request, messages, plan.cadence.id);
}
/**
* Execute one naming request through the official implementation.
*
* The route is resolved from the session being titled — its provider selects the
* saved group, the flat settings pair is the deployment default — and every
* candidate is tried in order until one succeeds. A max-token failure first gets
* one widened-budget retry on the same route; every other failure moves on.
* @param ctx - this row's context, exposing `llm`.
* @param module - the loaded auxiliary-LLM module.
* @param plan - the profile's fixed naming policy.
* @param request - service-owned session, message revision, and cancellation.
* @returns The official provider result.
* @throws The last candidate failure when every candidate fails.
*/
async function generateTitle(ctx, module, plan, request) {
	const candidates = titleRouteCandidates(currentSettings(ctx), sessionProviderOf(ctx, request.session), plan.config, request.route);
	const attempts = candidates.length === 0 ? [{
		route: void 0,
		config: plan.config
	}] : candidates.map((route) => ({
		route,
		config: composeTitleRoute(plan.config, route)
	}));
	let lastError;
	for (const attempt of attempts) try {
		return await runTitleCall(ctx, module, plan, request, attempt);
	} catch (error) {
		lastError = error;
		if (!shouldTryNextCandidate(error, request)) break;
		if (!isMaxTokensFailure(error)) continue;
		const widened = {
			route: attempt.route,
			config: {
				...attempt.config,
				maxOutputTokens: widerTitleBudget(attempt.config.maxOutputTokens)
			}
		};
		try {
			return await runTitleCall(ctx, module, plan, request, widened);
		} catch (retryError) {
			lastError = retryError;
			if (!shouldTryNextCandidate(retryError, request)) break;
		}
	}
	const tried = attempts.map((attempt) => attempt.route === void 0 ? "the row policy" : `${attempt.route.provider}/${attempt.route.model}`).join(" → ");
	if (!request.signal.aborted) ctx.logger.warn(`model-switch: session title generation failed on every candidate (${tried}): ${String(lastError)}`);
	throw lastError;
}
/**
* Read live Model Switch settings without requiring the host row.
*
* The host is read structurally instead of injected so this row keeps mirroring
* the official naming behavior when the `model-switch` row is disabled: an
* unreachable host resolves to the row's own policy rather than to a pinned
* route.
* @param ctx - this row's context.
* @returns The settings, or undefined when the host is unavailable.
*/
function currentSettings(ctx) {
	try {
		return ctx.get("modelSwitch", false)?.currentSettings();
	} catch {
		return;
	}
}
/** Resolve the naming plan for one official row, or the shipped defaults when no row exists. */
function planFor(ctx, module, entry) {
	const cadence = titleCadence(entry === void 0 ? void 0 : officialTitlePackage(entry)) ?? TITLE_CADENCES[0];
	if (cadence === void 0) return void 0;
	const forwarded = entry === void 0 ? {} : forwardedConfig(entry);
	let policy;
	try {
		policy = resolveNamingPolicy(module, forwarded);
	} catch (cause) {
		ctx.logger.error("model-switch: the official session-title row has no valid naming policy; naming keeps the deterministic fallback");
		ctx.logger.error(cause);
		return;
	}
	return {
		cadence,
		config: policy.config,
		targets: policy.targets
	};
}
/** One naming plan bound to a live route resolver. */
function providerOf(ctx, module, plan) {
	return {
		id: plan.cadence.id,
		automatic: plan.cadence.automatic,
		generate: (request) => generateTitle(ctx, module, plan, request)
	};
}
/** Timing knobs for the takeover choreography (exported for tests). */
const TAKEOVER_RETRY_DELAY_MS = 10;
/** How many times the takeover re-checks after disabling the official row. */
const TAKEOVER_MAX_ATTEMPTS = 20;
/**
* The single naming-provider slot this row serves.
*
* DSH's session-title service accepts exactly one registered provider, and the
* official rows (`session-title-llm`, and the experimental row the
* `dsh-experimental-session-titles-bundle` inserts) compete for the same slot.
* This row therefore mirrors one official row and owns the slot; when another
* official row activates anyway (the experimental bundle inserts its row after
* this plugin's patch layer, so a static `disabled` cannot reach it), it yields
* the slot so that row's own registration succeeds — no activation warning —
* and then disables that row and takes the slot back with its cadence mirrored.
* Every step uses released seams: the `loader/patch-context` waterfall, the
* public `Entry.update`, and `sessionTitle.register` plus its disposer.
*/
var NamingSeam = class {
	ctx;
	module;
	disposer;
	plan;
	constructor(ctx, module, plan) {
		this.ctx = ctx;
		this.module = module;
		this.plan = plan;
	}
	/** The cadence currently registered. */
	get cadence() {
		return this.plan.cadence;
	}
	/** Whether this row currently owns the slot. */
	get claimed() {
		return this.disposer !== void 0;
	}
	/**
	* Register this row's provider with the given plan.
	* @param plan - the naming plan to serve (defaults to the current one).
	* @returns true when the slot is ours, false when another provider holds it.
	*/
	claim(plan = this.plan) {
		this.plan = plan;
		if (this.disposer !== void 0) return true;
		try {
			this.disposer = this.ctx.sessionTitle.register(providerOf(this.ctx, this.module, plan));
			return true;
		} catch {
			return false;
		}
	}
	/** Release the slot (the service lets the next registration replace a closing one). */
	yieldSlot() {
		const disposer = this.disposer;
		this.disposer = void 0;
		if (disposer === void 0) return;
		try {
			disposer();
		} catch (cause) {
			this.ctx.logger.error("model-switch: releasing the session-title provider failed");
			this.ctx.logger.error(cause);
		}
	}
	/** Swap the served plan, re-registering only when the slot is already ours. */
	retarget(plan) {
		if (!this.claimed) {
			this.plan = plan;
			return;
		}
		this.yieldSlot();
		this.claim(plan);
	}
};
/**
* Whether one loader entry declares an official naming provider this row supersedes.
*
* The package name is the authoritative identity: the takeover disables the
* matched entry, which disposes its fiber, so an id-only match could reach a
* group or an unrelated plugin's row with a recycled id.
*/
function isOfficialTitleRow(entry) {
	if (entry === void 0) return false;
	const pkg = entry.options?.name;
	return typeof pkg === "string" && TITLE_CADENCES.some((cadence) => cadence.pkg === pkg);
}
/** The id one entry is known by (the loader's leaf id, not a nested path). */
function leafId(entry) {
	const raw = entry.options?.id;
	return typeof raw === "string" ? raw : void 0;
}
/**
* Every official naming row the loader currently has instantiated and enabled.
*
* A row that is enabled here may be about to run its own `register()`, so this
* row must not take the slot first: the official registration would throw
* "already registered", and a failed activation aborts the whole composition —
* the way saving a model provider used to fail while both rows were enabled.
* @param ctx - this row's context.
* @returns The live enabled rows, empty when the profile keeps none.
*/
function enabledOfficialRows(ctx) {
	const loader = ctx.get("loader", false);
	if (typeof loader?.entries !== "function") return [];
	const rows = [];
	for (const candidate of loader.entries()) {
		if (!isOfficialTitleRow(candidate)) continue;
		if (candidate.disabled === true) continue;
		rows.push(candidate);
	}
	return rows;
}
/**
* Install the takeover choreography for naming rows that activate after this one.
*
* `loader/patch-context` runs inside the official entry's own `_init`, before its
* plugin's `apply`, and it receives that entry. At that point the entry's
* `options` are final, so this row can yield the slot first — the official
* `register()` then succeeds instead of throwing the "already registered"
* activation warning — and afterwards disable that row through the public
* `Entry.update` and take the slot back with its cadence mirrored.
* @param ctx - this row's context.
* @param module - the auxiliary-LLM package.
* @param seam - the slot owner.
* @returns Nothing; the listeners are effects of this row's fiber.
*/
function installTakeover(ctx, module, seam) {
	/** Entries already handled, so a repeated patch-context does not loop. */
	const handled = /* @__PURE__ */ new Set();
	/** Entries with a reclaim cycle in flight, so two triggers cannot race. */
	const reclaiming = /* @__PURE__ */ new Set();
	/** After the yield, disable the official row and take the slot back. */
	const reclaim = async (entry, plan) => {
		const pkg = entry.options?.name;
		if (!(typeof pkg === "string" && TITLE_CADENCES.some((cadence) => cadence.pkg === pkg))) {
			ctx.logger.info(`model-switch: skipped a naming-row candidate without an official cadence package (${String(leafId(entry) ?? "unknown")})`);
			return;
		}
		if (reclaiming.has(entry)) return;
		reclaiming.add(entry);
		try {
			for (let attempt = 0; attempt < 20; attempt += 1) {
				await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 0 : 10));
				try {
					await entry.update({ disabled: true });
					ctx.logger.info(`model-switch: disabled the official naming row ${String(leafId(entry) ?? "unknown")} (${pkg}) so the naming provider slot stays configurable`);
				} catch (cause) {
					ctx.logger.info("model-switch: the displaced naming row could not be persisted as disabled; the takeover repeats next startup");
					ctx.logger.info(String(cause));
				}
				if (seam.claim(plan)) {
					ctx.logger.info(`model-switch: displaced the official naming row ${String(leafId(entry) ?? "unknown")}; its ${plan.cadence.automatic} cadence and policy are mirrored by the configurable naming route`);
					return;
				}
			}
			ctx.logger.info(`model-switch: another session-title provider owns the seam after the official naming row ${String(leafId(entry) ?? "unknown")} was displaced; naming follows it while it is active`);
		} finally {
			reclaiming.delete(entry);
		}
	};
	/**
	* The row an event names.
	*
	* The loader hands the emitting entry as the event's `this`, but cordis does
	* not rebind `this` for listeners added through `ctx.on`, so a listener can
	* also receive the payload as its first argument. Both shapes are accepted;
	* the real Host always provides one of them.
	*/
	const entryOfEvent = (self, first) => {
		const candidate = self ?? first;
		return candidate !== null && typeof candidate === "object" && "options" in candidate ? candidate : void 0;
	};
	const listeners = [];
	const listen = (event, listener) => {
		const dispose = ctx.on?.(event, listener);
		if (dispose !== void 0) listeners.push(dispose);
	};
	listen("loader/patch-context", function(first, second) {
		const nextFn = typeof first === "function" ? first : second;
		const entry = entryOfEvent(this, typeof first === "function" ? void 0 : first);
		if (entry === void 0 || typeof nextFn !== "function" || !isOfficialTitleRow(entry) || handled.has(entry)) return nextFn === void 0 ? void 0 : nextFn();
		handled.add(entry);
		const plan = planFor(ctx, module, entry);
		if (plan !== void 0) {
			seam.yieldSlot();
			reclaim(entry, plan);
		}
		return nextFn();
	});
	listen("loader/entry-init", function(first) {
		const entry = entryOfEvent(this, first);
		if (entry === void 0 || !isOfficialTitleRow(entry) || handled.has(entry)) return;
		const plan = planFor(ctx, module, entry);
		if (plan === void 0) return;
		handled.add(entry);
		seam.yieldSlot();
		reclaim(entry, plan);
	});
	listen("loader/partial-dispose", function(first) {
		seam.yieldSlot();
		const entry = entryOfEvent(this, first);
		if (entry === void 0 || !isOfficialTitleRow(entry)) return;
		handled.delete(entry);
		if (seam.claimed) return;
		const plan = planFor(ctx, module, officialTitleEntry(ctx.get("loader", false)));
		if (plan !== void 0) seam.claim(plan);
	});
	const loader = ctx.get("loader", false);
	if (typeof loader?.entries === "function") {
		let swept = false;
		for (const candidate of loader.entries()) {
			if (!isOfficialTitleRow(candidate)) continue;
			if (candidate.disabled === true) continue;
			const plan = planFor(ctx, module, candidate);
			if (plan === void 0) continue;
			swept = true;
			reclaim(candidate, plan);
		}
		if (!swept && !seam.claimed) seam.claim();
	}
	const disposable = () => {
		for (const dispose of listeners.splice(0)) dispose();
	};
	const effect = ctx.effect;
	if (effect === void 0) return;
	const registration = effect(function* () {
		yield disposable;
	}, "model-switch: session-title takeover");
	if (typeof registration === "function") listeners.push(registration);
}
/**
* Mount the Model Switch session-naming row for this profile.
*
* A profile with no official naming row, an unrecognized row package, a missing
* auxiliary-LLM package, or an invalid stored policy keeps the session-title
* service's deterministic fallback titles and reports the lost capability
* explicitly instead of guessing a route. The registration is an effect of this
* row's fiber, so unloading the profile unregisters the provider.
* @param ctx - this row's context.
*/
async function apply(ctx) {
	const entry = officialTitleEntry(ctx.get("loader", false));
	if (entry === void 0) ctx.logger.info("model-switch: no instantiated official session-title row to mirror; naming uses the first-prompt cadence");
	let module;
	try {
		module = await import(__rewriteRelativeImportExtension(TITLE_LLM_PACKAGE));
	} catch (cause) {
		ctx.logger.error(`model-switch: ${TITLE_LLM_PACKAGE} is unavailable; model-backed session naming cannot run at all`);
		ctx.logger.error(cause);
		return;
	}
	const plan = planFor(ctx, module, entry);
	if (plan === void 0) return;
	const seam = new NamingSeam(ctx, module, plan);
	if (!(enabledOfficialRows(ctx).length > 0) && !seam.claim()) ctx.logger.info("model-switch: another session-title provider already owns the seam; naming follows it while it is active");
	installTakeover(ctx, module, seam);
}
//#endregion
export { TAKEOVER_MAX_ATTEMPTS, TAKEOVER_RETRY_DELAY_MS, TITLE_CADENCES, apply, composeTitleRoute, forwardedConfig, frameTitleInput, inject, isMaxTokensFailure, isModernTitleModule, isOfficialTitleRow, name, normalizeTitleText, officialTitleEntry, officialTitlePackage, resolveNamingPolicy, selectTitleMessages, selectTitleReasoningEffort, shouldTryNextCandidate, splitTitlePolicy, titleCadence, titleFromOutput, titleFromResponse, titleRouteCandidates, titleSystemPrompt, widerTitleBudget };
