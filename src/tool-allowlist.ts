/**
 * The pure-read tool allowlist for the Auto reviewer.
 *
 * DSH's official Auto gate reviews **every** tool call with the model unless the
 * session is off the `auto` preset, so a `read` or `grep` costs a reviewer round
 * trip. This module owns the data behind skipping that review: which tool names
 * are safe to run unreviewed, how a name maps back to the plugin/MCP that
 * provides it, and the pattern syntax that keeps a re-named MCP/extension tool
 * covered without editing the list.
 *
 * Everything here is pure: no `ctx`, no filesystem, no settings. The caller
 * decides when the list applies (see `./auto-review.ts`), which keeps the rules
 * testable without a Host.
 *
 * @module dsh-model-switch/tool-allowlist
 */

/**
 * Where one tool comes from.
 *
 * - `core`: a released `@deepseek-ai/dsh-*` package (ships with the Host).
 * - `plugin`: a profile plugin that registers model tools.
 * - `mcp`: a tool bridged from an MCP server (`mcp__<server>__<tool>`).
 * - `extension`: a `<tool>__<name>` tool contributed through an extension
 *   directory — the suffix is the *owner's* name (a QQ bot persona), not a
 *   fixed string, which is why the defaults use a pattern.
 * - `unknown`: not in this module's calibrated catalog.
 */
export type ToolSourceKind = 'core' | 'plugin' | 'mcp' | 'extension' | 'unknown'

/** One resolved tool origin, ready to render next to a tool name. */
export interface ToolSource {
  readonly kind: ToolSourceKind
  /** Short human label, e.g. `插件 · dsh-ops` or `MCP · wincu`. */
  readonly label: string
  /** Repository for the providing package, when known. */
  readonly repo?: string
  /** Package / server / owner name, when known. */
  readonly owner?: string
}

/** One catalogued origin: the single source of truth for labels and repos. */
export interface SourceCatalogEntry {
  readonly id: string
  readonly kind: Exclude<ToolSourceKind, 'unknown'>
  readonly label: string
  readonly repo: string
}

/**
 * Every origin this allowlist ships defaults for.
 *
 * The release notes render this same table, so a new default entry cannot be
 * added without naming the package and its repository.
 */
export const SOURCE_CATALOG: readonly SourceCatalogEntry[] = [
  {
    id: 'core',
    kind: 'core',
    label: 'DSH 核心',
    repo: 'https://github.com/deepseek-ai/deepseek-harness',
  },
  {
    id: 'dsh-ops',
    kind: 'plugin',
    label: '插件 · dsh-ops',
    repo: 'https://github.com/T-Auto/dsh-ops',
  },
  {
    id: 'dsh-browser-cdp',
    kind: 'plugin',
    label: '插件 · dsh-browser-cdp',
    repo: 'https://github.com/drscrewdriver/dsh-browser-cdp',
  },
  {
    id: 'dsh-auto-memory',
    kind: 'plugin',
    label: '插件 · dsh-auto-memory',
    repo: 'https://github.com/AskTheWay/dsh-auto-memory',
  },
  {
    id: 'dsh-model-switch',
    kind: 'plugin',
    label: '插件 · dsh-model-switch',
    repo: 'https://github.com/vandoor7-droid/dsh-model-switch',
  },
  {
    id: 'dsh-prime-memory',
    kind: 'plugin',
    label: '插件 · dsh-prime-memory',
    repo: 'https://github.com/drscrewdriver/dsh-prime-memory',
  },
  {
    id: 'dsh-embedded-browser',
    kind: 'plugin',
    label: '插件 · dsh-embedded-browser',
    repo: 'https://github.com/imroc/dsh-embedded-browser',
  },
  {
    id: 'mcp:wincu',
    kind: 'mcp',
    label: 'MCP · wincu（dsh-computer-use-win）',
    repo: 'https://github.com/Yu-tao-Li/dsh-computer-use-win',
  },
  {
    id: 'qqbot-extension',
    kind: 'extension',
    label: 'QQ 机器人扩展（框架 @zaofan/dsh-qqbot）',
    repo: 'https://github.com/zaofan-make/dsh-qqbot',
  },
]

/** Catalog lookup by id. */
export const SOURCE_BY_ID: ReadonlyMap<string, SourceCatalogEntry> = new Map(
  SOURCE_CATALOG.map(entry => [entry.id, entry]),
)

/**
 * Tool names the released Host owns, calibrated against dsh 0.2.1-rc.2.
 *
 * A name outside the catalog would otherwise be reported as core, which is the
 * one guess a reader could act on wrongly; it resolves to `unknown` instead.
 */
const CORE_TOOLS: ReadonlySet<string> = new Set([
  'ask_user_question', 'conversation_search', 'create_goal', 'create_skill', 'create_worktree', 'edit',
  'exit_plan_mode', 'get_goal', 'glob', 'grep', 'interrupt_agent', 'job_kill',
  'job_list', 'job_output', 'list_agents', 'list_mcp_resource_templates',
  'list_mcp_resources', 'load_workspace_dependencies', 'present', 'pwsh', 'ralph',
  'read', 'read_image', 'read_mcp_resource', 'schedule_create', 'schedule_delete',
  'schedule_list', 'schedule_update', 'send_message', 'session_event_read',
  'session_event_search', 'session_event_trace', 'session_search', 'session_trace',
  'sidebar_open', 'skill', 'spawn_teammate', 'subagent', 'subagent_fork',
  'team_task_create', 'team_task_get', 'team_task_list', 'team_task_update',
  'terminal_close', 'terminal_list', 'terminal_open', 'terminal_read',
  'terminal_send', 'terminal_signal', 'todo_write', 'update_goal', 'wait_agent',
  'web_fetch', 'web_search', 'web_search_pro', 'workflow', 'working_directory',
  'write',
])

/** MCP server name → catalog id, for the servers this allowlist knows. */
const MCP_SERVERS: ReadonlyMap<string, string> = new Map([['wincu', 'mcp:wincu']])

/** Plugin identity by tool-name prefix (checked before the core catalog). */
const PLUGIN_PREFIXES: readonly (readonly [string, string])[] = [
  ['bcdp_', 'dsh-browser-cdp'],
  ['browser_window_', 'dsh-browser-cdp'],
  ['browser_embedded_', 'dsh-embedded-browser'],
  ['ops_', 'dsh-ops'],
]

/**
 * Single plugin tools that carry no usable prefix.
 *
 * `memory_` is shared by two installed plugins with disjoint names, so it cannot
 * be a prefix rule: the calibration below names each tool explicitly.
 */
const PLUGIN_TOOLS: ReadonlyMap<string, string> = new Map([
  ['generate_image', 'dsh-model-switch'],
  // dsh-prime-memory (0.26.16): L1/L2/L3 memory, graph and room tools.
  ['memory_add', 'dsh-prime-memory'],
  ['memory_conflicts', 'dsh-prime-memory'],
  ['memory_conflicts_rejected', 'dsh-prime-memory'],
  ['memory_delete', 'dsh-prime-memory'],
  ['memory_expand_graph_node', 'dsh-prime-memory'],
  ['memory_import', 'dsh-prime-memory'],
  ['memory_migrate_relation', 'dsh-prime-memory'],
  ['memory_read_scene', 'dsh-prime-memory'],
  ['memory_receipts', 'dsh-prime-memory'],
  ['memory_reproject', 'dsh-prime-memory'],
  ['memory_resolve_conflict', 'dsh-prime-memory'],
  ['memory_room_admin', 'dsh-prime-memory'],
  ['memory_room_review', 'dsh-prime-memory'],
  ['memory_ruminate', 'dsh-prime-memory'],
  ['memory_ruminate_cancel', 'dsh-prime-memory'],
  ['memory_ruminate_status', 'dsh-prime-memory'],
  ['memory_search', 'dsh-prime-memory'],
  ['memory_search_graph', 'dsh-prime-memory'],
  ['memory_skill_archive', 'dsh-prime-memory'],
  ['memory_skill_list', 'dsh-prime-memory'],
  ['memory_skill_pin', 'dsh-prime-memory'],
  ['memory_skill_read', 'dsh-prime-memory'],
  ['memory_slot_close', 'dsh-prime-memory'],
  ['memory_slot_list', 'dsh-prime-memory'],
  ['memory_slot_write', 'dsh-prime-memory'],
  ['memory_update', 'dsh-prime-memory'],
  // dsh-auto-memory (1.0.0): the older flat memory list/read/write tools.
  ['memory_context', 'dsh-auto-memory'],
  ['memory_delete_all', 'dsh-auto-memory'],
  ['memory_list', 'dsh-auto-memory'],
  ['memory_prune', 'dsh-auto-memory'],
  ['memory_read', 'dsh-auto-memory'],
  ['memory_write', 'dsh-auto-memory'],
])

/** `<base>__<owner>` — the extension-tool naming the QQ bot framework uses. */
const EXTENSION_TOOL = /^([A-Za-z0-9_-]+)__(.+)$/

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
export const DEFAULT_READ_ONLY_TOOLS: readonly string[] = [
  // DSH core — filesystem and session reads.
  'read', 'grep', 'glob', 'read_image',
  // DSH core — skill loading (reads the skill's instructions, writes nothing).
  'skill',
  // DSH core — network reads.
  'web_search', 'web_search_pro', 'web_fetch',
  // DSH core — bundled dependency paths and versions (pure read).
  'load_workspace_dependencies',
  // DSH core — asking the human and presenting a deliverable card (no file effect).
  'ask_user_question', 'present',
  // DSH core — sidebar navigation (opens a file, folder or URL for the human).
  'sidebar_open',
  // DSH core — the plan gate: the human approves it, so a second reviewer adds nothing.
  'exit_plan_mode',
  // DSH core — background job / terminal output.
  'job_list', 'job_output', 'terminal_list', 'terminal_read',
  // DSH core — team and goal inspection.
  'list_agents', 'team_task_list', 'team_task_get', 'get_goal', 'schedule_list',
  // DSH core — coordination that only dispatches or waits; the callee keeps its own
  // preset, so its tool calls stay reviewed.
  'wait_agent', 'send_message', 'team_task_create',
  // DSH core — MCP resource inspection.
  'list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource',
  // DSH core — session-log forensics.
  'session_search', 'session_event_search', 'session_event_read',
  'session_event_trace', 'session_trace',
  // DSH core — released by explicit user decision (2026-10-24). These change
  // session state or open an execution surface, but everything they enable is
  // still reviewed: goal rounds and scheduled prompts keep the same auto preset,
  // and a terminal's commands go through the still-reviewed `terminal_send`.
  'create_goal', 'schedule_create', 'terminal_open',
  // dsh-ops.
  'ops_read_files', 'ops_discover_tools',
  // dsh-browser-cdp (inspection only; navigate/script/space/open/close stay reviewed).
  'bcdp_status', 'bcdp_help', 'bcdp_doctor', 'bcdp_snapshot', 'browser_window_status',
  // dsh-auto-memory (the write/delete/prune tools stay reviewed).
  'memory_list', 'memory_read',
  // dsh-prime-memory — reads and inspections only (add/update/delete/import,
  // graph mutations, room writes and ruminate stay reviewed).
  'memory_search', 'memory_search_graph', 'memory_expand_graph_node',
  'memory_read_scene', 'memory_skill_list', 'memory_skill_read',
  'memory_slot_list', 'memory_receipts', 'memory_conflicts',
  'memory_conflicts_rejected', 'memory_ruminate_status',
  // dsh-ops — file reads and diffs (bash/edit/move/remove/replace/batch stay reviewed).
  'ops_glob', 'ops_grep', 'ops_inspect_local_file', 'ops_read_docx',
  'ops_diff', 'ops_result',
  // dsh-browser-cdp — page inspection that does not touch the page.
  'bcdp_captcha', 'bcdp_page_info', 'bcdp_read_element', 'bcdp_screenshot',
  // dsh-embedded-browser — inspection only; open/click/type/press/scroll/close
  // stay reviewed.
  'browser_embedded_status', 'browser_embedded_snapshot',
  'browser_embedded_screenshot', 'browser_embedded_ask_human',
  // DSH core — conversation-history search, same class as `session_search`.
  'conversation_search',
  // MCP wincu = dsh-computer-use-win (inspection only; input/window tools stay reviewed).
  'mcp__wincu__windows_computer_use_accessibility_tree',
  'mcp__wincu__windows_computer_use_element_info',
  'mcp__wincu__windows_computer_use_find',
  'mcp__wincu__windows_computer_use_health',
  'mcp__wincu__windows_computer_use_list_windows',
  'mcp__wincu__windows_computer_use_ocr',
  'mcp__wincu__windows_computer_use_screenshot',
  'mcp__wincu__windows_computer_use_snapshot',
  'mcp__wincu__windows_computer_use_tools',
  'mcp__wincu__windows_computer_use_wait',
  'mcp__wincu__windows_computer_use_wait_for',
  // QQ bot extension — the suffix is the bot's own name, hence the pattern.
  'sessions_list__*', 'bing_search__*',
]

/** Why one allowlist entry was refused. */
export type AllowEntryProblem = 'empty' | 'bare-wildcard' | 'leading-wildcard'

/**
 * Validate one allowlist entry.
 *
 * `*` is a suffix wildcard: the entry must keep at least one literal leading
 * character, so a stray `*` can never turn the list into "allow everything".
 *
 * @param entry - the raw entry as typed in settings.
 * @returns `ok`, or the specific problem.
 */
export function validateAllowEntry(entry: string): 'ok' | AllowEntryProblem {
  const trimmed = entry.trim()
  if (trimmed === '') return 'empty'
  if (/^\*+$/.test(trimmed)) return 'bare-wildcard'
  if (trimmed.startsWith('*')) return 'leading-wildcard'
  return 'ok'
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
export function matchesAllowPattern(name: string, entry: string): boolean {
  if (name === '' || validateAllowEntry(entry) !== 'ok') return false
  const trimmed = entry.trim()
  const star = trimmed.indexOf('*')
  if (star === -1) return name === trimmed
  const prefix = trimmed.slice(0, star)
  const suffix = trimmed.slice(star + 1)
  if (!name.startsWith(prefix) || !name.endsWith(suffix)) return false
  return name.length >= prefix.length + suffix.length
}

/**
 * Whether a tool name is covered by an allowlist.
 * @param name - the tool name under review.
 * @param allowlist - configured entries, patterns included.
 * @returns true when at least one entry matches.
 */
export function isAllowedByList(name: string, allowlist: readonly string[]): boolean {
  return allowlist.some(entry => matchesAllowPattern(name, entry))
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
export function resolveToolSource(name: string): ToolSource {
  // Accept a pattern entry as-is: the editor shows patterns next to their source,
  // and a trailing `*` is a wildcard, not part of the name.
  const trimmed = name.trim().replace(/\*+$/, '')
  const mcp = /^mcp__([A-Za-z0-9_-]+)__/.exec(trimmed)
  if (mcp !== null) {
    const server = mcp[1] as string
    const entry = SOURCE_BY_ID.get(MCP_SERVERS.get(server) ?? '')
    if (entry !== undefined) return { kind: 'mcp', label: entry.label, repo: entry.repo, owner: server }
    return { kind: 'mcp', label: `MCP · ${server}`, owner: server }
  }
  const extension = EXTENSION_TOOL.exec(trimmed)
  if (extension !== null && !trimmed.startsWith('mcp__')) {
    const entry = SOURCE_BY_ID.get('qqbot-extension')
    const base = extension[1] as string
    const owner = extension[2] as string
    return {
      kind: 'extension',
      label: `扩展 · ${base}__${owner}`,
      ...(entry === undefined ? {} : { repo: entry.repo }),
      owner,
    }
  }
  // A pattern such as `sessions_list__*`: the owner name is the wildcard.
  if (trimmed.endsWith('__')) {
    const entry = SOURCE_BY_ID.get('qqbot-extension')
    const base = trimmed.slice(0, -2)
    return {
      kind: 'extension',
      label: `扩展 · ${base}__*`,
      ...(entry === undefined ? {} : { repo: entry.repo }),
      owner: '*',
    }
  }
  for (const [prefix, id] of PLUGIN_PREFIXES) {
    if (!trimmed.startsWith(prefix)) continue
    const entry = SOURCE_BY_ID.get(id)
    if (entry !== undefined) return { kind: 'plugin', label: entry.label, repo: entry.repo, owner: id }
  }
  const plugin = PLUGIN_TOOLS.get(trimmed)
  if (plugin !== undefined) {
    const entry = SOURCE_BY_ID.get(plugin)
    if (entry !== undefined) return { kind: 'plugin', label: entry.label, repo: entry.repo, owner: plugin }
  }
  if (CORE_TOOLS.has(trimmed)) {
    const entry = SOURCE_BY_ID.get('core')
    return {
      kind: 'core',
      label: entry?.label ?? 'DSH 核心',
      ...(entry === undefined ? {} : { repo: entry.repo }),
      owner: 'core',
    }
  }
  return { kind: 'unknown', label: '未知来源' }
}

/**
 * The `<tool>__<owner>` base names this deployment's extension directory ships.
 *
 * Used by the settings editor to explain what a pattern covers; it is not a
 * security boundary — the allowlist itself is.
 */
export const EXTENSION_TOOL_BASES: readonly string[] = ['bing_search', 'sessions_list']
