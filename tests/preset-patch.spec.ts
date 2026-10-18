import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { Entry, Loader } from '@deepseek-ai/cordis-plugin-loader'
import {
  PRESET_ROW_IDS,
  bridgeAgentPresets,
  bridgePresetConfig,
  bridgePresetPlugins,
  presetEntry,
} from '../src/preset-sync.js'

/**
 * The Web surface runs session compaction inside each agent preset's isolated
 * `compaction` group, and the Loader patch index cannot reach rows inside a
 * preset's `config.plugins` list. The Host therefore bridges the nested engine
 * at startup (`src/preset-sync.ts`) instead of shipping copies of the shipped
 * presets: the official (or deployment-edited) preset stays authoritative.
 *
 * The static copies this replaced broke every DSH 0.2.1 turn: the 0.2.0-era
 * persona suffix carried `{{cwd}}`, and 0.2.1's prompt-variable validation only
 * registers `provider` and `model`.
 */

/** A 0.2.0-era preset: persona suffix with the removed `{{cwd}}` variable. */
const PRESET_020 = {
  id: 'standard',
  order: 1,
  plugins: [
    { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { suffix: 'Your working directory is {{cwd}}.', prefix: 'You are a coding agent powered by the {{model}} model.' } },
    { id: 'agent-instructions', name: '@deepseek-ai/dsh-agent-instructions', config: { maxBytes: 65536 } },
    {
      id: 'compaction',
      name: 'cordis:group',
      group: true,
      isolate: { compaction: true, toolResultPruner: true },
      config: [
        { id: 'compaction-basic', name: '@deepseek-ai/dsh-compaction-basic' },
        { id: 'command-compact', name: '@deepseek-ai/dsh-command-compact' },
      ],
    },
    { id: 'tool-todo', name: '@deepseek-ai/dsh-tool-todo' },
  ],
}

/** A 0.2.1-era preset: persona prefix only, plus the rows 0.2.1 moved into presets. */
const PRESET_021 = {
  id: 'standard',
  order: 1,
  plugins: [
    { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: 'You are a coding agent powered by the {{model}} model.' } },
    { id: 'agent-instructions', name: '@deepseek-ai/dsh-agent-instructions', config: { maxBytes: 65536 } },
    { id: 'time-context', name: '@deepseek-ai/dsh-time-context' },
    { id: 'tool-schedule', name: '@deepseek-ai/dsh-tool-schedule' },
    {
      id: 'compaction',
      name: 'cordis:group',
      group: true,
      isolate: { compaction: true, toolResultPruner: true },
      config: [
        { id: 'compaction-basic', name: '@deepseek-ai/dsh-compaction-basic' },
        { id: 'command-compact', name: '@deepseek-ai/dsh-command-compact' },
      ],
    },
  ],
}

const BRIDGED = { id: 'model-switch-compaction', name: 'dsh-model-switch/compaction' }

function compactionGroup(config: { plugins: readonly unknown[] }): { config: readonly any[] } {
  return (config.plugins as readonly any[]).find(row => row.id === 'compaction')
}

function entryOf(options: {
  id?: string
  name?: string
  config?: unknown
  fiber?: unknown
  update?: (options: { config?: unknown }) => Promise<void>
}): Entry {
  return {
    options: { id: options.id ?? 'preset-standard', name: options.name ?? '@deepseek-ai/dsh-agent-preset', config: options.config },
    fiber: options.fiber,
    update: options.update,
  } as unknown as Entry
}

function loaderOf(entries: readonly Entry[]): Loader {
  return { entries: () => entries.values() } as unknown as Loader
}

function ctxOf(loader: unknown, warns: string[]): Context {
  return {
    get: (name: string, fallback?: unknown) => name === 'loader' ? loader : fallback,
    logger: { info: () => {}, warn: (line: string) => { warns.push(String(line)) }, error: () => {} },
  } as unknown as Context
}

describe('bridgePresetPlugins', () => {
  it('disables the official engine and inserts the routed row right after it', () => {
    const { rows, changed } = bridgePresetPlugins(PRESET_020.plugins)
    expect(changed).toBe(true)
    const ids = rows.map(row => row.id)
    expect(ids).toEqual(['persona', 'agent-instructions', 'compaction', 'tool-todo'])
    const group = rows.find(row => row.id === 'compaction') as { config: readonly any[] }
    expect(group.config.map(row => row.id)).toEqual(['compaction-basic', 'model-switch-compaction', 'command-compact'])
    expect(group.config[0]).toMatchObject({ disabled: true })
    expect(group.config[1]).toEqual(BRIDGED)
  })

  it('keeps every other preset row untouched, including official 0.2.1 rows', () => {
    const { rows } = bridgePresetPlugins(PRESET_021.plugins)
    const group = compactionGroup({ plugins: rows })
    expect(group.config.map(row => row.id)).toEqual(['compaction-basic', 'model-switch-compaction', 'command-compact'])
    // The four leading rows are the same objects: the bridge never rewrites prompts.
    expect(rows.slice(0, 4)).toEqual(PRESET_021.plugins.slice(0, 4))
    expect(rows.slice(0, 4)).not.toBe(PRESET_021.plugins.slice(0, 4))
  })

  it('is idempotent', () => {
    const once = bridgePresetPlugins(PRESET_020.plugins)
    const twice = bridgePresetPlugins(once.rows)
    expect(twice.changed).toBe(false)
    expect(twice.rows).toEqual(once.rows)
  })

  it('leaves a preset without a compaction group untouched', () => {
    const plugins = [{ id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: 'x' } }]
    const { rows, changed } = bridgePresetPlugins(plugins)
    expect(changed).toBe(false)
    expect(rows).toEqual(plugins)
  })
})

describe('bridgePresetConfig', () => {
  it('returns a new config with only the compaction group swapped', () => {
    const { config, changed } = bridgePresetConfig(PRESET_020)
    expect(changed).toBe(true)
    expect(config).toEqual({
      ...PRESET_020,
      plugins: expect.any(Array),
    })
    const bridged = config as { plugins: readonly any[] }
    const [persona] = bridged.plugins
    expect(persona.config.suffix).toBe('Your working directory is {{cwd}}.')
    expect(compactionGroup(bridged).config.map(row => row.id))
      .toEqual(['compaction-basic', 'model-switch-compaction', 'command-compact'])
  })

  it('ignores non-object configs', () => {
    expect(bridgePresetConfig(undefined)).toEqual({ config: undefined, changed: false })
    expect(bridgePresetConfig({ id: 'minimal' })).toEqual({ config: { id: 'minimal' }, changed: false })
  })
})

describe('presetEntry', () => {
  it('matches the agent-preset declaring row by package and preset id', () => {
    const standard = entryOf({ id: 'preset-standard', config: PRESET_020 })
    const other = entryOf({ id: 'preset-ptc', config: { ...PRESET_020, id: 'ptc' } })
    const unrelated = entryOf({ id: 'tool-todo', name: '@deepseek-ai/dsh-tool-todo', config: {} })
    const loader = loaderOf([other, unrelated, standard])
    expect(presetEntry(loader, 'standard')).toBe(standard)
    expect(presetEntry(loader, 'ptc')).toBe(other)
    expect(presetEntry(loader, 'cordis')).toBeUndefined()
    expect(presetEntry(undefined, 'standard')).toBeUndefined()
  })
})

describe('bridgeAgentPresets', () => {
  it('rewrites the raw config of a preset that has not started yet', async () => {
    const warns: string[] = []
    const standard = entryOf({ id: 'preset-standard', config: PRESET_020 })
    const bridged = await bridgeAgentPresets(ctxOf(loaderOf([standard]), warns))
    expect(bridged).toEqual(['standard'])
    expect(warns).toEqual([])
    const config = standard.options.config as { plugins: readonly any[] }
    expect(compactionGroup(config).config.map(row => row.id))
      .toEqual(['compaction-basic', 'model-switch-compaction', 'command-compact'])
  })

  it('reloads a started preset through the public loader update', async () => {
    const warns: string[] = []
    const calls: { config?: unknown }[] = []
    const ptc = entryOf({
      id: 'preset-ptc',
      config: { ...PRESET_020, id: 'ptc' },
      fiber: { uid: 'fiber' },
      update: async options => { calls.push(options) },
    })
    const bridged = await bridgeAgentPresets(ctxOf(loaderOf([ptc]), warns))
    expect(bridged).toEqual(['ptc'])
    expect(calls).toHaveLength(1)
    const bridgedConfig = calls[0]!.config as { plugins: readonly any[] }
    expect(compactionGroup(bridgedConfig).config.map(row => row.id))
      .toEqual(['compaction-basic', 'model-switch-compaction', 'command-compact'])
    expect(warns).toEqual([])
  })

  it('skips presets without a compaction group and reports nothing bridged', async () => {
    const warns: string[] = []
    const minimal = entryOf({ id: 'preset-minimal', config: { id: 'minimal', plugins: [{ id: 'persona', name: '@deepseek-ai/dsh-persona' }] } })
    expect(await bridgeAgentPresets(ctxOf(loaderOf([minimal]), warns))).toEqual([])
    expect(warns).toEqual([])
  })

  it('keeps the official preset when the reload fails, with one warning', async () => {
    const warns: string[] = []
    const ptc = entryOf({
      id: 'preset-ptc',
      config: { ...PRESET_020, id: 'ptc' },
      fiber: { uid: 'fiber' },
      update: async () => { throw new Error('reload refused') },
    })
    expect(await bridgeAgentPresets(ctxOf(loaderOf([ptc]), warns))).toEqual([])
    expect(warns).toHaveLength(1)
    expect(warns[0]).toContain('failed to bridge agent preset ptc')
    expect(warns[0]).toContain('reload refused')
  })

  it('returns nothing when the profile exposes no loader', async () => {
    const warns: string[] = []
    expect(await bridgeAgentPresets(ctxOf(undefined, warns))).toEqual([])
  })

  it('covers every shipped preset row id', () => {
    expect(PRESET_ROW_IDS).toEqual(['preset-standard', 'preset-ptc', 'preset-cordis'])
  })
})

describe('shipped cordis.patch.yml after the preset bridge', () => {
  it('no longer replaces preset rows wholesale', async () => {
    const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    for (const id of PRESET_ROW_IDS) {
      expect(patch, `${id} stays the official preset row`).not.toContain(`- id: ${id}`)
    }
    expect(patch).toContain('src/preset-sync.ts')
  })

  it('keeps the top-level official engine disabled and one routed row for agent planes without presets', async () => {
    const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    expect(patch.match(/- id: model-switch-compaction/g) ?? []).toHaveLength(1)
    expect(patch).toMatch(/- id: compaction-basic\r?\n {2}name: '@deepseek-ai\/dsh-compaction-basic'\r?\n {2}disabled: true/)
  })
})
