import { readFileSync } from 'node:fs'
import { applyEntryPatches, entryListSchema, type PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import { load } from 'js-yaml'
import { expect, it } from 'vitest'

it('preserves existing global search and custom fetch pins through real patch composition', () => {
  const patch = load(readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8'), { schema: entryListSchema }) as PatchOptions[]
  const entries = [
    { id: 'web', name: '@deepseek-ai/dsh-web', config: { searchProvider: 'previous-search', fetchProvider: 'custom-fetch' } },
    { id: 'subagent', name: '@deepseek-ai/dsh-subagent' },
    { id: 'auto-review', name: '@deepseek-ai/dsh-experimental-auto-review' },
    { id: 'compaction-basic', name: '@deepseek-ai/dsh-compaction-basic' },
    // The shipped preset rows this patch replaces wholesale so the Web
    // surface's preset-nested compaction group runs the routed engine.
    { id: 'preset-standard', name: '@deepseek-ai/dsh-agent-preset' },
    { id: 'preset-ptc', name: '@deepseek-ai/dsh-agent-preset' },
    { id: 'preset-cordis', name: '@deepseek-ai/dsh-agent-preset' },
  ]
  const composed = applyEntryPatches(entries, patch, message => { throw new Error(message) })
  expect(composed.find(entry => entry.id === 'web')?.config).toEqual({ searchProvider: 'previous-search', fetchProvider: 'custom-fetch' })
  expect(composed.find(entry => entry.id === 'compaction-basic')?.disabled).toBe(true)
  expect(composed.some(entry => entry.id === 'model-switch-compaction')).toBe(true)
})
