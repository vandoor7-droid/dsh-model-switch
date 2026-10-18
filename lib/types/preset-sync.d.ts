import type { Context } from '@deepseek-ai/cordis';
import type { Entry, Loader } from '@deepseek-ai/cordis-plugin-loader';
/**
 * Agent presets that ship their own isolated `compaction` group.
 *
 * The Web surface mounts preset-nested rows below a `cordis:group`, and the
 * Loader's patch index cannot address rows inside a preset's `config.plugins`
 * list, so this plugin bridges those rows at runtime instead of shipping copies
 * of the shipped preset definitions: the official (or deployment-edited) preset
 * stays authoritative, and only the nested compaction engine is swapped.
 */
export declare const PRESET_ROW_IDS: readonly ["preset-standard", "preset-ptc", "preset-cordis"];
interface PresetRow {
    readonly id?: unknown;
    readonly name?: unknown;
    readonly group?: unknown;
    readonly disabled?: unknown;
    readonly config?: unknown;
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
export declare function bridgePresetPlugins(rows: readonly PresetRow[]): {
    rows: PresetRow[];
    changed: boolean;
};
/**
 * Bridge one preset definition's plugin list.
 * @param config - the preset row's stored config (`{ id, order, plugins }`).
 * @returns The bridged config and whether anything changed.
 */
export declare function bridgePresetConfig(config: unknown): {
    config: unknown;
    changed: boolean;
};
/**
 * Locate one preset row in the loader tree.
 * @param loader - the host loader.
 * @param id - the preset id (`standard`, `ptc`, `cordis`).
 * @returns The declaring entry, or undefined when this profile has no such preset.
 */
export declare function presetEntry(loader: Loader | undefined, id: string): Entry | undefined;
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
export declare function bridgeAgentPresets(ctx: Context): Promise<readonly string[]>;
export {};
