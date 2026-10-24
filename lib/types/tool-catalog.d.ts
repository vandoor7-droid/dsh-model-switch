/**
 * The Host's live tool catalog, annotated with where each tool comes from.
 *
 * The settings editor needs to show what actually exists on this machine — not
 * just the shipped defaults — so a human can tick a tool the defaults miss (a new
 * MCP server, a renamed bot extension) without editing YAML. The only public
 * source for that list is `ctx.tools.schemas()`, which is the same model-facing
 * set the reviewer sees.
 *
 * @module dsh-model-switch/tool-catalog
 */
import type { Context } from '@deepseek-ai/cordis';
import { type ToolSource } from './tool-allowlist.js';
/** One tool the running Host currently exposes. */
export interface ToolCatalogEntry {
    readonly name: string;
    /** First line of the tool description, for the settings list. */
    readonly description: string;
    readonly source: ToolSource;
}
/** The wire shape of the `tools` RPC endpoint. */
export interface ToolCatalogSnapshot {
    readonly tools: readonly ToolCatalogEntry[];
    /** Names that matched the shipped defaults, for the "已放行" mark. */
    readonly recommended: readonly string[];
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
export declare function readToolCatalog(ctx: Context): ToolCatalogEntry[];
