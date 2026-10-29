window.__ModuleLoader__.load({
	id: "dsh-model-switch",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		let react_dom = require("react-dom");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		/** Catalog lookup by id. */
		const SOURCE_BY_ID = new Map([
			{
				id: "core",
				kind: "core",
				label: "DSH 核心",
				repo: "https://github.com/deepseek-ai/deepseek-harness"
			},
			{
				id: "dsh-ops",
				kind: "plugin",
				label: "插件 · dsh-ops",
				repo: "https://github.com/T-Auto/dsh-ops"
			},
			{
				id: "dsh-browser-cdp",
				kind: "plugin",
				label: "插件 · dsh-browser-cdp",
				repo: "https://github.com/drscrewdriver/dsh-browser-cdp"
			},
			{
				id: "dsh-auto-memory",
				kind: "plugin",
				label: "插件 · dsh-auto-memory",
				repo: "https://github.com/AskTheWay/dsh-auto-memory"
			},
			{
				id: "dsh-model-switch",
				kind: "plugin",
				label: "插件 · dsh-model-switch",
				repo: "https://github.com/vandoor7-droid/dsh-model-switch"
			},
			{
				id: "mcp:wincu",
				kind: "mcp",
				label: "MCP · wincu（dsh-computer-use-win）",
				repo: "https://github.com/Yu-tao-Li/dsh-computer-use-win"
			},
			{
				id: "qqbot-extension",
				kind: "extension",
				label: "QQ 机器人扩展（框架 @zaofan/dsh-qqbot）",
				repo: "https://github.com/zaofan-make/dsh-qqbot"
			}
		].map((entry) => [entry.id, entry]));
		/**
		* Tool names the released Host owns, calibrated against dsh 0.2.1-rc.2.
		*
		* A name outside the catalog would otherwise be reported as core, which is the
		* one guess a reader could act on wrongly; it resolves to `unknown` instead.
		*/
		const CORE_TOOLS = /* @__PURE__ */ new Set([
			"ask_user_question",
			"create_goal",
			"create_skill",
			"create_worktree",
			"edit",
			"exit_plan_mode",
			"get_goal",
			"glob",
			"grep",
			"interrupt_agent",
			"job_kill",
			"job_list",
			"job_output",
			"list_agents",
			"list_mcp_resource_templates",
			"list_mcp_resources",
			"load_workspace_dependencies",
			"present",
			"pwsh",
			"ralph",
			"read",
			"read_image",
			"read_mcp_resource",
			"schedule_create",
			"schedule_delete",
			"schedule_list",
			"schedule_update",
			"send_message",
			"session_event_read",
			"session_event_search",
			"session_event_trace",
			"session_search",
			"session_trace",
			"sidebar_open",
			"skill",
			"spawn_teammate",
			"subagent",
			"subagent_fork",
			"team_task_create",
			"team_task_get",
			"team_task_list",
			"team_task_update",
			"terminal_close",
			"terminal_list",
			"terminal_open",
			"terminal_read",
			"terminal_send",
			"terminal_signal",
			"todo_write",
			"update_goal",
			"wait_agent",
			"web_fetch",
			"web_search",
			"web_search_pro",
			"workflow",
			"working_directory",
			"write"
		]);
		/** MCP server name → catalog id, for the servers this allowlist knows. */
		const MCP_SERVERS = /* @__PURE__ */ new Map([["wincu", "mcp:wincu"]]);
		/** Plugin identity by tool-name prefix (checked before the core catalog). */
		const PLUGIN_PREFIXES = [
			["bcdp_", "dsh-browser-cdp"],
			["browser_window_", "dsh-browser-cdp"],
			["ops_", "dsh-ops"],
			["memory_", "dsh-auto-memory"]
		];
		/** Single plugin tools that carry no prefix. */
		const PLUGIN_TOOLS = /* @__PURE__ */ new Map([["generate_image", "dsh-model-switch"]]);
		/** `<base>__<owner>` — the extension-tool naming the QQ bot framework uses. */
		const EXTENSION_TOOL = /^([A-Za-z0-9_-]+)__(.+)$/;
		/**
		* Default allowlist: every pure-read tool this deployment exposes plus the
		* no-side-effect and autonomy entries the user explicitly released, calibrated
		* on a live desktop profile (105 tools) at dsh 0.2.1-rc.2.
		*
		* Grouped by origin so a reader can trace each entry through {@link SOURCE_CATALOG}.
		* Entries ending in `*` are patterns: the QQ bot extension suffixes its tools with
		* the bot's own name, so `sessions_list__*` keeps working when the persona is
		* renamed.
		*
		* Everything here follows one rule: releasing it must not let a side effect escape
		* the reviewer. Calls that merely dispatch, ask, present, wait or navigate qualify
		* because the work they trigger still runs under the same auto preset. Delegation
		* tools (`subagent`, `subagent_fork`, `spawn_teammate`) deliberately stay out: a
		* child session seeds its preset from `permissionPresets.current(parent.session)`,
		* and this bypass answers `'custom'` for an allowlisted call in flight — releasing
		* them would hand the child no `auto` preset at all, i.e. no review.
		*/
		const DEFAULT_READ_ONLY_TOOLS = [
			"read",
			"grep",
			"glob",
			"read_image",
			"skill",
			"web_search",
			"web_search_pro",
			"web_fetch",
			"load_workspace_dependencies",
			"ask_user_question",
			"present",
			"sidebar_open",
			"exit_plan_mode",
			"job_list",
			"job_output",
			"terminal_list",
			"terminal_read",
			"list_agents",
			"team_task_list",
			"team_task_get",
			"get_goal",
			"schedule_list",
			"wait_agent",
			"send_message",
			"team_task_create",
			"list_mcp_resources",
			"list_mcp_resource_templates",
			"read_mcp_resource",
			"session_search",
			"session_event_search",
			"session_event_read",
			"session_event_trace",
			"session_trace",
			"create_goal",
			"schedule_create",
			"terminal_open",
			"ops_read_files",
			"ops_discover_tools",
			"bcdp_status",
			"bcdp_help",
			"bcdp_doctor",
			"bcdp_snapshot",
			"browser_window_status",
			"memory_list",
			"memory_read",
			"mcp__wincu__windows_computer_use_accessibility_tree",
			"mcp__wincu__windows_computer_use_element_info",
			"mcp__wincu__windows_computer_use_find",
			"mcp__wincu__windows_computer_use_health",
			"mcp__wincu__windows_computer_use_list_windows",
			"mcp__wincu__windows_computer_use_ocr",
			"mcp__wincu__windows_computer_use_screenshot",
			"mcp__wincu__windows_computer_use_snapshot",
			"mcp__wincu__windows_computer_use_tools",
			"mcp__wincu__windows_computer_use_wait",
			"mcp__wincu__windows_computer_use_wait_for",
			"sessions_list__*",
			"bing_search__*"
		];
		/**
		* Validate one allowlist entry.
		*
		* `*` is a suffix wildcard: the entry must keep at least one literal leading
		* character, so a stray `*` can never turn the list into "allow everything".
		*
		* @param entry - the raw entry as typed in settings.
		* @returns `ok`, or the specific problem.
		*/
		function validateAllowEntry(entry) {
			const trimmed = entry.trim();
			if (trimmed === "") return "empty";
			if (/^\*+$/.test(trimmed)) return "bare-wildcard";
			if (trimmed.startsWith("*")) return "leading-wildcard";
			return "ok";
		}
		/**
		* Whether a tool name matches one allowlist entry.
		*
		* Exact names match exactly; an entry may end in `*`, which matches any
		* remaining characters (including none). Invalid entries never match.
		*
		* @param name - the tool name from `exec.name`.
		* @param entry - one allowlist entry.
		* @returns true when the call may skip review.
		*/
		function matchesAllowPattern(name, entry) {
			if (name === "" || validateAllowEntry(entry) !== "ok") return false;
			const trimmed = entry.trim();
			const star = trimmed.indexOf("*");
			if (star === -1) return name === trimmed;
			const prefix = trimmed.slice(0, star);
			const suffix = trimmed.slice(star + 1);
			if (!name.startsWith(prefix) || !name.endsWith(suffix)) return false;
			return name.length >= prefix.length + suffix.length;
		}
		/**
		* Whether a tool name is covered by an allowlist.
		* @param name - the tool name under review.
		* @param allowlist - configured entries, patterns included.
		* @returns true when at least one entry matches.
		*/
		function isAllowedByList(name, allowlist) {
			return allowlist.some((entry) => matchesAllowPattern(name, entry));
		}
		/**
		* Resolve the origin of one tool name for display.
		*
		* Resolution order: MCP bridge → `<tool>__<owner>` extension → plugin prefix →
		* plugin table → core catalog → unknown. Only the first two are structural; the
		* rest are calibrated names, so an unlisted tool is reported as unknown rather
		* than guessed into a package.
		*
		* @param name - the tool name.
		* @returns The origin, with its repository when known.
		*/
		function resolveToolSource(name) {
			const trimmed = name.trim().replace(/\*+$/, "");
			const mcp = /^mcp__([A-Za-z0-9_-]+)__/.exec(trimmed);
			if (mcp !== null) {
				const server = mcp[1];
				const entry = SOURCE_BY_ID.get(MCP_SERVERS.get(server) ?? "");
				if (entry !== void 0) return {
					kind: "mcp",
					label: entry.label,
					repo: entry.repo,
					owner: server
				};
				return {
					kind: "mcp",
					label: `MCP · ${server}`,
					owner: server
				};
			}
			const extension = EXTENSION_TOOL.exec(trimmed);
			if (extension !== null && !trimmed.startsWith("mcp__")) {
				const entry = SOURCE_BY_ID.get("qqbot-extension");
				const base = extension[1];
				const owner = extension[2];
				return {
					kind: "extension",
					label: `扩展 · ${base}__${owner}`,
					...entry === void 0 ? {} : { repo: entry.repo },
					owner
				};
			}
			if (trimmed.endsWith("__")) {
				const entry = SOURCE_BY_ID.get("qqbot-extension");
				return {
					kind: "extension",
					label: `扩展 · ${trimmed.slice(0, -2)}__*`,
					...entry === void 0 ? {} : { repo: entry.repo },
					owner: "*"
				};
			}
			for (const [prefix, id] of PLUGIN_PREFIXES) {
				if (!trimmed.startsWith(prefix)) continue;
				const entry = SOURCE_BY_ID.get(id);
				if (entry !== void 0) return {
					kind: "plugin",
					label: entry.label,
					repo: entry.repo,
					owner: id
				};
			}
			const plugin = PLUGIN_TOOLS.get(trimmed);
			if (plugin !== void 0) {
				const entry = SOURCE_BY_ID.get(plugin);
				if (entry !== void 0) return {
					kind: "plugin",
					label: entry.label,
					repo: entry.repo,
					owner: plugin
				};
			}
			if (CORE_TOOLS.has(trimmed)) {
				const entry = SOURCE_BY_ID.get("core");
				return {
					kind: "core",
					label: entry?.label ?? "DSH 核心",
					...entry === void 0 ? {} : { repo: entry.repo },
					owner: "core"
				};
			}
			return {
				kind: "unknown",
				label: "未知来源"
			};
		}
		//#endregion
		//#region src/client-contract.ts
		const MODEL_SWITCH_CONFIG_ID = "model-switch";
		const PROVIDERS_CONFIG_ID = "llm-providers-ui";
		const SUBAGENT_SETTINGS_FIELDS = Object.freeze({
			mode: "subagentMode",
			provider: "subagentProvider",
			model: "subagentModel",
			reasoningEffort: "subagentReasoningEffort"
		});
		/** Instant Subagent header toggle. Off keeps the stored `follow-main` unset token. */
		function subagentModeForEnabled(enabled) {
			return enabled ? "fixed" : "follow-main";
		}
		const SEARCH_SETTINGS_FIELDS = Object.freeze({
			provider: "searchProvider",
			model: "searchModel"
		});
		const IMAGE_SETTINGS_FIELDS = Object.freeze({
			provider: "imageProvider",
			model: "imageModel"
		});
		/** Auto-preset reviewer route; both unset means the reviewer follows the session model. */
		const AUTO_REVIEW_SETTINGS_FIELDS = Object.freeze({
			provider: "autoReviewProvider",
			model: "autoReviewModel"
		});
		Object.freeze({
			enabled: "autoReviewSkipReadOnly",
			tools: "autoReviewAllowlist"
		});
		/** Upstream ceiling enforced by `@deepseek-ai/dsh-timeout` (MAX_TIMER_DELAY_MS). */
		const UPSTREAM_MAX_IDLE_TIMEOUT_MS = 2147483647;
		/**
		* Derive the allowlist editor's value.
		*
		* An absent list means "never configured" and shows the shipped defaults; an
		* explicitly emptied list stays empty, so clearing it is not undone by a reload.
		*/
		function deriveAutoReviewAllowlist(settings) {
			return {
				enabled: settings.autoReviewSkipReadOnly === true,
				tools: Array.isArray(settings.autoReviewAllowlist) ? [...settings.autoReviewAllowlist] : [...DEFAULT_READ_ONLY_TOOLS]
			};
		}
		/** Compaction summarization route for `/compact` and automatic compaction; both unset means the official default (the conversation target). */
		const COMPACTION_SETTINGS_FIELDS = Object.freeze({
			provider: "compactProvider",
			model: "compactModel"
		});
		/** Automatic session-title naming route; both unset means the official default (the session's own logged route). */
		const TITLE_SETTINGS_FIELDS = Object.freeze({
			provider: "titleProvider",
			model: "titleModel"
		});
		/** Distillation route handed to the memory plugin when it follows its own default. */
		const MEMORY_SETTINGS_FIELDS = Object.freeze({
			provider: "memoryProvider",
			model: "memoryModel"
		});
		function deriveSubagentSettings(settings) {
			return {
				mode: settings.subagentMode,
				...settings.subagentProvider === void 0 ? {} : { provider: settings.subagentProvider },
				...settings.subagentModel === void 0 ? {} : { model: settings.subagentModel },
				...settings.subagentReasoningEffort === void 0 ? {} : { reasoningEffort: settings.subagentReasoningEffort }
			};
		}
		function deriveSearchSettings(settings) {
			return {
				...settings.searchProvider === void 0 ? {} : { provider: settings.searchProvider },
				...settings.searchModel === void 0 ? {} : { model: settings.searchModel }
			};
		}
		function deriveImageSettings(settings) {
			return {
				...settings.imageProvider === void 0 ? {} : { provider: settings.imageProvider },
				...settings.imageModel === void 0 ? {} : { model: settings.imageModel }
			};
		}
		function deriveAutoReviewSettings(settings) {
			return {
				...settings.autoReviewProvider === void 0 ? {} : { provider: settings.autoReviewProvider },
				...settings.autoReviewModel === void 0 ? {} : { model: settings.autoReviewModel }
			};
		}
		function deriveCompactionSettings(settings) {
			return {
				...settings.compactProvider === void 0 ? {} : { provider: settings.compactProvider },
				...settings.compactModel === void 0 ? {} : { model: settings.compactModel }
			};
		}
		function deriveTitleSettings(settings) {
			return {
				...settings.titleProvider === void 0 ? {} : { provider: settings.titleProvider },
				...settings.titleModel === void 0 ? {} : { model: settings.titleModel }
			};
		}
		function deriveMemorySettings(settings) {
			return {
				...settings.memoryProvider === void 0 ? {} : { provider: settings.memoryProvider },
				...settings.memoryModel === void 0 ? {} : { model: settings.memoryModel }
			};
		}
		/** Whether both fields of a model route form a complete pair; an incomplete pair stays off. */
		function routePairConfigured(route) {
			return route !== void 0 && (route.provider ?? "").trim() !== "" && (route.model ?? "").trim() !== "";
		}
		/**
		* Decode the reviewer counters from a `tools` RPC payload.
		* @param value - the RPC result value.
		* @returns The counters, or undefined when the Host does not report them.
		*/
		function decodeReviewStatus(value) {
			if (value === null || typeof value !== "object" || Array.isArray(value)) return void 0;
			const raw = value.status;
			if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return void 0;
			const status = raw;
			const count = (input) => typeof input === "number" && Number.isFinite(input) && input >= 0 ? input : 0;
			const route = (input) => typeof input === "string" && input.trim() !== "" ? input.trim() : void 0;
			const automode = status.automode !== null && typeof status.automode === "object" && !Array.isArray(status.automode) ? (() => {
				const row = status.automode;
				if (row.installed !== true) return void 0;
				return {
					route: route(row.route),
					routeSkipped: route(row.routeSkipped),
					added: count(row.added),
					skipped: count(row.skipped)
				};
			})() : void 0;
			return {
				held: status.held === true,
				allowedCalls: count(status.allowedCalls),
				skippedReadOnly: count(status.skippedReadOnly),
				automode
			};
		}
		/**
		* Decode the `tools` RPC payload.
		*
		* Malformed entries are skipped rather than failing the page: the catalog is a
		* convenience view over the Host's tools, and a partial list is still useful.
		*
		* @param value - the RPC result value.
		* @returns The rows, or undefined when the payload is not a catalog at all.
		*/
		function decodeToolCatalog(value) {
			if (value === null || typeof value !== "object" || Array.isArray(value)) return void 0;
			const listed = value.tools;
			if (!Array.isArray(listed)) return void 0;
			const rows = [];
			for (const entry of listed) {
				if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
				const raw = entry;
				if (typeof raw.name !== "string" || raw.name === "") continue;
				const source = raw.source !== null && typeof raw.source === "object" && !Array.isArray(raw.source) ? raw.source : {};
				rows.push({
					name: raw.name,
					description: typeof raw.description === "string" ? raw.description : "",
					sourceLabel: typeof source.label === "string" ? source.label : "未知来源",
					...typeof source.repo === "string" ? { repo: source.repo } : {},
					recommended: isAllowedByList(raw.name, DEFAULT_READ_ONLY_TOOLS)
				});
			}
			return rows;
		}
		//#endregion
		//#region src/client/derived-config-form.ts
		function deriveConfigForm(source, project, fields) {
			let sourceSnapshot;
			let viewSnapshot;
			const getSnapshot = () => {
				const current = source.getSnapshot();
				if (current === sourceSnapshot && viewSnapshot !== void 0) return viewSnapshot;
				sourceSnapshot = current;
				const next = {
					...current,
					value: current.value === void 0 ? void 0 : project(current.value)
				};
				viewSnapshot = next;
				return next;
			};
			const write = async (operation, field, value) => {
				const sourceField = fields[field];
				if (!(operation === "set" ? await source.set(sourceField, value) : await source.unset(sourceField))) throw new Error("settings-rejected");
			};
			/**
			* Batch write: map every view field through the same `fields` table `set`/`unset`
			* use, so one atomic source mutate can carry a whole row's worth of edits under
			* a single revision fence instead of N independent fenced writes.
			*/
			const mutate = async (ops, expectedRevision) => {
				const mapped = ops.map((op) => op.value === void 0 ? {
					op: "unset",
					path: [fields[op.field]]
				} : {
					op: "set",
					path: [fields[op.field]],
					value: op.value
				});
				if (!await source.mutate(mapped, expectedRevision)) throw new Error("settings-rejected");
			};
			return {
				getSnapshot,
				subscribe: (listener) => source.subscribe(listener),
				set: (field, value) => write("set", field, value),
				unset: (field) => write("unset", field),
				mutate
			};
		}
		//#endregion
		//#region src/runtime-capabilities.ts
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
		//#region src/client/search-capabilities.ts
		function record$1(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
		}
		function cleanId(value) {
			return typeof value === "string" && value.trim() !== "" ? value : void 0;
		}
		function decodeModel(value) {
			const item = record$1(value);
			const id = item === void 0 ? void 0 : cleanId(item.id);
			const name = item === void 0 ? void 0 : cleanId(item.name);
			return id === void 0 || name === void 0 ? void 0 : {
				id,
				name
			};
		}
		/**
		* Strictly decode the Host search catalog into fresh plain metadata. Any malformed
		* entry fails the whole catalog (undefined): when the Host claims search is
		* available, invalid config must surface as an error, never hide as dropped rows.
		* Extra fields (functions, credentials) never survive: only id/name copy over.
		*/
		function decodeSearchCatalog(value) {
			if (!Array.isArray(value)) return void 0;
			const providers = [];
			for (const item of value) {
				const entry = record$1(item);
				const id = entry === void 0 ? void 0 : cleanId(entry.id);
				const name = entry === void 0 ? void 0 : cleanId(entry.name);
				if (entry === void 0 || id === void 0 || name === void 0 || !Array.isArray(entry.models)) return void 0;
				const models = [];
				for (const model of entry.models) {
					const decoded = decodeModel(model);
					if (decoded === void 0) return void 0;
					models.push(decoded);
				}
				providers.push({
					id,
					name,
					models
				});
			}
			return providers;
		}
		/**
		* Strictly decode one capabilities long-poll value; undefined when untrusted.
		* Only the decoded search block is taken from the network and overlaid onto the
		* frozen local defaults: no arbitrary Host fields pass through.
		*/
		function decodeCapabilitiesSnapshot(value) {
			const payload = record$1(value);
			const revision = payload?.revision;
			if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) return void 0;
			const capabilities = payload?.capabilities === void 0 ? void 0 : record$1(payload.capabilities);
			if (capabilities === void 0) return void 0;
			const search = record$1(capabilities.searchProviderAdapters);
			if (search === void 0 || typeof search.available !== "boolean") return void 0;
			if (search.providers !== void 0 && (!Array.isArray(search.providers) || !search.providers.every((id) => typeof id === "string"))) return void 0;
			const catalog = search.catalog === void 0 ? [] : decodeSearchCatalog(search.catalog);
			if (catalog === void 0) return void 0;
			return {
				revision,
				capabilities: {
					...RUNTIME_CAPABILITIES,
					searchProviderAdapters: {
						available: search.available,
						providers: search.providers ?? [],
						catalog
					}
				}
			};
		}
		/** Project already-validated Host search metadata onto group shape (no re-decode). */
		function searchGroupsFromCapabilities(capabilities) {
			const catalog = capabilities?.searchProviderAdapters.catalog;
			if (catalog === void 0) return [];
			return catalog.map((provider) => ({
				id: provider.id,
				name: provider.name,
				models: provider.models.map((model) => ({
					id: model.id,
					name: model.name
				}))
			}));
		}
		//#endregion
		//#region src/provider-group.ts
		const ROUTE_FIELDS = Object.freeze([
			"compactProvider",
			"compactModel",
			"autoReviewProvider",
			"autoReviewModel",
			"subagentProvider",
			"subagentModel",
			"subagentReasoningEffort",
			"titleProvider",
			"titleModel",
			"memoryProvider",
			"memoryModel"
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
		function present$1(value) {
			return typeof value === "string" && value.trim() !== "";
		}
		/** Normalize one raw entry to its owning provider and route view; undefined for non-object junk. */
		function normalizeEntry(value) {
			if (value === null || typeof value !== "object" || Array.isArray(value)) return void 0;
			const source = value;
			const group = {};
			for (const field of ROUTE_FIELDS) {
				const item = source[field];
				if (present$1(item)) group[field] = item;
			}
			return {
				provider: present$1(source.provider) ? source.provider : "",
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
		/** Storage entry for one provider's group; absent or blank route fields become ''. */
		function entryOf(provider, group) {
			return {
				provider,
				compactProvider: group.compactProvider ?? "",
				compactModel: group.compactModel ?? "",
				autoReviewProvider: group.autoReviewProvider ?? "",
				autoReviewModel: group.autoReviewModel ?? "",
				subagentProvider: group.subagentProvider ?? "",
				subagentModel: group.subagentModel ?? "",
				subagentReasoningEffort: group.subagentReasoningEffort ?? "",
				titleProvider: group.titleProvider ?? "",
				titleModel: group.titleModel ?? "",
				memoryProvider: group.memoryProvider ?? "",
				memoryModel: group.memoryModel ?? ""
			};
		}
		/**
		* The stored entry list with one provider's group replaced (an entry) or
		* removed (undefined). Every entry is re-normalized and de-duplicated so a
		* save can never write junk back; the input is never mutated. A blank
		* provider only normalizes.
		*/
		function withProviderGroup(storage, provider, group) {
			const groups = { ...normalizeProviderGroups(storage) };
			if (provider.trim() !== "") {
				if (group === void 0) delete groups[provider];
				else setKey(groups, provider, group);
			}
			return Object.entries(groups).map(([key, value]) => entryOf(key, value));
		}
		//#endregion
		//#region src/session-route.ts
		/** Flat deployment-default fields per capability, in group-storage field names. */
		const CAPABILITY_FIELDS = Object.freeze({
			compaction: {
				provider: "compactProvider",
				model: "compactModel"
			},
			autoReview: {
				provider: "autoReviewProvider",
				model: "autoReviewModel"
			},
			title: {
				provider: "titleProvider",
				model: "titleModel"
			},
			subagent: {
				provider: "subagentProvider",
				model: "subagentModel"
			},
			memory: {
				provider: "memoryProvider",
				model: "memoryModel"
			}
		});
		/** A non-blank string; blank values behave exactly like an absent field. */
		function present(value) {
			return typeof value === "string" && value.trim() !== "";
		}
		/** Read one capability's pair from a flat route record; undefined unless both halves are present. */
		function pairOf(source, fields) {
			if (source === void 0) return void 0;
			const record = source;
			const provider = record[fields.provider];
			const model = record[fields.model];
			if (!present(provider) || !present(model)) return void 0;
			return {
				provider,
				model
			};
		}
		/**
		* Every provider group that overrides one capability, provider-sorted.
		*
		* Reads the stored table only and never attributes a session, so a caller can
		* describe the layering ("this is the default; these groups override it")
		* without claiming which layer a given session receives.
		* @param groups - the normalized provider → group map.
		* @param capability - capability whose group pins are collected.
		* @returns The complete pins, ordered by provider id; empty when no group pins it.
		*/
		function capabilityGroupPins(groups, capability) {
			const pins = [];
			if (groups === void 0) return pins;
			for (const provider of Object.keys(groups).sort()) {
				const group = groups[provider];
				const route = pairOf(group, CAPABILITY_FIELDS[capability]);
				if (route === void 0) continue;
				const effort = capability === "subagent" ? group?.subagentReasoningEffort : void 0;
				pins.push(present(effort) ? {
					provider,
					route,
					reasoningEffort: effort
				} : {
					provider,
					route
				});
			}
			return pins;
		}
		//#endregion
		//#region src/client/plugin-rpc.ts
		function callPluginRpc(rpc, method, endpoint, payload, signal) {
			return rpc.call("/api", method, {
				endpoint,
				payload
			}, signal);
		}
		//#endregion
		//#region src/client/picker/external-catalog.ts
		/** Overlay groups from External Agent catalog onto the LLM session.models snapshot. */
		function mergePickerGroups(base, extra) {
			if (extra.length === 0) return base;
			const ids = new Set(extra.map((group) => group.id));
			return [...base.filter((group) => !ids.has(group.id)), ...extra];
		}
		//#endregion
		//#region src/client/antigravity-catalog.ts
		/** Agent role owned by ProviderDirectory (dsh-llm-providers-ui), never hardcoded by Model Switch. */
		const AGENT_ROLE = "agent";
		/**
		* Antigravity's authenticated plugin route; this plugin has no build dependency on its owner.
		*/
		const ANTIGRAVITY_CATALOG_METHOD = "plugin-rpc/antigravity";
		const ANTIGRAVITY_CATALOG_ENDPOINT = "catalog";
		function record(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
		}
		/** Retain supported effort choices from the remote catalog. */
		function decodeReasoning(value) {
			const item = record(value);
			if (item === void 0 || !Array.isArray(item.efforts)) return void 0;
			const efforts = [];
			for (const entry of item.efforts) {
				const effort = record(entry);
				if (effort === void 0 || typeof effort.id !== "string" || typeof effort.name !== "string") continue;
				efforts.push({
					id: effort.id,
					name: effort.name
				});
			}
			if (efforts.length === 0) return void 0;
			return {
				efforts,
				defaultEffort: typeof item.defaultEffort === "string" && efforts.some((effort) => effort.id === item.defaultEffort) ? item.defaultEffort : efforts[0].id
			};
		}
		const NATIVE_EFFORTS = [
			"high",
			"medium",
			"low"
		];
		function collapseNativeEfforts(models) {
			if (models.some((model) => model.reasoning !== void 0)) return models;
			const groups = /* @__PURE__ */ new Map();
			const order = [];
			for (const model of models) {
				let logical = model.id;
				let effort;
				for (const item of NATIVE_EFFORTS) {
					const suffix = "-" + item;
					if (model.id.endsWith(suffix) && model.id.length > suffix.length) {
						logical = model.id.slice(0, -suffix.length);
						effort = item;
						break;
					}
				}
				let group = groups.get(logical);
				if (group === void 0) {
					let name = model.name;
					for (const label of [
						" (High)",
						" (Medium)",
						" (Low)"
					]) if (name.endsWith(label)) name = name.slice(0, -label.length);
					group = {
						name,
						efforts: []
					};
					groups.set(logical, group);
					order.push(logical);
				}
				if (effort !== void 0 && !group.efforts.includes(effort)) group.efforts.push(effort);
				if (effort === void 0) group.name = model.name;
			}
			return order.map((id) => {
				const group = groups.get(id);
				const efforts = NATIVE_EFFORTS.filter((item) => group.efforts.includes(item)).map((item) => ({
					id: item,
					name: item[0].toUpperCase() + item.slice(1)
				}));
				return {
					id,
					name: group.name,
					...efforts.length === 0 ? {} : { reasoning: {
						efforts,
						defaultEffort: group.efforts.includes("high") ? "high" : efforts[0].id
					} }
				};
			});
		}
		/** Strictly decode one Enabled-catalog group; malformed groups are dropped, never thrown. */
		function decodeGroup(value) {
			const group = record(value);
			if (group === void 0 || typeof group.id !== "string" || typeof group.name !== "string" || !Array.isArray(group.models)) return void 0;
			const models = [];
			for (const item of group.models) {
				const model = record(item);
				if (model === void 0 || typeof model.id !== "string" || typeof model.name !== "string") continue;
				const reasoning = decodeReasoning(model.reasoning);
				models.push({
					id: model.id,
					name: model.name,
					...reasoning === void 0 ? {} : { reasoning }
				});
			}
			if (models.length === 0) return void 0;
			return {
				id: group.id,
				name: group.name,
				models: collapseNativeEfforts(models)
			};
		}
		/** Decode the Enabled-catalog payload; anything malformed decodes to no groups. */
		function decodeAntigravityCatalogGroups(value) {
			const payload = record(value);
			if (payload === void 0 || !Array.isArray(payload.groups)) return [];
			const groups = [];
			for (const item of payload.groups) {
				const group = decodeGroup(item);
				if (group !== void 0) groups.push(group);
			}
			return groups;
		}
		/**
		* Read the Enabled catalog; resolves to no groups when Antigravity is absent,
		* unreachable, or malformed. Never throws: the Host catalog stays authoritative.
		*/
		async function fetchAntigravityCatalogGroups(rpc) {
			if (rpc === void 0) return [];
			try {
				const result = await callPluginRpc(rpc, ANTIGRAVITY_CATALOG_METHOD, ANTIGRAVITY_CATALOG_ENDPOINT, {});
				return result.ok ? decodeAntigravityCatalogGroups(result.value) : [];
			} catch {
				return [];
			}
		}
		/** Overlay Enabled-catalog groups onto the Host catalog without duplicating ids. */
		function withAntigravityCatalog(base, extra) {
			return mergePickerGroups(base, extra);
		}
		/** Read one Provider role from the owner directory; undefined when the seam is absent. */
		function readProviderRole(directory, key) {
			if (directory === null || typeof directory !== "object" && typeof directory !== "function") return void 0;
			const roleOf = directory.roleOf;
			if (typeof roleOf !== "function") return void 0;
			const catalogRoutes = directory.catalogRoutes;
			const routes = typeof catalogRoutes === "function" ? catalogRoutes.call(directory) : void 0;
			const role = roleOf.call(directory, routes?.[key] ?? key);
			return typeof role === "string" ? role : void 0;
		}
		/** Whether a ProviderDirectory-owned role marks an Agent provider. */
		function isAgentRole(role) {
			return role === AGENT_ROLE;
		}
		/** Resolve a stored native `…-high|medium|low` id to the collapsed catalog row. */
		function matchCatalogModel(models, modelId) {
			if (modelId === void 0) return void 0;
			const exact = models.find((model) => model.id === modelId);
			if (exact !== void 0) return { model: exact };
			for (const effort of NATIVE_EFFORTS) {
				const suffix = "-" + effort;
				if (!modelId.endsWith(suffix) || modelId.length <= suffix.length) continue;
				const logical = models.find((model) => model.id === modelId.slice(0, -suffix.length));
				if (logical?.reasoning?.efforts.some((option) => option.id === effort)) return {
					model: logical,
					effort
				};
			}
		}
		//#endregion
		//#region src/client/main-row-controller.ts
		/** Build a settings route for a newly selected model using only that model's default effort. */
		function selectRouteModel(groups, provider, model) {
			const defaultEffort = groups.find((group) => group.id === provider)?.models.find((item) => item.id === model)?.reasoning?.defaultEffort;
			return {
				provider,
				model,
				...defaultEffort === void 0 ? {} : { reasoningEffort: defaultEffort }
			};
		}
		function deriveRouteChoices(groups, route, allowedProviders) {
			const allowed = allowedProviders === void 0 ? void 0 : new Set(allowedProviders);
			const providers = groups.filter((group) => allowed === void 0 || allowed.has(group.id)).map((group) => ({
				id: group.id,
				name: group.name
			}));
			if (route?.provider !== void 0 && !providers.some((option) => option.id === route.provider)) providers.push({
				id: route.provider,
				name: route.provider,
				unavailable: true
			});
			const models = (groups.find((item) => item.id === route?.provider)?.models ?? []).map((model) => ({
				id: model.id,
				name: model.name
			}));
			if (route?.model !== void 0 && !models.some((option) => option.id === route.model)) models.push({
				id: route.model,
				name: route.model,
				unavailable: true
			});
			return {
				providers,
				models
			};
		}
		/** Load the model catalog backing every route editor, reloading on provider-order changes. */
		function useSettingsCatalog(input) {
			const [groups, setGroups] = (0, react.useState)([]);
			const [catalogError, setCatalogError] = (0, react.useState)();
			(0, react.useEffect)(() => {
				let live = true;
				const load = () => {
					input.loadCatalog().then((value) => {
						if (live) {
							setGroups(value);
							setCatalogError(void 0);
						}
					}).catch(() => {
						if (live) setCatalogError(input.t("catalogFailed"));
					});
				};
				load();
				const stop = input.subscribeProviderOrder?.(() => {
					if (live) load();
				});
				return () => {
					live = false;
					stop?.();
				};
			}, [
				input.loadCatalog,
				input.subscribeProviderOrder,
				input.t
			]);
			return {
				groups,
				catalogError
			};
		}
		//#endregion
		//#region \0dsh-css:src/client/ModelSwitchSettings.module.css.mjs
		const css$2 = ".djvrPG_section{max-width:720px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:12px;display:flex;container-type:inline-size}.djvrPG_title{margin:0;font-size:16px;font-weight:500;line-height:24px}.djvrPG_intro{color:var(--dsw-alias-label-tertiary);margin:0;font-size:14px;line-height:22px}.djvrPG_saved{color:var(--dsw-alias-state-success-primary);align-items:center;gap:6px;margin:0;font-size:12px;line-height:18px;display:flex}.djvrPG_savedDot{background:currentColor;border-radius:50%;width:7px;height:7px}.djvrPG_group{flex-direction:column;gap:8px;margin-top:8px;display:flex}.djvrPG_groupLabel{color:var(--dsw-alias-label-tertiary);margin:0 2px;font-size:12px;font-weight:500;line-height:18px}.djvrPG_routeCard{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-module-platform);border-radius:10px;list-style:none;overflow:hidden}.djvrPG_routeCardUnavailable{opacity:.72}.djvrPG_routeHeader{width:100%;min-height:68px;color:inherit;font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;justify-content:space-between;align-items:center;gap:16px;padding:12px 14px;display:flex}.djvrPG_routeHeader:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}.djvrPG_routeHeader:disabled{cursor:default}.djvrPG_routeIcon{width:18px;height:18px;color:var(--dsw-alias-label-primary);flex:none;display:block}.djvrPG_routeCopy{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}.djvrPG_routeName{color:var(--dsw-alias-label-primary);align-items:center;gap:8px;font-size:14px;font-weight:600;line-height:20px;display:flex}.djvrPG_routeSummary{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:18px;overflow:hidden}.djvrPG_badge{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}.djvrPG_badgeWarn{color:var(--dsw-alias-state-warn-label)}.djvrPG_chevron{width:18px;height:18px;color:var(--dsw-alias-label-primary);flex:none;transition:transform .16s}.djvrPG_routeCardOpen .djvrPG_chevron{transform:rotate(180deg)}.djvrPG_cardBody{border-top:1px solid var(--dsw-alias-border-l2);padding:16px 14px 18px}.djvrPG_formGrid{grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;display:grid}.djvrPG_field{flex-direction:column;gap:6px;min-width:0;display:flex}.djvrPG_fieldFull{grid-column:1/-1}.djvrPG_fieldLabel{color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500;line-height:18px}.djvrPG_input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);appearance:none;background-color:var(--dsw-alias-bg-layer-1);width:100%;height:32px;color:var(--dsw-alias-label-primary);font:inherit;background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%2381858C' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\");background-position:right 10px center;background-repeat:no-repeat;border-radius:8px;padding:0 32px 0 10px;font-size:14px;line-height:22px}.djvrPG_textInput{background-image:none;padding-right:10px}.djvrPG_input:focus{border-color:var(--dsw-alias-brand-primary);outline:none}.djvrPG_input:disabled{opacity:.6;cursor:default}.djvrPG_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:18px}.djvrPG_warning{color:var(--dsw-alias-state-warn-label)}.djvrPG_message{flex:1;min-width:0}.djvrPG_cardFooter{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;margin-top:14px;padding:12px 0 0;display:flex}.djvrPG_button{box-sizing:border-box;height:36px;font:inherit;cursor:pointer;border-radius:18px;justify-content:center;align-items:center;padding:0 14px;font-size:14px;line-height:22px;display:inline-flex}.djvrPG_secondaryButton{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);background:0 0}.djvrPG_secondaryButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid)}.djvrPG_primaryButton{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);border:0}.djvrPG_primaryButton:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}.djvrPG_button:disabled{opacity:.4;cursor:default}.djvrPG_button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}@container (width<=420px){.djvrPG_formGrid{grid-template-columns:1fr}.djvrPG_cardFooter .djvrPG_button{flex:1}}.djvrPG_routeHeaderRow{align-items:center;gap:8px;padding-right:14px;display:flex}.djvrPG_routeHeaderRow .djvrPG_routeHeader{flex:1;min-width:0}.djvrPG_rowCard{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-module-platform);border-radius:10px;align-items:flex-start;gap:16px;padding:14px 16px;display:flex}.djvrPG_rowCard:has(+.djvrPG_formGrid){border-bottom-color:#0000;border-bottom-right-radius:0;border-bottom-left-radius:0}.djvrPG_rowCard:has(+.djvrPG_formGrid) .djvrPG_hint{display:none}.djvrPG_rowCard+.djvrPG_formGrid{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-module-platform);border-top:0;border-bottom-right-radius:10px;border-bottom-left-radius:10px;margin-top:-1px;padding:0 16px 14px}.djvrPG_formGrid+.djvrPG_rowCard{margin-top:14px}.djvrPG_rowCopy{flex:1;gap:4px;min-width:0;display:grid}.djvrPG_rowTitle{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:600;line-height:20px}.djvrPG_switch{background:var(--dsw-alias-bg-layer-1);width:40px;height:24px;box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l2);cursor:pointer;border:0;border-radius:999px;flex:none;padding:0;position:relative}.djvrPG_switchOn{background:var(--dsw-alias-button-primary-fill);box-shadow:none}.djvrPG_switch i{background:var(--dsw-alias-label-primary-foreground);pointer-events:none;border-radius:50%;width:18px;height:18px;transition:left .16s;position:absolute;top:3px;left:3px}.djvrPG_switchOn i{left:19px}.djvrPG_switch:disabled{opacity:.4;cursor:default}.djvrPG_switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}@media (prefers-reduced-motion:reduce){.djvrPG_chevron,.djvrPG_switch i{transition:none}}.djvrPG_allowToolbar{flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:10px;display:flex}.djvrPG_allowToolbar .djvrPG_input{flex:220px;width:auto;padding-right:10px}.djvrPG_allowList{flex-direction:column;gap:6px;margin:0 0 12px;padding:0;list-style:none;display:flex}.djvrPG_allowRow{border:1px solid var(--dsw-alias-border-l2);background-color:var(--dsw-alias-bg-layer-1);border-radius:8px;align-items:center;gap:10px;padding:6px 10px;display:flex}.djvrPG_allowLabel{cursor:default;flex:auto;align-items:center;gap:8px;min-width:0;display:flex}.djvrPG_allowLabel input{width:14px;height:14px;accent-color:var(--dsw-alias-brand-primary);flex:none}.djvrPG_allowName{color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:18px;overflow:hidden}.djvrPG_allowSource{color:var(--dsw-alias-label-secondary);flex:none;align-items:center;gap:4px;font-size:12px;line-height:18px;display:flex}.djvrPG_allowDot{opacity:.6}.djvrPG_allowRepo{color:var(--dsw-alias-brand-primary);text-decoration:none}.djvrPG_allowRepo:hover{text-decoration:underline}";
		const tagId$2 = "dsh-model-switch/ModelSwitchSettings.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-model-switch";
			tag.dataset.pluginCss = tagId$2;
			tag.textContent = css$2;
			document.head.appendChild(tag);
		}
		var ModelSwitchSettings_module_css_default = {
			"allowDot": "djvrPG_allowDot",
			"allowLabel": "djvrPG_allowLabel",
			"allowList": "djvrPG_allowList",
			"allowName": "djvrPG_allowName",
			"allowRepo": "djvrPG_allowRepo",
			"allowRow": "djvrPG_allowRow",
			"allowSource": "djvrPG_allowSource",
			"allowToolbar": "djvrPG_allowToolbar",
			"badge": "djvrPG_badge",
			"badgeWarn": "djvrPG_badgeWarn",
			"button": "djvrPG_button",
			"cardBody": "djvrPG_cardBody",
			"cardFooter": "djvrPG_cardFooter",
			"chevron": "djvrPG_chevron",
			"field": "djvrPG_field",
			"fieldFull": "djvrPG_fieldFull",
			"fieldLabel": "djvrPG_fieldLabel",
			"formGrid": "djvrPG_formGrid",
			"group": "djvrPG_group",
			"groupLabel": "djvrPG_groupLabel",
			"hint": "djvrPG_hint",
			"input": "djvrPG_input",
			"intro": "djvrPG_intro",
			"message": "djvrPG_message",
			"primaryButton": "djvrPG_primaryButton",
			"routeCard": "djvrPG_routeCard",
			"routeCardOpen": "djvrPG_routeCardOpen",
			"routeCardUnavailable": "djvrPG_routeCardUnavailable",
			"routeCopy": "djvrPG_routeCopy",
			"routeHeader": "djvrPG_routeHeader",
			"routeHeaderRow": "djvrPG_routeHeaderRow",
			"routeIcon": "djvrPG_routeIcon",
			"routeName": "djvrPG_routeName",
			"routeSummary": "djvrPG_routeSummary",
			"rowCard": "djvrPG_rowCard",
			"rowCopy": "djvrPG_rowCopy",
			"rowTitle": "djvrPG_rowTitle",
			"saved": "djvrPG_saved",
			"savedDot": "djvrPG_savedDot",
			"secondaryButton": "djvrPG_secondaryButton",
			"section": "djvrPG_section",
			"switch": "djvrPG_switch",
			"switchOn": "djvrPG_switchOn",
			"textInput": "djvrPG_textInput",
			"title": "djvrPG_title",
			"warning": "djvrPG_warning"
		};
		//#endregion
		//#region src/client/ModelSwitchSettings.tsx
		function cx(...values) {
			return values.filter(Boolean).join(" ");
		}
		function compact(...values) {
			return values.filter((value) => value !== void 0 && value !== "").join(" · ");
		}
		/**
		* The layering line under a capability card.
		*
		* The card's own summary is the deployment-wide default ("默认（无组时）"); a
		* provider group overrides it for that provider's sessions, so name the pins
		* instead of letting the default look like the effective route.
		* @param t - settings locale lookup.
		* @param pins - the capability's provider-group pins.
		* @returns The line, or undefined when no group pins this capability.
		*/
		function groupNote(t, pins) {
			if (pins.length === 0) return void 0;
			const listed = pins.slice(0, 3).map((pin) => `${pin.provider} → ${pin.route.provider} · ${pin.route.model}${pin.reasoningEffort === void 0 ? "" : ` · ${pin.reasoningEffort}`}`).join("；");
			return pins.length > 3 ? t("groupOverridesMore").replace("{listed}", listed).replace("{count}", String(pins.length)) : t("groupOverridesLabel").replace("{pins}", listed);
		}
		/** A complete pinned pair; either half blank leaves the capability at its default. */
		function draftPair(provider, model) {
			return provider !== void 0 && provider.trim() !== "" && model !== void 0 && model.trim() !== "" ? {
				provider,
				model
			} : void 0;
		}
		function RouteIcon({ kind }) {
			if (kind === "providerGroups") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "18",
				height: "18",
				viewBox: "0 0 18 18",
				fill: "none",
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M3 5.5h12M3 12.5h12",
						stroke: "currentColor",
						strokeLinecap: "round"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "6.5",
						cy: "5.5",
						r: "2",
						stroke: "currentColor"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "11.5",
						cy: "12.5",
						r: "2",
						stroke: "currentColor"
					})
				]
			});
			if (kind === "compaction") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: "18",
				height: "18",
				viewBox: "0 0 18 18",
				fill: "none",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M5 3.5 9 7.5l4-4M5 14.5 9 10.5l4 4",
					stroke: "currentColor",
					strokeLinecap: "round",
					strokeLinejoin: "round"
				})
			});
			if (kind === "subagent") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "18",
				height: "18",
				viewBox: "0 0 18 18",
				fill: "none",
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "6",
						cy: "6",
						r: "2.5",
						stroke: "currentColor"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "12.5",
						cy: "11.5",
						r: "2",
						stroke: "currentColor"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M3 14c.4-2.5 1.6-4 3-4s2.6 1.5 3 4M10 7.5c.5-.8 1.3-1.2 2.2-1.2 1.5 0 2.6 1 2.8 2.7",
						stroke: "currentColor",
						strokeLinecap: "round"
					})
				]
			});
			if (kind === "search") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "18",
				height: "18",
				viewBox: "0 0 18 18",
				fill: "none",
				"aria-hidden": "true",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "8",
					cy: "8",
					r: "4.5",
					stroke: "currentColor"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "m11.5 11.5 3.5 3.5",
					stroke: "currentColor",
					strokeLinecap: "round"
				})]
			});
			if (kind === "image") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "18",
				height: "18",
				viewBox: "0 0 18 18",
				fill: "none",
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
						x: "2.5",
						y: "3",
						width: "13",
						height: "12",
						rx: "2",
						stroke: "currentColor"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "6.5",
						cy: "7",
						r: "1.3",
						stroke: "currentColor"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "m4 13 3.5-3 2.2 2 1.8-1.6 2.5 2.6",
						stroke: "currentColor",
						strokeLinejoin: "round"
					})
				]
			});
			if (kind === "autoReview") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "18",
				height: "18",
				viewBox: "0 0 18 18",
				fill: "none",
				"aria-hidden": "true",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M9 2.5 14.5 4.8v4.1c0 3.1-2.3 5.7-5.5 6.6-3.2-.9-5.5-3.5-5.5-6.6V4.8L9 2.5Z",
					stroke: "currentColor",
					strokeLinejoin: "round"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "m6.6 8.9 1.7 1.7 3.2-3.4",
					stroke: "currentColor",
					strokeLinecap: "round",
					strokeLinejoin: "round"
				})]
			});
			if (kind === "sessionTitle") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "18",
				height: "18",
				viewBox: "0 0 18 18",
				fill: "none",
				"aria-hidden": "true",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M3 4.5h7.5l4.2 4.2-5.7 5.7L3 9.8V4.5Z",
					stroke: "currentColor",
					strokeLinejoin: "round"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "6.2",
					cy: "7.2",
					r: "1.1",
					stroke: "currentColor"
				})]
			});
			if (kind === "memory") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "18",
				height: "18",
				viewBox: "0 0 18 18",
				fill: "none",
				"aria-hidden": "true",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M4.5 3.5h9v11h-9z",
					stroke: "currentColor",
					strokeLinejoin: "round"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M7 6.5h4M7 9h4M7 11.5h2.5",
					stroke: "currentColor",
					strokeLinecap: "round"
				})]
			});
			return null;
		}
		function RouteCard({ title, summary, hint, note, icon, open, onToggle, disabled = false, badge, badgeWarn = false, trailing, expandable = true, children }) {
			const header = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: ModelSwitchSettings_module_css_default.routeHeader,
				disabled,
				"aria-expanded": disabled || !expandable ? void 0 : open,
				onClick: onToggle,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: ModelSwitchSettings_module_css_default.routeIcon,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RouteIcon, { kind: icon })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: ModelSwitchSettings_module_css_default.routeCopy,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: ModelSwitchSettings_module_css_default.routeName,
								children: [title, badge === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {
									className: cx(ModelSwitchSettings_module_css_default.badge, badgeWarn && ModelSwitchSettings_module_css_default.badgeWarn),
									children: badge
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: ModelSwitchSettings_module_css_default.routeSummary,
								children: summary
							}),
							note === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: ModelSwitchSettings_module_css_default.hint,
								children: note
							}),
							hint === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: ModelSwitchSettings_module_css_default.hint,
								children: hint
							})
						]
					}),
					disabled || !expandable ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
						className: ModelSwitchSettings_module_css_default.chevron,
						width: "14",
						height: "14",
						viewBox: "0 0 14 14",
						fill: "none",
						"aria-hidden": "true",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
							d: "m4 5 3 3 3-3",
							stroke: "currentColor",
							strokeLinecap: "round",
							strokeLinejoin: "round"
						})
					})
				]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
				className: cx(ModelSwitchSettings_module_css_default.routeCard, open && ModelSwitchSettings_module_css_default.routeCardOpen, disabled && ModelSwitchSettings_module_css_default.routeCardUnavailable),
				children: [trailing === void 0 ? header : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: ModelSwitchSettings_module_css_default.routeHeaderRow,
					children: [header, trailing]
				}), open && !disabled ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: ModelSwitchSettings_module_css_default.cardBody,
					children
				}) : null]
			});
		}
		function InstantSwitch({ checked, disabled, label, onChange }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: cx(ModelSwitchSettings_module_css_default.switch, checked && ModelSwitchSettings_module_css_default.switchOn),
				role: "switch",
				"aria-checked": checked,
				"aria-label": label,
				disabled,
				onClick: () => {
					if (!disabled) onChange(!checked);
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {})
			});
		}
		function Field({ label, value, disabled, choices, onChange, full = false }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				className: cx(ModelSwitchSettings_module_css_default.field, full && ModelSwitchSettings_module_css_default.fieldFull),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: ModelSwitchSettings_module_css_default.fieldLabel,
					children: label
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
					className: ModelSwitchSettings_module_css_default.input,
					disabled,
					value: value ?? "",
					onChange: (event) => {
						onChange(event.target.value);
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
						value: "",
						children: "—"
					}), choices.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
						value: option.id,
						children: [option.name, option.unavailable === true ? " ⚠" : ""]
					}, option.id))]
				})]
			});
		}
		function Actions({ t, busy, disabled, message, extra, onCancel, onSave }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: ModelSwitchSettings_module_css_default.cardFooter,
				children: [
					message === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: cx(ModelSwitchSettings_module_css_default.hint, ModelSwitchSettings_module_css_default.message),
						children: message
					}),
					extra,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: cx(ModelSwitchSettings_module_css_default.button, ModelSwitchSettings_module_css_default.secondaryButton),
						disabled: busy,
						onClick: onCancel,
						children: t("cancel")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: cx(ModelSwitchSettings_module_css_default.button, ModelSwitchSettings_module_css_default.primaryButton),
						disabled,
						onClick: onSave,
						children: busy ? t("saving") : t("save")
					})
				]
			});
		}
		/**
		* One editable row draft.
		*
		* Only a PRISTINE draft follows the accepted snapshot. A draft the user has
		* edited is never overwritten by an incoming snapshot — another tab's write, or
		* the recovery read that follows a refused write, would otherwise discard the
		* typed values and make the page look like it rolled back on its own. The user
		* either saves the draft or cancels it back to the accepted value.
		* @param snapshot - the accepted form snapshot for this row.
		* @returns the draft, its setter, and a reset that re-adopts the accepted value.
		*/
		function useDraft(snapshot) {
			const [draft, setDraft] = (0, react.useState)(snapshot.value);
			const pristine = (0, react.useRef)(true);
			(0, react.useEffect)(() => {
				if (!pristine.current) return;
				setDraft(snapshot.value);
			}, [snapshot.revision, snapshot.value]);
			return [
				draft,
				(0, react.useCallback)((value) => {
					pristine.current = false;
					setDraft(value);
				}, []),
				(0, react.useCallback)(() => {
					pristine.current = true;
					setDraft(snapshot.value);
				}, [snapshot.value])
			];
		}
		function routeName(groups, route) {
			if (route === void 0) return "";
			const provider = groups.find((group) => group.id === route.provider);
			const model = matchCatalogModel(provider?.models ?? [], route.model)?.model;
			return compact(provider?.name ?? route.provider, model?.name ?? route.model);
		}
		function routeDefaultEffort(groups, route) {
			if (route === void 0) return void 0;
			const matched = matchCatalogModel(groups.find((group) => group.id === route.provider)?.models ?? [], route.model);
			return matched?.effort ?? matched?.model.reasoning?.defaultEffort;
		}
		/**
		* The effort caption for the subagent summary: a stored effort is the pinned
		* one ("已固定 · High"); an unset effort follows the provider default and says
		* so ("Provider 默认 · High"), using the same effort-name lookup the picker does.
		*/
		function subagentEffortSegment(t, matched, pinned, defaultEffort) {
			const effortName = (id) => matched?.model.reasoning?.efforts.find((level) => level.id === id)?.name ?? id;
			if (pinned !== "") return compact(t("effortPinned"), effortName(pinned));
			return defaultEffort === void 0 ? t("providerDefaultShort") : compact(t("providerDefaultShort"), effortName(defaultEffort));
		}
		/** The catalog head route; capability switches pin here when turned On. */
		function firstCatalogRoute(groups) {
			const provider = groups[0];
			const model = provider?.models[0];
			return provider === void 0 || model === void 0 ? void 0 : selectRouteModel(groups, provider.id, model.id);
		}
		function capabilityChoices(groups, route, providers, kind) {
			const choices = deriveRouteChoices(groups, route, providers);
			if (kind === "image" && route?.provider === "grok") {
				const models = [{
					id: "grok-imagine-image-quality",
					name: "Grok Imagine 1.0"
				}];
				if (route.model !== void 0 && !models.some((model) => model.id === route.model)) models.push({
					id: route.model,
					name: route.model,
					unavailable: true
				});
				return {
					providers: choices.providers,
					models
				};
			}
			return choices;
		}
		function ModelSwitchSettings(props) {
			const { groups, catalogError } = useSettingsCatalog(props);
			const subagent = props.useSubagentSettings((value) => value);
			const search = props.useSearchSettings((value) => value);
			const image = props.useImageSettings((value) => value);
			const autoReview = props.useAutoReviewSettings((value) => value);
			const compaction = props.useCompactionSettings((value) => value);
			const sessionTitle = props.useTitleSettings((value) => value);
			const memory = props.useMemorySettings((value) => value);
			const switchSettings = props.useSwitchSettings((value) => value);
			const [open, setOpen] = (0, react.useState)();
			const [subagentDraft, setSubagentDraft, resetSubagent] = useDraft(subagent);
			const [searchDraft, setSearchDraft, resetSearch] = useDraft(search);
			const [imageDraft, setImageDraft, resetImage] = useDraft(image);
			const [autoReviewDraft, setAutoReviewDraft, resetAutoReview] = useDraft(autoReview);
			const [compactionDraft, setCompactionDraft, resetCompaction] = useDraft(compaction);
			const [titleDraft, setTitleDraft, resetTitle] = useDraft(sessionTitle);
			const [memoryDraft, setMemoryDraft, resetMemory] = useDraft(memory);
			const [busy, setBusy] = (0, react.useState)();
			const [message, setMessage] = (0, react.useState)();
			const [groupProvider, setGroupProvider] = (0, react.useState)("");
			const [groupDraft, setGroupDraft] = (0, react.useState)(void 0);
			const [allowlistQuery, setAllowlistQuery] = (0, react.useState)("");
			const [catalogRows, setCatalogRows] = (0, react.useState)(void 0);
			const [catalogState, setCatalogState] = (0, react.useState)("idle");
			const [reviewStatus, setReviewStatus] = (0, react.useState)(void 0);
			const loadSearchCapabilities = props.loadCapabilities;
			const [searchSnapshot, setSearchSnapshot] = (0, react.useState)(void 0);
			const [searchError, setSearchError] = (0, react.useState)(void 0);
			(0, react.useEffect)(() => {
				if (loadSearchCapabilities === void 0) return;
				let live = true;
				const scope = new AbortController();
				let timer;
				let failures = 0;
				let signature;
				const poll = async (revision) => {
					try {
						const snapshot = await loadSearchCapabilities(revision, scope.signal);
						if (!live) return;
						const nextSignature = JSON.stringify(snapshot);
						if (signature !== nextSignature || failures > 0) {
							signature = nextSignature;
							setSearchSnapshot(snapshot);
							setSearchError(void 0);
						}
						failures = 0;
						poll(snapshot.revision);
					} catch (error) {
						if (!live || scope.signal.aborted) return;
						failures = Math.min(failures + 1, 8);
						if (failures >= 3) setSearchError(error instanceof Error ? error.message : props.t("catalogFailed"));
						timer = setTimeout(() => {
							if (live) poll(void 0);
						}, Math.min(250 * 2 ** (failures - 1), 2e4));
					}
				};
				poll(void 0);
				return () => {
					live = false;
					scope.abort();
					if (timer !== void 0) clearTimeout(timer);
				};
			}, [loadSearchCapabilities]);
			const providerGroups = normalizeProviderGroups(switchSettings.value?.providerGroups);
			const groupPins = {
				autoReview: capabilityGroupPins(providerGroups, "autoReview"),
				compaction: capabilityGroupPins(providerGroups, "compaction"),
				title: capabilityGroupPins(providerGroups, "title"),
				memory: capabilityGroupPins(providerGroups, "memory"),
				subagent: capabilityGroupPins(providerGroups, "subagent")
			};
			/**
			* Seed an unsaved group from the live routes.
			*
			* All four per-session capabilities (compaction, autoReview, sessionTitle,
			* subagent) are seeded from their active deployment-wide cards so a newly
			* edited provider group starts from the currently active configuration.
			*/
			const seedGroupFromActive = () => {
				const compactionPin = compaction.value !== void 0 && routePairConfigured(compaction.value) ? {
					provider: compaction.value.provider ?? "",
					model: compaction.value.model ?? ""
				} : void 0;
				const reviewPin = autoReview.value !== void 0 && routePairConfigured(autoReview.value) ? {
					provider: autoReview.value.provider ?? "",
					model: autoReview.value.model ?? ""
				} : void 0;
				const title = sessionTitle.value !== void 0 && routePairConfigured(sessionTitle.value) ? {
					provider: sessionTitle.value.provider ?? "",
					model: sessionTitle.value.model ?? ""
				} : void 0;
				const fixedSubagent = subagent.value !== void 0 && subagent.value.mode === "fixed" && routePairConfigured(subagent.value) ? {
					provider: subagent.value.provider ?? "",
					model: subagent.value.model ?? "",
					reasoningEffort: subagent.value.reasoningEffort
				} : void 0;
				return {
					...compactionPin === void 0 ? {} : {
						compactProvider: compactionPin.provider,
						compactModel: compactionPin.model
					},
					...reviewPin === void 0 ? {} : {
						autoReviewProvider: reviewPin.provider,
						autoReviewModel: reviewPin.model
					},
					...title === void 0 ? {} : {
						titleProvider: title.provider,
						titleModel: title.model
					},
					...fixedSubagent === void 0 ? {} : {
						subagentProvider: fixedSubagent.provider,
						subagentModel: fixedSubagent.model,
						...fixedSubagent.reasoningEffort === void 0 ? {} : { subagentReasoningEffort: fixedSubagent.reasoningEffort }
					}
				};
			};
			/** Reload the editor draft: the saved group when one exists, else a seed from the live routes. */
			const resyncGroupDraft = () => {
				if (groupProvider === "") {
					setGroupDraft(void 0);
					return;
				}
				setGroupDraft(groupOf(providerGroups, groupProvider) ?? seedGroupFromActive());
			};
			/** Open the editor on the provider in use: the first configured group, else the catalog head. */
			(0, react.useEffect)(() => {
				if (groupProvider !== "") return;
				const initial = Object.keys(providerGroups)[0] ?? groups[0]?.id;
				if (initial !== void 0 && initial.trim() !== "") setGroupProvider(initial);
			}, [
				groupProvider,
				providerGroups,
				groups
			]);
			(0, react.useEffect)(() => {
				resyncGroupDraft();
			}, [
				groupProvider,
				switchSettings.value,
				subagent.value,
				autoReview.value,
				compaction.value,
				sessionTitle.value
			]);
			if ([
				subagent,
				search,
				image,
				switchSettings,
				sessionTitle
			].some((form) => form.mode === "memory")) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("main", {
				className: ModelSwitchSettings_module_css_default.section,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h1", {
					className: ModelSwitchSettings_module_css_default.title,
					children: props.t("title")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					role: "status",
					className: ModelSwitchSettings_module_css_default.hint,
					children: props.t("remoteSettingsUnavailable")
				})]
			});
			const unavailable = (key) => {
				const reason = props.capabilities[key].reason;
				return reason === void 0 ? props.t("unavailable") : props.t("reason." + reason);
			};
			const toggle = (route) => {
				setOpen((current) => current === route ? void 0 : route);
				setMessage(void 0);
			};
			const subagentRoute = subagentDraft === void 0 ? void 0 : {
				...subagentDraft.provider === void 0 ? {} : { provider: subagentDraft.provider },
				...subagentDraft.model === void 0 ? {} : { model: subagentDraft.model }
			};
			const subagentCatalogModel = matchCatalogModel(groups.find((group) => group.id === subagentDraft?.provider)?.models ?? [], subagentDraft?.model);
			const subagentChoices = deriveRouteChoices(groups, subagentCatalogModel === void 0 ? subagentRoute : {
				...subagentRoute,
				model: subagentCatalogModel.model.id
			});
			const subagentEfforts = (() => {
				const efforts = (subagentCatalogModel?.model.reasoning?.efforts ?? []).map((effort) => ({
					id: effort.id,
					name: effort.name
				}));
				if (subagentDraft?.reasoningEffort !== void 0 && !efforts.some((option) => option.id === subagentDraft.reasoningEffort)) efforts.push({
					id: subagentDraft.reasoningEffort,
					name: subagentDraft.reasoningEffort
				});
				return efforts;
			})();
			const defaultEffort = routeDefaultEffort(groups, subagentRoute);
			const searchLive = searchSnapshot?.capabilities;
			const searchGroups = searchGroupsFromCapabilities(searchLive);
			const searchChoices = capabilityChoices(searchGroups, searchDraft, void 0, "search");
			const searchAvailable = searchLive?.searchProviderAdapters.available ?? false;
			const imageChoices = capabilityChoices(groups, imageDraft, props.capabilities.imageProviderAdapters.providers ?? [], "image");
			const autoReviewChoices = deriveRouteChoices(groups, autoReviewDraft);
			const autoReviewOn = routePairConfigured(autoReview.value);
			const compactionChoices = deriveRouteChoices(groups, compactionDraft);
			const compactionOn = routePairConfigured(compaction.value);
			const titleChoices = deriveRouteChoices(groups, titleDraft);
			deriveRouteChoices(groups, memoryDraft);
			const titleOn = routePairConfigured(sessionTitle.value);
			const catalogSeed = firstCatalogRoute(groups);
			const synced = [
				subagent,
				search,
				image,
				autoReview,
				compaction,
				sessionTitle
			].every((snapshot) => snapshot.status === "ready");
			/**
			* Run one row save with a visible outcome that ALWAYS settles.
			*
			* A stalled write used to latch the page on "保存中…" forever, because `busy`
			* was only cleared by the settling promise. The 30s deadline reports the stall
			* instead; a late result is ignored by the race, so it can never overwrite a
			* newer draft either.
			* @param route - the row whose save is running, for busy and message routing.
			* @param operation - the single fenced write to perform.
			* @returns whether the write was accepted.
			*/
			const run = async (route, operation) => {
				if (busy !== void 0) return false;
				const timeoutMs = 3e4;
				setBusy(route);
				setMessage(void 0);
				let timer;
				try {
					await Promise.race([operation(), new Promise((_resolve, reject) => {
						timer = setTimeout(() => reject(new Error(props.t("saveTimeout"))), timeoutMs);
					})]);
					setMessage({
						route,
						text: props.t("saved")
					});
					return true;
				} catch (error) {
					const raw = error instanceof Error ? error.message : String(error);
					setMessage({
						route,
						text: raw === "settings-rejected" ? props.t("saveRejected") : raw
					});
					return false;
				} finally {
					if (timer !== void 0) clearTimeout(timer);
					setBusy(void 0);
				}
			};
			/**
			* The Auto reviewer's read-only allowlist.
			*
			* An absent stored list means "never configured" and renders the shipped
			* defaults; an explicitly emptied list stays empty. Every write carries both
			* the switch and the entries, so the two can never drift apart on disk.
			*/
			const allowlistView = switchSettings.value === void 0 ? void 0 : deriveAutoReviewAllowlist(switchSettings.value);
			const allowlistTools = allowlistView?.tools ?? DEFAULT_READ_ONLY_TOOLS;
			const allowlistEnabled = allowlistView?.enabled === true;
			const allowlistWritable = switchSettings.status === "ready" && switchSettings.writable;
			const persistAllowlist = (next) => {
				if (busy !== void 0 || !allowlistWritable) return;
				const tools = next.tools.filter((entry) => validateAllowEntry(entry) === "ok");
				run("allowlist", () => props.saveReviewAllowlist({
					enabled: next.enabled,
					tools
				}));
			};
			const setAllowTool = (name, allowed) => {
				if (allowed) {
					if (isAllowedByList(name, allowlistTools)) return;
					persistAllowlist({
						enabled: true,
						tools: [...allowlistTools, name]
					});
					return;
				}
				persistAllowlist({
					enabled: allowlistEnabled,
					tools: allowlistTools.filter((entry) => entry !== name)
				});
			};
			const scanAllowlistTools = () => {
				const scan = props.scanTools;
				if (scan === void 0 || busy !== void 0) return;
				setCatalogState("loading");
				run("allowlist", async () => {
					const scanned = await scan();
					setCatalogRows(scanned.rows);
					setReviewStatus(scanned.status);
				}).then((accepted) => {
					setCatalogState(accepted ? "ready" : "failed");
				});
			};
			const allowlistQueryText = allowlistQuery.trim().toLowerCase();
			const allowlistIncluded = allowlistTools.map((entry) => ({
				entry,
				source: resolveToolSource(entry)
			})).filter((row) => allowlistQueryText === "" || row.entry.toLowerCase().includes(allowlistQueryText));
			const allowlistAvailable = (catalogRows ?? []).filter((row) => !isAllowedByList(row.name, allowlistTools)).filter((row) => allowlistQueryText === "" || row.name.toLowerCase().includes(allowlistQueryText) || row.sourceLabel.toLowerCase().includes(allowlistQueryText));
			const allowlistSummaryText = allowlistView === void 0 ? props.t("loading") : allowlistEnabled ? props.t("reviewAllowlistOnSummary").replace("{count}", String(allowlistTools.length)) : props.t("reviewAllowlistOffSummary");
			/**
			* The reviewer stream idle timeout, stored in seconds for display; undefined
			* = follow the provider default. The save path converts to milliseconds and
			* `0` = cancelled (upstream ceiling) before writing.
			*/
			const storedTimeoutMs = switchSettings.value?.autoReviewTimeoutMs;
			const [timeoutDraft, setTimeoutDraft] = (0, react.useState)(void 0);
			const timeoutSeconds = timeoutDraft ?? (storedTimeoutMs === void 0 ? void 0 : String(Math.round(storedTimeoutMs / 1e3)));
			const timeoutCancelled = storedTimeoutMs === 0;
			const timeoutWritable = switchSettings.status === "ready" && switchSettings.writable;
			const timeoutSummary = storedTimeoutMs === void 0 ? props.t("reviewTimeoutDefault") : storedTimeoutMs === 0 ? props.t("reviewTimeoutCancelled") : `${Math.round(storedTimeoutMs / 1e3)}s`;
			const saveTimeout = () => {
				if (busy !== void 0 || !timeoutWritable) return;
				const trimmed = (timeoutDraft ?? "").trim();
				if (trimmed === "") {
					run("timeout", () => props.saveReviewTimeout(void 0));
					return;
				}
				const seconds = Number(trimmed);
				if (!Number.isFinite(seconds) || seconds < 1 || !Number.isInteger(seconds)) return;
				const ms = Math.min(seconds, Math.round(UPSTREAM_MAX_IDLE_TIMEOUT_MS / 1e3)) * 1e3;
				run("timeout", () => props.saveReviewTimeout(ms));
			};
			const saveSubagent = () => {
				if (subagentDraft === void 0 || subagentDraft.mode !== "fixed") return;
				const matched = subagentCatalogModel;
				const provider = (subagentDraft.provider ?? "").trim();
				const model = (matched?.model.id ?? subagentDraft.model ?? "").trim();
				if (provider === "" || model === "") return;
				const nextEffort = subagentDraft.reasoningEffort === "" ? void 0 : subagentDraft.reasoningEffort || matched?.effort;
				run("subagent", () => props.saveSubagent([
					{
						field: "provider",
						value: provider
					},
					{
						field: "model",
						value: model
					},
					{
						field: "reasoningEffort",
						value: nextEffort
					}
				]));
			};
			const persistSubagentEnabled = (enabled) => {
				if (subagentDraft === void 0 || busy !== void 0 || !subagent.writable) return;
				const mode = subagentModeForEnabled(enabled);
				run("subagent", () => props.saveSubagent([{
					field: "mode",
					value: mode
				}])).then((accepted) => {
					if (!accepted) {
						resetSubagent();
						return;
					}
					setSubagentDraft({
						...subagentDraft,
						mode
					});
					setOpen((current) => enabled ? "subagent" : current === "subagent" ? void 0 : current);
				});
			};
			/** Both halves of one pinned capability route, written together in one mutation. */
			const pairOps = (next) => [{
				field: "provider",
				value: next.provider
			}, {
				field: "model",
				value: next.model
			}];
			const saveCapability = (route, next) => {
				if (next === void 0) return;
				const provider = (next.provider ?? "").trim();
				const model = (next.model ?? "").trim();
				if (provider === "" || model === "") return;
				run(route, () => props.saveCapability(route, [{
					field: "provider",
					value: provider
				}, {
					field: "model",
					value: model
				}]));
			};
			const saveAutoReview = () => {
				if (autoReviewDraft === void 0 || (autoReviewDraft.provider ?? "").trim() === "" || (autoReviewDraft.model ?? "").trim() === "") return;
				run("autoReview", () => props.saveCapability("autoReview", pairOps(autoReviewDraft)));
			};
			const saveCompaction = () => {
				if (compactionDraft === void 0 || (compactionDraft.provider ?? "").trim() === "" || (compactionDraft.model ?? "").trim() === "") return;
				run("compaction", () => props.saveCapability("compaction", pairOps(compactionDraft)));
			};
			const saveTitle = () => {
				if (titleDraft === void 0 || (titleDraft.provider ?? "").trim() === "" || (titleDraft.model ?? "").trim() === "") return;
				run("sessionTitle", () => props.saveCapability("title", pairOps(titleDraft)));
			};
			/**
			* The reviewer switch: Off unsets both stored fields (follow the session
			* model); On pins the route to the catalog head so the pin takes effect
			* immediately and stays editable below. A failed write reports, never
			* flips silently.
			*/
			const persistAutoReviewEnabled = (enabled) => {
				if (busy !== void 0 || !autoReview.writable || autoReview.value === void 0) return;
				if (!enabled) {
					setOpen((current) => current === "autoReview" ? void 0 : current);
					run("autoReview", () => props.saveCapability("autoReview", [{
						field: "provider",
						value: void 0
					}, {
						field: "model",
						value: void 0
					}]));
					return;
				}
				if (catalogSeed === void 0) return;
				run("autoReview", () => props.saveCapability("autoReview", pairOps(catalogSeed))).then((accepted) => {
					if (!accepted) return;
					setAutoReviewDraft({
						provider: catalogSeed.provider,
						model: catalogSeed.model
					});
					setOpen("autoReview");
				});
			};
			/**
			* The compaction switch: Off unsets both stored fields (official default =
			* the conversation target); On pins the route to the catalog head so the
			* pin takes effect immediately and stays editable below. A failed write
			* reports, never flips silently.
			*/
			const persistCompactionEnabled = (enabled) => {
				if (busy !== void 0 || !compaction.writable || compaction.value === void 0) return;
				if (!enabled) {
					setOpen((current) => current === "compaction" ? void 0 : current);
					run("compaction", () => props.saveCapability("compaction", [{
						field: "provider",
						value: void 0
					}, {
						field: "model",
						value: void 0
					}]));
					return;
				}
				if (catalogSeed === void 0) return;
				run("compaction", () => props.saveCapability("compaction", pairOps(catalogSeed))).then((accepted) => {
					if (!accepted) return;
					setCompactionDraft({
						provider: catalogSeed.provider,
						model: catalogSeed.model
					});
					setOpen("compaction");
				});
			};
			/**
			* The session-title switch: Off unsets both stored fields (naming follows
			* the session's own logged route); On pins the route to the catalog head so
			* the pin takes effect immediately and stays editable below. A failed write
			* reports, never flips silently.
			*/
			const persistTitleEnabled = (enabled) => {
				if (busy !== void 0 || !sessionTitle.writable || sessionTitle.value === void 0) return;
				if (!enabled) {
					setOpen((current) => current === "sessionTitle" ? void 0 : current);
					run("sessionTitle", () => props.saveCapability("title", [{
						field: "provider",
						value: void 0
					}, {
						field: "model",
						value: void 0
					}]));
					return;
				}
				if (catalogSeed === void 0) return;
				run("sessionTitle", () => props.saveCapability("title", pairOps(catalogSeed))).then((accepted) => {
					if (!accepted) return;
					setTitleDraft({
						provider: catalogSeed.provider,
						model: catalogSeed.model
					});
					setOpen("sessionTitle");
				});
			};
			const subagentRole = subagentDraft?.mode === "fixed" && subagentDraft.provider !== void 0 && subagentDraft.provider !== "" ? props.providerRoleOf?.(subagentDraft.provider) : void 0;
			const subagentOn = subagentDraft?.mode === "fixed";
			const subagentSummary = subagentDraft === void 0 ? props.t("loading") : subagentOn ? compact(routeName(groups, subagentRoute), isAgentRole(subagentRole) ? props.t("agentBadge") : void 0, subagentEffortSegment(props.t, subagentCatalogModel, (subagentDraft.reasoningEffort ?? "").trim(), defaultEffort)) : props.t("subagentOff");
			const subagentSwitchDisabled = busy !== void 0 || !subagent.writable || subagentDraft === void 0;
			const autoReviewSwitchDisabled = busy !== void 0 || !autoReview.writable || autoReview.value === void 0 || !autoReviewOn && catalogSeed === void 0;
			const compactionSwitchDisabled = busy !== void 0 || !compaction.writable || compaction.value === void 0 || !compactionOn && catalogSeed === void 0;
			const titleSwitchDisabled = busy !== void 0 || !sessionTitle.writable || sessionTitle.value === void 0 || !titleOn && catalogSeed === void 0;
			const subagentDisabled = subagent.status !== "ready" || !subagent.writable || subagentDraft === void 0 || busy !== void 0 || !subagentOn || (subagentDraft.provider ?? "").trim() === "" || (subagentDraft.model ?? "").trim() === "";
			const capabilityDisabled = (_route, snapshot, next) => snapshot.status !== "ready" || !snapshot.writable || next === void 0 || busy !== void 0 || (next.provider ?? "").trim() === "" || (next.model ?? "").trim() === "";
			const autoReviewDisabled = autoReview.status !== "ready" || !autoReview.writable || autoReviewDraft === void 0 || busy !== void 0 || !autoReviewOn || (autoReviewDraft.provider ?? "").trim() === "" || (autoReviewDraft.model ?? "").trim() === "";
			const compactionDisabled = compaction.status !== "ready" || !compaction.writable || compactionDraft === void 0 || busy !== void 0 || !compactionOn || (compactionDraft.provider ?? "").trim() === "" || (compactionDraft.model ?? "").trim() === "";
			const titleDisabled = sessionTitle.status !== "ready" || !sessionTitle.writable || titleDraft === void 0 || busy !== void 0 || !titleOn || (titleDraft.provider ?? "").trim() === "" || (titleDraft.model ?? "").trim() === "";
			const configuredGroupCount = Object.keys(providerGroups).length;
			const groupControlsDisabled = busy !== void 0 || switchSettings.status !== "ready" || !switchSettings.writable;
			const groupProviderChoices = deriveRouteChoices(groups, groupProvider === "" ? void 0 : { provider: groupProvider }).providers.map((choice) => groupOf(providerGroups, choice.id) === void 0 ? choice : {
				...choice,
				name: choice.name + " ✓"
			});
			const groupCompaction = groupDraft === void 0 ? void 0 : draftPair(groupDraft.compactProvider, groupDraft.compactModel);
			const groupAutoReview = groupDraft === void 0 ? void 0 : draftPair(groupDraft.autoReviewProvider, groupDraft.autoReviewModel);
			const groupTitle = groupDraft === void 0 ? void 0 : draftPair(groupDraft.titleProvider, groupDraft.titleModel);
			const groupMemory = groupDraft === void 0 ? void 0 : draftPair(groupDraft.memoryProvider, groupDraft.memoryModel);
			const groupSubagent = groupDraft === void 0 ? void 0 : draftPair(groupDraft.subagentProvider, groupDraft.subagentModel);
			const groupCompactionChoices = deriveRouteChoices(groups, groupCompaction);
			const groupAutoReviewChoices = deriveRouteChoices(groups, groupAutoReview);
			const groupTitleChoices = deriveRouteChoices(groups, groupTitle);
			deriveRouteChoices(groups, groupMemory);
			const groupSubagentChoices = deriveRouteChoices(groups, groupSubagent);
			const groupSubMatched = matchCatalogModel(groups.find((group) => group.id === (groupDraft?.subagentProvider ?? ""))?.models ?? [], groupDraft?.subagentModel ?? "");
			const groupSubEfforts = (() => {
				const efforts = (groupSubMatched?.model.reasoning?.efforts ?? []).map((effort) => ({
					id: effort.id,
					name: effort.name
				}));
				const current = groupDraft?.subagentReasoningEffort;
				if (current !== void 0 && current !== "" && !efforts.some((option) => option.id === current)) efforts.push({
					id: current,
					name: current
				});
				return efforts;
			})();
			/**
			* Enable a capability row inside a provider group by pinning it: to that
			* capability's live route when one is configured, else to the catalog head.
			*/
			const enableGroupCapability = (kind) => {
				const active = seedGroupFromActive();
				setGroupDraft((draft) => {
					if (draft === void 0) return draft;
					if (kind === "compaction") {
						const provider = active.compactProvider ?? catalogSeed?.provider;
						const model = active.compactModel ?? catalogSeed?.model;
						if (provider === void 0 || model === void 0) return draft;
						return {
							...draft,
							compactProvider: provider,
							compactModel: model
						};
					}
					if (kind === "autoReview") {
						const provider = active.autoReviewProvider ?? catalogSeed?.provider;
						const model = active.autoReviewModel ?? catalogSeed?.model;
						if (provider === void 0 || model === void 0) return draft;
						return {
							...draft,
							autoReviewProvider: provider,
							autoReviewModel: model
						};
					}
					if (kind === "sessionTitle") {
						const provider = active.titleProvider ?? catalogSeed?.provider;
						const model = active.titleModel ?? catalogSeed?.model;
						if (provider === void 0 || model === void 0) return draft;
						return {
							...draft,
							titleProvider: provider,
							titleModel: model
						};
					}
					if (kind === "memory") {
						const provider = active.memoryProvider ?? catalogSeed?.provider;
						const model = active.memoryModel ?? catalogSeed?.model;
						if (provider === void 0 || model === void 0) return draft;
						return {
							...draft,
							memoryProvider: provider,
							memoryModel: model
						};
					}
					const provider = active.subagentProvider ?? catalogSeed?.provider;
					const model = active.subagentModel ?? catalogSeed?.model;
					if (provider === void 0 || model === void 0) return draft;
					const effort = active.subagentProvider !== void 0 ? active.subagentReasoningEffort : catalogSeed?.reasoningEffort;
					return {
						...draft,
						subagentProvider: provider,
						subagentModel: model,
						...effort === void 0 || effort === "" ? {} : { subagentReasoningEffort: effort }
					};
				});
			};
			const disableGroupCapability = (kind) => {
				setGroupDraft((draft) => {
					if (draft === void 0) return draft;
					if (kind === "compaction") return {
						...draft,
						compactProvider: "",
						compactModel: ""
					};
					if (kind === "autoReview") return {
						...draft,
						autoReviewProvider: "",
						autoReviewModel: ""
					};
					if (kind === "sessionTitle") return {
						...draft,
						titleProvider: "",
						titleModel: ""
					};
					if (kind === "memory") return {
						...draft,
						memoryProvider: "",
						memoryModel: ""
					};
					return {
						...draft,
						subagentProvider: "",
						subagentModel: "",
						subagentReasoningEffort: ""
					};
				});
			};
			const saveProviderGroupCard = () => {
				if (groupProvider === "" || groupDraft === void 0) return;
				run("providerGroups", () => props.saveProviderGroup(groupProvider, groupDraft));
			};
			const deleteProviderGroupCard = () => {
				if (groupProvider === "") return;
				run("providerGroups", () => props.saveProviderGroup(groupProvider, void 0));
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("main", {
				className: ModelSwitchSettings_module_css_default.section,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h1", {
						className: ModelSwitchSettings_module_css_default.title,
						children: props.t("title")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: ModelSwitchSettings_module_css_default.intro,
						children: props.t("subtitle")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: ModelSwitchSettings_module_css_default.saved,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { className: ModelSwitchSettings_module_css_default.savedDot }), synced ? props.t("settingsSynced") : props.t("loading")]
					}),
					catalogError === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: cx(ModelSwitchSettings_module_css_default.hint, ModelSwitchSettings_module_css_default.message),
						children: catalogError
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: ModelSwitchSettings_module_css_default.group,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							className: ModelSwitchSettings_module_css_default.groupLabel,
							children: props.t("conversationRoutes")
						}), props.capabilities.centralSubagentRouting.available ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RouteCard, {
							title: props.t("subagent"),
							summary: subagentSummary,
							hint: props.t("subagentHelp"),
							note: groupNote(props.t, groupPins.subagent),
							icon: "subagent",
							open: open === "subagent" && subagentOn,
							onToggle: () => {
								if (subagentOn) toggle("subagent");
							},
							expandable: subagentOn,
							trailing: subagentDraft === void 0 ? void 0 : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InstantSwitch, {
								checked: subagentOn,
								disabled: subagentSwitchDisabled,
								label: props.t("subagent"),
								onChange: persistSubagentEnabled
							}),
							children: subagentDraft === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: ModelSwitchSettings_module_css_default.hint,
								children: props.t("loading")
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: ModelSwitchSettings_module_css_default.formGrid,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
										label: props.t("provider"),
										value: subagentDraft.provider ?? "",
										disabled: busy !== void 0 || !subagent.writable,
										choices: subagentChoices.providers,
										onChange: (provider) => {
											const first = groups.find((group) => group.id === provider)?.models[0];
											setSubagentDraft({
												mode: "fixed",
												...selectRouteModel(groups, provider, first?.id ?? subagentDraft.model ?? "")
											});
										}
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
										label: props.t("model"),
										value: subagentCatalogModel?.model.id ?? subagentDraft.model ?? "",
										disabled: busy !== void 0 || !subagent.writable,
										choices: subagentChoices.models,
										onChange: (model) => {
											setSubagentDraft({
												mode: "fixed",
												...selectRouteModel(groups, subagentDraft.provider ?? "", model)
											});
										}
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
										label: props.t("effort"),
										value: subagentDraft.reasoningEffort || subagentCatalogModel?.effort || "",
										disabled: busy !== void 0 || !subagent.writable,
										choices: subagentEfforts,
										onChange: (effort) => {
											const matched = subagentCatalogModel;
											setSubagentDraft({
												...subagentDraft,
												...matched?.model.id === void 0 ? {} : { model: matched.model.id },
												reasoningEffort: effort
											});
										}
									})
								]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Actions, {
								t: props.t,
								busy: busy === "subagent",
								disabled: subagentDisabled,
								...message?.route === "subagent" ? { message: message.text } : {},
								onCancel: () => {
									resetSubagent();
									setMessage(void 0);
								},
								onSave: saveSubagent
							})] })
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RouteCard, {
							title: props.t("subagent"),
							summary: unavailable("centralSubagentRouting"),
							icon: "subagent",
							open: false,
							onToggle: () => {},
							disabled: true,
							badge: props.t("unavailable"),
							badgeWarn: true
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: ModelSwitchSettings_module_css_default.group,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
								className: ModelSwitchSettings_module_css_default.groupLabel,
								children: props.t("capabilityRoutes")
							}),
							searchAvailable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RouteCard, {
								title: props.t("search"),
								summary: searchDraft === void 0 ? props.t("loading") : routeName(searchGroups, searchDraft),
								icon: "search",
								open: open === "search",
								onToggle: () => {
									toggle("search");
								},
								children: searchDraft === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: ModelSwitchSettings_module_css_default.hint,
									children: props.t("loading")
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: ModelSwitchSettings_module_css_default.hint,
										children: props.t("searchHelp")
									}),
									searchError === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: ModelSwitchSettings_module_css_default.hint,
										children: searchError
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: ModelSwitchSettings_module_css_default.formGrid,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
											label: props.t("provider"),
											value: searchDraft.provider,
											disabled: busy !== void 0 || !search.writable || searchError !== void 0,
											choices: searchChoices.providers,
											onChange: (provider) => {
												const first = searchGroups.find((group) => group.id === provider)?.models[0];
												setSearchDraft({
													provider,
													...first === void 0 ? {} : { model: first.id }
												});
											}
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
											label: props.t("model"),
											value: searchDraft.model,
											disabled: busy !== void 0 || !search.writable || searchError !== void 0,
											choices: searchChoices.models,
											onChange: (model) => {
												setSearchDraft({
													...searchDraft,
													model
												});
											}
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Actions, {
										t: props.t,
										busy: busy === "search",
										disabled: capabilityDisabled("search", search, searchDraft) || searchError !== void 0 || !searchGroups.some((group) => group.id === searchDraft.provider && group.models.some((model) => model.id === searchDraft.model)),
										...message?.route === "search" ? { message: message.text } : {},
										onCancel: () => {
											resetSearch();
											setMessage(void 0);
										},
										onSave: () => {
											saveCapability("search", searchDraft);
										}
									})
								] })
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RouteCard, {
								title: props.t("search"),
								summary: searchError ?? unavailable("searchProviderAdapters"),
								icon: "search",
								open: false,
								onToggle: () => {},
								disabled: true,
								badge: props.t("unavailable"),
								badgeWarn: true
							}),
							props.capabilities.imageProviderAdapters.available ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RouteCard, {
								title: props.t("image"),
								summary: imageDraft === void 0 ? props.t("loading") : routeName(groups, imageDraft),
								icon: "image",
								open: open === "image",
								onToggle: () => {
									toggle("image");
								},
								children: imageDraft === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: ModelSwitchSettings_module_css_default.hint,
									children: props.t("loading")
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: ModelSwitchSettings_module_css_default.hint,
										children: props.t("imageHelp")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: ModelSwitchSettings_module_css_default.formGrid,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
											label: props.t("provider"),
											value: imageDraft.provider,
											disabled: busy !== void 0 || !image.writable,
											choices: imageChoices.providers,
											onChange: (provider) => {
												const model = provider === "grok" ? "grok-imagine-image-quality" : groups.find((group) => group.id === provider)?.models[0]?.id;
												setImageDraft({
													provider,
													...model === void 0 ? {} : { model }
												});
											}
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
											label: props.t("model"),
											value: imageDraft.model,
											disabled: busy !== void 0 || !image.writable,
											choices: imageChoices.models,
											onChange: (model) => {
												setImageDraft({
													...imageDraft,
													model
												});
											}
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Actions, {
										t: props.t,
										busy: busy === "image",
										disabled: capabilityDisabled("image", image, imageDraft),
										...message?.route === "image" ? { message: message.text } : {},
										onCancel: () => {
											resetImage();
											setMessage(void 0);
										},
										onSave: () => {
											saveCapability("image", imageDraft);
										}
									})
								] })
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RouteCard, {
								title: props.t("image"),
								summary: unavailable("imageProviderAdapters"),
								icon: "image",
								open: false,
								onToggle: () => {},
								disabled: true,
								badge: props.t("unavailable"),
								badgeWarn: true
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RouteCard, {
								title: props.t("autoReview"),
								summary: autoReviewDraft === void 0 ? props.t("loading") : autoReviewOn ? routeName(groups, autoReviewDraft) : props.t("autoReviewFollow"),
								hint: props.t("autoReviewHelp"),
								note: groupNote(props.t, groupPins.autoReview),
								icon: "autoReview",
								open: open === "autoReview" && autoReviewOn,
								onToggle: () => {
									if (autoReviewOn) toggle("autoReview");
								},
								expandable: autoReviewOn,
								trailing: autoReviewDraft === void 0 ? void 0 : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InstantSwitch, {
									checked: autoReviewOn,
									disabled: autoReviewSwitchDisabled,
									label: props.t("autoReview"),
									onChange: persistAutoReviewEnabled
								}),
								children: autoReviewDraft === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: ModelSwitchSettings_module_css_default.hint,
									children: props.t("loading")
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: ModelSwitchSettings_module_css_default.hint,
										children: props.t(props.capabilities.autoReview?.available ?? true ? "autoReviewTakeoverNote" : "autoReviewTakeoverWarning")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: ModelSwitchSettings_module_css_default.hint,
										children: props.t("autoReviewRouteHelp")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: ModelSwitchSettings_module_css_default.formGrid,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
											label: props.t("provider"),
											value: autoReviewDraft.provider ?? "",
											disabled: busy !== void 0 || !autoReview.writable,
											choices: autoReviewChoices.providers,
											onChange: (provider) => {
												const first = groups.find((group) => group.id === provider)?.models[0];
												setAutoReviewDraft({
													provider,
													...first === void 0 ? {} : { model: first.id }
												});
											}
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
											label: props.t("model"),
											value: autoReviewDraft.model ?? "",
											disabled: busy !== void 0 || !autoReview.writable,
											choices: autoReviewChoices.models,
											onChange: (model) => {
												setAutoReviewDraft({
													...autoReviewDraft,
													model
												});
											}
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Actions, {
										t: props.t,
										busy: busy === "autoReview",
										disabled: autoReviewDisabled,
										...message?.route === "autoReview" ? { message: message.text } : {},
										onCancel: () => {
											resetAutoReview();
											setMessage(void 0);
										},
										onSave: saveAutoReview
									})
								] })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RouteCard, {
								title: props.t("compaction"),
								summary: compactionDraft === void 0 ? props.t("loading") : compactionOn ? routeName(groups, compactionDraft) : props.t("compactionFollow"),
								hint: props.t("compactionHelp"),
								note: groupNote(props.t, groupPins.compaction),
								icon: "compaction",
								open: open === "compaction" && compactionOn,
								onToggle: () => {
									if (compactionOn) toggle("compaction");
								},
								expandable: compactionOn,
								trailing: compactionDraft === void 0 ? void 0 : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InstantSwitch, {
									checked: compactionOn,
									disabled: compactionSwitchDisabled,
									label: props.t("compaction"),
									onChange: persistCompactionEnabled
								}),
								children: compactionDraft === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: ModelSwitchSettings_module_css_default.hint,
									children: props.t("loading")
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: ModelSwitchSettings_module_css_default.hint,
										children: props.t("compactionRouteHelp")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: ModelSwitchSettings_module_css_default.formGrid,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
											label: props.t("provider"),
											value: compactionDraft.provider ?? "",
											disabled: busy !== void 0 || !compaction.writable,
											choices: compactionChoices.providers,
											onChange: (provider) => {
												const first = groups.find((group) => group.id === provider)?.models[0];
												setCompactionDraft({
													provider,
													...first === void 0 ? {} : { model: first.id }
												});
											}
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
											label: props.t("model"),
											value: compactionDraft.model ?? "",
											disabled: busy !== void 0 || !compaction.writable,
											choices: compactionChoices.models,
											onChange: (model) => {
												setCompactionDraft({
													...compactionDraft,
													model
												});
											}
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Actions, {
										t: props.t,
										busy: busy === "compaction",
										disabled: compactionDisabled,
										...message?.route === "compaction" ? { message: message.text } : {},
										onCancel: () => {
											resetCompaction();
											setMessage(void 0);
										},
										onSave: saveCompaction
									})
								] })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RouteCard, {
								title: props.t("sessionTitle"),
								summary: titleDraft === void 0 ? props.t("loading") : titleOn ? routeName(groups, titleDraft) : props.t("titleFollow"),
								hint: props.t("titleHelp"),
								note: groupNote(props.t, groupPins.title),
								icon: "sessionTitle",
								open: open === "sessionTitle" && titleOn,
								onToggle: () => {
									if (titleOn) toggle("sessionTitle");
								},
								expandable: titleOn,
								trailing: titleDraft === void 0 ? void 0 : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InstantSwitch, {
									checked: titleOn,
									disabled: titleSwitchDisabled,
									label: props.t("sessionTitle"),
									onChange: persistTitleEnabled
								}),
								children: titleDraft === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: ModelSwitchSettings_module_css_default.hint,
									children: props.t("loading")
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: ModelSwitchSettings_module_css_default.hint,
										children: props.t("titleRouteHelp")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: ModelSwitchSettings_module_css_default.formGrid,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
											label: props.t("provider"),
											value: titleDraft.provider ?? "",
											disabled: busy !== void 0 || !sessionTitle.writable,
											choices: titleChoices.providers,
											onChange: (provider) => {
												const first = groups.find((group) => group.id === provider)?.models[0];
												setTitleDraft({
													provider,
													...first === void 0 ? {} : { model: first.id }
												});
											}
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
											label: props.t("model"),
											value: titleDraft.model ?? "",
											disabled: busy !== void 0 || !sessionTitle.writable,
											choices: titleChoices.models,
											onChange: (model) => {
												setTitleDraft({
													...titleDraft,
													model
												});
											}
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Actions, {
										t: props.t,
										busy: busy === "sessionTitle",
										disabled: titleDisabled,
										...message?.route === "sessionTitle" ? { message: message.text } : {},
										onCancel: () => {
											resetTitle();
											setMessage(void 0);
										},
										onSave: saveTitle
									})
								] })
							}),
							null
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: ModelSwitchSettings_module_css_default.group,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
								className: ModelSwitchSettings_module_css_default.groupLabel,
								children: props.t("reviewAllowlistGroup")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(RouteCard, {
								title: props.t("reviewAllowlist"),
								summary: allowlistSummaryText,
								hint: props.t("reviewAllowlistHelp"),
								icon: "autoReview",
								open: open === "allowlist",
								onToggle: () => {
									toggle("allowlist");
								},
								...allowlistEnabled ? { badge: props.t("reviewAllowlistBadge") } : {},
								trailing: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InstantSwitch, {
									checked: allowlistEnabled,
									disabled: busy !== void 0 || !allowlistWritable,
									label: props.t("reviewAllowlist"),
									onChange: (value) => {
										persistAllowlist({
											enabled: value,
											tools: allowlistTools
										});
									}
								}),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: ModelSwitchSettings_module_css_default.hint,
										children: props.t("reviewAllowlistNote")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: ModelSwitchSettings_module_css_default.allowToolbar,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												className: ModelSwitchSettings_module_css_default.input,
												type: "search",
												value: allowlistQuery,
												placeholder: props.t("reviewAllowlistSearch"),
												onChange: (event) => {
													setAllowlistQuery(event.target.value);
												}
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: cx(ModelSwitchSettings_module_css_default.button, ModelSwitchSettings_module_css_default.secondaryButton),
												disabled: busy !== void 0 || props.scanTools === void 0 || catalogState === "loading",
												onClick: scanAllowlistTools,
												children: catalogState === "loading" ? props.t("reviewAllowlistScanning") : props.t("reviewAllowlistScan")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: cx(ModelSwitchSettings_module_css_default.button, ModelSwitchSettings_module_css_default.secondaryButton),
												disabled: busy !== void 0 || !allowlistWritable,
												onClick: () => {
													persistAllowlist({
														enabled: allowlistEnabled,
														tools: [...DEFAULT_READ_ONLY_TOOLS]
													});
												},
												children: props.t("reviewAllowlistReset")
											})
										]
									}),
									message?.route === "allowlist" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: cx(ModelSwitchSettings_module_css_default.hint, ModelSwitchSettings_module_css_default.message),
										children: message.text
									}) : null,
									reviewStatus === void 0 || reviewStatus.skippedReadOnly === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: ModelSwitchSettings_module_css_default.hint,
										children: props.t("reviewAllowlistSkipped").replace("{count}", String(reviewStatus.skippedReadOnly))
									}),
									reviewStatus?.automode === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: ModelSwitchSettings_module_css_default.hint,
										children: props.t("reviewAutomodeLinked").replace("{route}", reviewStatus.automode.route ?? (reviewStatus.automode.routeSkipped === "user-set" ? props.t("reviewAutomodeRouteOwn") : props.t("reviewAutomodeRouteUnset"))).replace("{added}", String(reviewStatus.automode.added)).replace("{skipped}", String(reviewStatus.automode.skipped))
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
										className: ModelSwitchSettings_module_css_default.allowList,
										children: allowlistIncluded.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
											className: ModelSwitchSettings_module_css_default.allowRow,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
													className: ModelSwitchSettings_module_css_default.allowLabel,
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
														type: "checkbox",
														checked: true,
														readOnly: true
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
														className: ModelSwitchSettings_module_css_default.allowName,
														children: row.entry
													})]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: ModelSwitchSettings_module_css_default.allowSource,
													children: [row.source.label, row.source.repo === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: ModelSwitchSettings_module_css_default.allowDot,
														children: "·"
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
														className: ModelSwitchSettings_module_css_default.allowRepo,
														href: row.source.repo,
														target: "_blank",
														rel: "noreferrer",
														children: props.t("reviewAllowlistRepo")
													})] })]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: cx(ModelSwitchSettings_module_css_default.button, ModelSwitchSettings_module_css_default.secondaryButton),
													disabled: busy !== void 0 || !allowlistWritable,
													onClick: () => {
														setAllowTool(row.entry, false);
													},
													children: props.t("reviewAllowlistRemove")
												})
											]
										}, row.entry))
									}),
									allowlistIncluded.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: ModelSwitchSettings_module_css_default.hint,
										children: props.t("reviewAllowlistNone")
									}) : null,
									allowlistAvailable.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: ModelSwitchSettings_module_css_default.hint,
										children: props.t("reviewAllowlistAvailable")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
										className: ModelSwitchSettings_module_css_default.allowList,
										children: allowlistAvailable.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
											className: ModelSwitchSettings_module_css_default.allowRow,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
													className: ModelSwitchSettings_module_css_default.allowLabel,
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
														type: "checkbox",
														checked: false,
														readOnly: true
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
														className: ModelSwitchSettings_module_css_default.allowName,
														children: row.name
													})]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: ModelSwitchSettings_module_css_default.allowSource,
													children: [row.sourceLabel, row.repo === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: ModelSwitchSettings_module_css_default.allowDot,
														children: "·"
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
														className: ModelSwitchSettings_module_css_default.allowRepo,
														href: row.repo,
														target: "_blank",
														rel: "noreferrer",
														children: props.t("reviewAllowlistRepo")
													})] })]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: cx(ModelSwitchSettings_module_css_default.button, ModelSwitchSettings_module_css_default.secondaryButton),
													disabled: busy !== void 0 || !allowlistWritable,
													onClick: () => {
														setAllowTool(row.name, true);
													},
													children: props.t("reviewAllowlistAdd")
												})
											]
										}, row.name))
									})] }),
									catalogState === "failed" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: cx(ModelSwitchSettings_module_css_default.hint, ModelSwitchSettings_module_css_default.message),
										children: props.t("reviewAllowlistScanFailed")
									}) : null
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(RouteCard, {
								title: props.t("reviewTimeout"),
								summary: timeoutSummary,
								hint: props.t("reviewTimeoutHelp"),
								icon: "autoReview",
								open: open === "timeout",
								onToggle: () => {
									toggle("timeout");
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: ModelSwitchSettings_module_css_default.hint,
										children: props.t("reviewTimeoutScope")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: ModelSwitchSettings_module_css_default.formGrid,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											className: ModelSwitchSettings_module_css_default.field,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: ModelSwitchSettings_module_css_default.fieldLabel,
												children: props.t("reviewTimeoutSeconds")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												className: ModelSwitchSettings_module_css_default.input,
												type: "number",
												min: 1,
												max: Math.round(UPSTREAM_MAX_IDLE_TIMEOUT_MS / 1e3),
												step: 1,
												disabled: busy !== void 0 || !timeoutWritable || timeoutCancelled,
												value: timeoutSeconds ?? "",
												placeholder: props.t("reviewTimeoutPlaceholder"),
												onChange: (event) => {
													setTimeoutDraft(event.target.value);
												}
											})]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											className: ModelSwitchSettings_module_css_default.field,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: ModelSwitchSettings_module_css_default.fieldLabel,
												children: props.t("reviewTimeoutCancelLabel")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												style: {
													display: "flex",
													alignItems: "center",
													gap: 6
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													type: "checkbox",
													checked: timeoutCancelled,
													disabled: busy !== void 0 || !timeoutWritable,
													onChange: (event) => {
														if (event.target.checked) {
															setTimeoutDraft(void 0);
															run("timeout", () => props.saveReviewTimeout(0));
														} else run("timeout", () => props.saveReviewTimeout(void 0));
													}
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: ModelSwitchSettings_module_css_default.hint,
													children: props.t("reviewTimeoutCancelHint")
												})]
											})]
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: ModelSwitchSettings_module_css_default.formGrid,
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: cx(ModelSwitchSettings_module_css_default.button, ModelSwitchSettings_module_css_default.secondaryButton),
											disabled: busy !== void 0 || !timeoutWritable,
											onClick: saveTimeout,
											children: props.t("reviewTimeoutSave")
										})
									}),
									message?.route === "timeout" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: cx(ModelSwitchSettings_module_css_default.hint, ModelSwitchSettings_module_css_default.message),
										children: message.text
									}) : null
								]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: ModelSwitchSettings_module_css_default.group,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							className: ModelSwitchSettings_module_css_default.groupLabel,
							children: props.t("providerGroups")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(RouteCard, {
							title: props.t("providerGroupsCard"),
							summary: props.t("providerGroupsSummary"),
							hint: props.t("providerGroupsHelp"),
							icon: "providerGroups",
							open: open === "providerGroups",
							onToggle: () => {
								toggle("providerGroups");
							},
							...configuredGroupCount > 0 ? { badge: String(configuredGroupCount) } : {},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: ModelSwitchSettings_module_css_default.hint,
									children: props.t("providerGroupsBodyHelp")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: ModelSwitchSettings_module_css_default.formGrid,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
										label: props.t("provider"),
										value: groupProvider,
										disabled: groupControlsDisabled,
										choices: groupProviderChoices,
										onChange: setGroupProvider
									})
								}),
								groupProvider === "" || groupDraft === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: ModelSwitchSettings_module_css_default.hint,
									children: props.t("providerGroupPick")
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: ModelSwitchSettings_module_css_default.rowCard,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: ModelSwitchSettings_module_css_default.rowCopy,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: ModelSwitchSettings_module_css_default.rowTitle,
												children: props.t("compaction")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
												className: ModelSwitchSettings_module_css_default.hint,
												children: groupCompaction === void 0 ? props.t("compactionFollow") : routeName(groups, groupCompaction)
											})]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InstantSwitch, {
											checked: groupCompaction !== void 0,
											disabled: groupControlsDisabled || groupCompaction === void 0 && catalogSeed === void 0 && !compactionOn,
											label: props.t("compaction"),
											onChange: (value) => {
												if (value) enableGroupCapability("compaction");
												else disableGroupCapability("compaction");
											}
										})]
									}),
									groupCompaction === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: ModelSwitchSettings_module_css_default.formGrid,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
											label: props.t("provider"),
											value: groupCompaction.provider,
											disabled: groupControlsDisabled,
											choices: groupCompactionChoices.providers,
											onChange: (provider) => {
												const first = groups.find((item) => item.id === provider)?.models[0];
												setGroupDraft((draft) => draft === void 0 ? draft : {
													...draft,
													compactProvider: provider,
													compactModel: first?.id ?? ""
												});
											}
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
											label: props.t("model"),
											value: groupCompaction.model,
											disabled: groupControlsDisabled,
											choices: groupCompactionChoices.models,
											onChange: (model) => {
												setGroupDraft((draft) => draft === void 0 ? draft : {
													...draft,
													compactModel: model
												});
											}
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: ModelSwitchSettings_module_css_default.rowCard,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: ModelSwitchSettings_module_css_default.rowCopy,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: ModelSwitchSettings_module_css_default.rowTitle,
												children: props.t("autoReview")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
												className: ModelSwitchSettings_module_css_default.hint,
												children: groupAutoReview === void 0 ? props.t("autoReviewFollow") : routeName(groups, groupAutoReview)
											})]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InstantSwitch, {
											checked: groupAutoReview !== void 0,
											disabled: groupControlsDisabled || groupAutoReview === void 0 && catalogSeed === void 0 && !autoReviewOn,
											label: props.t("autoReview"),
											onChange: (value) => {
												if (value) enableGroupCapability("autoReview");
												else disableGroupCapability("autoReview");
											}
										})]
									}),
									groupAutoReview === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: ModelSwitchSettings_module_css_default.formGrid,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
											label: props.t("provider"),
											value: groupAutoReview.provider,
											disabled: groupControlsDisabled,
											choices: groupAutoReviewChoices.providers,
											onChange: (provider) => {
												const first = groups.find((item) => item.id === provider)?.models[0];
												setGroupDraft((draft) => draft === void 0 ? draft : {
													...draft,
													autoReviewProvider: provider,
													autoReviewModel: first?.id ?? ""
												});
											}
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
											label: props.t("model"),
											value: groupAutoReview.model,
											disabled: groupControlsDisabled,
											choices: groupAutoReviewChoices.models,
											onChange: (model) => {
												setGroupDraft((draft) => draft === void 0 ? draft : {
													...draft,
													autoReviewModel: model
												});
											}
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: ModelSwitchSettings_module_css_default.rowCard,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: ModelSwitchSettings_module_css_default.rowCopy,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: ModelSwitchSettings_module_css_default.rowTitle,
												children: props.t("sessionTitle")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
												className: ModelSwitchSettings_module_css_default.hint,
												children: groupTitle === void 0 ? props.t("titleFollow") : routeName(groups, groupTitle)
											})]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InstantSwitch, {
											checked: groupTitle !== void 0,
											disabled: groupControlsDisabled || groupTitle === void 0 && catalogSeed === void 0 && !titleOn,
											label: props.t("sessionTitle"),
											onChange: (value) => {
												if (value) enableGroupCapability("sessionTitle");
												else disableGroupCapability("sessionTitle");
											}
										})]
									}),
									groupTitle === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: ModelSwitchSettings_module_css_default.formGrid,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
											label: props.t("provider"),
											value: groupTitle.provider,
											disabled: groupControlsDisabled,
											choices: groupTitleChoices.providers,
											onChange: (provider) => {
												const first = groups.find((item) => item.id === provider)?.models[0];
												setGroupDraft((draft) => draft === void 0 ? draft : {
													...draft,
													titleProvider: provider,
													titleModel: first?.id ?? ""
												});
											}
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
											label: props.t("model"),
											value: groupTitle.model,
											disabled: groupControlsDisabled,
											choices: groupTitleChoices.models,
											onChange: (model) => {
												setGroupDraft((draft) => draft === void 0 ? draft : {
													...draft,
													titleModel: model
												});
											}
										})]
									}),
									null,
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: ModelSwitchSettings_module_css_default.rowCard,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: ModelSwitchSettings_module_css_default.rowCopy,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: ModelSwitchSettings_module_css_default.rowTitle,
												children: props.t("subagent")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
												className: ModelSwitchSettings_module_css_default.hint,
												children: groupSubagent === void 0 ? props.t("subagentOff") : routeName(groups, groupSubagent)
											})]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InstantSwitch, {
											checked: groupSubagent !== void 0,
											disabled: groupControlsDisabled || groupSubagent === void 0 && catalogSeed === void 0 && !(subagent.value?.mode === "fixed" && routePairConfigured(subagent.value)),
											label: props.t("subagent"),
											onChange: (value) => {
												if (value) enableGroupCapability("subagent");
												else disableGroupCapability("subagent");
											}
										})]
									}),
									groupSubagent === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: ModelSwitchSettings_module_css_default.formGrid,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
												label: props.t("provider"),
												value: groupSubagent.provider,
												disabled: groupControlsDisabled,
												choices: groupSubagentChoices.providers,
												onChange: (provider) => {
													const first = groups.find((item) => item.id === provider)?.models[0];
													const routed = selectRouteModel(groups, provider, first?.id ?? groupSubagent.model);
													setGroupDraft((draft) => draft === void 0 ? draft : {
														...draft,
														subagentProvider: routed.provider,
														subagentModel: routed.model,
														subagentReasoningEffort: routed.reasoningEffort ?? ""
													});
												}
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
												label: props.t("model"),
												value: groupSubagent.model,
												disabled: groupControlsDisabled,
												choices: groupSubagentChoices.models,
												onChange: (model) => {
													const routed = selectRouteModel(groups, groupSubagent.provider, model);
													setGroupDraft((draft) => draft === void 0 ? draft : {
														...draft,
														subagentProvider: routed.provider,
														subagentModel: routed.model,
														subagentReasoningEffort: routed.reasoningEffort ?? ""
													});
												}
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
												label: props.t("effort"),
												value: groupDraft.subagentReasoningEffort ?? "",
												disabled: groupControlsDisabled,
												choices: groupSubEfforts,
												onChange: (effort) => {
													setGroupDraft((draft) => draft === void 0 ? draft : {
														...draft,
														subagentReasoningEffort: effort
													});
												}
											})
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Actions, {
										t: props.t,
										busy: busy === "providerGroups",
										disabled: groupControlsDisabled || groupProvider === "",
										...message?.route === "providerGroups" ? { message: message.text } : {},
										extra: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: cx(ModelSwitchSettings_module_css_default.button, ModelSwitchSettings_module_css_default.secondaryButton),
											disabled: groupControlsDisabled || groupOf(providerGroups, groupProvider) === void 0,
											onClick: deleteProviderGroupCard,
											children: props.t("providerGroupDelete")
										}),
										onCancel: () => {
											resyncGroupDraft();
											setMessage(void 0);
										},
										onSave: saveProviderGroupCard
									})
								] })
							]
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		const zh$1 = {
			nav: "模型切换",
			title: "模型切换",
			subtitle: "为子代理与能力路由设置固定模型；当前会话模型用输入框旁的选择器直接切换。",
			conversationRoutes: "对话路由",
			capabilityRoutes: "能力路由",
			settingsSynced: "设置已同步",
			remoteSettingsUnavailable: "官方 DSH 在非本机浏览器禁用配置读取与写入；请在 Host 的 127.0.0.1 页面打开设置。",
			cancel: "取消",
			provider: "提供商",
			model: "模型",
			providerDefault: "使用提供商默认值",
			providerDefaultShort: "Provider 默认",
			effort: "推理强度",
			effortPinned: "已固定",
			save: "保存",
			saving: "保存中…",
			saved: "已保存",
			subagent: "子代理默认路由",
			subagentHelp: "DSH 已有官方子代理模型白名单：模型自己点名 provider/model 时以它为准。这里只在未点名时使用。",
			subagentOff: "未指定时使用官方继承",
			agentBadge: "Agent",
			search: "Web 搜索",
			searchHelp: "下拉选择的是期望使用的搜索 Adapter/模型；仅当全局 Web searchProvider=model-switch 时官方 web_search 才会使用该选择，否则保持原有路由不变。",
			image: "图像生成",
			imageHelp: "统一 generate_image 会调用所选 Codex 或 Grok Adapter；Provider 原有图片工具仍保留。",
			unavailable: "未接入",
			loading: "正在加载设置…",
			requestFailed: "保存失败",
			catalogFailed: "无法加载模型目录。",
			autoReview: "自动审查模型",
			autoReviewFollow: "跟随会话模型",
			autoReviewHelp: "为官方 auto-review（Auto 权限预设的逐调用审查）指定审查模型；需启用官方 auto-review 能力包。关闭时审查跟随当前会话模型。本插件启用时，官方「自动审查」组件由本插件接管。",
			autoReviewRouteHelp: "审查请求固定使用这里的 Provider/模型，与会话模型无关；保存后对下一次审查立即生效。",
			autoReviewTakeoverWarning: "审查路由当前未接管（官方「自动审查」行仍占着唯一注册位）：工具调用会照常执行，但这些调用未经审查。重启 DSH 即可收敛；若重启后仍显示此提示，请把日志里的 fiber 链反馈给上游。",
			autoReviewTakeoverNote: "官方「自动审查」组件已由本插件接管（提供可配置审查路由）；在插件管理里把它重新打开会被再次关闭，并在日志里留下一条记录。",
			compaction: "压缩模型",
			compactionFollow: "跟随会话模型",
			compactionHelp: "为官方压缩（/compact 与官方自动压缩）指定摘要模型；关闭（两个字段都留空）时使用官方默认，即当前会话的目标模型。",
			compactionRouteHelp: "摘要请求固定使用这里的 Provider/模型，与会话目标模型无关；保存后对下一次压缩立即生效。保存时若恰有压缩进行中，可能被打断并在下次重试。",
			sessionTitle: "会话命名模型",
			titleFollow: "跟随会话模型",
			titleHelp: "为官方自动命名（新会话首条消息后生成标题）指定模型；关闭（两个字段都留空）时命名跟随当前会话模型。",
			titleRouteHelp: "命名请求固定使用这里的 Provider/模型（不带推理强度）；关闭时跟随会话模型。保存后立即对下一次命名生效，不会中断正在进行的命名，会话日志记录的也是实际使用的模型。",
			memory: "记忆蒸馏模型",
			memoryFollow: "跟随记忆插件默认",
			memoryHelp: "为 dsh-prime-memory 的记忆蒸馏指定路由；两个字段都留空时跟随该插件自己的默认模型。保存后立即生效（写入该插件自己的 live 设置，运行中的实例会读到）；它拒收时才回落到静态路由，下次启动生效。",
			memoryRouteHelp: "按部署默认供应商的配置组解析；该供应商没有组时使用这里填写的平面默认。优先写该行的 live 设置（立即生效），不可用时写静态路由（llm.provider/llm.model），启动时生效。",
			providerGroups: "供应商配置组",
			providerGroupsCard: "按供应商预设路由",
			providerGroupsSummary: "使用该供应商的会话自动采用对应组",
			providerGroupsHelp: "为压缩、自动审查、会话命名与子代理按供应商分别保存路由。",
			providerGroupsBodyHelp: "每个供应商保存一组压缩、自动审查、会话命名与子代理路由。会话自身的供应商与该组一致时，这四项能力按组实时解析，未固定项回落到上方卡片里的全局设置。切换某个会话的模型不会写入任何全局设置，因此不同供应商的多个会话并行时互不影响，会话中切换供应商后下一次调用也会立即跟随新供应商的配置组。",
			providerGroupPick: "选择供应商以编辑其配置组。",
			providerGroupDelete: "删除该组",
			groupOverridesLabel: "组覆盖：{pins}；无组时用上方默认值",
			groupOverridesMore: "组覆盖：{listed} 等 {count} 个组；无组时用上方默认值",
			saveTimeout: "保存超时，请重试",
			saveRejected: "保存被拒绝，请重试",
			reviewAllowlistGroup: "审查豁免",
			reviewAllowlist: "纯读工具免审查",
			reviewAllowlistBadge: "已开启",
			reviewAllowlistOnSummary: "名单内 {count} 条免审查",
			reviewAllowlistOffSummary: "未开启：每次调用都经审查",
			reviewAllowlistHelp: "开启后，名单内的纯读工具直接执行，不再调用审查模型；名单外的写操作、命令执行与删除仍照常审查。",
			reviewAllowlistNote: "来源按工具名解析（MCP 前缀 / 插件前缀 / 扩展后缀）；同名工具可以冒充来源，徽章只是提示，不是安全边界。",
			reviewAllowlistSearch: "搜索工具名或来源",
			reviewAllowlistScan: "扫描本机工具",
			reviewAllowlistScanning: "扫描中…",
			reviewAllowlistScanFailed: "扫描失败：Host 没有提供工具目录接口。",
			reviewAllowlistReset: "恢复默认名单",
			reviewAllowlistRemove: "移除",
			reviewAllowlistAdd: "加入",
			reviewAllowlistNone: "名单为空：没有任何工具免审查。",
			reviewAllowlistAvailable: "本机存在但未放行的工具：",
			reviewAllowlistRepo: "仓库",
			reviewAllowlistSkipped: "本 Host 进程已为纯读调用跳过 {count} 次审查。",
			reviewTimeout: "审查超时",
			reviewTimeoutDefault: "跟随 Provider 默认（300 秒）",
			reviewTimeoutHelp: "设置自动审查请求的流式空闲超时。留空恢复 Provider 默认值；勾选「取消超时」写入上游上限（约 24.8 天），审查将不会因空闲而超时。保存后会立即重挂审查模型所在的 Provider 使其生效，重挂会中断该 Provider 的在途调用；重挂不了时回落到下次启动生效。",
			reviewTimeoutScope: "注意：该值写入审查模型所在 Provider 的 streamIdleTimeoutMs，对该 Provider 的所有调用（含主对话）生效，不只影响审查请求。",
			reviewTimeoutSeconds: "超时秒数",
			reviewTimeoutPlaceholder: "300（默认）",
			reviewTimeoutCancelLabel: "取消超时",
			reviewTimeoutCancelHint: "审查调用不再因空闲超时（写入约 24.8 天上限）",
			reviewTimeoutSave: "保存超时设置",
			reviewTimeoutCancelled: "已取消超时",
			reviewAutomodeLinked: "Auto mode 已接入：审查路由 {route}，直通 +{added} 个纯读工具（{skipped} 条通配未同步）。",
			reviewAutomodeRouteOwn: "沿用其自身配置",
			reviewAutomodeRouteUnset: "未配置（沿用会话模型）",
			"reason.central-subagent-routing": "Alpha.4 没有全局子代理启动路由接口。",
			"reason.packaged-preset-roots": "Alpha.4 不支持插件提供额外 preset root。",
			"reason.tool-owner-suppression": "Alpha.4 没有工具所有者或来源抑制接口。",
			"reason.search-provider-adapters": "当前公开版本没有可按模型切换的搜索 Provider Adapter。",
			"reason.vision-provider-adapters": "尚无 Provider 注册可独立路由的 Vision Adapter。",
			"reason.image-provider-adapters": "当前公开版本没有图像生成 Provider Adapter。"
		};
		const en$1 = {
			nav: "Model Switch",
			title: "Model Switch",
			subtitle: "Pin routes for Subagents and capability tools; switch the active session model through the composer picker.",
			conversationRoutes: "Conversation routes",
			capabilityRoutes: "Capability routes",
			settingsSynced: "Settings synced",
			remoteSettingsUnavailable: "Official DSH disables settings reads and writes in non-loopback browsers. Open Settings on the Host loopback URL to edit model routes.",
			cancel: "Cancel",
			provider: "Provider",
			model: "Model",
			providerDefault: "Provider default",
			providerDefaultShort: "Provider default",
			effort: "Reasoning effort",
			effortPinned: "Pinned",
			save: "Save",
			saving: "Saving…",
			saved: "Saved",
			subagent: "Default Subagent route",
			subagentHelp: "DSH already has an official Allowlist for child models the agent names. This default applies only when the spawn names none.",
			subagentOff: "Official inherit when unnamed",
			agentBadge: "Agent",
			search: "Web search",
			searchHelp: "The dropdown selects the requested search adapter/model. The official web_search uses it only when the global Web searchProvider is model-switch; otherwise the original route is unchanged.",
			image: "Image generation",
			imageHelp: "The stable generate_image tool calls the selected Codex or Grok Adapter; existing provider image tools remain available.",
			unavailable: "Unavailable",
			loading: "Loading settings…",
			requestFailed: "Save failed",
			catalogFailed: "Could not load the model catalog.",
			autoReview: "Auto review model",
			autoReviewFollow: "Follows the session model",
			autoReviewHelp: "Pin the reviewer model for the official auto-review gate (per-call review under the Auto permission preset). Requires the official auto-review bundle. When off, reviews follow the session model. With this plugin enabled the official auto-review component is taken over.",
			autoReviewRouteHelp: "Review requests use exactly this provider/model regardless of the session model; saved changes apply to the very next review.",
			autoReviewTakeoverWarning: "The reviewer route is not held right now (the official Auto-review row still owns the single registration): tool calls keep running, but they are not reviewed. Restart DSH to converge; if this stays after a restart, report the fiber chain from the log upstream.",
			autoReviewTakeoverNote: "The official auto-review component is taken over by this plugin (configurable reviewer route); toggling it back on in the plugin manager is re-disabled, with one log line.",
			compaction: "Compaction model",
			compactionFollow: "Follows the conversation model",
			compactionHelp: "Pick the summarization model for official compaction (/compact and official automatic compaction). When off (both fields empty), the official default applies: the conversation target model.",
			compactionRouteHelp: "Summarization requests use exactly this provider/model regardless of the conversation target; saved changes apply to the very next compaction. Saving while a compaction is running may interrupt it; it retries next time.",
			sessionTitle: "Session title model",
			titleFollow: "Follows the session model",
			titleHelp: "Pick the model used to name new sessions automatically (right after the first prompt). When off (both fields empty), naming follows the session model.",
			titleRouteHelp: "Naming requests use exactly this provider/model (no reasoning effort); when off they follow the session model. A saved change applies to the very next title, never interrupts a running one, and the session log records the route actually used.",
			memory: "Memory distillation model",
			memoryFollow: "Follows the memory plugin default",
			memoryHelp: "Pin the distillation route for dsh-prime-memory. Both fields empty keeps that plugin on its own default model. Saved changes apply immediately through that plugin’s own live settings; only when it refuses the write does the static route fall back to the next start.",
			memoryRouteHelp: "Resolved from the deployment default provider group; without a group the flat pair here applies. The live settings are preferred (immediate); the static route (llm.provider/llm.model) is the fallback that applies at start.",
			providerGroups: "Provider groups",
			providerGroupsCard: "Per-provider route presets",
			providerGroupsSummary: "Sessions using that provider adopt this group",
			providerGroupsHelp: "Save compaction, auto-review, session-naming, and subagent routes per provider.",
			providerGroupsBodyHelp: "Each provider stores one route group for compaction, auto review, session naming, and subagents. A session running on that provider resolves all four capabilities from the group and falls back to the cards above when a row is off. Switching a session’s model writes no global setting, so parallel sessions on different providers never affect each other, and mid-session provider switches take effect on the very next call.",
			providerGroupPick: "Pick a provider to edit its group.",
			providerGroupDelete: "Delete group",
			groupOverridesLabel: "Group overrides: {pins}; without a group the default above applies",
			groupOverridesMore: "Group overrides: {listed} and {count} groups; without a group the default above applies",
			saveTimeout: "The save timed out; try again",
			saveRejected: "The save was rejected; try again",
			reviewAllowlistGroup: "Review bypass",
			reviewAllowlist: "Skip review for pure reads",
			reviewAllowlistBadge: "On",
			reviewAllowlistOnSummary: "{count} entries skip review",
			reviewAllowlistOffSummary: "Off: every call is reviewed",
			reviewAllowlistHelp: "When on, allowlisted pure-read tools run immediately instead of calling the reviewer. Writes, command execution and deletions stay reviewed.",
			reviewAllowlistNote: "Sources are resolved from the tool name (MCP prefix, plugin prefix, extension suffix); a lookalike tool can claim any origin, so the badge is a hint, not a security boundary.",
			reviewAllowlistSearch: "Search tool name or source",
			reviewAllowlistScan: "Scan local tools",
			reviewAllowlistScanning: "Scanning…",
			reviewAllowlistScanFailed: "Scan failed: the Host exposes no tool catalog endpoint.",
			reviewAllowlistReset: "Restore defaults",
			reviewAllowlistRemove: "Remove",
			reviewAllowlistAdd: "Add",
			reviewAllowlistNone: "Empty list: no tool skips review.",
			reviewAllowlistAvailable: "Present on this machine but not allowed:",
			reviewAllowlistRepo: "repo",
			reviewAllowlistSkipped: "This Host process has skipped the reviewer {count} times.",
			reviewTimeout: "Review timeout",
			reviewTimeoutDefault: "Follows Provider default (300 s)",
			reviewTimeoutHelp: "Set the streaming idle timeout for auto-review requests. Leave empty to restore the Provider default. Check \"Cancel timeout\" to write the upstream ceiling (~24.8 days) so reviews never time out on idle. Saving reloads the Provider hosting the reviewer model so the value applies at once; that reload drops the Provider’s in-flight calls. When the reload cannot run, the value applies at the next start.",
			reviewTimeoutScope: "Note: this value is written to the streamIdleTimeoutMs of the Provider hosting the reviewer model and applies to every call through that Provider (main chat included), not only review requests.",
			reviewTimeoutSeconds: "Timeout (seconds)",
			reviewTimeoutPlaceholder: "300 (default)",
			reviewTimeoutCancelLabel: "Cancel timeout",
			reviewTimeoutCancelHint: "Reviews never time out on idle (writes ~24.8-day ceiling)",
			reviewTimeoutSave: "Save timeout",
			reviewTimeoutCancelled: "Timeout cancelled",
			reviewAutomodeLinked: "Auto mode linked: reviewer route {route}, passes +{added} read-only tools ({skipped} pattern entries not synced).",
			reviewAutomodeRouteOwn: "its own settings",
			reviewAutomodeRouteUnset: "unset (follows the session model)",
			"reason.central-subagent-routing": "Alpha.4 exposes no global Subagent start-routing seam.",
			"reason.packaged-preset-roots": "Alpha.4 exposes no plugin-owned preset root.",
			"reason.tool-owner-suppression": "Alpha.4 exposes no tool owner or provenance suppression seam.",
			"reason.search-provider-adapters": "This release exposes no model-selectable Search provider adapter.",
			"reason.vision-provider-adapters": "No Provider has registered an independently routable Vision Adapter.",
			"reason.image-provider-adapters": "This release exposes no image-generation provider adapter."
		};
		//#endregion
		//#region src/picker/plan-review.ts
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
		var PlanApprovalResponseError = class extends Error {
			constructor(message, options) {
				super(message, options);
				this.name = "PlanApprovalResponseError";
			}
		};
		function codeOf(value) {
			if (value === null || typeof value !== "object") return void 0;
			const code = value.code;
			return typeof code === "string" && code !== "" ? code : void 0;
		}
		/**
		* Diagnostic text for one failed action, keeping the wire code visible.
		* Official Remote failures carry a code that names the owning domain
		* (`session/writer-held`, `session/model-unavailable`, …); dropping it leaves
		* the human with copy they cannot act on.
		* @param cause - the thrown value.
		* @returns The message, prefixed with the nearest available code.
		*/
		function planErrorText(cause) {
			const message = cause instanceof Error ? cause.message : String(cause);
			const code = codeOf(cause) ?? (cause instanceof Error ? codeOf(cause.cause) : void 0);
			return code === void 0 ? message : `${code}: ${message}`;
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
		function planActionView(state, available, hasExecution) {
			return {
				approveDisabled: state.busy || state.blocked || !available || !hasExecution,
				error: state.error
			};
		}
		async function settlePlanAction(send, update) {
			update({
				busy: true,
				blocked: false,
				error: null
			});
			try {
				await send();
				return true;
			} catch (cause) {
				update({
					busy: false,
					blocked: cause instanceof PlanApprovalResponseError,
					error: planErrorText(cause)
				});
				return false;
			}
		}
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
		/** Catalog id for a standard-row window that the Host did not publish. UI localizes this. */
		const STANDARD_CONTEXT_LABEL = "standard";
		/** Human label for a context tier: 1M, 272K, or STANDARD_CONTEXT_LABEL when its window is unknown. */
		function contextTierLabel(tier, tokens) {
			if (tier === null) return tokens === void 0 ? STANDARD_CONTEXT_LABEL : formatWindow(tokens);
			const match = /^(\d+)(k|m)$/iu.exec(tier);
			if (match !== null) return `${match[1]}${match[2].toUpperCase()}`;
			return tokens === void 0 ? tier : formatWindow(tokens);
		}
		/** Compact token window for trigger / context-cell copy. */
		function formatWindow(tokens) {
			if (tokens >= 1e6 && tokens % 1e6 === 0) return `${tokens / 1e6}M`;
			if (tokens >= 1e3 && tokens % 1e3 === 0) return `${tokens / 1e3}K`;
			if (tokens >= 1e3) return `${Math.round(tokens / 1e3)}K`;
			return String(tokens);
		}
		/** Standard-row window when the Host directory omits contextWindow. */
		function impliedStandardTokens(base) {
			if (/^gpt-5\.6(?:-|$)/u.test(base)) return 272e3;
		}
		/** Label a selected variant from catalog identity, never from stale session pressure. */
		function contextLabelForMember(family, member) {
			const tokens = member.contextTokens ?? (member.contextTier === null ? impliedStandardTokens(family.base) : void 0);
			return contextTierLabel(member.contextTier, tokens);
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
		/** Locate the family that owns a provider/model pair. */
		function findFamily(families, provider, modelId) {
			return families.find((family) => family.provider === provider && family.members.some((member) => member.model.id === modelId));
		}
		/** Locate one family member by catalog id. */
		function findMember(family, modelId) {
			return family.members.find((member) => member.model.id === modelId);
		}
		/** Pick a sibling after toggling Fast / context / thinking, keeping the other axes. */
		function pickVariant(family, current, patch) {
			const fast = patch.fast ?? current.fast;
			const contextTier = patch.contextTier !== void 0 ? patch.contextTier : current.contextTier;
			const thinking = patch.thinking ?? current.thinking;
			const exact = family.members.find((member) => member.fast === fast && member.contextTier === contextTier && member.thinking === thinking);
			if (exact !== void 0) return exact;
			const sameTier = family.members.find((member) => member.fast === fast && member.contextTier === contextTier);
			if (sameTier !== void 0) return sameTier;
			return family.members.find((member) => member.fast === fast) ?? family.members[0] ?? current;
		}
		/** Fast row appears only when both a Fast and a non-Fast sibling exist. */
		function familyHasFast(family) {
			return family.members.some((member) => member.fast) && family.members.some((member) => !member.fast);
		}
		function displayNameOf(name, parsed) {
			let next = name;
			if (parsed.fast) next = next.replace(/\s+Fast$/iu, "");
			if (parsed.contextTier !== null) next = next.replace(/\s+(?:Max|1M)$/iu, "");
			return next.replace(/\s+/gu, " ").trim() || name;
		}
		/** Provider sections in catalog order, for the model pane. */
		function sectionFamilies(families) {
			const sections = [];
			const index = /* @__PURE__ */ new Map();
			for (const family of families) {
				let section = index.get(family.provider);
				if (section === void 0) {
					section = {
						provider: family.provider,
						providerName: family.providerName,
						families: []
					};
					index.set(family.provider, section);
					sections.push(section);
				}
				section.families.push(family);
			}
			return sections;
		}
		/** Unique context tiers in catalog order. */
		function contextTiers(family, standardTokens) {
			const seen = /* @__PURE__ */ new Set();
			const rows = [];
			for (const member of family.members) {
				const tokens = member.contextTier === null ? member.contextTokens ?? standardTokens ?? impliedStandardTokens(family.base) : member.contextTokens;
				const label = contextTierLabel(member.contextTier, tokens);
				if (seen.has(label)) continue;
				seen.add(label);
				rows.push({
					tier: member.contextTier,
					label,
					...tokens === void 0 ? {} : { tokens }
				});
			}
			return rows;
		}
		/** Context row appears only when the family has more than one tier. */
		function familyHasContextChoices(family) {
			return contextTiers(family).length > 1;
		}
		/** Thinking on/off siblings at the current Fast + context axes, or null. */
		function thinkingSiblings(family, current) {
			const on = family.members.find((member) => member.fast === current.fast && member.contextTier === current.contextTier && member.thinking);
			const off = family.members.find((member) => member.fast === current.fast && member.contextTier === current.contextTier && !member.thinking);
			if (on === void 0 || off === void 0) return null;
			return {
				on,
				off
			};
		}
		/** Case-insensitive local search over family name, base, and provider. */
		function filterFamilies(families, query) {
			const needle = query.trim().toLowerCase();
			if (needle.length === 0) return [...families];
			return families.filter((family) => family.name.toLowerCase().includes(needle) || family.base.toLowerCase().includes(needle) || family.providerName.toLowerCase().includes(needle) || family.members.some((member) => member.model.id.toLowerCase().includes(needle)));
		}
		/** Build a Host selection from a member, preserving or defaulting effort. */
		function selectionOf(family, member, reasoningEffort) {
			const reasoning = member.model.reasoning;
			const effort = reasoningEffort !== void 0 && reasoning?.efforts.some((level) => level.id === reasoningEffort) ? reasoningEffort : reasoning?.defaultEffort;
			return {
				provider: family.provider,
				model: member.model.id,
				...effort === void 0 ? {} : { reasoningEffort: effort }
			};
		}
		//#endregion
		//#region src/picker/selection-feedback.ts
		/** Immediate picker feedback around an asynchronous Host model selection. */
		async function beginSelection(select, showFeedback, settle) {
			showFeedback();
			settle(await select());
		}
		//#endregion
		//#region src/client/picker/popup-dismissal.ts
		/** Install capture-phase outside-pointer dismissal and optional mobile Back registration. */
		function installPickerDismissal({ documentTarget, surfaceId, interaction, trigger, popup, dismiss }) {
			let unregister = () => {};
			try {
				unregister = interaction?.registerSurface({
					id: surfaceId,
					kind: "popup",
					dismiss: () => {
						dismiss();
					}
				}) ?? unregister;
			} catch (error) {
				console.warn("dsh-model-switch: optional interaction surface registration failed", error);
			}
			const onPointerDown = (event) => {
				const target = event.target;
				if (!(target instanceof Node)) return;
				if (trigger()?.contains(target) || popup()?.contains(target)) return;
				dismiss();
			};
			documentTarget.addEventListener("pointerdown", onPointerDown, true);
			return () => {
				documentTarget.removeEventListener("pointerdown", onPointerDown, true);
				unregister();
			};
		}
		//#endregion
		//#region src/client/picker/useComposerPickerSurface.ts
		/** Own popup activation, positioning, and dismissal behind one internal seam. */
		function useComposerPickerSurface(options) {
			const [open, setOpen] = (0, react.useState)(false);
			const [menuStyle, setMenuStyle] = (0, react.useState)({
				position: "fixed",
				zIndex: 4e3
			});
			const triggerRef = (0, react.useRef)(null);
			const menuRef = (0, react.useRef)(null);
			const pointerOpenIntent = (0, react.useRef)(null);
			const callbacks = (0, react.useRef)({
				onOpen: options.onOpen,
				onClose: options.onClose
			});
			callbacks.current = {
				onOpen: options.onOpen,
				onClose: options.onClose
			};
			const lockedRef = (0, react.useRef)(options.locked);
			lockedRef.current = options.locked;
			const id = (0, react.useId)();
			const close = (0, react.useCallback)((restoreFocus = false) => {
				setOpen(false);
				callbacks.current.onClose();
				if (restoreFocus) queueMicrotask(() => {
					triggerRef.current?.focus();
				});
			}, []);
			const show = () => {
				if (lockedRef.current) return;
				callbacks.current.onOpen();
				setOpen(true);
				if (options.tone !== "capsule") options.reload();
			};
			(0, react.useEffect)(() => {
				if (options.locked) close();
			}, [close, options.locked]);
			(0, react.useLayoutEffect)(() => {
				if (!open) return;
				const trigger = triggerRef.current;
				if (trigger === null) return;
				const rect = trigger.getBoundingClientRect();
				const gutter = 8;
				const maxWidth = Math.min(420, window.innerWidth - 16);
				const preferredWidth = Math.min(320, maxWidth);
				const safeRight = "max(" + Math.min(Math.max(gutter, window.innerWidth - rect.right), Math.max(gutter, window.innerWidth - gutter - preferredWidth)) + "px, calc(env(safe-area-inset-right) + 8px))";
				setMenuStyle({
					position: "fixed",
					right: safeRight,
					bottom: "max(" + Math.max(gutter, window.innerHeight - rect.top + gutter) + "px, calc(env(safe-area-inset-bottom) + 8px))",
					maxWidth: "max(0px, calc(100vw - " + safeRight + " - env(safe-area-inset-left) - 8px))",
					zIndex: 4e3
				});
			}, [
				open,
				options.embedded,
				options.pane
			]);
			(0, react.useEffect)(() => {
				if (!open || options.tone === "capsule") return;
				const interaction = options.resolveInteractionOperations?.();
				return installPickerDismissal({
					documentTarget: document,
					surfaceId: "composer-model-picker-" + id,
					...interaction === void 0 ? {} : { interaction },
					trigger: () => triggerRef.current,
					popup: () => menuRef.current,
					dismiss: close
				});
			}, [
				close,
				id,
				open,
				options.resolveInteractionOperations,
				options.tone
			]);
			return {
				id,
				open,
				menuStyle,
				triggerRef,
				menuRef,
				show,
				close,
				onTriggerPointerDown: (event) => {
					event.stopPropagation();
					pointerOpenIntent.current = {
						open: !open,
						until: Date.now() + 750
					};
				},
				onTriggerClick: (event) => {
					event?.stopPropagation();
					const intent = pointerOpenIntent.current;
					const desiredOpen = intent !== null && Date.now() <= intent.until ? intent.open : !open;
					if (intent !== null && Date.now() > intent.until) pointerOpenIntent.current = null;
					if (desiredOpen) show();
					else close();
				}
			};
		}
		[
			"[data-provider-card]{box-sizing:border-box;width:100%;min-width:0;list-style:none;margin:0!important;border:0!important;border-radius:0!important;background:none!important;box-shadow:none!important;overflow:visible}",
			"[data-provider-card-header]{box-sizing:border-box;width:100%;min-height:76px!important;display:flex;align-items:center;justify-content:space-between;gap:16px;border:0;padding:12px 14px!important;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;text-align:left;cursor:pointer}",
			"[data-provider-body][hidden]{display:none!important}",
			"[data-provider-role-badge] svg{width:12px;height:12px}",
			"[data-provider-card-header]:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent)}",
			"[data-provider-body]{display:flex;flex-direction:column;gap:18px;border-top:1px solid var(--dsw-alias-border-l2);padding:16px 14px 18px}",
			"[data-provider-model]{display:flex;align-items:center;gap:9px;min-height:40px}",
			"[data-provider-quota-mini]{display:block}",
			"[data-providers-list]{display:flex;flex-direction:column}",
			"[data-providers-list] [data-sortable-row]+[data-sortable-row]{border-top:1px solid var(--dsw-alias-border-l2)}",
			"[data-providers-section]{container-type:inline-size}",
			"@media (max-width:680px){[data-provider-card-header]{min-height:106px!important;padding:17px 4px!important}[data-provider-header-main]{display:grid!important;grid-template-columns:minmax(0,1fr) auto;gap:7px 9px!important;align-items:center}[data-provider-header-identity]{grid-column:1;grid-row:1;gap:9px!important}[data-provider-header-mark]{width:25px!important;height:25px!important}[data-provider-role-badge]{margin-left:4px;font-size:9px!important}[data-provider-role-badge] svg{width:11px!important;height:11px!important}[data-provider-header-side]{grid-column:2;grid-row:1;justify-self:end}[data-provider-header-side] [data-provider-header-chevron]{width:18px}[data-provider-quota-mini]{grid-column:1;grid-row:2;width:auto!important;max-width:none!important;text-align:left;padding-left:34px!important}[data-provider-header-status]{grid-column:2;grid-row:2;width:auto!important;max-width:100px}[data-provider-model]{min-height:48px}[data-provider-model] input[type=checkbox]{width:17px;height:17px}[data-providers-section] button,[data-provider-card] button{min-height:44px}}",
			"@container (max-width:540px){[data-provider-card-header]{min-height:106px!important;padding:17px 4px!important}[data-provider-header-main]{display:grid!important;grid-template-columns:minmax(0,1fr) auto;gap:7px 9px!important;align-items:center}[data-provider-header-identity]{grid-column:1;grid-row:1;gap:9px!important}[data-provider-header-mark]{width:25px!important;height:25px!important}[data-provider-role-badge]{margin-left:4px;font-size:9px!important}[data-provider-role-badge] svg{width:11px!important;height:11px!important}[data-provider-header-side]{grid-column:2;grid-row:1;justify-self:end}[data-provider-header-side] [data-provider-header-chevron]{width:18px}[data-provider-quota-mini]{grid-column:1;grid-row:2;width:auto!important;max-width:none!important;text-align:left;padding-left:34px!important}[data-provider-header-status]{grid-column:2;grid-row:2;width:auto!important;max-width:100px}[data-provider-model]{min-height:48px}[data-provider-model] input[type=checkbox]{width:17px;height:17px}[data-providers-section] button,[data-provider-card] button{min-height:44px}}",
			"@media (pointer:coarse){[data-sortable-handle],[data-sortable-move]{min-width:44px;min-height:44px}}"
		].join("\n");
		function Svg(props) {
			return (0, react_jsx_runtime.jsxs)("svg", {
				className: "pu-logo",
				viewBox: props.viewBox,
				preserveAspectRatio: "xMidYMid meet",
				"aria-hidden": true,
				children: [
					" ",
					props.children,
					" "
				]
			});
		}
		const DEEPSEEK_FISH_PATH = "M22.9168 1.43018C22.6713 1.31018 22.5658 1.53918 22.4223 1.65519C22.3733 1.69269 22.3318 1.74169 22.2903 1.78669C21.9317 2.1697 21.5127 2.42121 20.9657 2.39121C20.1657 2.34621 19.4827 2.59771 18.8787 3.20973C18.7502 2.45521 18.3236 2.0047 17.6746 1.71569C17.3351 1.56568 16.9916 1.41518 16.7536 1.08867C16.5876 0.856163 16.5421 0.597155 16.4591 0.341647C16.4061 0.187643 16.3536 0.0301382 16.1761 0.00363739C15.9836 -0.0263635 15.9081 0.135141 15.8326 0.270145C15.5306 0.822162 15.4136 1.43018 15.4251 2.0462C15.4516 3.43174 16.0366 4.53527 17.1991 5.3203C17.3311 5.4103 17.3651 5.5003 17.3236 5.63181C17.2441 5.90231 17.1501 6.16482 17.0671 6.43533C17.0141 6.60784 16.9351 6.64584 16.7501 6.57033C16.1121 6.30383 15.5611 5.90931 15.074 5.4328C14.2475 4.63328 13.5 3.75075 12.568 3.05973C12.349 2.89822 12.13 2.74822 11.9034 2.60522C10.9524 1.68169 12.028 0.923165 12.277 0.833162C12.5375 0.739159 12.3675 0.41615 11.5259 0.42015C10.6844 0.42365 9.91439 0.705658 8.93286 1.08117C8.78935 1.13767 8.63835 1.17867 8.48384 1.21267C7.59332 1.04367 6.66829 1.00617 5.70226 1.11517C3.88321 1.31768 2.43016 2.1777 1.36213 3.64575C0.0790928 5.4103 -0.222916 7.41536 0.146595 9.50642C0.535106 11.7105 1.66014 13.535 3.38869 14.9616C5.18125 16.4406 7.24581 17.1657 9.60138 17.0266C11.0319 16.9441 12.6245 16.7526 14.421 15.2321C14.874 15.4576 15.3496 15.5476 16.1381 15.6151C16.7456 15.6716 17.3306 15.5851 17.7836 15.4911C18.4931 15.3411 18.4441 14.6841 18.1876 14.5636C16.1081 13.595 16.5646 13.9891 16.1496 13.67C17.2061 12.42 18.8202 10.1979 19.3182 7.17235C19.3672 6.83834 19.4297 6.36783 19.4222 6.09732C19.4182 5.93231 19.4562 5.86831 19.6447 5.84931C20.1657 5.78931 20.6712 5.64681 21.1357 5.3913C22.4833 4.65528 23.0268 3.44624 23.1548 1.9972C23.1738 1.77569 23.1508 1.54668 22.9168 1.43018ZM11.1749 14.4736C9.15936 12.889 8.18184 12.3675 7.77832 12.39C7.40081 12.4125 7.46881 12.8445 7.55182 13.126C7.63882 13.404 7.75182 13.5955 7.91033 13.8396C8.01983 14.0011 8.09533 14.2411 7.80083 14.4216C7.15181 14.8231 6.02327 14.2866 5.97027 14.2601C4.65673 13.4865 3.5587 12.4655 2.78467 11.069C2.03715 9.72493 1.60314 8.28289 1.53164 6.74384C1.51264 6.37233 1.62214 6.24082 1.99215 6.17332C2.47916 6.08332 2.98118 6.06432 3.46769 6.13582C5.52476 6.43633 7.27581 7.35586 8.74385 8.8129C9.58188 9.64243 10.2159 10.634 10.8689 11.6025C11.5634 12.631 12.3105 13.611 13.262 14.4146C13.598 14.6961 13.866 14.9101 14.1225 15.0681C13.349 15.1546 12.058 15.1731 11.1749 14.4746L11.1749 14.4736ZM12.141 8.25988C12.141 8.09488 12.273 7.96338 12.439 7.96338C12.4765 7.96338 12.5105 7.97088 12.541 7.98188C12.5825 7.99688 12.6205 8.01938 12.6505 8.05338C12.7035 8.10588 12.7335 8.18088 12.7335 8.25988C12.7335 8.42489 12.6015 8.55639 12.4355 8.55639C12.2695 8.55639 12.141 8.42489 12.141 8.25988ZM15.1415 9.79893C14.949 9.87793 14.7565 9.94544 14.5715 9.95294C14.2845 9.96794 13.9715 9.85143 13.8015 9.70893C13.5375 9.48742 13.3485 9.36342 13.2695 8.97691C13.2355 8.8119 13.2545 8.55639 13.2845 8.40989C13.3525 8.09438 13.277 7.89187 13.0545 7.70787C12.8735 7.55786 12.643 7.51636 12.39 7.51636C12.2955 7.51636 12.209 7.47486 12.1445 7.44136C12.039 7.38886 11.9519 7.25735 12.035 7.09585C12.0615 7.04335 12.19 6.91584 12.22 6.89334C12.5635 6.69784 12.9595 6.76184 13.326 6.90834C13.6655 7.04735 13.9225 7.30236 14.292 7.66287C14.6695 8.09838 14.7375 8.21838 14.9525 8.54539C15.1225 8.8009 15.277 9.06341 15.3831 9.36392C15.4471 9.55142 15.3641 9.70493 15.1415 9.79893Z";
		const GENERIC_GLOBE_PATH = "M7.00018 0.353516C10.6708 0.353535 13.6468 3.32958 13.6469 7.00018C13.6468 10.6708 10.6708 13.6468 7.00018 13.6469C3.32957 13.6468 0.353535 10.6708 0.353516 7.00018C0.353535 3.32957 3.32957 0.353531 7.00018 0.353516ZM5.44643 7.59661C5.49463 8.97506 5.70762 10.191 6.02136 11.0793C6.20141 11.5891 6.40328 11.9585 6.59898 12.1889C6.79501 12.4196 6.93213 12.454 7.00018 12.454C7.06822 12.454 7.20533 12.4197 7.40138 12.1889C7.59708 11.9585 7.79895 11.589 7.979 11.0793C8.29274 10.191 8.50574 8.97506 8.55394 7.59661H5.44643ZM1.57861 7.59661C1.80785 9.70467 3.2386 11.4509 5.1715 12.1388C5.07135 11.9317 4.97972 11.7098 4.89746 11.477C4.53084 10.4391 4.30224 9.0828 4.25357 7.59661H1.57861ZM9.74679 7.59661C9.69813 9.0828 9.46952 10.4391 9.1029 11.477C9.0206 11.7099 8.92818 11.9316 8.82797 12.1388C10.7613 11.4511 12.1925 9.70496 12.4218 7.59661H9.74679ZM5.1706 1.8616C3.23814 2.54963 1.80876 4.29604 1.5795 6.40376H4.25357C4.30224 4.91756 4.53083 3.56129 4.89746 2.5234C4.97968 2.29066 5.07051 2.0686 5.1706 1.8616ZM7.00018 1.54637C6.93213 1.54638 6.79503 1.5807 6.59898 1.81145C6.40332 2.04177 6.20139 2.41058 6.02136 2.92012C5.70754 3.80851 5.49461 5.02499 5.44643 6.40376H8.55394C8.50575 5.025 8.29282 3.80851 7.979 2.92012C7.79898 2.41059 7.59705 2.04177 7.40138 1.81145C7.20531 1.58067 7.06823 1.54637 7.00018 1.54637ZM8.82887 1.8616C8.92902 2.0687 9.02064 2.29053 9.1029 2.5234C9.46953 3.56129 9.69812 4.91756 9.74679 6.40376H12.4209C12.1916 4.29575 10.7618 2.54943 8.82887 1.8616Z";
		function ProviderMark(props) {
			const raw = props.providerKey;
			switch (raw === "cursor-agent" || raw === "cursor" || raw === "acp-cursor" ? "llm-cursor" : raw === "claude-agent" || raw === "claude" || raw === "claude-code" || raw === "acp-claude" ? "llm-claude" : raw.startsWith("llm-") ? raw : raw === "opencode" ? "llm-opencode-go" : "llm-" + raw) {
				case "llm-claude": return (0, react_jsx_runtime.jsx)(Svg, {
					viewBox: "0 0 24 24",
					children: (0, react_jsx_runtime.jsx)("path", {
						fill: "currentColor",
						d: "m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z"
					})
				});
				case "llm-cursor": return (0, react_jsx_runtime.jsx)(Svg, {
					viewBox: "0.24 -1.44 23.6 26.88",
					children: (0, react_jsx_runtime.jsx)("path", {
						fill: "currentColor",
						d: "M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23"
					})
				});
				case "llm-antigravity": return (0, react_jsx_runtime.jsx)(Svg, {
					viewBox: "13.4 8.4 142.1 129.9",
					children: (0, react_jsx_runtime.jsx)("path", {
						fill: "currentColor",
						d: "M84.5 16C64 16 57 39 49 67C42 93 36 111 24 122C18 128 22 132 28 132C42 132 50 116 59 99C66 85 72 78 84.5 78C97 78 103 85 110 99C119 116 127 132 141 132C147 132 151 128 145 122C133 111 127 93 120 67C112 39 105 16 84.5 16Z"
					})
				});
				case "llm-codex": return (0, react_jsx_runtime.jsx)(Svg, {
					viewBox: "-1.2 -1.44 26.6 26.88",
					children: (0, react_jsx_runtime.jsx)("path", {
						fill: "currentColor",
						d: "M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"
					})
				});
				case "llm-ollama": return (0, react_jsx_runtime.jsx)(Svg, {
					viewBox: "1.8 -1.44 20.4 26.88",
					children: (0, react_jsx_runtime.jsx)("path", {
						fill: "currentColor",
						d: "M16.361 10.26a.894.894 0 0 0-.558.47l-.072.148.001.207c0 .193.004.217.059.353.076.193.152.312.291.448.24.238.51.3.872.205a.86.86 0 0 0 .517-.436.752.752 0 0 0 .08-.498c-.064-.453-.33-.782-.724-.897a1.06 1.06 0 0 0-.466 0zm-9.203.005c-.305.096-.533.32-.65.639a1.187 1.187 0 0 0-.06.52c.057.309.31.59.598.667.362.095.632.033.872-.205.14-.136.215-.255.291-.448.055-.136.059-.16.059-.353l.001-.207-.072-.148a.894.894 0 0 0-.565-.472 1.02 1.02 0 0 0-.474.007Zm4.184 2c-.131.071-.223.25-.195.383.031.143.157.288.353.407.105.063.112.072.117.136.004.038-.01.146-.029.243-.02.094-.036.194-.036.222.002.074.07.195.143.253.064.052.076.054.255.059.164.005.198.001.264-.03.169-.082.212-.234.15-.525-.052-.243-.042-.28.087-.355.137-.08.281-.219.324-.314a.365.365 0 0 0-.175-.48.394.394 0 0 0-.181-.033c-.126 0-.207.03-.355.124l-.085.053-.053-.032c-.219-.13-.259-.145-.391-.143a.396.396 0 0 0-.193.032zm.39-2.195c-.373.036-.475.05-.654.086-.291.06-.68.195-.951.328-.94.46-1.589 1.226-1.787 2.114-.04.176-.045.234-.045.53 0 .294.005.357.043.524.264 1.16 1.332 2.017 2.714 2.173.3.033 1.596.033 1.896 0 1.11-.125 2.064-.727 2.493-1.571.114-.226.169-.372.22-.602.039-.167.044-.23.044-.523 0-.297-.005-.355-.045-.531-.288-1.29-1.539-2.304-3.072-2.497a6.873 6.873 0 0 0-.855-.031zm.645.937a3.283 3.283 0 0 1 1.44.514c.223.148.537.458.671.662.166.251.26.508.303.82.02.143.01.251-.043.482-.08.345-.332.705-.672.957a3.115 3.115 0 0 1-.689.348c-.382.122-.632.144-1.525.138-.582-.006-.686-.01-.853-.042-.57-.107-1.022-.334-1.35-.68-.264-.28-.385-.535-.45-.946-.03-.192.025-.509.137-.776.136-.326.488-.73.836-.963.403-.269.934-.46 1.422-.512.187-.02.586-.02.773-.002zm-5.503-11a1.653 1.653 0 0 0-.683.298C5.617.74 5.173 1.666 4.985 2.819c-.07.436-.119 1.04-.119 1.503 0 .544.064 1.24.155 1.721.02.107.031.202.023.208a8.12 8.12 0 0 1-.187.152 5.324 5.324 0 0 0-.949 1.02 5.49 5.49 0 0 0-.94 2.339 6.625 6.625 0 0 0-.023 1.357c.091.78.325 1.438.727 2.04l.13.195-.037.064c-.269.452-.498 1.105-.605 1.732-.084.496-.095.629-.095 1.294 0 .67.009.803.088 1.266.095.555.288 1.143.503 1.534.071.128.243.393.264.407.007.003-.014.067-.046.141a7.405 7.405 0 0 0-.548 1.873c-.062.417-.071.552-.071.991 0 .56.031.832.148 1.279L3.42 24h1.478l-.05-.091c-.297-.552-.325-1.575-.068-2.597.117-.472.25-.819.498-1.296l.148-.29v-.177c0-.165-.003-.184-.057-.293a.915.915 0 0 0-.194-.25 1.74 1.74 0 0 1-.385-.543c-.424-.92-.506-2.286-.208-3.451.124-.486.329-.918.544-1.154a.787.787 0 0 0 .223-.531c0-.195-.07-.355-.224-.522a3.136 3.136 0 0 1-.817-1.729c-.14-.96.114-2.005.69-2.834.563-.814 1.353-1.336 2.237-1.475.199-.033.57-.028.776.01.226.04.367.028.512-.041.179-.085.268-.19.374-.431.093-.215.165-.333.36-.576.234-.29.46-.489.822-.729.413-.27.884-.467 1.352-.561.17-.035.25-.04.569-.04.319 0 .398.005.569.04a4.07 4.07 0 0 1 1.914.997c.117.109.398.457.488.602.034.057.095.177.132.267.105.241.195.346.374.43.14.068.286.082.503.045.343-.058.607-.053.943.016 1.144.23 2.14 1.173 2.581 2.437.385 1.108.276 2.267-.296 3.153-.097.15-.193.27-.333.419-.301.322-.301.722-.001 1.053.493.539.801 1.866.708 3.036-.062.772-.26 1.463-.533 1.854a2.096 2.096 0 0 1-.224.258.916.916 0 0 0-.194.25c-.054.109-.057.128-.057.293v.178l.148.29c.248.476.38.823.498 1.295.253 1.008.231 2.01-.059 2.581a.845.845 0 0 0-.044.098c0 .006.329.009.732.009h.73l.02-.074.036-.134c.019-.076.057-.3.088-.516.029-.217.029-1.016 0-1.258-.11-.875-.295-1.57-.597-2.226-.032-.074-.053-.138-.046-.141.008-.005.057-.074.108-.152.376-.569.607-1.284.724-2.228.031-.26.031-1.378 0-1.628-.083-.645-.182-1.082-.348-1.525a6.083 6.083 0 0 0-.329-.7l-.038-.064.131-.194c.402-.604.636-1.262.727-2.04a6.625 6.625 0 0 0-.024-1.358 5.512 5.512 0 0 0-.939-2.339 5.325 5.325 0 0 0-.95-1.02 8.097 8.097 0 0 1-.186-.152.692.692 0 0 1 .023-.208c.208-1.087.201-2.443-.017-3.503-.19-.924-.535-1.658-.98-2.082-.354-.338-.716-.482-1.15-.455-.996.059-1.8 1.205-2.116 3.01a6.805 6.805 0 0 0-.097.726c0 .036-.007.066-.015.066a.96.96 0 0 1-.149-.078A4.857 4.857 0 0 0 12 3.03c-.832 0-1.687.243-2.456.698a.958.958 0 0 1-.148.078c-.008 0-.015-.03-.015-.066a6.71 6.71 0 0 0-.097-.725C8.997 1.392 8.337.319 7.46.048a2.096 2.096 0 0 0-.585-.041Zm.293 1.402c.248.197.523.759.682 1.388.03.113.06.244.069.292.007.047.026.152.041.233.067.365.098.76.102 1.24l.002.475-.12.175-.118.178h-.278c-.324 0-.646.041-.954.124l-.238.06c-.033.007-.038-.003-.057-.144a8.438 8.438 0 0 1 .016-2.323c.124-.788.413-1.501.696-1.711.067-.05.079-.049.157.013zm9.825-.012c.17.126.358.46.498.888.28.854.36 2.028.212 3.145-.019.14-.024.151-.057.144l-.238-.06a3.693 3.693 0 0 0-.954-.124h-.278l-.119-.178-.119-.175.002-.474c.004-.669.066-1.19.214-1.772.157-.623.434-1.185.68-1.382.078-.062.09-.063.159-.012z"
					})
				});
				case "llm-grok": return (0, react_jsx_runtime.jsxs)(Svg, {
					viewBox: "-33.7 -30.4 629.4 604.9",
					children: [(0, react_jsx_runtime.jsx)("path", {
						fill: "currentColor",
						d: "M411 105C376 80 334 66 289 66C173 66 79 160 79 276C79 306 85 329 95 353C117 407 87 451 0 542L178 383C150 355 134 318 134 277C134 192 203 123 289 123C310 123 330 127 348 134Z"
					}), (0, react_jsx_runtime.jsx)("path", {
						fill: "currentColor",
						d: "M167 448L230 418C248 426 268 430 289 430C374 430 443 361 443 277C443 256 439 234 431 214C427 206 416 204 407 210L217 349L562 2C480 103 475 144 494 229C518 333 468 422 391 459C319 494 235 498 167 448Z"
					})]
				});
				case "llm-commandcode": return (0, react_jsx_runtime.jsxs)(Svg, {
					viewBox: "-8.2 -8.2 152.5 152.5",
					children: [
						(0, react_jsx_runtime.jsx)("path", {
							fill: "currentColor",
							d: "m0 66.7959c0-31.4879 0-47.2318 9.78204-57.01386 9.78206-9.78204 25.52596-9.78204 57.01396-9.78204h2.5357c31.4883 0 47.2323 0 57.0143 9.78204 9.782 9.78206 9.782 25.52596 9.782 57.01396v2.5357c0 31.4883 0 47.2323-9.782 57.0143s-25.526 9.782-57.0144 9.782h-2.5357c-31.4879 0-47.2318 0-57.01386-9.782-9.78204-9.782-9.78204-25.526-9.78204-57.0144z"
						}),
						(0, react_jsx_runtime.jsx)("path", {
							clipRule: "evenodd",
							fill: "currentColor",
							fillRule: "evenodd",
							d: "m69.3317 5.56633h-2.5357c-15.9014 0-27.2674.01182-35.905 1.17312-8.4775 1.13977-13.4886 3.29415-17.173 6.97855s-5.83878 8.6955-6.97855 17.173c-1.1613 8.6376-1.17312 20.0036-1.17312 35.9049v2.5357c0 15.9014.01182 27.2674 1.17312 35.9054 1.13977 8.477 3.29415 13.488 6.97855 17.173 3.6844 3.684 8.6955 5.838 17.173 6.978 8.6376 1.161 20.0036 1.173 35.9049 1.173h2.5357c15.9014 0 27.2674-.012 35.9054-1.173 8.477-1.14 13.488-3.294 17.173-6.978 3.684-3.685 5.838-8.696 6.978-17.173 1.161-8.638 1.173-20.004 1.173-35.9053v-2.5357c0-15.9014-.012-27.2674-1.173-35.905-1.14-8.4775-3.294-13.4886-6.978-17.173-3.685-3.6844-8.696-5.83878-17.173-6.97855-8.638-1.1613-20.004-1.17312-35.9053-1.17312zm-59.54966 4.21571c-9.78204 9.78206-9.78204 25.52596-9.78204 57.01386v2.5357c0 31.4884 0 47.2324 9.78204 57.0144 9.78206 9.782 25.52596 9.782 57.01386 9.782h2.5357c31.4884 0 47.2324 0 57.0144-9.782s9.782-25.526 9.782-57.0143v-2.5357c0-31.488 0-47.2319-9.782-57.01396-9.782-9.78204-25.526-9.78204-57.0143-9.78204h-2.5357c-31.488 0-47.2319 0-57.01396 9.78204z"
						}),
						(0, react_jsx_runtime.jsx)("path", {
							fill: "var(--dsw-alias-bg-layer-1)",
							d: "m93.6604 26.1784c-8.982 0-16.2887 7.3067-16.2887 16.2888v6.9809h-18.6158v-6.9809c0-8.9821-7.3067-16.2888-16.2887-16.2888-8.9821 0-16.2888 7.3067-16.2888 16.2888s7.3067 16.2887 16.2888 16.2887h6.9809v18.6158h-6.9809c-8.9821 0-16.2888 7.3067-16.2888 16.2888 0 8.9825 7.3067 16.2885 16.2888 16.2885 8.982 0 16.2887-7.306 16.2887-16.2885v-6.981h18.6158v6.981c0 8.9825 7.3067 16.2885 16.2887 16.2885 8.9826 0 16.2886-7.306 16.2886-16.2885 0-8.9821-7.306-16.2888-16.2886-16.2888h-6.9809v-18.6158h6.9809c8.9826 0 16.2886-7.3066 16.2886-16.2887s-7.306-16.2888-16.2886-16.2888zm-6.9809 23.2697v-6.9809c0-3.8628 3.1182-6.9809 6.9809-6.9809 3.8628 0 6.9806 3.1181 6.9806 6.9809 0 3.8627-3.1178 6.9809-6.9806 6.9809zm-44.2123 0c-3.8628 0-6.9809-3.1182-6.9809-6.9809 0-3.8628 3.1181-6.9809 6.9809-6.9809 3.8627 0 6.9809 3.1181 6.9809 6.9809v6.9809zm16.2887 27.9236v-18.6158h18.6158v18.6158zm34.9045 23.2693c-3.8627 0-6.9809-3.1178-6.9809-6.9805v-6.981h6.9809c3.8628 0 6.9806 3.1182 6.9806 6.981 0 3.8627-3.1178 6.9805-6.9806 6.9805zm-51.1932 0c-3.8628 0-6.9809-3.1178-6.9809-6.9805 0-3.8628 3.1181-6.981 6.9809-6.981h6.9809v6.981c0 3.8627-3.1182 6.9805-6.9809 6.9805z"
						})
					]
				});
				case "llm-deepseek":
				case "llm-deepseek-official": return (0, react_jsx_runtime.jsx)(Svg, {
					viewBox: "0 0 23.16 17.04",
					children: (0, react_jsx_runtime.jsx)("path", {
						fill: "currentColor",
						d: DEEPSEEK_FISH_PATH
					})
				});
				case "llm-opencode-go": return (0, react_jsx_runtime.jsxs)(Svg, {
					viewBox: "120.6 86.4 286.1 359.4",
					children: [(0, react_jsx_runtime.jsx)("path", {
						fill: "currentColor",
						opacity: ".35",
						d: "M320 224V352H192V224H320Z"
					}), (0, react_jsx_runtime.jsx)("path", {
						fill: "currentColor",
						fillRule: "evenodd",
						d: "M384 416H128V96H384V416ZM320 160H192V352H320V160Z"
					})]
				});
				default: return (0, react_jsx_runtime.jsx)(Svg, {
					viewBox: "0 0 14 14",
					children: (0, react_jsx_runtime.jsx)("path", {
						fill: "currentColor",
						fillRule: "evenodd",
						clipRule: "evenodd",
						d: GENERIC_GLOBE_PATH
					})
				});
			}
		}
		//#endregion
		//#region src/client/runtime-lock.ts
		/** Decode a wire reply only for the provider that owns the query. */
		function decodeBindingProvider(value, provider) {
			if (value === null || typeof value !== "object" || Array.isArray(value)) return void 0;
			const reply = value;
			return reply.provider === null || reply.provider === provider ? reply.provider : void 0;
		}
		/** Query installed declarations; one failed query must never become a successful unbound read. */
		async function fetchSessionBinding(rpc, sessionId, sources) {
			if (sources.length === 0) return {
				provider: null,
				failed: false
			};
			if (rpc === void 0) return {
				provider: null,
				failed: true
			};
			const replies = await Promise.all(sources.map(async (source) => {
				try {
					const result = await callPluginRpc(rpc, source.channel, source.endpoint, { sessionId });
					return result.ok ? decodeBindingProvider(result.value, source.provider) : void 0;
				} catch {
					return;
				}
			}));
			const bindings = new Set(replies.filter((value) => typeof value === "string"));
			return {
				provider: bindings.size === 1 ? [...bindings][0] : null,
				failed: replies.includes(void 0) || bindings.size > 1
			};
		}
		/** Whether one provider remains selectable under a known lock read. */
		function providerSelectable(lock, provider) {
			return lock === null || provider === lock;
		}
		/**
		* Existing DSH history cannot convert to an External Agent. Blank sessions
		* and already-bound native sessions keep their current Agent choice.
		*/
		function agentProviderLocked(blank, bound, active = false) {
			return (blank === false || active) && bound === null;
		}
		/** Picker allow-check over the already-effective lock and the agentLocked bit. */
		function runtimeChoiceAllowed(lock, agentLocked, provider, currentProvider, agent) {
			if (!providerSelectable(lock, provider)) return false;
			if (agentLocked && agent) return provider === currentProvider;
			return true;
		}
		/**
		* Whether one provider remains selectable under a lock read that may have failed.
		* Failed reads keep only the known binding or current selection selectable;
		* active Agent selections reserve their runtime before the first binding arrives.
		* Unbound sessions with DSH history cannot select a new Agent provider.
		* Log reading is never gated by this.
		* @param state - Latest lock read for the session.
		* @param provider - Candidate provider for the pending selection.
		* @param currentProvider - Session current provider, if any.
		* @param context - Session history, request activity, and candidate Agent role.
		*/
		function isProviderAllowed(state, provider, currentProvider, context = {}) {
			if (state.failed && provider !== (state.provider ?? currentProvider)) return false;
			const lock = effectiveProviderLock(state, currentProvider, context.active, context.currentAgent);
			if (!providerSelectable(lock, provider)) return false;
			if (context.agent === true && (context.blank === false || context.active === true) && lock === null) return provider === currentProvider;
			return true;
		}
		/**
		* Effective single-provider lock for pickers that only understand
		* RuntimeProviderLock. Errors fail closed exactly as isProviderAllowed does.
		*/
		function effectiveProviderLock(state, currentProvider, active = false, currentAgent = false) {
			if (state.provider !== null) return state.provider;
			if (state.failed || active && currentAgent) return currentProvider ?? null;
			return null;
		}
		/**
		* Create one session lock store over an injecting query.
		* The query sees the previous snapshot for sticky failure mapping and never
		* throws (failures resolve to failed reads); refresh never rejects.
		*/
		function createProviderLockStore(query) {
			let current = {
				provider: null,
				failed: false
			};
			const listeners = /* @__PURE__ */ new Set();
			let generation = 0;
			const emit = () => {
				for (const listener of [...listeners]) listener();
			};
			return {
				subscribe: (listener) => {
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				},
				getSnapshot: () => current,
				refresh: async () => {
					const seen = ++generation;
					const previous = current;
					let next;
					try {
						next = await query(previous);
					} catch {
						next = {
							provider: previous.provider,
							failed: true
						};
					}
					if (seen !== generation) return current;
					if (next.provider !== current.provider || next.failed !== current.failed) {
						current = next;
						emit();
					}
					return current;
				}
			};
		}
		//#endregion
		//#region \0dsh-css:src/client/picker/ComposerPicker.module.css.mjs
		const css$1 = ".GdQohq_root{min-width:0;position:relative}.GdQohq_trigger{width:fit-content;min-width:0;max-width:256px;min-height:28px;color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xs-strong-13);cursor:pointer;background:0 0;border:none;border-radius:24px;outline:none;align-items:center;gap:4px;padding:4px 4px 4px 8px;display:flex}.GdQohq_trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.GdQohq_trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}.GdQohq_trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.GdQohq_triggerLabel{overflow-wrap:normal;text-overflow:ellipsis;white-space:nowrap;align-items:center;gap:4px;min-width:0;display:inline-flex;overflow:hidden}.GdQohq_triggerEffort{color:var(--dsw-alias-label-caption);flex:none}.GdQohq_chevron{color:var(--dsw-alias-label-caption);transition:transform .12s var(--ds-ease-in-out);flex:none}.GdQohq_chevronOpen{transform:rotate(180deg)}.GdQohq_embedded{width:100%}.GdQohq_embedded .GdQohq_trigger{background:var(--dsw-alias-interactive-bg-hover);width:100%;max-width:none;min-height:36px;color:var(--dsw-alias-label-primary);border-radius:10px;justify-content:space-between;padding:4px 10px}.GdQohq_embedded .GdQohq_trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.GdQohq_capsule{width:100%}.GdQohq_capsule .GdQohq_trigger{border:1px solid var(--dsw-alias-border-inverted);background:var(--dsw-specific-input-major);width:100%;max-width:none;min-height:32px;color:var(--dsw-alias-label-primary);border-radius:24px;justify-content:space-between;padding:4px 8px 4px 10px}.GdQohq_capsule .GdQohq_trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.GdQohq_menu{box-sizing:border-box;width:min(280px, max(0px, calc(100vw - 32px - env(safe-area-inset-left) - env(safe-area-inset-right))));max-height:min(360px, calc(56dvh - env(safe-area-inset-bottom)));border:1px solid var(--dsw-alias-border-inverted);background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border-radius:12px;flex-direction:column;padding:4px;display:flex;overflow:hidden}.GdQohq_paneHeader{flex:none;grid-template-columns:32px minmax(0,1fr) 32px;align-items:center;gap:8px;min-height:40px;padding:2px 4px;display:grid}.GdQohq_paneHeader .GdQohq_headerButton{width:32px;min-width:32px;height:32px;color:var(--dsw-alias-label-secondary);padding:0}.GdQohq_paneHeader .GdQohq_headerButton:last-child{justify-self:end}.GdQohq_paneTitle{min-width:0;color:var(--dsw-alias-label-primary);font:var(--dsw-font-s-strong-14);overflow-wrap:anywhere;text-align:center;padding:4px 8px}.GdQohq_searchSlot{min-width:0;overflow:hidden}.GdQohq_headerSearch{box-sizing:border-box;width:100%;min-width:0;max-width:100%;display:flex}.GdQohq_headerSearch input::-webkit-search-cancel-button{display:none}.GdQohq_list{min-height:0;overflow:hidden auto}.GdQohq_status,.GdQohq_empty{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xs-13);overflow-wrap:anywhere;padding:10px}.GdQohq_error,.GdQohq_warning{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);font:var(--dsw-font-xxs-12);overflow-wrap:anywhere;border-radius:8px;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:4px;padding:7px 8px;display:flex}.GdQohq_warning{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-state-warn-label)}.GdQohq_retry{color:inherit;font:var(--dsw-font-xxs-strong-12);cursor:pointer;background:0 0;border:none;flex:none;padding:0}.GdQohq_groups{min-height:0}.GdQohq_group+.GdQohq_group{margin-top:4px}.GdQohq_groupTitle{z-index:1;background:var(--dsw-specific-menu);color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxs-strong-12);overflow-wrap:anywhere;align-items:center;gap:6px;padding:5px 8px 3px;display:flex;position:sticky;top:0}.GdQohq_runtimeMark{min-width:14px;color:var(--dsw-alias-label-primary);font:var(--dsw-font-xxs-strong-12);justify-content:center;align-items:center;display:inline-flex}.GdQohq_runtimeMark svg{width:14px;height:14px;display:block}.GdQohq_option{box-sizing:border-box;width:auto;min-width:100%;min-height:38px;color:inherit;text-align:left;cursor:pointer;background:0 0;border:none;border-radius:10px;outline:none;align-items:center;gap:8px;padding:6px 8px;display:flex}.GdQohq_option:hover:not(:disabled),.GdQohq_option:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}.GdQohq_selected{background:0 0}.GdQohq_option:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.GdQohq_optionCopy{flex-direction:column;flex:1;min-width:0;display:flex}.GdQohq_modelName{color:inherit;font:var(--dsw-font-s-strong-14);overflow-wrap:anywhere}.GdQohq_description{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxs-12);overflow-wrap:anywhere}.GdQohq_check{color:var(--dsw-alias-label-primary);flex:0 0 18px;place-items:center;display:grid}.GdQohq_cell{box-sizing:border-box;width:auto;min-width:100%;height:40px;min-height:40px;color:var(--dsw-alias-label-primary);font:var(--dsw-font-s-14);cursor:pointer;text-align:left;background:0 0;border:none;border-radius:10px;align-items:center;gap:8px;padding:0 10px;display:flex}.GdQohq_cell:hover{background:var(--dsw-alias-interactive-bg-hover)}.GdQohq_cellLabel{white-space:nowrap;flex:none}.GdQohq_cellValue{min-width:0;color:var(--dsw-alias-label-tertiary);text-align:right;text-overflow:ellipsis;white-space:nowrap;flex:auto;overflow:hidden}.GdQohq_cellChevron{color:var(--dsw-alias-label-tertiary);flex:none}";
		const tagId$1 = "dsh-model-switch/ComposerPicker.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-model-switch";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var ComposerPicker_module_css_default = {
			"capsule": "GdQohq_capsule",
			"cell": "GdQohq_cell",
			"cellChevron": "GdQohq_cellChevron",
			"cellLabel": "GdQohq_cellLabel",
			"cellValue": "GdQohq_cellValue",
			"check": "GdQohq_check",
			"chevron": "GdQohq_chevron",
			"chevronOpen": "GdQohq_chevronOpen",
			"description": "GdQohq_description",
			"embedded": "GdQohq_embedded",
			"empty": "GdQohq_empty",
			"error": "GdQohq_error",
			"group": "GdQohq_group",
			"groups": "GdQohq_groups",
			"groupTitle": "GdQohq_groupTitle",
			"headerButton": "GdQohq_headerButton",
			"headerSearch": "GdQohq_headerSearch",
			"list": "GdQohq_list",
			"menu": "GdQohq_menu",
			"modelName": "GdQohq_modelName",
			"option": "GdQohq_option",
			"optionCopy": "GdQohq_optionCopy",
			"paneHeader": "GdQohq_paneHeader",
			"paneTitle": "GdQohq_paneTitle",
			"retry": "GdQohq_retry",
			"root": "GdQohq_root",
			"runtimeMark": "GdQohq_runtimeMark",
			"searchSlot": "GdQohq_searchSlot",
			"selected": "GdQohq_selected",
			"status": "GdQohq_status",
			"trigger": "GdQohq_trigger",
			"triggerEffort": "GdQohq_triggerEffort",
			"triggerLabel": "GdQohq_triggerLabel",
			"warning": "GdQohq_warning"
		};
		//#endregion
		//#region src/client/picker/ComposerPicker.tsx
		/**
		* Composer model seat: suffix-grouped Model / Effort / Context / Fast / Thinking.
		*/
		function sameSelection(left, right) {
			return left?.provider === right?.provider && left?.model === right?.model && left?.reasoningEffort === right?.reasoningEffort;
		}
		function classNames(...parts) {
			return parts.filter((part) => typeof part === "string" && part.length > 0).join(" ");
		}
		function ModelPaneHeader({ title, backLabel, searchLabel, closeSearchLabel, searchable, searching, query, onBack, onStartSearch, onCloseSearch, onQueryChange }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: ComposerPicker_module_css_default.paneHeader,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "ghost",
						size: "sm",
						className: ComposerPicker_module_css_default.headerButton,
						icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronLeftOutlineRegular, { size: 14 }),
						"aria-label": backLabel,
						onClick: onBack
					}),
					searching ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: ComposerPicker_module_css_default.searchSlot,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
							className: ComposerPicker_module_css_default.headerSearch ?? "",
							type: "search",
							autoFocus: true,
							value: query,
							placeholder: searchLabel,
							"aria-label": searchLabel,
							onChange: (event) => {
								onQueryChange(event.currentTarget.value);
							}
						})
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: ComposerPicker_module_css_default.paneTitle,
						children: title
					}),
					searchable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "ghost",
						size: "sm",
						className: ComposerPicker_module_css_default.headerButton,
						icon: searching ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseOutlineRegular, { size: 16 }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSearchOutlineRegular, { size: 16 }),
						"aria-label": searching ? closeSearchLabel : searchLabel,
						onClick: searching ? onCloseSearch : onStartSearch
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { "aria-hidden": true })
				]
			});
		}
		function RuntimeIcon({ provider, roleOf }) {
			const mark = isAgentRole(roleOf?.(provider)) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderMark, { providerKey: provider }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderMark, { providerKey: "deepseek-official" });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: ComposerPicker_module_css_default.runtimeMark,
				children: mark
			});
		}
		function ComposerPicker({ locked, providerLock = null, agentLocked = false, available, directory, t, draft, onDraftChange, embedded, tone, resolveInteractionOperations, roleOf }) {
			const { snapshot: state, getDirectorySnapshot, load, select } = directory;
			const [pane, setPane] = (0, react.useState)("root");
			const [searching, setSearching] = (0, react.useState)(false);
			const [query, setQuery] = (0, react.useState)("");
			const [toast, setToast] = (0, react.useState)(null);
			const [acceptedSelection, setAcceptedSelection] = (0, react.useState)();
			const toastSeq = (0, react.useRef)(0);
			const selectionGeneration = (0, react.useRef)(0);
			const lastActionRef = (0, react.useRef)("load");
			const lockedRef = (0, react.useRef)(locked);
			lockedRef.current = locked;
			const families = (0, react.useMemo)(() => groupFamilies(state.groups), [state.groups]);
			const currentSelection = draft ?? acceptedSelection?.selection ?? state.current;
			const currentCanBeUsed = draft !== void 0 || acceptedSelection !== void 0 || state.routable !== false;
			const family = currentSelection === null ? void 0 : findFamily(families, currentSelection.provider, currentSelection.model);
			const member = family === void 0 || currentSelection === null ? void 0 : findMember(family, currentSelection.model);
			const reasoning = member?.model.reasoning;
			const effectiveEffort = currentSelection?.reasoningEffort ?? reasoning?.defaultEffort;
			const effortLabel = reasoning === void 0 ? void 0 : effectiveEffort === void 0 ? t("effort.providerDefault") : reasoning.efforts.find((level) => level.id === effectiveEffort)?.name ?? effectiveEffort;
			const contextLabel = family === void 0 || member === void 0 ? void 0 : contextLabelForMember(family, member);
			const thinkingPair = family !== void 0 && member !== void 0 ? thinkingSiblings(family, member) : null;
			const visibleFamilies = (0, react.useMemo)(() => filterFamilies(families, query), [families, query]);
			const sections = (0, react.useMemo)(() => sectionFamilies(visibleFamilies), [visibleFamilies]);
			const busy = state.status === "selecting";
			const choiceAllowed = (provider) => runtimeChoiceAllowed(providerLock, agentLocked, provider, currentSelection?.provider, isAgentRole(roleOf?.(provider)));
			const reload = () => {
				if (lockedRef.current) return;
				lastActionRef.current = "load";
				load();
			};
			const { id, open, menuStyle, triggerRef, menuRef, close, onTriggerPointerDown, onTriggerClick } = useComposerPickerSurface({
				locked,
				embedded: embedded ?? false,
				pane,
				reload,
				onOpen: () => {
					setPane(embedded && tone !== "capsule" ? "model" : "root");
					setSearching(false);
					setQuery("");
				},
				onClose: () => {
					setPane("root");
					setSearching(false);
					setQuery("");
				},
				...tone === void 0 ? {} : { tone },
				...resolveInteractionOperations === void 0 ? {} : { resolveInteractionOperations }
			});
			(0, react.useEffect)(() => {
				if (available) {
					lastActionRef.current = "load";
					load();
					return;
				}
				selectionGeneration.current += 1;
				setAcceptedSelection(void 0);
			}, [available, load]);
			(0, react.useEffect)(() => {
				if (acceptedSelection === void 0) return;
				if (!sameSelection(state.current, acceptedSelection.projectedBeforeRequest)) setAcceptedSelection(void 0);
			}, [acceptedSelection, state.current]);
			(0, react.useEffect)(() => {
				if (!locked) return;
				selectionGeneration.current += 1;
				setAcceptedSelection(void 0);
			}, [locked]);
			(0, react.useLayoutEffect)(() => {
				if (!open) return;
				const menu = menuRef.current;
				if (menu !== null && !menu.contains(document.activeElement)) menu.focus();
			}, [
				open,
				pane,
				searching
			]);
			if (!available) return null;
			const returnToRoot = () => {
				setPane("root");
				setSearching(false);
				setQuery("");
			};
			const settleSelection = (outcome) => {
				if (outcome.committed) return;
				const message = getDirectorySnapshot().error;
				if (message !== null) {
					toastSeq.current += 1;
					setToast({
						seq: toastSeq.current,
						text: t("error.action", { message })
					});
				}
			};
			const applySelection = (next) => {
				if (lockedRef.current || !choiceAllowed(next.provider)) return;
				if (onDraftChange !== void 0) {
					onDraftChange(next);
					returnToRoot();
					return;
				}
				if (currentCanBeUsed && sameSelection(currentSelection, next)) {
					returnToRoot();
					return;
				}
				lastActionRef.current = "select";
				if (select !== void 0) {
					const generation = ++selectionGeneration.current;
					const projectedBeforeRequest = state.current;
					beginSelection(() => select(next), returnToRoot, (outcome) => {
						if (generation !== selectionGeneration.current || lockedRef.current) return;
						if (outcome.committed) setAcceptedSelection({
							selection: next,
							projectedBeforeRequest
						});
						settleSelection(outcome);
					});
				}
			};
			const chooseMember = (nextFamily, next, effort) => {
				applySelection(selectionOf(nextFamily, next, effort));
			};
			const chooseEffort = (effort) => {
				if (family === void 0 || member === void 0) return;
				applySelection(selectionOf(family, member, effort));
			};
			const modelLabel = family?.name ?? member?.model.name ?? currentSelection?.model ?? t("trigger.fallback");
			const contextBit = contextLabel === void 0 || contextLabel === "standard" ? void 0 : member?.contextTier === null ? void 0 : contextLabel;
			const triggerBits = [
				modelLabel,
				...effortLabel === void 0 ? [] : [effortLabel],
				...member?.fast === true ? [t("menu.fast")] : [],
				...contextBit === void 0 ? [] : [contextBit],
				...thinkingPair !== null && member?.thinking === true ? [t("menu.thinking")] : []
			];
			const contextDisplay = (label) => label === "standard" ? t("context.standard") : label;
			const triggerLabel = triggerBits.join(" · ");
			const triggerAria = currentSelection === null ? t("trigger.selectAria") : t("trigger.aria", { model: triggerLabel });
			const onRootKeyDown = (event) => {
				if (lockedRef.current) return;
				if (event.key === "Escape" && open) {
					event.preventDefault();
					if (pane === "model" && searching) {
						setSearching(false);
						setQuery("");
					} else if (pane !== "root") returnToRoot();
					else close(true);
				}
			};
			const paneHeader = pane === "root" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModelPaneHeader, {
				title: t({
					model: "menu.model",
					effort: "menu.effort",
					context: "menu.context",
					fast: "menu.fast",
					thinking: "menu.thinking"
				}[pane]),
				backLabel: t("menu.back"),
				searchLabel: t("menu.search"),
				closeSearchLabel: t("menu.closeSearch"),
				searchable: pane === "model",
				searching: pane === "model" && searching,
				query,
				onBack: returnToRoot,
				onStartSearch: () => {
					setSearching(true);
				},
				onCloseSearch: () => {
					setSearching(false);
					setQuery("");
				},
				onQueryChange: setQuery
			});
			const menu = open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: menuRef,
				id: `${id}-menu`,
				className: ComposerPicker_module_css_default.menu,
				style: menuStyle,
				role: "menu",
				tabIndex: -1,
				"aria-label": t("menu.aria"),
				"aria-busy": state.status === "loading" || busy,
				onPointerDown: (event) => {
					event.stopPropagation();
				},
				children: [paneHeader, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: ComposerPicker_module_css_default.list,
					children: [
						pane === "root" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								role: "menuitem",
								className: ComposerPicker_module_css_default.cell,
								onClick: () => {
									setPane("model");
									setSearching(false);
									setQuery("");
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: ComposerPicker_module_css_default.cellLabel,
										children: t("menu.model")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: ComposerPicker_module_css_default.cellValue,
										children: family?.name ?? modelLabel
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutlineRegular, {
										size: 14,
										className: ComposerPicker_module_css_default.cellChevron
									})
								]
							}),
							reasoning !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								role: "menuitem",
								className: ComposerPicker_module_css_default.cell,
								onClick: () => {
									setPane("effort");
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: ComposerPicker_module_css_default.cellLabel,
										children: t("menu.effort")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: ComposerPicker_module_css_default.cellValue,
										children: effortLabel
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutlineRegular, {
										size: 14,
										className: ComposerPicker_module_css_default.cellChevron
									})
								]
							}),
							family !== void 0 && familyHasContextChoices(family) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								role: "menuitem",
								className: ComposerPicker_module_css_default.cell,
								onClick: () => {
									setPane("context");
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: ComposerPicker_module_css_default.cellLabel,
										children: t("menu.context")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: ComposerPicker_module_css_default.cellValue,
										children: contextDisplay(contextLabel ?? "")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutlineRegular, {
										size: 14,
										className: ComposerPicker_module_css_default.cellChevron
									})
								]
							}),
							family !== void 0 && familyHasFast(family) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								role: "menuitem",
								className: ComposerPicker_module_css_default.cell,
								onClick: () => {
									setPane("fast");
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: ComposerPicker_module_css_default.cellLabel,
										children: t("menu.fast")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: ComposerPicker_module_css_default.cellValue,
										children: member?.fast === true ? t("fast.on") : t("fast.off")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutlineRegular, {
										size: 14,
										className: ComposerPicker_module_css_default.cellChevron
									})
								]
							}),
							thinkingPair !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								role: "menuitem",
								className: ComposerPicker_module_css_default.cell,
								onClick: () => {
									setPane("thinking");
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: ComposerPicker_module_css_default.cellLabel,
										children: t("menu.thinking")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: ComposerPicker_module_css_default.cellValue,
										children: member?.thinking === true ? t("thinking.on") : t("thinking.off")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutlineRegular, {
										size: 14,
										className: ComposerPicker_module_css_default.cellChevron
									})
								]
							})
						] }),
						pane === "model" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							state.status === "loading" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: ComposerPicker_module_css_default.status,
								children: t("status.loading")
							}),
							state.error !== null && lastActionRef.current === "load" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: ComposerPicker_module_css_default.error,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("error.action", { message: state.error }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: ComposerPicker_module_css_default.retry,
									disabled: locked,
									onClick: reload,
									children: t("retry")
								})]
							}),
							state.failures.map((failure) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: ComposerPicker_module_css_default.warning,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("warning.groupLoad", {
									name: failure.name,
									message: failure.message
								}) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: ComposerPicker_module_css_default.retry,
									disabled: locked,
									onClick: reload,
									children: t("retry")
								})]
							}, failure.id)),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: classNames(ComposerPicker_module_css_default.groups, "scrollable"),
								children: sections.map((section) => {
									const headingId = `${id}-${section.provider}`;
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
										role: "group",
										"aria-labelledby": headingId,
										className: ComposerPicker_module_css_default.group,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: ComposerPicker_module_css_default.groupTitle,
											id: headingId,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RuntimeIcon, {
												provider: section.provider,
												...roleOf === void 0 ? {} : { roleOf }
											}), section.providerName]
										}), section.families.map((item) => {
											const selected = currentSelection?.provider === item.provider && item.members.some((entry) => entry.model.id === currentSelection.model);
											const representative = member !== void 0 && family?.provider === item.provider && family.base === item.base ? member : item.members.find((entry) => !entry.fast && entry.contextTier === null) ?? item.members[0];
											return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
												type: "button",
												role: "menuitemradio",
												"aria-checked": selected,
												className: classNames(ComposerPicker_module_css_default.option, selected && ComposerPicker_module_css_default.selected),
												disabled: locked || busy || !choiceAllowed(item.provider),
												onClick: () => {
													if (representative === void 0) return;
													chooseMember(item, representative);
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: ComposerPicker_module_css_default.optionCopy,
													children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: ComposerPicker_module_css_default.modelName,
														children: item.name
													})
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: ComposerPicker_module_css_default.check,
													children: selected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutlineRegular, { size: 16 }) : null
												})]
											}, `${item.provider}:${item.base}`);
										})]
									}, section.provider);
								})
							}),
							state.status === "ready" && visibleFamilies.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: ComposerPicker_module_css_default.empty,
								children: t("empty.models")
							})
						] }),
						pane === "effort" && (reasoning === void 0 || reasoning.efforts.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: ComposerPicker_module_css_default.empty,
							children: t("empty.efforts")
						}) : reasoning.efforts.map((level) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							role: "menuitemradio",
							"aria-checked": effectiveEffort === level.id,
							className: classNames(ComposerPicker_module_css_default.option, effectiveEffort === level.id && ComposerPicker_module_css_default.selected),
							disabled: locked || busy || family !== void 0 && !choiceAllowed(family.provider),
							onClick: () => {
								chooseEffort(level.id);
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: ComposerPicker_module_css_default.optionCopy,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: ComposerPicker_module_css_default.modelName,
									children: level.name
								})
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: ComposerPicker_module_css_default.check,
								children: effectiveEffort === level.id ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutlineRegular, { size: 16 }) : null
							})]
						}, level.id))),
						pane === "context" && family !== void 0 && member !== void 0 && contextTiers(family).map((row) => {
							const next = pickVariant(family, member, { contextTier: row.tier });
							const selected = member.contextTier === row.tier;
							const honored = next.contextTier === row.tier && next.fast === member.fast && next.thinking === member.thinking;
							const unreachable = !selected && (!honored || next.model.id === member.model.id);
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								role: "menuitemradio",
								"aria-checked": selected,
								className: classNames(ComposerPicker_module_css_default.option, selected && ComposerPicker_module_css_default.selected),
								disabled: locked || busy || !choiceAllowed(family.provider) || unreachable,
								title: unreachable ? t("choice.unavailable") : void 0,
								onClick: () => {
									if (!unreachable) chooseMember(family, next, effectiveEffort);
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: ComposerPicker_module_css_default.optionCopy,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: ComposerPicker_module_css_default.modelName,
										children: contextDisplay(row.label)
									})
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: ComposerPicker_module_css_default.check,
									children: selected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutlineRegular, { size: 16 }) : null
								})]
							}, row.tier ?? "standard");
						}),
						pane === "fast" && family !== void 0 && member !== void 0 && [false, true].map((fast) => {
							const next = pickVariant(family, member, { fast });
							const selected = member.fast === fast;
							const honored = next.fast === fast && next.contextTier === member.contextTier && next.thinking === member.thinking;
							const unreachable = !selected && (!honored || next.model.id === member.model.id);
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								role: "menuitemradio",
								"aria-checked": selected,
								className: classNames(ComposerPicker_module_css_default.option, selected && ComposerPicker_module_css_default.selected),
								disabled: locked || busy || !choiceAllowed(family.provider) || unreachable,
								title: unreachable ? t("choice.unavailable") : void 0,
								onClick: () => {
									if (!unreachable) chooseMember(family, next, effectiveEffort);
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: ComposerPicker_module_css_default.optionCopy,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: ComposerPicker_module_css_default.modelName,
										children: fast ? t("fast.on") : t("fast.off")
									})
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: ComposerPicker_module_css_default.check,
									children: selected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutlineRegular, { size: 16 }) : null
								})]
							}, fast ? "on" : "off");
						}),
						pane === "thinking" && family !== void 0 && member !== void 0 && thinkingPair !== null && [{
							on: true,
							row: thinkingPair.on
						}, {
							on: false,
							row: thinkingPair.off
						}].map((choice) => {
							const selected = member.thinking === choice.on;
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								role: "menuitemradio",
								"aria-checked": selected,
								className: classNames(ComposerPicker_module_css_default.option, selected && ComposerPicker_module_css_default.selected),
								disabled: locked || busy || !choiceAllowed(family.provider),
								onClick: () => {
									chooseMember(family, choice.row, effectiveEffort);
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: ComposerPicker_module_css_default.optionCopy,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: ComposerPicker_module_css_default.modelName,
										children: choice.on ? t("thinking.on") : t("thinking.off")
									})
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: ComposerPicker_module_css_default.check,
									children: selected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutlineRegular, { size: 16 }) : null
								})]
							}, choice.on ? "on" : "off");
						})
					]
				})]
			}) : null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: classNames(ComposerPicker_module_css_default.root, tone === "capsule" ? ComposerPicker_module_css_default.capsule : embedded && ComposerPicker_module_css_default.embedded),
				onKeyDown: onRootKeyDown,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						ref: triggerRef,
						type: "button",
						className: ComposerPicker_module_css_default.trigger,
						"aria-label": triggerAria,
						"aria-haspopup": "menu",
						"aria-expanded": open,
						"aria-controls": open ? `${id}-menu` : void 0,
						title: triggerLabel,
						disabled: locked,
						onPointerDown: onTriggerPointerDown,
						onClick: onTriggerClick,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: ComposerPicker_module_css_default.triggerLabel,
							children: [currentSelection !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RuntimeIcon, {
								provider: currentSelection.provider,
								...roleOf === void 0 ? {} : { roleOf }
							}) : null, triggerLabel]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, {
							size: 14,
							className: classNames(ComposerPicker_module_css_default.chevron, open && ComposerPicker_module_css_default.chevronOpen)
						})]
					}),
					menu !== null && (tone === "capsule" ? menu : (0, react_dom.createPortal)(menu, document.body)),
					toast !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Toast, {
						text: toast.text,
						icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconWarningOutlineRegular, { size: 16 }),
						anchor: triggerRef.current?.closest("[data-composer-card]") ?? null,
						onDone: () => {
							setToast(null);
						}
					}, toast.seq)
				]
			});
		}
		//#endregion
		//#region src/client/picker/plan-preview.ts
		/** Registration id ui-plan uses for its `conversation.plan-review.actions` entry. */
		const PLAN_REVIEW_OPEN_ID = "@deepseek-ai/dsh-client-ui-plan";
		/** Identities whose preview was already opened this process (official parity: ui-plan's store keeps them too). */
		const opened = /* @__PURE__ */ new Set();
		/**
		* Stable identity of one review's sidebar preview.
		* @param sessionId - session that owns the review.
		* @param review - narrowed plan review.
		* @param requestKey - pending-question request key.
		* @returns `session:call:<callId>` for a logged plan, else `session:review:<requestKey>`.
		*/
		function planPreviewIdentity(sessionId, review, requestKey) {
			const identity = review.callId === void 0 ? `review:${requestKey}` : `call:${review.callId}`;
			return `${String(sessionId)}:${identity}`;
		}
		function faceOf(slots, sessionId) {
			const entry = slots.entries("conversation.plan-review.actions").find((candidate) => candidate.options.id === PLAN_REVIEW_OPEN_ID && typeof candidate.inject === "function");
			if (entry === void 0 || entry.inject === void 0) return void 0;
			try {
				const face = entry.inject(sessionId);
				if (face === void 0 || typeof face.openReview !== "function") return void 0;
				if (face.hooks === void 0 || typeof face.hooks.sidebarMounted?.getSnapshot !== "function") return void 0;
				return face;
			} catch {
				return;
			}
		}
		/**
		* Bind the preview navigation to one slot registry.
		* @param slots - the live registry ledger.
		* @returns an idempotent binding usable from the card's render and effects.
		*/
		function createPlanPreviewBinding(slots) {
			const open = (sessionId, review, requestKey) => {
				const face = faceOf(slots, sessionId);
				if (face === void 0) return false;
				opened.add(planPreviewIdentity(sessionId, review, requestKey));
				face.openReview(review, requestKey);
				return true;
			};
			return {
				available: () => slots.entries("conversation.plan-review.actions").some((candidate) => candidate.options.id === PLAN_REVIEW_OPEN_ID),
				open,
				autoOpen: (sessionId, review, requestKey) => {
					const identity = planPreviewIdentity(sessionId, review, requestKey);
					if (opened.has(identity)) return () => void 0;
					const face = faceOf(slots, sessionId);
					if (face === void 0) return () => void 0;
					const mounted = face.hooks.sidebarMounted;
					if (mounted.getSnapshot() !== void 0) {
						opened.add(identity);
						face.openReview(review, requestKey);
						return () => void 0;
					}
					let disposed = false;
					let openedHere = false;
					const unsubscribe = mounted.subscribe(() => {
						if (disposed || openedHere || opened.has(identity)) return;
						if (mounted.getSnapshot() === void 0) return;
						openedHere = true;
						opened.add(identity);
						unsubscribe();
						face.openReview(review, requestKey);
					});
					return () => {
						disposed = true;
						unsubscribe();
					};
				}
			};
		}
		//#endregion
		//#region node_modules/.pnpm/dsh-llm-providers-ui@https+_f1dadb1b56406564fc1bb8f2d953b82d/node_modules/dsh-llm-providers-ui/lib/order.js
		/** Display order for installed provider cards when the user has not saved one. */
		const PROVIDER_ITEM_ORDER = [
			"llm-cursor",
			"llm-grok",
			"llm-codex",
			"llm-ollama",
			"llm-commandcode",
			"llm-opencode-go"
		];
		const KNOWN_KEYS = new Set(PROVIDER_ITEM_ORDER);
		new Map(Object.entries({
			"llm-cursor": "cursor",
			"llm-grok": "grok",
			"llm-codex": "codex",
			"llm-ollama": "ollama-cloud",
			"llm-commandcode": "commandcode",
			"llm-opencode-go": "opencode-go"
		}).map(([key, route]) => [route, key]));
		/**
		* Merge a saved key list with the keys that are actually installed.
		* Saved keys that are not installed are dropped; installed keys missing from
		* the save append in PROVIDER_ITEM_ORDER, then leftover unknown keys.
		* Nothing registered yields an empty list (the settings empty state).
		*/
		function applySavedOrder(registered, saved = []) {
			const have = [...new Set(registered.filter((key) => key.length > 0))];
			if (have.length === 0) return [];
			const installed = new Set(have);
			const preferredSaved = [...new Set(saved)].filter((key) => installed.has(key));
			const preferred = new Set(preferredSaved);
			const rest = have.filter((key) => !preferred.has(key));
			const known = PROVIDER_ITEM_ORDER.filter((key) => rest.includes(key));
			const extra = rest.filter((key) => !KNOWN_KEYS.has(key));
			return [
				...preferredSaved,
				...known,
				...extra
			];
		}
		function ownCatalogKey$1(catalogKeys, id) {
			return Object.hasOwn(catalogKeys, id) ? catalogKeys[id] : void 0;
		}
		/**
		* Sort picker/catalog groups from declared directory routes.
		* With a saved card order, mapped providers follow that list; with none, groups keep catalog order.
		* Groups the live map does not know keep catalog order and append after ranked routes.
		* @param catalogKeys - live catalog-group-id → card-key map from ProviderDirectory.catalogRoutes().
		*/
		function sortCatalogGroups(groups, saved = [], catalogKeys = {}) {
			if (saved.length === 0) return [...groups];
			const idByKey = /* @__PURE__ */ new Map();
			for (const [id, key] of Object.entries(catalogKeys)) idByKey.set(key, id);
			const ranked = applySavedOrder(groups.map((group) => ownCatalogKey$1(catalogKeys, group.id)).filter((key) => key !== void 0), saved);
			const rank = new Map(ranked.flatMap((key, index) => {
				const route = idByKey.get(key);
				return route === void 0 ? [] : [[route, index]];
			}));
			const known = [];
			const unknown = [];
			for (const group of groups) if (rank.has(group.id)) known.push(group);
			else unknown.push(group);
			known.sort((left, right) => (rank.get(left.id) ?? 0) - (rank.get(right.id) ?? 0));
			return [...known, ...unknown];
		}
		//#endregion
		//#region src/client/provider-directory.ts
		/** Optional ProviderDirectory operations consumed by Model Switch. */
		/** Read the optional catalog route map without assuming a particular Providers UI release. */
		function readCatalogRoutes(directory) {
			const catalogRoutes = directory?.catalogRoutes;
			return typeof catalogRoutes === "function" ? catalogRoutes.call(directory) : {};
		}
		/** Read the optional native-binding declarations without assuming a particular Providers UI release. */
		function readNativeBindings(directory) {
			const nativeBindings = directory?.nativeBindings;
			return typeof nativeBindings === "function" ? nativeBindings.call(directory) : [];
		}
		function ownCatalogKey(catalogKeys, id) {
			return Object.hasOwn(catalogKeys, id) ? catalogKeys[id] : void 0;
		}
		/**
		* Rank picker/catalog groups from live ProviderDirectory routes.
		* Published 0.2.8 `sortCatalogGroups` only understands hardcoded LLM routes and
		* ignores a third argument, so Agent catalog ids would keep source order.
		* When the Owner publishes `catalogRoutes`, this ranks those keys locally.
		* With no live map, fall back to the compile-pinned 0.2.8 LLM-only sort.
		*/
		function sortCatalogGroupsWithRoutes(groups, saved = [], catalogKeys = {}) {
			const live = Object.entries(catalogKeys).filter(([id, key]) => Object.hasOwn(catalogKeys, id) && key.length > 0);
			if (live.length === 0) return sortCatalogGroups(groups, saved);
			if (saved.length === 0) return [...groups];
			const idByKey = /* @__PURE__ */ new Map();
			for (const [id, key] of live) idByKey.set(key, id);
			const ranked = applySavedOrder(groups.map((group) => ownCatalogKey(catalogKeys, group.id)).filter((key) => key !== void 0), saved);
			const rank = new Map(ranked.flatMap((key, index) => {
				const route = idByKey.get(key);
				return route === void 0 ? [] : [[route, index]];
			}));
			const known = [];
			const unknown = [];
			for (const group of groups) if (rank.has(group.id)) known.push(group);
			else unknown.push(group);
			known.sort((left, right) => (rank.get(left.id) ?? 0) - (rank.get(right.id) ?? 0));
			return [...known, ...unknown];
		}
		//#endregion
		//#region src/client/picker/PickerDirectory.ts
		function pickerDirectoryView(snapshot, operations) {
			return {
				snapshot,
				getDirectorySnapshot: operations.getDirectorySnapshot,
				load: operations.load,
				select: operations.select
			};
		}
		/** Directory view whose groups follow the shared LLM Providers card order. */
		function pickerDirectoryViewOrdered(snapshot, operations, order, catalogKeys = {}) {
			return pickerDirectoryView({
				...snapshot,
				groups: sortCatalogGroupsWithRoutes(snapshot.groups, order, catalogKeys)
			}, operations);
		}
		//#endregion
		//#region src/picker/pending-dismissal.ts
		/** Raised when the running Host exposes neither withdrawal verb. */
		var PlanDismissalUnsupportedError = class extends Error {
			constructor(message) {
				super(message);
				this.name = "PlanDismissalUnsupportedError";
			}
		};
		/**
		* Withdraw a pending card so the human can talk instead, on either generation.
		* @param wait - the matched pending question carrier.
		* @returns Which verb withdrew the card.
		* @throws {PlanDismissalUnsupportedError} when the carrier exposes neither verb.
		*/
		async function dismissPendingQuestion(wait) {
			if (typeof wait.dismiss === "function") {
				await wait.dismiss();
				return "dismiss";
			}
			if (typeof wait.cancel === "function") {
				await wait.cancel();
				return "cancel";
			}
			throw new PlanDismissalUnsupportedError("this DSH Host exposes neither PendingQuestion.dismiss() (0.2.x) nor PendingQuestion.cancel() (0.1.x)");
		}
		//#endregion
		//#region src/picker/discuss-plan.ts
		/**
		* Withdraw the review by interrupting the turn, falling back to dismissal.
		*
		* Order matters: cancellation is what keeps the work details expanded, so it is
		* tried first and only genuinely unavailable/refused cancellation falls through
		* to the released withdrawal (which still gives the human the composer back, just
		* without the expansion guarantee).
		*
		* @param cancelTurn - the session cancel seam; absent on a Host without one.
		* @param sessionId - the session whose turn is being withdrawn.
		* @param dismiss - the released `PendingQuestion` withdrawal.
		* @returns Which route withdrew the review.
		*/
		async function discussPlan(cancelTurn, sessionId, dismiss) {
			if (cancelTurn !== void 0 && sessionId !== "") try {
				await cancelTurn(sessionId);
				return "interrupted";
			} catch {}
			await dismiss();
			return "dismissed";
		}
		//#endregion
		//#region src/picker/plan-goal.ts
		/**
		* Strip the gateway's transport prefix from a Host message.
		*
		* The goal service throws `GoalError`, and the RPC gateway relays a thrown
		* error as `code: "gateway/internal"` with the original text still in
		* `message`. Showing `gateway/internal: goal "…" already exists…` to a human
		* buries the only sentence that matters, so the prefix is removed here.
		*/
		function normalizeHostMessage(message) {
			return message.replace(/^\s*gateway\/[a-z0-9-]+\s*:\s*/i, "").trim();
		}
		/**
		* Whether a refused goal call means "this session already has a goal".
		*
		* Two shapes reach here. A Host that returns the domain code says
		* `GOAL_ALREADY_EXISTS`; the gateway instead relays the thrown `GoalError` as
		* `gateway/internal` and keeps only the text, so the message itself has to be
		* recognised. The domain code is checked first and the text only decides the
		* message shape the Host is known to produce — a refusal for any other reason
		* must never clear the user's current goal.
		*/
		function isAlreadyExistsError(error) {
			if (error.code === "GOAL_ALREADY_EXISTS") return true;
			return /already exists with phase/i.test(error.message);
		}
		/** Codes that describe the transport, not the goal domain. */
		function isTransportCode(code) {
			return code === "GOAL_TRANSPORT" || code.startsWith("gateway/");
		}
		function failure(result, fallback) {
			if (result.ok) return { message: fallback };
			const { code, message } = result.error;
			const text = normalizeHostMessage(message);
			const wording = text === "" ? fallback : text;
			return isTransportCode(code) ? { message: wording } : {
				code,
				message: wording
			};
		}
		/**
		* Run one remote call, turning a rejected promise into a refused envelope.
		*
		* Generated remotes normally resolve `{ ok: false }`, but a transport failure
		* (or an older Host that rejects instead of answering) must not escape as an
		* unhandled rejection: the card would lose its error state and the plan would
		* stay pending with no explanation.
		*/
		async function guarded(call, fallback) {
			try {
				return await call();
			} catch (error) {
				const text = normalizeHostMessage(error instanceof Error ? error.message : String(error));
				return {
					ok: false,
					error: {
						code: "GOAL_TRANSPORT",
						message: text === "" ? fallback : text
					}
				};
			}
		}
		/**
		* Address the plan document exactly as the official opener does.
		*
		* A logged plan (`callId` present) resolves from `dsh-resource://plan/...`
		* for as long as the session log holds the call; before that the pending
		* review's own `dsh-resource://plan-review/...` address is the one that
		* opens its preview.
		*
		* @param sessionId - the session that owns the review.
		* @param ref - logged call identity plus the pending request key.
		* @returns The plan resource address.
		*/
		function planDocumentAddress(sessionId, ref) {
			const encode = encodeURIComponent;
			return ref.callId === void 0 ? `dsh-resource://plan-review/${encode(sessionId)}/${encode(ref.requestKey)}` : `dsh-resource://plan/${encode(sessionId)}/${encode(ref.callId)}`;
		}
		/**
		* Make this plan the session's armed goal, replacing any unfinished goal.
		*
		* The objective is a short instruction carrying the plan document's address,
		* not the plan's raw markdown: goal objectives are injected into every round,
		* and a full plan would be truncated by length limits mid-sentence. The round
		* driver reads the plan from the address instead.
		*
		* Ordering mirrors the card's own commit-then-answer rule: a refusal here keeps
		* the Plan pending instead of approving work that no goal tracks. The replace
		* path clears rather than edits so a new plan receives a fresh round budget —
		* `edit` would inherit the rounds the previous goal already spent.
		*
		* @param remote - the released goal remote, absent when no goal package is mounted.
		* @param sessionId - the session that owns both the review and the goal.
		* @param plan - the plan markdown under review (validated non-empty).
		* @param ref - the plan document identity used for its address.
		* @returns Whether the goal now tracks this plan, or why it does not.
		*/
		async function setPlanAsGoal(remote, sessionId, plan, ref) {
			if (remote === void 0) return { kind: "unsupported" };
			if (plan.trim() === "") return {
				kind: "failed",
				code: "GOAL_INVALID_OBJECTIVE",
				message: "goal objective must be a non-empty string"
			};
			const objective = `持续推进当前plan直到完成（plan 文档：${planDocumentAddress(sessionId, ref)}）`;
			const created = await guarded(() => remote.create(sessionId, { objective }), "the goal could not be created");
			if (created.ok) return { kind: "created" };
			if (!isAlreadyExistsError(created.error)) return {
				kind: "failed",
				...failure(created, "the goal could not be created")
			};
			const current = await guarded(() => remote.get(sessionId), "the current goal could not be read for replacement");
			if (!current.ok || current.value === void 0 || current.value === null) return {
				kind: "failed",
				...failure(current, "the current goal could not be read for replacement")
			};
			const cleared = await guarded(() => remote.clear(sessionId, {
				id: current.value.id,
				revision: current.value.revision
			}), "the current goal could not be cleared");
			if (!cleared.ok) return {
				kind: "failed",
				...failure(cleared, "the current goal could not be cleared")
			};
			const retry = await guarded(() => remote.create(sessionId, { objective }), "the goal could not be created");
			if (retry.ok) return { kind: "replaced" };
			return {
				kind: "failed",
				...failure(retry, "the goal could not be created")
			};
		}
		//#endregion
		//#region src/client/picker/RetryBoundary.tsx
		/** Own retryable React error-boundary state while callers own presentation and copy. */
		var RetryBoundary = class extends react.Component {
			state = { message: null };
			static getDerivedStateFromError(error) {
				return { message: error instanceof Error ? error.message : String(error) };
			}
			componentDidCatch(error, info) {
				console.error(this.props.logLabel, error, info);
			}
			render() {
				if (this.state.message === null) return this.props.children;
				return this.props.renderFallback(this.state.message, () => {
					this.setState({ message: null });
				});
			}
		};
		//#endregion
		//#region \0dsh-css:src/client/picker/PlanReviewCard.module.css.mjs
		const css = ".BylfoW_frame{padding:6px calc(var(--dsh-composer-side-clearance) + 16px) 10px;justify-content:center;display:flex}.BylfoW_card{width:100%;max-width:var(--dsh-chat-content-width);border:1px solid var(--dsw-alias-state-warn-secondary);background:var(--dsw-specific-input-major);max-height:min(60vh,520px);box-shadow:var(--dsw-shadow-lv2);color:var(--dsw-alias-label-primary);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border-radius:20px;flex-direction:column;display:flex;overflow:visible}.BylfoW_card,.BylfoW_card *{box-sizing:border-box}.BylfoW_strip{background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-state-warn-primary);border-radius:20px 20px 0 0;flex-shrink:0;align-items:center;gap:8px;padding:10px 16px;font-size:13px;line-height:18px;display:flex}.BylfoW_dot{background:var(--dsw-alias-state-warn-primary);border-radius:50%;width:8px;height:8px}.BylfoW_stripTitle{flex:none;font-weight:600}.BylfoW_previewLink{color:inherit;font:inherit;cursor:pointer;opacity:.85;background:0 0;border:0;flex:none;align-items:center;gap:4px;padding:0;display:inline-flex}.BylfoW_previewLink:hover{opacity:1;text-decoration:underline}.BylfoW_previewLink:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:3px}.BylfoW_headerPicker{flex:0 auto;align-items:center;min-width:0;max-width:55%;margin-left:auto;display:flex}.BylfoW_headerPicker>*{min-width:0;max-width:100%}.BylfoW_body{overscroll-behavior:contain;flex:auto;min-height:0;padding:12px 16px 4px;font-size:14px;line-height:22px;overflow-y:auto}.BylfoW_summary{min-width:0}.BylfoW_summaryTitle{text-overflow:ellipsis;white-space:nowrap;margin:0;font-size:15px;font-weight:500;line-height:22px;overflow:hidden}.BylfoW_summaryText{-webkit-line-clamp:2;color:var(--dsw-alias-label-secondary);-webkit-box-orient:vertical;margin:8px 0 0;font-size:14px;line-height:24px;display:-webkit-box;overflow:hidden}.BylfoW_footer{z-index:2;flex-direction:column;flex-shrink:0;gap:6px;padding:8px 16px 12px;display:flex;position:relative;overflow:visible}.BylfoW_feedback{min-height:0;color:var(--dsw-alias-state-error-primary);font-size:11px;line-height:16px}.BylfoW_feedback:empty{display:none}.BylfoW_feedbackRow{align-items:center;gap:8px;min-width:0;display:flex}.BylfoW_feedbackInput{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-specific-input-minor);min-width:0;height:32px;color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13);border-radius:8px;flex:auto;padding:0 10px}.BylfoW_feedbackInput::placeholder{color:var(--dsw-alias-label-tertiary)}.BylfoW_feedbackInput:disabled{opacity:.6}.BylfoW_bar{flex-wrap:nowrap;justify-content:space-between;align-items:center;gap:12px;min-width:0;min-height:32px;display:flex}.BylfoW_picker{flex:16rem;min-width:0;max-width:16rem}.BylfoW_pickerError{color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere;flex-wrap:wrap;align-items:center;gap:6px;font-size:12px;display:flex}.BylfoW_actions{flex-wrap:wrap;flex:0 auto;justify-content:flex-end;align-items:center;gap:8px;min-width:0;margin-left:auto;display:flex}.BylfoW_discuss,.BylfoW_keep,.BylfoW_goalRun,.BylfoW_approve,.BylfoW_recover{white-space:nowrap;flex:0 auto;min-width:0;height:32px;min-height:32px;padding:0 10px}.BylfoW_discuss,.BylfoW_recover{color:var(--dsw-alias-label-secondary)}.BylfoW_discuss:hover:not(:disabled),.BylfoW_recover:hover:not(:disabled){color:var(--dsw-alias-label-primary)}.BylfoW_approve{flex-shrink:0;padding:0 12px}@media (width<=720px){.BylfoW_frame{padding-right:max(10px, env(safe-area-inset-right));padding-bottom:max(10px, env(safe-area-inset-bottom));padding-left:max(10px, env(safe-area-inset-left))}.BylfoW_card{border-radius:16px}.BylfoW_strip,.BylfoW_body,.BylfoW_footer{padding-left:12px;padding-right:12px}.BylfoW_strip{flex-wrap:wrap;gap:6px}.BylfoW_headerPicker{flex:100%;max-width:100%;margin-left:0}.BylfoW_bar{justify-content:flex-end;gap:6px}.BylfoW_actions{flex:100%;justify-content:flex-end;gap:6px;min-width:0}.BylfoW_discuss,.BylfoW_keep,.BylfoW_goalRun,.BylfoW_approve,.BylfoW_recover{overflow-wrap:anywhere;white-space:normal;flex:1 1 0;min-width:0;height:auto;padding:4px;line-height:14px}.BylfoW_feedbackInput{height:auto;min-height:32px}}";
		const tagId = "dsh-model-switch/PlanReviewCard.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-model-switch";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var PlanReviewCard_module_css_default = {
			"actions": "BylfoW_actions",
			"approve": "BylfoW_approve",
			"bar": "BylfoW_bar",
			"body": "BylfoW_body",
			"card": "BylfoW_card",
			"discuss": "BylfoW_discuss",
			"dot": "BylfoW_dot",
			"feedback": "BylfoW_feedback",
			"feedbackInput": "BylfoW_feedbackInput",
			"feedbackRow": "BylfoW_feedbackRow",
			"footer": "BylfoW_footer",
			"frame": "BylfoW_frame",
			"goalRun": "BylfoW_goalRun",
			"headerPicker": "BylfoW_headerPicker",
			"keep": "BylfoW_keep",
			"picker": "BylfoW_picker",
			"pickerError": "BylfoW_pickerError",
			"previewLink": "BylfoW_previewLink",
			"recover": "BylfoW_recover",
			"strip": "BylfoW_strip",
			"stripTitle": "BylfoW_stripTitle",
			"summary": "BylfoW_summary",
			"summaryText": "BylfoW_summaryText",
			"summaryTitle": "BylfoW_summaryTitle"
		};
		//#endregion
		//#region src/client/picker/PlanReviewCard.tsx
		function PickerGuard({ children, errorLabel, retryLabel }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RetryBoundary, {
				logLabel: "dsh-model-switch: Plan Review picker crashed",
				renderFallback: (message, retry) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					"data-dsh-ms-plan-picker-error": true,
					role: "alert",
					className: PlanReviewCard_module_css_default.pickerError,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: errorLabel(message) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						type: "button",
						variant: "outline",
						onClick: retry,
						children: retryLabel
					})]
				}),
				children
			});
		}
		/**
		* Answer one review question.
		*
		* A typed feedback answer follows the official single-select convention: the
		* custom text replaces the option list, because plan mode reads `custom` as
		* "keep planning, and here is why" and falls back to the bare option when it
		* is absent.
		*/
		async function respondAnswer(wait, id, label, rejectedMessage, terminalRejection = false, feedback) {
			const custom = feedback === void 0 || feedback === "" ? void 0 : feedback;
			const answer = custom === void 0 ? { answers: [{
				id,
				selected: [label]
			}] } : { answers: [{
				id,
				selected: [],
				custom
			}] };
			try {
				await wait.answer(answer);
			} catch (cause) {
				throw terminalRejection ? new PlanApprovalResponseError(rejectedMessage, { cause }) : new Error(rejectedMessage, { cause });
			}
		}
		/**
		* Withdraw the takeover so the human can speak instead, on either Host
		* generation; a Host exposing no withdrawal verb is named instead of guessed.
		*/
		async function respondDismiss(wait, rejectedMessage, unsupportedMessage) {
			try {
				await dismissPendingQuestion(wait);
			} catch (cause) {
				throw cause instanceof PlanDismissalUnsupportedError ? new Error(unsupportedMessage, { cause }) : new Error(rejectedMessage, { cause });
			}
		}
		/** Inline failed lock-read status; history and log reading stay unaffected. */
		function ProviderLockHint(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				role: "alert",
				className: PlanReviewCard_module_css_default.strip,
				"data-provider-lock-failed": true,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: PlanReviewCard_module_css_default.dot }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: PlanReviewCard_module_css_default.stripTitle,
					children: props.t("lock.readFailed")
				})]
			});
		}
		function PlanReviewCard(props) {
			const snapshot = props.useDirectory((value) => value);
			const order = props.useProviderOrder((value) => value);
			const lock = (0, react.useSyncExternalStore)(props.providerLockStore.subscribe, props.providerLockStore.getSnapshot);
			const phase = props.useInput((input) => input.phase);
			const blank = props.useSession((session) => session.blank);
			const active = props.useSession((session) => session.running || session.awaitingFirstTurn) || phase === "submitting";
			(0, react.useEffect)(() => {
				props.refreshProviderLock();
			}, [
				props.refreshProviderLock,
				phase,
				active,
				snapshot,
				order
			]);
			const providerLock = effectiveProviderLock(lock, snapshot.current?.provider, active, isAgentRole(props.roleOf?.(snapshot.current?.provider ?? "")));
			const agentLocked = agentProviderLocked(blank, providerLock, active);
			const review = planReviewOf(props.matched.questions);
			if (review === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: PlanReviewCard_module_css_default.frame,
				"data-plan-review-key": props.matched.key,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
					className: PlanReviewCard_module_css_default.card,
					"aria-label": props.t("plan.header"),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: PlanReviewCard_module_css_default.strip,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: PlanReviewCard_module_css_default.dot }), props.t("plan.header")]
					}), lock.failed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderLockHint, { t: props.t })]
				})
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PlanReviewState, {
				matched: props.matched,
				review,
				available: props.available && (!lock.failed || snapshot.current !== null),
				providerLock,
				agentLocked,
				lockFailed: lock.failed,
				directory: pickerDirectoryViewOrdered(snapshot, props, order, props.catalogRoutes?.() ?? {}),
				t: props.t,
				goalRemote: props.goalRemote,
				planPreview: props.planPreview,
				...props.resolveInteractionOperations === void 0 ? {} : { resolveInteractionOperations: props.resolveInteractionOperations },
				...props.roleOf === void 0 ? {} : { roleOf: props.roleOf },
				...props.cancelTurn === void 0 ? {} : { cancelTurn: props.cancelTurn }
			}, props.matched.key);
		}
		function PlanReviewState({ matched, review, available, providerLock, agentLocked, lockFailed, directory, t, goalRemote, planPreview, resolveInteractionOperations, roleOf, cancelTurn }) {
			const { snapshot, getDirectorySnapshot, load, select } = directory;
			const [execution, setExecution] = (0, react.useState)(snapshot.current ?? void 0);
			const [feedback, setFeedback] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(false);
			const [blocked, setBlocked] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const [notice, setNotice] = (0, react.useState)(null);
			const operationLocked = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				load();
			}, [load]);
			(0, react.useEffect)(() => {
				if (execution === void 0 && snapshot.current !== null) setExecution(snapshot.current);
			}, [execution, snapshot.current]);
			/**
			* The takeover hides the official panel, so this card drives ui-plan's
			* registered opener: the full plan opens in the right sidebar as soon as a
			* Session is on screen (identity-deduped inside the binding).
			*/
			(0, react.useEffect)(() => planPreview.autoOpen(matched.sessionId, review, matched.key), [
				planPreview,
				matched.sessionId,
				matched.key,
				review
			]);
			/** Official two-part summary: first line as title, first paragraph as body. */
			const summary = (0, react.useMemo)(() => {
				const title = (0, _deepseek_ai_dsh_client_ui_primitives.extractMarkdownPlainText)(review.plan, { mode: "first-line" });
				const description = (0, _deepseek_ai_dsh_client_ui_primitives.extractMarkdownPlainText)(review.plan, { mode: "first-paragraph" });
				return {
					title,
					description: description === title ? "" : description
				};
			}, [review.plan]);
			/**
			* Run one takeover action. `force` reaches past a terminal answer state: the
			* withdrawal action must stay reachable, or a rejected answer would leave the
			* card with no way back to the composer.
			*/
			const settle = (send, force = false) => {
				if (busy) return;
				if (!force && (operationLocked.current || blocked)) return;
				operationLocked.current = true;
				let terminal = false;
				settlePlanAction(send, (state) => {
					terminal = state.blocked;
					setBusy(state.busy);
					setBlocked(state.blocked);
					setError(state.error);
				}).then((completed) => {
					if (!completed && !terminal) operationLocked.current = false;
				});
			};
			/** Re-read the Host and re-enable every action after a failed settlement. */
			const recover = () => {
				operationLocked.current = false;
				setBusy(false);
				setBlocked(false);
				setError(null);
				setNotice(null);
				load();
			};
			const executionAllowed = execution !== void 0 && runtimeChoiceAllowed(providerLock, agentLocked, execution.provider, snapshot.current?.provider, isAgentRole(roleOf?.(execution.provider)));
			const action = planActionView({
				busy,
				blocked,
				error
			}, available, executionAllowed);
			/**
			* Commit one execution model, then run the card exit.
			*
			* The picker on this card only holds a **draft** (`onDraftChange`), so a
			* model chosen here reaches the session only when something commits it. That
			* used to be Approve alone: keeping the plan or withdrawing to the composer
			* silently discarded the change and the conversation continued on the
			* previous model. Every exit now runs through this helper instead.
			*
			* @param model - the execution model to commit; `undefined` means the card
			*   has not resolved a picker yet, so the exit runs uncommitted.
			* @param act - the exit to perform once the commit landed.
			* @returns nothing; a refused commit throws so the card stays open with the
			*   error, exactly like a refused approval, instead of dropping the choice.
			*/
			const commitThen = async (model, act) => {
				if (model === void 0) {
					await act();
					return;
				}
				if (!await approvePlanReview({
					select,
					selection: model,
					current: snapshot.current,
					answer: act
				})) {
					const message = getDirectorySnapshot().error;
					throw new Error(message === null ? t("plan.modelFailed") : t("error.action", { message }));
				}
			};
			/** Commit whatever the picker currently holds, then run the exit. */
			const commitDraftThen = (act) => commitThen(execution, act);
			/** Approve this review after committing its execution model; a refused commit keeps the Plan pending. */
			const approveWith = (model) => commitThen(model, () => respondAnswer(matched, review.id, review.approve.label, t("plan.responseRejected"), true));
			const onApprove = () => {
				if (execution === void 0 || !executionAllowed || !available || busy || blocked) return;
				settle(async () => {
					await approveWith(execution);
				});
			};
			const goal = goalRemote();
			const goalReason = goal === void 0 ? t("plan.goalUnsupported") : void 0;
			/**
			* Arm this plan as the session's goal first, then approve. The goal must be
			* set before the answer because a refusal must leave the Plan pending, and
			* because only an armed goal lets the round driver carry the plan after plan
			* mode exits.
			*/
			const onRunAsGoal = () => {
				if (execution === void 0 || !executionAllowed || !available || busy || blocked || goal === void 0) return;
				settle(async () => {
					const handoff = await setPlanAsGoal(goal, matched.sessionId, review.plan, {
						...review.callId === void 0 ? {} : { callId: review.callId },
						requestKey: matched.key
					});
					if (handoff.kind === "unsupported") throw new Error(t("plan.goalUnsupported"));
					if (handoff.kind === "failed") {
						const message = handoff.code === void 0 ? handoff.message : `${handoff.code}: ${handoff.message}`;
						throw new Error(t("plan.goalFailed", { message }));
					}
					if (handoff.kind === "replaced") setNotice(t("plan.goalReplaced"));
					await approveWith(execution);
				});
			};
			const decline = review.decline;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: PlanReviewCard_module_css_default.frame,
				"data-plan-review-key": matched.key,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
					className: PlanReviewCard_module_css_default.card,
					"aria-label": review.question,
					children: [
						lockFailed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderLockHint, { t }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: PlanReviewCard_module_css_default.strip,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: PlanReviewCard_module_css_default.dot }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: PlanReviewCard_module_css_default.stripTitle,
									children: t("plan.header")
								}),
								planPreview.available() && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: PlanReviewCard_module_css_default.previewLink,
									"data-plan-preview-open": true,
									onClick: () => {
										planPreview.open(matched.sessionId, review, matched.key);
									},
									children: t("plan.openFull")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: PlanReviewCard_module_css_default.headerPicker,
									"aria-label": t("plan.execution"),
									onPointerDown: (event) => {
										event.stopPropagation();
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PickerGuard, {
										errorLabel: (message) => t("plan.pickerCrash", { message }),
										retryLabel: t("retry"),
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ComposerPicker, {
											locked: busy || blocked,
											providerLock,
											agentLocked,
											...roleOf === void 0 ? {} : { roleOf },
											available,
											directory,
											t,
											...resolveInteractionOperations === void 0 ? {} : { resolveInteractionOperations },
											...execution === void 0 ? {} : { draft: execution },
											onDraftChange: setExecution,
											embedded: true,
											tone: "capsule"
										})
									})
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: PlanReviewCard_module_css_default.body,
							"data-plan-review-scroll": true,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: PlanReviewCard_module_css_default.summary,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
									className: PlanReviewCard_module_css_default.summaryTitle,
									"data-plan-review-summary": true,
									children: summary.title
								}), summary.description !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: PlanReviewCard_module_css_default.summaryText,
									children: summary.description
								})]
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: PlanReviewCard_module_css_default.footer,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: PlanReviewCard_module_css_default.feedback,
									role: "status",
									children: action.error ?? notice
								}),
								decline !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: PlanReviewCard_module_css_default.feedbackRow,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										className: PlanReviewCard_module_css_default.feedbackInput,
										type: "text",
										value: feedback,
										disabled: busy || blocked,
										placeholder: t("plan.feedbackPlaceholder"),
										"aria-label": t("plan.feedback"),
										onChange: (event) => {
											setFeedback(event.target.value);
										},
										onPointerDown: (event) => {
											event.stopPropagation();
										}
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: PlanReviewCard_module_css_default.bar,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: PlanReviewCard_module_css_default.actions,
										children: [
											error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												variant: "ghost",
												className: PlanReviewCard_module_css_default.recover,
												onClick: recover,
												children: t("action.reload")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												variant: "ghost",
												className: PlanReviewCard_module_css_default.discuss,
												icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutlineRegular, { size: 14 }),
												disabled: busy,
												onClick: () => {
													settle(async () => {
														await commitDraftThen(async () => {
															await discussPlan(cancelTurn, matched.sessionId, () => respondDismiss(matched, t("plan.cancelRejected"), t("plan.dismissUnsupported")));
														});
													}, true);
												},
												children: t("plan.discuss")
											}),
											decline !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												variant: "outline",
												className: PlanReviewCard_module_css_default.keep,
												disabled: busy || blocked,
												title: decline.description ?? t("plan.keep"),
												onClick: () => {
													settle(() => commitDraftThen(() => respondAnswer(matched, review.id, decline.label, t("plan.responseRejected"), false, feedback.trim())));
												},
												children: t("plan.keep")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												variant: "outline",
												className: PlanReviewCard_module_css_default.goalRun,
												disabled: action.approveDisabled || goalReason !== void 0,
												...goalReason === void 0 ? {} : { title: goalReason },
												onClick: onRunAsGoal,
												children: t("plan.goalRun")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												variant: "primary",
												className: PlanReviewCard_module_css_default.approve,
												disabled: action.approveDisabled,
												onClick: onApprove,
												children: t("plan.approve")
											})
										]
									})
								})
							]
						})
					]
				})
			});
		}
		//#endregion
		//#region src/client/picker/PickerSeatBoundary.tsx
		function PickerSeatBoundary({ children, errorLabel }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RetryBoundary, {
				logLabel: "dsh-model-switch: composer picker seat crashed",
				renderFallback: (message, retry) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					"data-dsh-ms-seat-error": true,
					title: message,
					onClick: retry,
					style: {
						maxWidth: 280,
						border: 0,
						background: "transparent",
						color: "var(--dsw-alias-state-error-primary)",
						font: "var(--dsw-font-xs-13)",
						overflowWrap: "anywhere",
						cursor: "pointer"
					},
					children: errorLabel(message)
				}),
				children
			});
		}
		//#endregion
		//#region src/client/picker/locales.ts
		/** `composer-picker` namespace dictionaries. */
		const zh = {
			"trigger.fallback": "选择模型",
			"trigger.selectAria": "选择模型",
			"trigger.aria": "选择模型，当前 {model}",
			"trigger.ariaEffort": "选择模型，当前 {model}，推理等级 {effort}",
			"menu.aria": "模型档位",
			"menu.back": "返回模型设置",
			"menu.closeSearch": "关闭搜索",
			"menu.model": "模型",
			"menu.effort": "推理等级",
			"menu.context": "上下文",
			"menu.fast": "Fast",
			"menu.thinking": "思考",
			"menu.search": "搜索模型",
			"context.standard": "标准",
			"fast.on": "开",
			"fast.off": "关",
			"thinking.on": "开",
			"thinking.off": "关",
			"effort.providerDefault": "Default",
			"status.loading": "正在刷新模型列表…",
			"error.action": "模型操作失败：{message}",
			"error.picker": "模型选择器出错：{message}（点击重试）",
			"action.reload": "重新加载",
			"retry": "重试",
			"warning.groupLoad": "{name} 加载失败：{message}",
			"empty.models": "没有可用的模型。",
			"empty.efforts": "当前模型未提供推理等级。",
			"lock.readFailed": "提供方锁定状态读取失败，模型选项可能不是最新。",
			"choice.unavailable": "目录没有这个组合",
			"plan.kicker": "Plan",
			"plan.header": "计划待审",
			"plan.openFull": "查看完整计划",
			"plan.execution": "执行模型",
			"plan.approve": "确认执行",
			"plan.keep": "拒绝",
			"plan.discuss": "去聊天里说",
			"plan.modelFailed": "切换执行模型失败；计划尚未批准，可以重试。",
			"plan.pickerCrash": "执行模型选择器出错：{message}",
			"plan.feedback": "拒绝时的反馈",
			"plan.feedbackPlaceholder": "说明要改什么（可留空）",
			"plan.dismissUnsupported": "当前 DSH 版本既未提供 PendingQuestion.dismiss() 也未提供 cancel()，无法回到聊天；请直接在输入框里发送你的意见。",
			"plan.goalRun": "设置为目标并执行",
			"plan.goalFailed": "设置目标失败：{message}",
			"plan.goalReplaced": "已替换本会话原有的目标",
			"plan.goalUnsupported": "当前部署未挂载 goal 服务，无法把计划设为目标",
			"plan.responseRejected": "计划答复已被另一客户端处理；已提交的模型切换无法由插件回滚。",
			"plan.cancelRejected": "计划审查已被另一客户端处理，无法返回讨论。",
			"markdown.copy": "复制代码",
			"markdown.copied": "已复制",
			"markdown.footnotes": "脚注"
		};
		const en = {
			"trigger.fallback": "Select model",
			"trigger.selectAria": "Select model",
			"trigger.aria": "Select model, current {model}",
			"trigger.ariaEffort": "Select model, current {model}, reasoning effort {effort}",
			"menu.aria": "Model options",
			"menu.back": "Back to model settings",
			"menu.closeSearch": "Close search",
			"menu.model": "Model",
			"menu.effort": "Effort",
			"menu.context": "Context",
			"menu.fast": "Fast",
			"menu.thinking": "Thinking",
			"menu.search": "Search models",
			"context.standard": "Standard",
			"fast.on": "On",
			"fast.off": "Off",
			"thinking.on": "On",
			"thinking.off": "Off",
			"effort.providerDefault": "Default",
			"status.loading": "Refreshing model list…",
			"error.action": "Model operation failed: {message}",
			"error.picker": "Model picker error: {message} (click to retry)",
			"action.reload": "Reload",
			"retry": "Retry",
			"warning.groupLoad": "{name} failed to load: {message}",
			"empty.models": "No models available.",
			"empty.efforts": "This model provides no reasoning effort levels.",
			"lock.readFailed": "Provider lock read failed; model choices may be stale.",
			"choice.unavailable": "This combination is not in the catalog",
			"plan.kicker": "Plan",
			"plan.header": "Plan review",
			"plan.openFull": "View full plan",
			"plan.execution": "Execution model",
			"plan.approve": "Approve",
			"plan.keep": "Keep planning",
			"plan.discuss": "Discuss",
			"plan.modelFailed": "Could not switch the execution model; the Plan is still pending and can be retried.",
			"plan.pickerCrash": "Execution model picker error: {message}",
			"plan.feedback": "Feedback when declining",
			"plan.feedbackPlaceholder": "Say what to change (optional)",
			"plan.dismissUnsupported": "This DSH Host exposes neither PendingQuestion.dismiss() nor cancel(), so the review cannot return to chat; send your feedback as a message instead.",
			"plan.goalRun": "Set as goal and run",
			"plan.goalFailed": "Could not set the goal: {message}",
			"plan.goalReplaced": "Replaced this session's previous goal",
			"plan.goalUnsupported": "This deployment mounts no goal service, so the Plan cannot be set as a goal",
			"plan.responseRejected": "Another client already handled this Plan response. A committed model change cannot be rolled back by this plugin.",
			"plan.cancelRejected": "Another client already handled this Plan review, so it cannot return to discussion.",
			"markdown.copy": "Copy code",
			"markdown.copied": "Copied",
			"markdown.footnotes": "Footnotes"
		};
		//#endregion
		//#region src/client/picker/install.tsx
		const NS = "composer-picker";
		const MODEL_PRIORITY = -10;
		const PLAN_REVIEW_PRIORITY = -5;
		function interactionOperationsFrom(ctx) {
			let value;
			try {
				value = ctx.get("interactionOperations", false);
			} catch {
				return;
			}
			if (value === null || typeof value !== "object") return void 0;
			const candidate = value;
			return typeof candidate.registerSurface === "function" ? candidate : void 0;
		}
		const EMPTY_ORDER = [];
		/**
		* Resolve the released goal remote without hard-depending on it.
		*
		* `remote.goals` exists only when the deployment mounts `@deepseek-ai/dsh-goal`,
		* so the capability must be looked up per render rather than injected: an
		* `inject` on a dotted service name would otherwise block this whole client
		* plugin on a deployment that does not mount the goal package. The dotted name
		* is read first, with the namespace object as the fallback shape.
		* @param ctx - client root context holding the remote namespace.
		* @returns The goal remote, or undefined when no goal service is mounted.
		*/
		function goalRemoteFrom(ctx) {
			const read = (name) => {
				try {
					return ctx.get(name, false);
				} catch {
					return;
				}
			};
			const nested = read("remote.goals");
			if (nested !== void 0 && nested !== null) return nested;
			return read("remote")?.goals;
		}
		/**
		* Bind the optional Providers entry order as a React external store.
		* @returns A subscribable order snapshot with an invalidation hook for directory changes.
		*/
		function providerOrderStore(form) {
			const listeners = /* @__PURE__ */ new Set();
			let last = EMPTY_ORDER;
			return {
				subscribe: (listener) => {
					listeners.add(listener);
					const stop = form.subscribe(listener);
					return () => {
						listeners.delete(listener);
						stop();
					};
				},
				getSnapshot: () => {
					const next = form.getSnapshot().value?.order ?? EMPTY_ORDER;
					if (next.length !== last.length || next.some((key, index) => key !== last[index])) last = [...next];
					return last;
				},
				invalidate: () => {
					last = [...last];
					for (const listener of listeners) listener();
				}
			};
		}
		function readSessionState(sessions, sessionId) {
			if (sessions === null || typeof sessions !== "object") return void 0;
			const get = sessions.get;
			if (typeof get !== "function") return void 0;
			try {
				const snapshot = get.call(sessions, sessionId)?.getSnapshot?.();
				if (snapshot === void 0) return void 0;
				return {
					...typeof snapshot.blank === "boolean" ? { blank: snapshot.blank } : {},
					active: snapshot.running === true || snapshot.awaitingFirstTurn === true || (snapshot.pendingSubmissions?.length ?? 0) > 0
				};
			} catch {
				return {
					blank: false,
					active: true
				};
			}
		}
		function ModelSeat(props) {
			const directory = props.useDirectory((snapshot) => snapshot);
			const order = props.useProviderOrder((value) => value);
			const lock = (0, react.useSyncExternalStore)(props.providerLockStore.subscribe, props.providerLockStore.getSnapshot);
			const phase = props.useInput((input) => input.phase);
			const blank = props.useSession((session) => session.blank);
			const active = props.useSession((session) => session.running || session.awaitingFirstTurn) || phase === "submitting";
			(0, react.useEffect)(() => {
				props.refreshProviderLock();
			}, [
				props.refreshProviderLock,
				phase,
				active,
				directory,
				order
			]);
			const providerLock = effectiveProviderLock(lock, directory.current?.provider, active, isAgentRole(props.roleOf?.(directory.current?.provider ?? "")));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [lock.failed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProviderLockHint, { t: props.t }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ComposerPicker, {
				locked: props.locked || lock.failed && directory.current === null,
				providerLock,
				agentLocked: agentProviderLocked(blank, providerLock, active),
				...props.roleOf === void 0 ? {} : { roleOf: props.roleOf },
				available: props.available,
				directory: pickerDirectoryViewOrdered(directory, props, order, props.catalogRoutes?.() ?? {}),
				t: props.t,
				...props.resolveInteractionOperations === void 0 ? {} : { resolveInteractionOperations: props.resolveInteractionOperations }
			})] });
		}
		function ModelSeatEntry(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PickerSeatBoundary, {
				errorLabel: (message) => props.t("error.picker", { message }),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModelSeat, { ...props })
			});
		}
		/** Register composer model picker and Plan Review execution picker. */
		function installComposerPicker(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-model-switch: composer picker dictionaries");
			ctx.inject([
				"slots",
				"modelDirectories",
				"configForms"
			], (scope) => {
				const models = scope.modelDirectories;
				const sessions = scope.sessions;
				let directoryService;
				const orderStore = providerOrderStore(scope.configForms.get(PROVIDERS_CONFIG_ID));
				scope.inject(["providerDirectory"], (directoryScope) => {
					const directory = directoryScope.get("providerDirectory", false);
					if (directory === void 0 || typeof directory.subscribe !== "function") return;
					directoryService = directory;
					orderStore.invalidate();
					directoryScope.effect(() => directory.subscribe(orderStore.invalidate));
					directoryScope.effect(() => () => {
						if (directoryService === directory) directoryService = void 0;
						orderStore.invalidate();
					});
				});
				const resolveInteractionOperations = () => interactionOperationsFrom(scope);
				const planPreview = createPlanPreviewBinding(scope.slots);
				const rpcOf = () => {
					return scope.get("connection", false)?.rpc;
				};
				/**
				* Cancel the session's running turn through the official Stop seam.
				*
				* The discuss action interrupts instead of merely withdrawing the pending
				* question: an aborted turn is kept expanded by the transcript, so the work
				* details the human was reading never fold. The conversation service is
				* addressed through the session scope exactly like the official composer's
				* Stop button does.
				*/
				const cancelTurn = async (sessionId) => {
					const conversation = (sessions?.scope?.(sessionId))?.get?.("conversation");
					if (typeof conversation?.cancel !== "function") throw new Error("model-switch: the conversation service exposes no cancel() through the session scope");
					await conversation.cancel();
				};
				const directoryFace = (sessionId) => {
					const directory = models.directoryFor(sessionId);
					const available = sessions?.subagentAddress?.(sessionId) === void 0;
					const readLock = async (previous) => {
						const result = await fetchSessionBinding(rpcOf(), sessionId, readNativeBindings(directoryService));
						return result.failed ? {
							provider: result.provider ?? previous.provider,
							failed: true
						} : result;
					};
					const roleOf = (key) => readProviderRole(directoryService, key);
					const providerLockStore = createProviderLockStore(readLock);
					return {
						available,
						roleOf,
						catalogRoutes: () => readCatalogRoutes(directoryService),
						providerLockStore,
						refreshProviderLock: () => {
							providerLockStore.refresh();
						},
						goalRemote: () => goalRemoteFrom(scope),
						planPreview,
						cancelTurn,
						hooks: {
							directory: directory.store,
							providerOrder: orderStore
						},
						getDirectorySnapshot: directory.store.getSnapshot,
						resolveInteractionOperations,
						load: () => {
							if (available) directory.load().catch(() => {});
						},
						select: async (selection) => {
							if (!available) return { committed: false };
							const state = await providerLockStore.refresh();
							const currentProvider = directory.store.getSnapshot().current?.provider;
							if (!isProviderAllowed(state, selection.provider, currentProvider, {
								...readSessionState(sessions, sessionId),
								agent: isAgentRole(roleOf(selection.provider)),
								currentAgent: currentProvider !== void 0 && isAgentRole(roleOf(currentProvider))
							})) return { committed: false };
							let result;
							try {
								result = await directory.select(selection);
							} catch {
								return { committed: false };
							}
							if (!result.ok) return { committed: false };
							return { committed: true };
						}
					};
				};
				scope.slots.inject("conversation.input.model", () => scope.slots.register({
					name: "conversation.input.model",
					locale: NS,
					priority: MODEL_PRIORITY,
					inject: directoryFace
				}, ModelSeatEntry));
				scope.slots.inject("conversation.composer", () => scope.slots.register({
					name: "conversation.composer",
					locale: NS,
					priority: PLAN_REVIEW_PRIORITY,
					select: (owner) => selectPlanReview(owner),
					inject: directoryFace
				}, PlanReviewCard));
			});
		}
		/**
		* Save one provider group through the revision fence, retrying a refusal.
		*
		* Every attempt re-reads the form snapshot: another card, another window, or
		* the runtime's own capture write can move the fence between the read and the
		* write, and a refused write must cost one retry instead of a lost save. The
		* whole update therefore lands as one atomic `set`/`unset` op under the
		* revision that was actually read.
		* @param form - the settings form the provider groups live in.
		* @param provider - provider key whose group is being edited.
		* @param group - replacement group, or undefined to drop the provider's group.
		* @returns nothing; rejects with `settings-rejected` after every attempt is refused.
		*/
		async function saveProviderGroupFenced(form, provider, group) {
			for (let attempt = 0; attempt < 3; attempt += 1) {
				const snapshot = form.getSnapshot();
				const current = snapshot.value?.providerGroups;
				const next = withProviderGroup(current, provider, group);
				if (next.length === 0) {
					if (current === void 0) return;
					if (await form.mutate([{
						op: "unset",
						path: ["providerGroups"]
					}], snapshot.revision)) return;
					continue;
				}
				if (await form.mutate([{
					op: "set",
					path: ["providerGroups"],
					value: next
				}], snapshot.revision)) return;
			}
			throw new Error("settings-rejected");
		}
		//#endregion
		//#region src/client/nav-icon.ts
		/** Official settings.section has no icon field. Swap the default gear for a model-switch glyph. */
		const LABELS = /* @__PURE__ */ new Set(["Model Switch", "模型切换"]);
		const MARK = "data-dsh-ms-icon";
		const GLYPH = [
			"<g data-dsh-ms-glyph=\"switch\">",
			"<path d=\"M3 5.5h7.2\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linecap=\"round\"/>",
			"<path d=\"M10.2 5.5 8.4 3.7M10.2 5.5 8.4 7.3\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>",
			"<path d=\"M13 10.5H5.8\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linecap=\"round\"/>",
			"<path d=\"M5.8 10.5 7.6 8.7M5.8 10.5 7.6 12.3\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>",
			"</g>"
		].join("");
		function patch() {
			for (const button of Array.from(document.querySelectorAll("nav button"))) {
				if (Array.from(button.querySelectorAll("span")).find((span) => LABELS.has(span.textContent?.trim() ?? "")) === void 0) continue;
				const svg = button.querySelector("svg");
				if (svg === null) continue;
				if (svg.getAttribute(MARK) === "switch" && svg.innerHTML.includes("data-dsh-ms-glyph=\"switch\"")) continue;
				svg.setAttribute(MARK, "switch");
				svg.setAttribute("viewBox", "0 0 16 16");
				svg.setAttribute("fill", "none");
				svg.innerHTML = GLYPH;
			}
		}
		function touchesSettingsNav(node) {
			if (!(node instanceof Element)) return false;
			if (node.closest("nav") !== null || node.querySelector("nav") !== null) return true;
			const buttons = node.matches("button") ? [node, ...Array.from(node.querySelectorAll("button"))] : Array.from(node.querySelectorAll("button"));
			for (const button of buttons) for (const span of Array.from(button.querySelectorAll("span"))) if (LABELS.has(span.textContent?.trim() ?? "")) return true;
			return false;
		}
		/** Keep the Model Switch nav glyph in place across Settings re-renders. */
		function installModelSwitchNavIcon() {
			if (typeof document === "undefined" || document.body === null) return () => {};
			let frame = 0;
			const observer = new MutationObserver((records) => {
				if (!records.some((record) => touchesSettingsNav(record.target) || Array.from(record.addedNodes).some(touchesSettingsNav))) return;
				if (frame !== 0) return;
				frame = requestAnimationFrame(() => {
					frame = 0;
					patch();
					observer.takeRecords();
				});
			});
			observer.observe(document.body, {
				childList: true,
				subtree: true
			});
			patch();
			observer.takeRecords();
			return () => {
				observer.disconnect();
				if (frame !== 0) cancelAnimationFrame(frame);
			};
		}
		//#endregion
		//#region src/client/index.tsx
		const name = "dsh-model-switch-client";
		const inject = [
			"slots",
			"locale",
			"sessions",
			"modelDirectories",
			"configForms",
			"remote",
			"remote.session"
		];
		function apply(ctx) {
			installComposerPicker(ctx);
			ctx.effect(installModelSwitchNavIcon, "dsh-model-switch: settings nav icon");
			const localeNamespace = "settings.model-switch";
			ctx.effect(() => ctx.locale.register(localeNamespace, {
				zh: zh$1,
				en: en$1
			}), "dsh-model-switch: localized Settings section");
			const t = ctx.locale.bind(localeNamespace);
			const remote = ctx.remote;
			const owned = ctx.configForms.get(MODEL_SWITCH_CONFIG_ID);
			const subagent = deriveConfigForm(owned, deriveSubagentSettings, SUBAGENT_SETTINGS_FIELDS);
			const search = deriveConfigForm(owned, deriveSearchSettings, SEARCH_SETTINGS_FIELDS);
			const image = deriveConfigForm(owned, deriveImageSettings, IMAGE_SETTINGS_FIELDS);
			const autoReview = deriveConfigForm(owned, deriveAutoReviewSettings, AUTO_REVIEW_SETTINGS_FIELDS);
			const compaction = deriveConfigForm(owned, deriveCompactionSettings, COMPACTION_SETTINGS_FIELDS);
			const sessionTitle = deriveConfigForm(owned, deriveTitleSettings, TITLE_SETTINGS_FIELDS);
			const memory = deriveConfigForm(owned, deriveMemorySettings, MEMORY_SETTINGS_FIELDS);
			const connectionRpc = (() => {
				try {
					const rpc = ctx.get("connection", false)?.rpc;
					return rpc !== void 0 && typeof rpc.call === "function" ? rpc : void 0;
				} catch {
					return;
				}
			})();
			const orderStore = providerOrderStore(ctx.configForms.get(PROVIDERS_CONFIG_ID));
			let directory;
			ctx.inject(["providerDirectory"], (scope) => {
				const current = scope.get("providerDirectory", false);
				if (current === void 0 || typeof current.subscribe !== "function") return;
				directory = current;
				orderStore.invalidate();
				scope.effect(() => current.subscribe(orderStore.invalidate));
				scope.effect(() => () => {
					if (directory === current) directory = void 0;
					orderStore.invalidate();
				});
			});
			const providerRoleOf = (key) => readProviderRole(directory, key) ?? "llm";
			const subscribeProviderOrder = orderStore.subscribe;
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "model-switch",
				order: 9,
				label: () => t("nav"),
				locale: localeNamespace,
				inject: () => ({
					t,
					hooks: {
						subagentSettings: subagent,
						searchSettings: search,
						imageSettings: image,
						autoReviewSettings: autoReview,
						compactionSettings: compaction,
						titleSettings: sessionTitle,
						memorySettings: memory,
						switchSettings: owned
					},
					capabilities: RUNTIME_CAPABILITIES,
					saveSubagent: (ops) => subagent.mutate(ops),
					saveCapability: (route, ops) => {
						return (route === "search" ? search : route === "image" ? image : route === "compaction" ? compaction : route === "title" ? sessionTitle : route === "memory" ? memory : autoReview).mutate(ops);
					},
					saveReviewAllowlist: async ({ enabled, tools }) => {
						if (!await owned.mutate([{
							op: "set",
							path: ["autoReviewSkipReadOnly"],
							value: enabled
						}, {
							op: "set",
							path: ["autoReviewAllowlist"],
							value: [...tools]
						}])) throw new Error("settings-rejected");
					},
					saveReviewTimeout: async (value) => {
						if (!await owned.mutate([value === void 0 ? {
							op: "unset",
							path: ["autoReviewTimeoutMs"]
						} : {
							op: "set",
							path: ["autoReviewTimeoutMs"],
							value
						}])) throw new Error("settings-rejected");
					},
					...connectionRpc === void 0 ? {} : { scanTools: async () => {
						const response = await callPluginRpc(connectionRpc, "plugin-rpc/model-switch", "tools", {});
						if (!response.ok || response.value === void 0) throw new Error(t("reviewAllowlistScanFailed"));
						const rows = decodeToolCatalog(response.value);
						if (rows === void 0) throw new Error(t("reviewAllowlistScanFailed"));
						const status = decodeReviewStatus(response.value);
						return status === void 0 ? { rows } : {
							rows,
							status
						};
					} },
					saveProviderGroup: async (provider, group) => {
						await saveProviderGroupFenced(owned, provider, group);
					},
					providerRoleOf,
					loadCatalog: async () => {
						const response = await remote.session.modelCatalog();
						if (!response.ok || response.value === void 0) throw new Error(t("catalogFailed"));
						const enabled = await fetchAntigravityCatalogGroups(connectionRpc);
						const order = orderStore.getSnapshot();
						return sortCatalogGroupsWithRoutes(withAntigravityCatalog(response.value.groups, enabled), order, readCatalogRoutes(directory));
					},
					...connectionRpc === void 0 ? {} : { loadCapabilities: async (revision, signal) => {
						const rpc = connectionRpc;
						if (rpc === void 0) throw new Error(t("catalogFailed"));
						const response = await callPluginRpc(rpc, "plugin-rpc/model-switch", "capabilities", revision === void 0 ? {} : { revision }, signal);
						if (!response.ok || response.value === void 0) throw new Error(t("catalogFailed"));
						const snapshot = decodeCapabilitiesSnapshot(response.value);
						if (snapshot === void 0) throw new Error(t("catalogFailed"));
						return snapshot;
					} },
					subscribeProviderOrder
				})
			}, ModelSwitchSettings));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});
