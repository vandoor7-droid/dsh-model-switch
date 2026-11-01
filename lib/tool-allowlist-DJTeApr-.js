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
		id: "dsh-prime-memory",
		kind: "plugin",
		label: "插件 · dsh-prime-memory",
		repo: "https://github.com/drscrewdriver/dsh-prime-memory"
	},
	{
		id: "dsh-embedded-browser",
		kind: "plugin",
		label: "插件 · dsh-embedded-browser",
		repo: "https://github.com/imroc/dsh-embedded-browser"
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
	"conversation_search",
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
	["browser_embedded_", "dsh-embedded-browser"],
	["ops_", "dsh-ops"]
];
/**
* Single plugin tools that carry no usable prefix.
*
* `memory_` is shared by two installed plugins with disjoint names, so it cannot
* be a prefix rule: the calibration below names each tool explicitly.
*/
const PLUGIN_TOOLS = /* @__PURE__ */ new Map([
	["generate_image", "dsh-model-switch"],
	["memory_add", "dsh-prime-memory"],
	["memory_conflicts", "dsh-prime-memory"],
	["memory_conflicts_rejected", "dsh-prime-memory"],
	["memory_delete", "dsh-prime-memory"],
	["memory_expand_graph_node", "dsh-prime-memory"],
	["memory_import", "dsh-prime-memory"],
	["memory_migrate_relation", "dsh-prime-memory"],
	["memory_read_scene", "dsh-prime-memory"],
	["memory_receipts", "dsh-prime-memory"],
	["memory_reproject", "dsh-prime-memory"],
	["memory_resolve_conflict", "dsh-prime-memory"],
	["memory_room_admin", "dsh-prime-memory"],
	["memory_room_review", "dsh-prime-memory"],
	["memory_ruminate", "dsh-prime-memory"],
	["memory_ruminate_cancel", "dsh-prime-memory"],
	["memory_ruminate_status", "dsh-prime-memory"],
	["memory_search", "dsh-prime-memory"],
	["memory_search_graph", "dsh-prime-memory"],
	["memory_skill_archive", "dsh-prime-memory"],
	["memory_skill_list", "dsh-prime-memory"],
	["memory_skill_pin", "dsh-prime-memory"],
	["memory_skill_read", "dsh-prime-memory"],
	["memory_slot_close", "dsh-prime-memory"],
	["memory_slot_list", "dsh-prime-memory"],
	["memory_slot_write", "dsh-prime-memory"],
	["memory_update", "dsh-prime-memory"],
	["memory_context", "dsh-auto-memory"],
	["memory_delete_all", "dsh-auto-memory"],
	["memory_list", "dsh-auto-memory"],
	["memory_prune", "dsh-auto-memory"],
	["memory_read", "dsh-auto-memory"],
	["memory_write", "dsh-auto-memory"]
]);
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
	"memory_search",
	"memory_search_graph",
	"memory_expand_graph_node",
	"memory_read_scene",
	"memory_skill_list",
	"memory_skill_read",
	"memory_slot_list",
	"memory_receipts",
	"memory_conflicts",
	"memory_conflicts_rejected",
	"memory_ruminate_status",
	"ops_glob",
	"ops_grep",
	"ops_inspect_local_file",
	"ops_read_docx",
	"ops_diff",
	"ops_result",
	"bcdp_captcha",
	"bcdp_page_info",
	"bcdp_read_element",
	"bcdp_screenshot",
	"browser_embedded_status",
	"browser_embedded_snapshot",
	"browser_embedded_screenshot",
	"browser_embedded_ask_human",
	"conversation_search",
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
export { isAllowedByList as n, resolveToolSource as r, DEFAULT_READ_ONLY_TOOLS as t };
