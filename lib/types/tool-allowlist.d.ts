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
export type ToolSourceKind = 'core' | 'plugin' | 'mcp' | 'extension' | 'unknown';
/** One resolved tool origin, ready to render next to a tool name. */
export interface ToolSource {
    readonly kind: ToolSourceKind;
    /** Short human label, e.g. `插件 · dsh-ops` or `MCP · wincu`. */
    readonly label: string;
    /** Repository for the providing package, when known. */
    readonly repo?: string;
    /** Package / server / owner name, when known. */
    readonly owner?: string;
}
/** One catalogued origin: the single source of truth for labels and repos. */
export interface SourceCatalogEntry {
    readonly id: string;
    readonly kind: Exclude<ToolSourceKind, 'unknown'>;
    readonly label: string;
    readonly repo: string;
}
/**
 * Every origin this allowlist ships defaults for.
 *
 * The release notes render this same table, so a new default entry cannot be
 * added without naming the package and its repository.
 */
export declare const SOURCE_CATALOG: readonly SourceCatalogEntry[];
/** Catalog lookup by id. */
export declare const SOURCE_BY_ID: ReadonlyMap<string, SourceCatalogEntry>;
/**
 * Default allowlist: every pure-read tool this deployment exposes, calibrated on
 * a live desktop profile (105 tools) at dsh 0.2.1-rc.2.
 *
 * Grouped by origin so a reader can trace each entry through {@link SOURCE_CATALOG}.
 * Entries ending in `*` are patterns: the QQ bot extension suffixes its tools with
 * the bot's own name, so `sessions_list__*` keeps working when the persona is
 * renamed.
 */
export declare const DEFAULT_READ_ONLY_TOOLS: readonly string[];
/** Why one allowlist entry was refused. */
export type AllowEntryProblem = 'empty' | 'bare-wildcard' | 'leading-wildcard';
/**
 * Validate one allowlist entry.
 *
 * `*` is a suffix wildcard: the entry must keep at least one literal leading
 * character, so a stray `*` can never turn the list into "allow everything".
 *
 * @param entry - the raw entry as typed in settings.
 * @returns `ok`, or the specific problem.
 */
export declare function validateAllowEntry(entry: string): 'ok' | AllowEntryProblem;
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
export declare function matchesAllowPattern(name: string, entry: string): boolean;
/**
 * Whether a tool name is covered by an allowlist.
 * @param name - the tool name under review.
 * @param allowlist - configured entries, patterns included.
 * @returns true when at least one entry matches.
 */
export declare function isAllowedByList(name: string, allowlist: readonly string[]): boolean;
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
export declare function resolveToolSource(name: string): ToolSource;
/**
 * The `<tool>__<owner>` base names this deployment's extension directory ships.
 *
 * Used by the settings editor to explain what a pattern covers; it is not a
 * security boundary — the allowlist itself is.
 */
export declare const EXTENSION_TOOL_BASES: readonly string[];
