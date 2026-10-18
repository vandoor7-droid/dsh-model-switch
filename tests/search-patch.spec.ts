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
    { id: 'session-title-llm', name: '@deepseek-ai/dsh-session-title-first-prompt-llm' },
    // DSH 0.2.1's optional session-titles bundle mounts its own all-prompts row.
    { id: 'optional-session-title-all-prompts', name: '@deepseek-ai/dsh-session-title-all-prompts-llm' },
    // The shipped preset rows stay untouched by this patch: the Host bridges
    // their nested compaction engine at startup instead (src/preset-sync.ts).
    { id: 'preset-standard', name: '@deepseek-ai/dsh-agent-preset' },
    { id: 'preset-ptc', name: '@deepseek-ai/dsh-agent-preset' },
    { id: 'preset-cordis', name: '@deepseek-ai/dsh-agent-preset' },
  ]
  const composed = applyEntryPatches(entries, patch, message => { throw new Error(message) })
  expect(composed.find(entry => entry.id === 'web')?.config).toEqual({ searchProvider: 'previous-search', fetchProvider: 'custom-fetch' })
  expect(composed.find(entry => entry.id === 'compaction-basic')?.disabled).toBe(true)
  expect(composed.some(entry => entry.id === 'model-switch-compaction')).toBe(true)
  expect(composed.find(entry => entry.id === 'session-title-llm')?.disabled).toBe(true)
  expect(composed.find(entry => entry.id === 'optional-session-title-all-prompts')?.disabled).toBe(true)
  expect(composed.some(entry => entry.id === 'model-switch-session-title')).toBe(true)
  // Disabling keeps the original row in the tree, so the replacement's own row
  // id is what carries the configurable route.
  expect(composed.find(entry => entry.id === 'model-switch-session-title')?.name).toBe('dsh-model-switch/session-title')
})
