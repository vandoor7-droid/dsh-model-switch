import { s as normalizeProviderGroups } from "./session-route-D8izd8Zd.js";
import { r as resolveToolSource, t as DEFAULT_READ_ONLY_TOOLS } from "./tool-allowlist-DlzB5GlQ.js";
import { i as autoReviewStatus } from "./auto-review-D0RrXQQb.js";
import { ModelSwitchAdapterRegistry } from "./adapter-registry.js";
import { automodeCompatView } from "./automode-compat.js";
import { u as reviewTimeoutStatus } from "./review-timeout-CKTTDj8g.js";
import { createRequire } from "node:module";
import z from "@deepseek-ai/schemastery";
import { Service } from "@deepseek-ai/cordis";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { clientRequestSchema } from "@deepseek-ai/dsh-client-connection";
import { credentialRef, isCredentialRefName } from "@deepseek-ai/dsh-credentials";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";
import { Config as Config$1, DEEPSEEK_DEFAULT_API_VERSION, DEEPSEEK_DEFAULT_BASE_URL, DEEPSEEK_DEFAULT_MAX_TOKENS, DEEPSEEK_DEFAULT_MAX_USES, DEEPSEEK_DEFAULT_MODEL, DEEPSEEK_PROVIDER_ID, DeepSeekSearchProvider, WEB_SEARCH_DEEPSEEK_SETTINGS_NAMESPACE } from "@deepseek-ai/dsh-web-search-deepseek";
//#region lib/types/host-settings.js
/**
* Annotated rather than inferred: the nested entry schema's inferred type
* expands to cosmokit internals (`Dict`) that cannot be named in the emitted
* declaration, and the annotation pins the output shape to this interface.
*/
const Config = z.object({
	subagentMode: z.union(["follow-main", "fixed"]).default("follow-main").volatile(),
	subagentProvider: z.string().volatile(),
	subagentModel: z.string().volatile(),
	subagentReasoningEffort: z.string().volatile(),
	searchProvider: z.string().volatile(),
	searchModel: z.string().volatile(),
	imageProvider: z.string().volatile(),
	imageModel: z.string().volatile(),
	autoReviewProvider: z.string().volatile(),
	autoReviewModel: z.string().volatile(),
	autoReviewSkipReadOnly: z.boolean().default(false).volatile(),
	autoReviewAllowlist: z.array(z.string()).default([...DEFAULT_READ_ONLY_TOOLS]).volatile(),
	/** Reviewer stream idle timeout in ms; 0 = cancel (upstream ceiling); absent = provider default. */
	autoReviewTimeoutMs: z.number().step(1).min(0).max(2147483647).volatile(),
	compactProvider: z.string().volatile(),
	compactModel: z.string().volatile(),
	titleProvider: z.string().volatile(),
	titleModel: z.string().volatile(),
	memoryProvider: z.string().volatile(),
	memoryModel: z.string().volatile(),
	providerGroups: z.array(z.object({
		provider: z.string().default(""),
		compactProvider: z.string().default(""),
		compactModel: z.string().default(""),
		autoReviewProvider: z.string().default(""),
		autoReviewModel: z.string().default(""),
		subagentProvider: z.string().default(""),
		subagentModel: z.string().default(""),
		subagentReasoningEffort: z.string().default(""),
		titleProvider: z.string().default(""),
		titleModel: z.string().default(""),
		memoryProvider: z.string().default(""),
		memoryModel: z.string().default("")
	})).default([]).volatile()
});
function readConfig(config) {
	const subagentProvider = config.subagentProvider.get();
	const subagentModel = config.subagentModel.get();
	const subagentReasoningEffort = config.subagentReasoningEffort.get();
	const searchProvider = config.searchProvider.get();
	const searchModel = config.searchModel.get();
	const imageProvider = config.imageProvider.get();
	const imageModel = config.imageModel.get();
	const autoReviewProvider = config.autoReviewProvider.get();
	const autoReviewModel = config.autoReviewModel.get();
	const autoReviewSkipReadOnly = config.autoReviewSkipReadOnly.get();
	const autoReviewAllowlist = config.autoReviewAllowlist.get();
	const autoReviewTimeoutMs = config.autoReviewTimeoutMs.get();
	const compactProvider = config.compactProvider.get();
	const compactModel = config.compactModel.get();
	const titleProvider = config.titleProvider.get();
	const titleModel = config.titleModel.get();
	const memoryProvider = config.memoryProvider.get();
	const memoryModel = config.memoryModel.get();
	const providerGroups = normalizeProviderGroups(config.providerGroups.get());
	return {
		subagentMode: config.subagentMode.get(),
		...subagentProvider === void 0 ? {} : { subagentProvider },
		...subagentModel === void 0 ? {} : { subagentModel },
		...subagentReasoningEffort === void 0 ? {} : { subagentReasoningEffort },
		...searchProvider === void 0 ? {} : { searchProvider },
		...searchModel === void 0 ? {} : { searchModel },
		...imageProvider === void 0 ? {} : { imageProvider },
		...imageModel === void 0 ? {} : { imageModel },
		...autoReviewProvider === void 0 || autoReviewProvider === "" ? {} : { autoReviewProvider },
		...autoReviewModel === void 0 || autoReviewModel === "" ? {} : { autoReviewModel },
		...autoReviewSkipReadOnly ? { autoReviewSkipReadOnly } : {},
		...Array.isArray(autoReviewAllowlist) ? { autoReviewAllowlist: [...autoReviewAllowlist] } : {},
		...autoReviewTimeoutMs === void 0 ? {} : { autoReviewTimeoutMs },
		...compactProvider === void 0 || compactProvider === "" ? {} : { compactProvider },
		...compactModel === void 0 || compactModel === "" ? {} : { compactModel },
		...titleProvider === void 0 || titleProvider === "" ? {} : { titleProvider },
		...titleModel === void 0 || titleModel === "" ? {} : { titleModel },
		...memoryProvider === void 0 || memoryProvider === "" ? {} : { memoryProvider },
		...memoryModel === void 0 || memoryModel === "" ? {} : { memoryModel },
		...Object.keys(providerGroups).length === 0 ? {} : { providerGroups }
	};
}
//#endregion
//#region lib/types/runtime-capabilities.js
const RUNTIME_CAPABILITIES = Object.freeze({
	mainDefaults: Object.freeze({ available: true }),
	settings: Object.freeze({ available: true }),
	centralSubagentRouting: Object.freeze({ available: true }),
	packagedPresetRoots: Object.freeze({
		available: false,
		reason: "packaged-preset-roots"
	}),
	toolOwnerSuppression: Object.freeze({
		available: false,
		reason: "tool-owner-suppression"
	}),
	searchProviderAdapters: Object.freeze({
		available: false,
		reason: "search-provider-adapters",
		providers: Object.freeze([])
	}),
	visionProviderAdapters: Object.freeze({
		available: false,
		reason: "vision-provider-adapters"
	}),
	imageProviderAdapters: Object.freeze({
		available: true,
		providers: Object.freeze(["codex", "grok"])
	}),
	autoReview: Object.freeze({ available: true })
});
//#endregion
//#region lib/types/search-provider.js
const MODEL_SWITCH_SEARCH_PROVIDER_ID = "model-switch";
function selected$1(settings) {
	const provider = settings.searchProvider?.trim();
	const model = settings.searchModel?.trim();
	if (provider === void 0 || provider === "" || model === void 0 || model === "") return void 0;
	return {
		provider,
		model
	};
}
/** Thin official WebSearchProvider that resolves Model Switch routing at execution time. */
var ModelSwitchSearchProvider = class {
	settings;
	adapters;
	id = MODEL_SWITCH_SEARCH_PROVIDER_ID;
	constructor(settings, adapters) {
		this.settings = settings;
		this.adapters = adapters;
	}
	available() {
		const route = selected$1(this.settings());
		if (route === void 0) return false;
		const adapter = this.adapters.get(route.provider)?.search;
		return adapter !== void 0 && adapter.supportsModel(route.model);
	}
	async search(request, signal) {
		const route = selected$1(this.settings());
		if (route === void 0) throw new Error("search provider and model must be configured in Model Switch");
		const adapter = this.adapters.get(route.provider)?.search;
		if (adapter === void 0) throw new Error("missing search adapter: " + route.provider);
		if (!adapter.supportsModel(route.model)) throw new Error("search model is not supported by adapter: " + route.provider + "/" + route.model);
		return adapter.search(route.model, request, signal);
	}
};
function installModelSwitchSearchProvider(ctx, runtime) {
	ctx.inject(["web"], (scope) => scope.effect(() => scope.web.registerSearchProvider(new ModelSwitchSearchProvider(() => runtime.currentSettings(), runtime.adapters)), "Model Switch: register thin Search provider"));
}
//#endregion
//#region lib/types/image-tool.js
const GENERATE_IMAGE_TOOL_NAME = "generate_image";
function selected(settings) {
	const provider = settings.imageProvider?.trim();
	const model = settings.imageModel?.trim();
	if (provider === void 0 || provider === "" || model === void 0 || model === "") throw new Error("image provider and model must be configured in Model Switch");
	return {
		provider,
		model
	};
}
function optional(value) {
	return typeof value === "string" && value.trim() !== "" ? value : void 0;
}
function validateGenerated(value) {
	if (typeof value !== "object" || value === null) throw new Error("image adapter returned invalid metadata");
	if (typeof value.path !== "string" || value.path.trim() === "") throw new Error("image adapter returned empty path");
	if (![
		"image/png",
		"image/jpeg",
		"image/webp",
		"image/gif"
	].includes(value.mediaType)) throw new Error("image adapter returned invalid media type");
	if (!Number.isInteger(value.width) || value.width <= 0 || !Number.isInteger(value.height) || value.height <= 0) throw new Error("image adapter returned invalid dimensions");
	if (value.bytes !== void 0 && (!Number.isInteger(value.bytes) || value.bytes <= 0)) throw new Error("image adapter returned invalid byte count");
	if (value.attachmentId !== void 0 && (typeof value.attachmentId !== "string" || value.attachmentId.trim() === "")) throw new Error("image adapter returned invalid attachment id");
	return value;
}
function createGenerateImageTool(runtime) {
	const schemaProvider = runtime.currentSettings().imageProvider?.trim();
	const parameters = {
		prompt: {
			type: "string",
			required: true,
			description: "Detailed image prompt."
		},
		path: {
			type: "string",
			description: "Optional workspace-relative destination."
		},
		...schemaProvider === "codex" ? {
			source: {
				type: "string",
				description: "Optional source image for editing. Omit for a new image."
			},
			outputFormat: {
				type: "string",
				enum: [
					"png",
					"jpeg",
					"webp"
				],
				description: "Output format."
			}
		} : {},
		...schemaProvider === "grok" ? { aspectRatio: {
			type: "string",
			description: "Optional Grok aspect ratio, for example 1:1 or 16:9."
		} } : {}
	};
	return defineTool({
		name: GENERATE_IMAGE_TOOL_NAME,
		description: schemaProvider === "codex" ? "Generate or edit a raster image through the Codex model selected in Model Switch." : schemaProvider === "grok" ? "Generate a raster image through the Grok model selected in Model Switch." : "Generate a raster image through the provider and model selected in Model Switch.",
		parameters,
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					provider: {
						type: "string",
						required: true
					},
					model: {
						type: "string",
						required: true
					},
					path: {
						type: "string",
						required: true
					},
					mediaType: {
						type: "string",
						required: true
					},
					width: {
						type: "integer",
						required: true
					},
					height: {
						type: "integer",
						required: true
					},
					bytes: { type: "integer" },
					attachmentId: { type: "string" },
					name: { type: "string" },
					revisedPrompt: { type: "string" }
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: value.path
			}]
		},
		async execute(rawArgs, execution) {
			const args = rawArgs;
			if (typeof args.prompt !== "string" || args.prompt.trim() === "") throw new Error("image prompt must be non-empty");
			const route = selected(runtime.currentSettings());
			const path = optional(args.path);
			const source = optional(args.source);
			const aspectRatio = optional(args.aspectRatio);
			const outputFormat = optional(args.outputFormat);
			if (route.provider === "codex" && aspectRatio !== void 0) throw new Error("Codex image generation does not accept aspectRatio");
			if (route.provider === "grok" && (source !== void 0 || outputFormat !== void 0)) throw new Error("Grok image generation does not accept source or outputFormat");
			if (route.provider !== "codex" && route.provider !== "grok") throw new Error("image provider must be codex or grok");
			const adapter = runtime.adapters.get(route.provider)?.image;
			if (adapter === void 0) throw new Error("missing image adapter: " + route.provider);
			if (!adapter.supportsModel(route.model)) throw new Error("image model is not supported by adapter: " + route.provider + "/" + route.model);
			const request = {
				prompt: args.prompt,
				...path === void 0 ? {} : { path },
				...source === void 0 ? {} : { source },
				...outputFormat === void 0 ? {} : { outputFormat },
				...aspectRatio === void 0 ? {} : { aspectRatio }
			};
			const generated = validateGenerated(await adapter.generate(route.model, request, execution));
			return {
				provider: route.provider,
				model: route.model,
				...generated
			};
		}
	});
}
/** Registers one provider-specific schema and replaces it transactionally on Settings changes. */
function installGenerateImageTool(ctx, runtime) {
	let register;
	let current;
	let tail = Promise.resolve();
	const replace = () => {
		if (register === void 0) return;
		const next = createGenerateImageTool(runtime);
		const previous = current;
		previous?.dispose();
		try {
			current = {
				tool: next,
				dispose: register(next)
			};
		} catch (error) {
			current = previous === void 0 ? void 0 : {
				tool: previous.tool,
				dispose: register(previous.tool)
			};
			throw error;
		}
	};
	const controller = { reconcile() {
		const operation = tail.then(replace, replace);
		tail = operation.catch(() => {});
		return operation;
	} };
	ctx.inject(["tools"], (scope) => {
		register = (tool) => scope.tools.register(tool);
		replace();
		return () => {
			current?.dispose();
			current = void 0;
			register = void 0;
		};
	});
	return controller;
}
//#endregion
//#region lib/types/tool-catalog.js
function descriptionOf(entry) {
	const raw = entry.description;
	if (typeof raw !== "string") return "";
	return (raw.split("\n", 1)[0] ?? "").trim();
}
/**
* Read the Host's current tool set.
*
* Structural and best-effort: a deployment without the tools registry (or a
* registry that throws while listing) yields an empty catalog instead of failing
* the settings page.
*
* @param ctx - any host context on the profile.
* @returns Every exposed tool with its resolved origin, name-sorted.
*/
function readToolCatalog(ctx) {
	let tools;
	try {
		tools = ctx.get("tools", false);
	} catch {
		return [];
	}
	const schemas = tools?.schemas;
	if (typeof schemas !== "function") return [];
	let listed;
	try {
		listed = schemas.call(tools);
	} catch {
		return [];
	}
	if (!Array.isArray(listed)) return [];
	const catalog = [];
	for (const entry of listed) {
		const name = entry.name;
		if (typeof name !== "string" || name === "") continue;
		catalog.push({
			name,
			description: descriptionOf(entry),
			source: resolveToolSource(name)
		});
	}
	catalog.sort((left, right) => left.name.localeCompare(right.name));
	return catalog;
}
function statusResponse(status) {
	return new Response(status === 415 ? "Unsupported Media Type" : status === 500 ? "Internal Server Error" : "Bad Request", { status });
}
function binaryResponse(rpcId, result) {
	const response = {
		type: "server-response",
		rpcId,
		result
	};
	if (!result.ok) return Response.json(response);
	const { attachments, ...value } = result;
	const envelope = {
		...response,
		result: value
	};
	if (attachments === void 0 || attachments.length === 0) return Response.json(envelope);
	const parts = new FormData();
	const attachmentMetadata = attachments.map((attachment, index) => {
		const part = `bytes-${index}`;
		parts.set(part, new Blob([new Uint8Array(attachment.bytes)]));
		return {
			path: [...attachment.path],
			codec: "bytes",
			part
		};
	});
	parts.set("metadata", JSON.stringify({
		...envelope,
		attachments: attachmentMetadata
	}));
	return new Response(parts);
}
async function handleFetchRpc(request, handler, operator) {
	if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") return statusResponse(415);
	let body;
	try {
		body = await request.json();
	} catch {
		return statusResponse(400);
	}
	const parsed = clientRequestSchema.safeParse(body);
	if (!parsed.success || parsed.data.method !== "plugin-rpc/model-switch") return statusResponse(400);
	const wrapped = parsed.data.payload;
	if (typeof wrapped !== "object" || wrapped === null || Array.isArray(wrapped)) return statusResponse(400);
	if (Object.keys(wrapped).some((key) => key !== "endpoint" && key !== "payload")) return statusResponse(400);
	const { endpoint, payload } = wrapped;
	if (typeof endpoint !== "string") return statusResponse(400);
	try {
		const result = await handler(endpoint, payload, request.signal, operator);
		return binaryResponse(parsed.data.rpcId, result);
	} catch {
		return statusResponse(500);
	}
}
/** Bounded long-poll on the existing registry; each caller owns and disposes its subscription. */
function capabilitiesRpc(registry, snapshot, lifetime, catalog = () => ({
	tools: [],
	recommended: [...DEFAULT_READ_ONLY_TOOLS]
}), status = () => ({
	held: false,
	allowedCalls: 0,
	skippedReadOnly: 0
})) {
	let revision = 0;
	let previous;
	const read = () => {
		const capabilities = snapshot();
		const signature = JSON.stringify(capabilities);
		if (previous !== void 0 && signature !== previous) revision++;
		previous = signature;
		return {
			revision,
			capabilities
		};
	};
	return async (endpoint, payload, signal) => {
		if (endpoint === "tools") {
			if (payload === null || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).length !== 0) return {
				ok: false,
				error: {
					details: {},
					code: "invalid-request",
					message: "Expected an empty payload"
				}
			};
			return {
				ok: true,
				value: {
					...catalog(),
					status: status()
				}
			};
		}
		if (endpoint !== "capabilities") return {
			ok: false,
			error: {
				details: {},
				code: "unknown-endpoint",
				message: "Unknown Model Switch endpoint"
			}
		};
		if (payload === null || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).some((key) => key !== "revision")) return {
			ok: false,
			error: {
				details: {},
				code: "invalid-request",
				message: "Expected optional revision"
			}
		};
		const requested = payload.revision;
		if (requested !== void 0 && (typeof requested !== "number" || !Number.isSafeInteger(requested) || requested < 0)) return {
			ok: false,
			error: {
				details: {},
				code: "invalid-request",
				message: "Invalid capabilities revision"
			}
		};
		if (requested === read().revision && !lifetime.aborted && !signal.aborted) await new Promise((resolve) => {
			const finish = () => {
				clearTimeout(timer);
				unsubscribe();
				signal.removeEventListener("abort", finish);
				lifetime.removeEventListener("abort", finish);
				resolve();
			};
			const unsubscribe = registry.subscribe(finish);
			const timer = setTimeout(finish, 2e4);
			signal.addEventListener("abort", finish, { once: true });
			lifetime.addEventListener("abort", finish, { once: true });
		});
		if (lifetime.aborted || signal.aborted) return {
			ok: false,
			error: {
				details: {},
				code: "cancelled",
				message: "Capabilities subscription closed"
			}
		};
		return {
			ok: true,
			value: read()
		};
	};
}
function installCapabilitiesRpc(ctx, registry, snapshot) {
	ctx.inject(["connection"], (scope) => scope.effect(() => {
		const lifetime = new AbortController();
		const handler = capabilitiesRpc(registry, snapshot, lifetime.signal, () => ({
			tools: readToolCatalog(ctx),
			recommended: [...DEFAULT_READ_ONLY_TOOLS]
		}), () => ({
			held: autoReviewStatus.held,
			allowedCalls: autoReviewStatus.allowedCalls,
			skippedReadOnly: autoReviewStatus.skippedReadOnly,
			automode: automodeCompatView(),
			reviewTimeout: {
				configuredMs: reviewTimeoutStatus.configuredMs,
				applied: reviewTimeoutStatus.applied,
				hotApplied: reviewTimeoutStatus.hotApplied,
				hot: reviewTimeoutStatus.hot,
				hotReason: reviewTimeoutStatus.hotReason
			}
		}));
		const dispose = scope.connection.fetch.register({
			path: "/api/plugin-rpc/model-switch",
			methods: ["POST"],
			requestBody: "buffered",
			fetch: (request) => handleFetchRpc(request, handler, scope.connection.operator)
		});
		return async () => {
			lifetime.abort();
			await dispose();
		};
	}, "Model Switch: lifecycle-owned search capability metadata"));
}
//#endregion
//#region lib/types/deepseek-search-adapter.js
const DEFAULT_API_KEY_REF = "DEEPSEEK_API_KEY";
const SEARCH_BASE_URL_ENV = "DEEPSEEK_SEARCH_BASE_URL";
const DEEPSEEK_SEARCH_MODELS = [{
	id: DEEPSEEK_DEFAULT_MODEL,
	name: "DeepSeek-V4-Flash"
}, {
	id: "deepseek-v4-pro",
	name: "DeepSeek-V4-Pro"
}];
function readDeepSeekSection(ctx) {
	const loader = ctx.get("loader", false);
	let configured;
	for (const entry of loader?.entries() ?? []) {
		if (entry.id !== WEB_SEARCH_DEEPSEEK_SETTINGS_NAMESPACE) continue;
		configured = entry.fiber?.config;
		break;
	}
	const section = configured ?? Config$1({});
	const apiKey = section.apiKey.get();
	const baseURL = section.baseURL.get();
	return {
		...apiKey === void 0 ? {} : { apiKey },
		apiKeyEnv: section.apiKeyEnv.get(),
		...baseURL === void 0 ? {} : { baseURL },
		model: section.model.get(),
		apiVersion: section.apiVersion.get(),
		maxTokens: section.maxTokens.get(),
		maxUses: section.maxUses.get()
	};
}
function keyRef(section) {
	const name = section.apiKeyEnv ?? DEFAULT_API_KEY_REF;
	if (!isCredentialRefName(name)) throw new Error("invalid web-search-deepseek apiKeyEnv credential reference");
	return credentialRef(name);
}
function recordSearchRequest(ctx, request) {
	(ctx.get("agents")?.currentInitiator?.())?.session?.append("web/deepseek-search-llm-request", request);
}
function toProviderOptions(ctx, section, model) {
	const apiKeyEnv = keyRef(section);
	const literalApiKey = section.apiKey !== void 0 && section.apiKey.length > 0 ? section.apiKey : void 0;
	return {
		...literalApiKey === void 0 ? {} : { apiKey: literalApiKey },
		resolveApiKey: async () => {
			const credentials = ctx.get("credentials");
			if (credentials !== void 0) return (await credentials.resolve(apiKeyEnv))?.value;
			const ambient = launchEnvironmentOf(ctx).get(apiKeyEnv);
			return ambient !== void 0 && ambient.value.length > 0 ? ambient.value : void 0;
		},
		apiKeyEnv,
		baseURL: section.baseURL ?? launchEnvironmentOf(ctx).get(SEARCH_BASE_URL_ENV)?.value ?? DEEPSEEK_DEFAULT_BASE_URL,
		model,
		apiVersion: section.apiVersion ?? DEEPSEEK_DEFAULT_API_VERSION,
		maxTokens: section.maxTokens ?? DEEPSEEK_DEFAULT_MAX_TOKENS,
		maxUses: section.maxUses ?? DEEPSEEK_DEFAULT_MAX_USES,
		recordRequest: (request) => {
			recordSearchRequest(ctx, request);
		}
	};
}
var DeepSeekSearchAdapter = class {
	ctx;
	provider = DEEPSEEK_PROVIDER_ID;
	label = "DeepSeek";
	models = DEEPSEEK_SEARCH_MODELS;
	constructor(ctx) {
		this.ctx = ctx;
	}
	supportsModel(model) {
		return DEEPSEEK_SEARCH_MODELS.some((known) => known.id === model);
	}
	async search(model, request, signal) {
		if (!this.supportsModel(model)) throw new Error("search model is not supported by adapter: " + DEEPSEEK_PROVIDER_ID + "/" + model);
		const options = toProviderOptions(this.ctx, readDeepSeekSection(this.ctx), model);
		return new DeepSeekSearchProvider(() => options).search(request, signal);
	}
};
function installDeepSeekSearchAdapter(ctx) {
	ctx.inject(["modelSwitch"], (scope) => scope.effect(() => scope.modelSwitch.adapters.register({
		provider: DEEPSEEK_PROVIDER_ID,
		search: new DeepSeekSearchAdapter(ctx)
	}), "Model Switch: register DeepSeek search adapter"));
}
//#endregion
//#region lib/types/compatibility.js
/**
* Parse a dotted DSH version, tolerating a prerelease suffix.
* @param version - the raw version text.
* @returns the parsed parts, or undefined when the shape is unknown.
*/
function parseVersion(version) {
	const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version.trim());
	if (match === null) return void 0;
	return {
		base: [
			Number(match[1]),
			Number(match[2]),
			Number(match[3])
		],
		pre: match[4] === void 0 ? [] : match[4].split(".")
	};
}
/** Semver prerelease ordering for one identifier pair. */
function compareIdentifier(left, right) {
	const leftNumeric = /^\d+$/.test(left);
	const rightNumeric = /^\d+$/.test(right);
	if (leftNumeric && rightNumeric) return Number(left) - Number(right);
	if (leftNumeric) return -1;
	if (rightNumeric) return 1;
	return left < right ? -1 : left > right ? 1 : 0;
}
/**
* Order two DSH versions with prerelease semantics (`rc.2 < rc.3 < release`).
* @param left - first version.
* @param right - second version.
* @returns -1/0/1, or undefined when either side is unparsable.
*/
function compareDshVersions(left, right) {
	const a = parseVersion(left);
	const b = parseVersion(right);
	if (a === void 0 || b === void 0) return void 0;
	for (let index = 0; index < 3; index += 1) {
		const difference = a.base[index] - b.base[index];
		if (difference !== 0) return difference < 0 ? -1 : 1;
	}
	if (a.pre.length === 0 && b.pre.length === 0) return 0;
	if (a.pre.length === 0) return 1;
	if (b.pre.length === 0) return -1;
	const shared = Math.min(a.pre.length, b.pre.length);
	for (let index = 0; index < shared; index += 1) {
		const difference = compareIdentifier(a.pre[index], b.pre[index]);
		if (difference !== 0) return difference < 0 ? -1 : 1;
	}
	if (a.pre.length === b.pre.length) return 0;
	return a.pre.length < b.pre.length ? -1 : 1;
}
/**
* Read the floor out of a declared runtime range.
*
* Only the open-ended `>=x.y.z` form is understood: the declaration promises
* "this release and everything after it", so a bounded range is a different
* statement and is ignored rather than half-honoured.
*
* @param range - the declared range text.
* @returns the floor version, or undefined when absent/misunderstood.
*/
function runtimeFloorOf(range) {
	if (typeof range !== "string") return void 0;
	const match = /^\s*>=\s*([0-9A-Za-z.-]+)\s*$/.exec(range);
	return match === null ? void 0 : match[1];
}
/**
* Classify one runtime without treating the verified table as an allowlist.
*
* Precedence: a blocked version wins over everything; a version named in the
* evidence table is verified; otherwise a declared `dshRuntime` floor marks every
* runtime at or above it verified. Anything else stays unverified, and the mount
* path remains fail-open for it.
*
* @param version - Resolved DSH runtime version.
* @param verified - Releases with direct compatibility evidence.
* @param blocklist - Versions excluded after reproduced failures.
* @param runtimeRange - Declared open-ended floor (`>=x.y.z`).
* @returns The fail-open mount decision.
*/
function classifyDshRuntime(version, verified, blocklist = {}, runtimeRange) {
	const reason = blocklist[version];
	if (typeof reason === "string" && reason.trim() !== "") return {
		kind: "blocked",
		reason
	};
	if (verified.has(version)) return { kind: "verified" };
	const floor = runtimeFloorOf(runtimeRange);
	if (floor !== void 0) {
		const order = compareDshVersions(version, floor);
		if (order !== void 0 && order >= 0) return { kind: "verified" };
	}
	return { kind: "unverified" };
}
/**
* Apply the fail-open decision and emit at most one visible warning.
* @param logger - Host logger receiving compatibility warnings.
* @param pluginName - Plugin identifier used in diagnostics.
* @param version - Resolved DSH runtime version.
* @param verified - Releases with direct compatibility evidence.
* @param blocklist - Versions excluded after reproduced failures.
* @param runtimeRange - Declared open-ended floor (`>=x.y.z`).
* @returns Whether the host mount should continue.
*/
function shouldMountDshRuntime(logger, pluginName, version, verified, blocklist = {}, runtimeRange) {
	const decision = classifyDshRuntime(version, verified, blocklist, runtimeRange);
	if (decision.kind === "blocked") {
		logger.warn(`[${pluginName}] blocked on DSH ${version}: ${decision.reason}; see package.json#dsh.compatibility.blocklist`);
		return false;
	}
	if (decision.kind === "unverified") logger.warn(`[${pluginName}] best-effort on unverified runtime ${version}`);
	return true;
}
function readManifest() {
	try {
		return JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
	} catch {
		return {};
	}
}
function packageVersion(packageName) {
	try {
		const require = createRequire(import.meta.url);
		let directory = dirname(require.resolve(packageName));
		for (;;) {
			try {
				const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
				if (typeof manifest.version === "string" && manifest.version !== "") return manifest.version;
			} catch {}
			const parent = dirname(directory);
			if (parent === directory) return void 0;
			directory = parent;
		}
	} catch {
		return;
	}
}
/**
* Warn once for an unknown runtime while keeping the normal host mount path.
* @param logger - Host logger receiving compatibility warnings.
* @param pluginName - Plugin identifier used in diagnostics.
* @param candidates - DSH peer packages used to resolve the host version.
* @returns Whether the host mount should continue.
*/
function allowDshRuntime(logger, pluginName, candidates) {
	const version = process.env.DSH_VERSION?.trim() || candidates.map(packageVersion).find((value) => value !== void 0) || "unknown";
	const compatibility = readManifest().dsh?.compatibility;
	return shouldMountDshRuntime(logger, pluginName, version, new Set(Object.entries(compatibility?.dshReleases ?? {}).filter(([, status]) => status === "compatible" || status === "verified").map(([release]) => release)), compatibility?.blocklist, compatibility?.dshRuntime);
}
//#endregion
//#region lib/types/preset-sync.js
/** The preset ids those rows declare (`preset-…` is only the row id). */
const PRESET_IDS = [
	"standard",
	"ptc",
	"cordis"
];
/** The presentation row every preset uses for its child plugin list. */
const PRESET_PACKAGE = "@deepseek-ai/dsh-agent-preset";
/** DSH's own compaction engine inside a preset's compaction group. */
const OFFICIAL_COMPACTION_NAME = "@deepseek-ai/dsh-compaction-basic";
/** This plugin's routed engine row. */
const BRIDGED_COMPACTION_ID = "model-switch-compaction";
const BRIDGED_COMPACTION_NAME = "dsh-model-switch/compaction";
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isOfficialCompaction(row) {
	return row.name === OFFICIAL_COMPACTION_NAME;
}
function isBridgedCompaction(row) {
	return row !== void 0 && row.id === BRIDGED_COMPACTION_ID && row.name === BRIDGED_COMPACTION_NAME;
}
/**
* Swap the nested official compaction engine for this plugin's routed engine.
*
* Recurses through every nested entry list, so a preset that wraps its
* compaction group differently is still bridged. A list that carries no
* official engine is returned untouched. The transform is idempotent: a list
* whose official row is already disabled and already followed by the routed row
* reports `changed: false`.
* @param rows - one plugin list (a preset's `plugins` or a nested group's `config`).
* @returns The new list and whether anything changed.
*/
function bridgePresetPlugins(rows) {
	let changed = false;
	const bridged = [];
	for (let index = 0; index < rows.length; index += 1) {
		const source = rows[index];
		let row = source;
		if (Array.isArray(source.config)) {
			const nested = bridgePresetPlugins(source.config);
			if (nested.changed) {
				row = {
					...source,
					config: nested.rows
				};
				changed = true;
			}
		}
		if (isOfficialCompaction(row)) {
			const follower = rows[index + 1];
			const already = isBridgedCompaction(follower);
			if (!already || row.disabled !== true) {
				bridged.push({
					...row,
					disabled: true
				});
				if (!already) bridged.push({
					id: BRIDGED_COMPACTION_ID,
					name: BRIDGED_COMPACTION_NAME
				});
				changed = true;
				continue;
			}
		}
		bridged.push(row);
	}
	return {
		rows: bridged,
		changed
	};
}
/**
* Bridge one preset definition's plugin list.
* @param config - the preset row's stored config (`{ id, order, plugins }`).
* @returns The bridged config and whether anything changed.
*/
function bridgePresetConfig(config) {
	if (!isRecord(config) || !Array.isArray(config.plugins)) return {
		config,
		changed: false
	};
	const { rows, changed } = bridgePresetPlugins(config.plugins);
	if (!changed) return {
		config,
		changed: false
	};
	return {
		config: {
			...config,
			plugins: rows
		},
		changed: true
	};
}
/**
* Locate one preset row in the loader tree.
* @param loader - the host loader.
* @param id - the preset id (`standard`, `ptc`, `cordis`).
* @returns The declaring entry, or undefined when this profile has no such preset.
*/
function presetEntry(loader, id) {
	if (!loader) return void 0;
	for (const entry of loader.entries()) {
		if (entry.options?.name !== PRESET_PACKAGE) continue;
		const config = entry.options?.config;
		if (isRecord(config) && config.id === id) return entry;
	}
}
/**
* Bridge every shipped preset in the running composition.
*
* Runs at Host startup, before any session can use a preset, so the wrapped
* engine is in place for the first session. An entry that has not started yet
* has its raw config replaced (so the first activation already carries the
* bridge); a started entry is reloaded through the public loader update. A
* preset without a compaction group is skipped, and a bridge failure is logged
* without failing the row: the official presets keep working.
* @param ctx - the Host plugin context.
* @returns The preset ids that were bridged.
*/
async function bridgeAgentPresets(ctx) {
	let loader;
	try {
		loader = ctx.get("loader", false);
	} catch {
		loader = void 0;
	}
	if (loader === void 0) return [];
	const bridged = [];
	for (const id of PRESET_IDS) {
		const entry = presetEntry(loader, id);
		if (entry === void 0) continue;
		const { config, changed } = bridgePresetConfig(entry.options.config);
		if (!changed) continue;
		try {
			if (entry.fiber === void 0) entry.options.config = config;
			else await entry.update({ config });
			bridged.push(id);
		} catch (error) {
			ctx.logger.warn(`model-switch: failed to bridge agent preset ${id}: ${String(error)}`);
		}
	}
	return bridged;
}
//#endregion
//#region lib/types/host-runtime.js
/** Host owner for Model Switch settings. */
var ModelSwitchRuntime = class extends Service {
	static Config = Config;
	get capabilities() {
		const catalog = this.adapters.searchCatalog();
		return {
			...RUNTIME_CAPABILITIES,
			searchProviderAdapters: {
				available: true,
				providers: catalog.map((provider) => provider.id),
				catalog
			},
			autoReview: autoReviewStatus.held ? { available: true } : {
				available: false,
				reason: "auto-review-takeover"
			}
		};
	}
	adapters = new ModelSwitchAdapterRegistry();
	source;
	constructor(ctx, entry) {
		super(ctx, "modelSwitch");
		this.source = () => readConfig(entry);
		try {
			ctx.inject(["settings"], (scope) => scope.effect(() => scope.settings.configure({ auto: false }, ctx.fiber), "Model Switch: disable automatic settings form"));
			if (!allowDshRuntime(ctx.logger, "dsh-model-switch", ["@deepseek-ai/dsh-agent"])) return;
			installDeepSeekSearchAdapter(ctx);
			installModelSwitchSearchProvider(ctx, this);
			installCapabilitiesRpc(ctx, this.adapters, () => this.capabilities);
			const imageTool = installGenerateImageTool(ctx, this);
			ctx.on("loader/volatile-update", () => {
				imageTool.reconcile().catch((error) => {
					ctx.logger.error("Model Switch: failed to regenerate generate_image schema");
					ctx.logger.error(error);
				});
				ctx.emit("model-switch/settings-update");
			});
			ctx.emit("model-switch/settings-update");
			bridgeAgentPresets(ctx).then((bridged) => {
				if (bridged.length > 0) ctx.logger.info(`model-switch: bridged agent preset compaction rows (${bridged.join(", ")})`);
			}).catch((error) => ctx.logger.warn(`model-switch: agent preset bridge failed: ${String(error)}`));
		} catch (error) {
			ctx.logger.error("Model Switch: the host runtime could not finish installing; the modelSwitch service stays registered so dependent rows keep loading");
			ctx.logger.error(error);
		}
	}
	currentSettings() {
		return { ...this.source() };
	}
};
const CONTEXT_SUFFIX = /-(\d+)(k|m)$/iu;
/** Peel Fast and `-<n>k` / `-<n>m` in either order. Product names like `-max` stay. */
function parsePickerId(id) {
	let rest = id;
	let fast = false;
	let contextTier = null;
	let contextTokens;
	for (;;) {
		if (rest.endsWith("-fast") && rest.length > 5) {
			rest = rest.slice(0, -5);
			fast = true;
			continue;
		}
		const match = CONTEXT_SUFFIX.exec(rest);
		if (match !== null && match.index > 0) {
			const n = Number(match[1]);
			const unit = match[2].toLowerCase();
			rest = rest.slice(0, match.index);
			contextTier = `${n}${unit}`;
			contextTokens = unit === "m" ? n * 1e6 : n * 1e3;
			continue;
		}
		break;
	}
	return {
		base: rest,
		fast,
		contextTier,
		...contextTokens === void 0 ? {} : { contextTokens }
	};
}
function memberOf(model) {
	const parsed = parsePickerId(model.id);
	return {
		model,
		fast: parsed.fast,
		contextTier: parsed.contextTier,
		...parsed.contextTokens === void 0 ? {} : { contextTokens: parsed.contextTokens },
		thinking: model.reasoning !== void 0
	};
}
/** Group directory rows by provider + peeled base. */
function groupFamilies(groups) {
	const families = [];
	const index = /* @__PURE__ */ new Map();
	for (const group of groups) for (const model of group.models) {
		const parsed = parsePickerId(model.id);
		const key = `${group.id}\0${parsed.base}`;
		let family = index.get(key);
		if (family === void 0) {
			family = {
				provider: group.id,
				providerName: group.name,
				base: parsed.base,
				name: displayNameOf(model.name, parsed),
				members: []
			};
			index.set(key, family);
			families.push(family);
		}
		family.members.push(memberOf(model));
		if (!parsed.fast && parsed.contextTier === null) family.name = displayNameOf(model.name, parsed);
	}
	return families;
}
function displayNameOf(name, parsed) {
	let next = name;
	if (parsed.fast) next = next.replace(/\s+Fast$/iu, "");
	if (parsed.contextTier !== null) next = next.replace(/\s+(?:Max|1M)$/iu, "");
	return next.replace(/\s+/gu, " ").trim() || name;
}
//#endregion
//#region lib/types/picker/plan-review.js
function planReviewOf(questions) {
	if (questions.length !== 1) return void 0;
	const question = questions[0];
	if (question === void 0) return void 0;
	const intent = question.intent;
	if (intent?.kind !== "plan-review" || question.detail === void 0 || question.multiSelect === true) return void 0;
	const options = question.options ?? [];
	if (options.length > 2) return void 0;
	const approve = options.find((option) => option.label === intent.approve);
	if (approve === void 0) return void 0;
	const decline = options.find((option) => option.label !== intent.approve);
	return {
		id: question.id,
		question: question.question,
		plan: question.detail,
		...intent.callId === void 0 ? {} : { callId: intent.callId },
		approve,
		...decline === void 0 ? {} : { decline }
	};
}
function selectPlanReview(owner) {
	const interaction = owner.pendingInteraction;
	if (interaction === void 0 || interaction.kind !== "question" && interaction.kind !== "plan-review") return null;
	return planReviewOf(interaction.questions) === void 0 ? null : interaction;
}
/**
* Commit the execution model a Plan card holds, then run its exit.
*
* Shared by every exit (approve, keep, discuss, run-as-goal): the card's picker
* is a draft, so an exit that skipped this call left the session on the model
* the review opened with. An unchanged selection short-circuits without a
* second commit, and a refused commit returns `false` **without** running the
* exit, so the caller can keep the card open and show the error.
*
* @param args.select - commits one selection onto the session.
* @param args.selection - the execution model the card currently holds.
* @param args.current - the session's committed selection, for the short-circuit.
* @param args.answer - the exit to run once the commit landed.
* @returns whether the exit ran.
*/
async function approvePlanReview(args) {
	const current = args.current;
	if (!(current !== void 0 && current !== null && current.provider === args.selection.provider && current.model === args.selection.model && current.reasoningEffort === args.selection.reasoningEffort ? { committed: true } : await args.select(args.selection)).committed) return false;
	await args.answer();
	return true;
}
//#endregion
//#region lib/types/index.js
const name = "dsh-model-switch";
//#endregion
export { Config, ModelSwitchAdapterRegistry, ModelSwitchRuntime, ModelSwitchRuntime as default, RUNTIME_CAPABILITIES, approvePlanReview, groupFamilies, name, parsePickerId, planReviewOf, readConfig, selectPlanReview };
