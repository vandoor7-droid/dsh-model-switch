import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { clearStaticPin, writeStaticPin } from '../src/prime-memory-compat.js'

/** A profile patch with the memory row first and an unrelated row after it. */
const document = [
  '- id: dsh-memory',
  '  name: dsh-prime-memory',
  '  config:',
  '    family: auto',
  '',
  '- id: model-switch',
  '  name: dsh-model-switch',
  '  config:',
  '    compactOnSwitch: false',
  '',
].join('\n')

/** Write a patch document into a throwaway directory and return its path. */
async function scratch(name: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-model-switch-pin-'))
  const path = join(directory, name)
  await writeFile(path, document, 'utf8')
  return path
}

describe('dsh-prime-memory static pin', () => {
  it('pins the route and then clears it again', async () => {
    const path = await scratch('cordis.patch.yml')

    expect(await writeStaticPin(path, 'apigoto', 'probe-memory')).toBe('written')
    const pinned = await readFile(path, 'utf8')
    expect(pinned).toContain('    llm:\n      provider: apigoto\n      model: probe-memory\n')

    // `effectiveCfg` ignores the live pair while a pin is present, so clearing must actually
    // remove the block — not merely blank it or leave an empty `llm:` mapping behind.
    expect(await clearStaticPin(path)).toBe('cleared')
    const cleared = await readFile(path, 'utf8')
    expect(cleared).not.toContain('llm:')
    expect(cleared).not.toContain('provider: apigoto')
    expect(cleared).toContain('    family: auto')
    expect(cleared).toContain('- id: model-switch')

    // Idempotent: a second pass reports that there was nothing to do.
    expect(await clearStaticPin(path)).toBe('absent')
    expect(await readFile(path, 'utf8')).toBe(cleared)
  })

  it('reports a document without the memory row instead of guessing', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-model-switch-pin-'))
    const path = join(directory, 'cordis.patch.yml')
    await writeFile(path, '- id: model-switch\n  name: dsh-model-switch\n', 'utf8')

    expect(await clearStaticPin(path)).toBe('missing')
    expect(await writeStaticPin(path, 'apigoto', 'probe-memory')).toBe('missing')
  })

  it('reports a missing document rather than throwing', async () => {
    expect(await clearStaticPin(join(tmpdir(), 'dsh-model-switch-no-such-patch.yml'))).toBe('missing')
  })
})
