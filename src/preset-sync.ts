import type { Context } from '@deepseek-ai/cordis'
import type { Entry, Loader } from '@deepseek-ai/cordis-plugin-loader'

/**
 * Agent presets that ship their own isolated `compaction` group.
 *
 * The Web surface mounts preset-nested rows below a `cordis:group`, and the
 * Loader's patch index cannot address rows inside a preset's `config.plugins`
 * list, so this plugin bridges those rows at runtime instead of shipping copies
 * of the shipped preset definitions: the official (or deployment-edited) preset
 * stays authoritative, and only the nested compaction engine is swapped.
 */
export const PRESET_ROW_IDS = ['preset-standard', 'preset-ptc', 'preset-cordis'] as const

/** The preset ids those rows declare (`preset-…` is only the row id). */
const PRESET_IDS = ['standard', 'ptc', 'cordis'] as const

/** The presentation row every preset uses for its child plugin list. */
const PRESET_PACKAGE = '@deepseek-ai/dsh-agent-preset'
/** DSH's own compaction engine inside a preset's compaction group. */
const OFFICIAL_COMPACTION_NAME = '@deepseek-ai/dsh-compaction-basic'
/** This plugin's routed engine row. */
const BRIDGED_COMPACTION_ID = 'model-switch-compaction'
const BRIDGED_COMPACTION_NAME = 'dsh-model-switch/compaction'

interface PresetRow {
  readonly id?: unknown
  readonly name?: unknown
  readonly group?: unknown
  readonly disabled?: unknown
  readonly config?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOfficialCompaction(row: PresetRow): boolean {
  return row.name === OFFICIAL_COMPACTION_NAME
}

function isBridgedCompaction(row: PresetRow | undefined): boolean {
  return row !== undefined && row.id === BRIDGED_COMPACTION_ID && row.name === BRIDGED_COMPACTION_NAME
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
export function bridgePresetPlugins(rows: readonly PresetRow[]): { rows: PresetRow[]; changed: boolean } {
  let changed = false
  const bridged: PresetRow[] = []
  for (let index = 0; index < rows.length; index += 1) {
    const source = rows[index]!
    let row: PresetRow = source
    if (Array.isArray(source.config)) {
      const nested = bridgePresetPlugins(source.config as PresetRow[])
      if (nested.changed) {
        row = { ...source, config: nested.rows }
        changed = true
      }
    }
    if (isOfficialCompaction(row)) {
      const follower = rows[index + 1]
      const already = isBridgedCompaction(follower)
      if (!already || row.disabled !== true) {
        bridged.push({ ...row, disabled: true })
        if (!already) bridged.push({ id: BRIDGED_COMPACTION_ID, name: BRIDGED_COMPACTION_NAME })
        changed = true
        continue
      }
    }
    bridged.push(row)
  }
  return { rows: bridged, changed }
}

/**
 * Bridge one preset definition's plugin list.
 * @param config - the preset row's stored config (`{ id, order, plugins }`).
 * @returns The bridged config and whether anything changed.
 */
export function bridgePresetConfig(config: unknown): { config: unknown; changed: boolean } {
  if (!isRecord(config) || !Array.isArray(config.plugins)) return { config, changed: false }
  const { rows, changed } = bridgePresetPlugins(config.plugins as PresetRow[])
  if (!changed) return { config, changed: false }
  return { config: { ...config, plugins: rows }, changed: true }
}

/**
 * Locate one preset row in the loader tree.
 * @param loader - the host loader.
 * @param id - the preset id (`standard`, `ptc`, `cordis`).
 * @returns The declaring entry, or undefined when this profile has no such preset.
 */
export function presetEntry(loader: Loader | undefined, id: string): Entry | undefined {
  if (!loader) return undefined
  for (const entry of loader.entries()) {
    if (entry.options?.name !== PRESET_PACKAGE) continue
    const config = entry.options?.config
    if (isRecord(config) && config.id === id) return entry
  }
  return undefined
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
export async function bridgeAgentPresets(ctx: Context): Promise<readonly string[]> {
  let loader: Loader | undefined
  try {
    loader = ctx.get('loader', false)
  } catch {
    loader = undefined
  }
  if (loader === undefined) return []
  const bridged: string[] = []
  for (const id of PRESET_IDS) {
    const entry = presetEntry(loader, id)
    if (entry === undefined) continue
    const { config, changed } = bridgePresetConfig(entry.options.config)
    if (!changed) continue
    try {
      if (entry.fiber === undefined) {
        // Not activated yet: replace the raw config so the first mount uses it.
        entry.options.config = config
      } else {
        await entry.update({ config })
      }
      bridged.push(id)
    } catch (error) {
      ctx.logger.warn(`model-switch: failed to bridge agent preset ${id}: ${String(error)}`)
    }
  }
  return bridged
}
