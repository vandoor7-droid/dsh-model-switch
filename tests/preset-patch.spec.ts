import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

/**
 * The Web surface runs session compaction inside each agent preset's isolated
 * `compaction` group, and the Loader's patch index cannot reach rows inside a
 * preset's `config.plugins` list. `cordis.patch.yml` therefore replaces each
 * preset row wholesale (the Web preset editor's own mechanism) and swaps the
 * group's official compaction-basic for model-switch-compaction. These tests
 * pin that transform: a DSH release that edits the shipped presets re-syncs the
 * copies here, and this file turns a missed sync red.
 */

const PRESETS = ['preset-standard', 'preset-ptc', 'preset-cordis'] as const

function sectionOf(patch: string, id: string): string {
  const start = patch.indexOf(`- id: ${id}`)
  expect(start, `${id} is missing from cordis.patch.yml`).toBeGreaterThanOrEqual(0)
  const rest = patch.slice(start + 1)
  const next = rest.search(/\r?\n- (?:id|insert):/)
  return next < 0 ? rest : rest.slice(0, next)
}

describe('shipped cordis.patch.yml preset replacements', () => {
  it('swaps each preset compaction group to the Model Switch engine', async () => {
    const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    for (const id of PRESETS) {
      const section = sectionOf(patch, id)
      expect(section, `${id} stays the official agent-preset row`).toContain("name: '@deepseek-ai/dsh-agent-preset'")
      // The nested official engine is disabled and our row takes its place.
      expect(section, `${id} keeps its compaction group`).toContain('- id: compaction-basic')
      expect(section, `${id} swaps the compaction engine`).toMatch(/- id: compaction-basic\r?\n\s+name: '@deepseek-ai\/dsh-compaction-basic'\r?\n\s+disabled: true\r?\n\s+- id: model-switch-compaction\r?\n\s+name: 'dsh-model-switch\/compaction'/)
    }
  })

  it('keeps one top-level model-switch-compaction row and one per preset group', async () => {
    const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    const rows = patch.match(/- id: model-switch-compaction/g) ?? []
    expect(rows.length).toBe(PRESETS.length + 1)
    // The top-level official row stays disabled for process-wide agent planes (TUI).
    expect(patch).toMatch(/- id: compaction-basic\r?\n {2}name: '@deepseek-ai\/dsh-compaction-basic'\r?\n {2}disabled: true/)
  })
})
