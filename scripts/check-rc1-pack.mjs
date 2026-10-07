#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const source = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const work = mkdtempSync(join(root, 'node_modules', '.dsh-pack-'))

/**
 * npm's JS entry beside the running Node. On Windows `npm` is a `.cmd` shim and
 * a shell-less spawnSync cannot launch it, so the packer is reached through the
 * Node that already runs this script.
 * @returns Absolute path to npm's CLI entry, or undefined when npm is not beside Node.
 */
function npmEntry() {
  return [
    join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ].find(existsSync)
}

/**
 * Run the packer through npm's own CLI, falling back to its JS entry only when
 * the launcher itself is missing. A pack failure is never retried.
 * @param args - npm arguments.
 * @param options - execFileSync options.
 * @returns npm's stdout.
 */
function pack(args, options) {
  try {
    return execFileSync('npm', args, options)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    const entry = npmEntry()
    if (entry === undefined) throw error
    return execFileSync(process.execPath, [entry, ...args], options)
  }
}

try {
  const [report] = JSON.parse(pack([
    'pack', '--json', '--ignore-scripts', '--pack-destination', work,
  ], { cwd: root, encoding: 'utf8' }))
  assert(report?.filename, 'npm pack did not produce an archive')
  const archive = join(work, report.filename)
  // Archive listings are CRLF on Windows and LF elsewhere; members are compared as names.
  const names = new Set(execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' })
    .split(/\r?\n/u).map(name => name.trim()).filter(name => name !== ''))
  execFileSync('tar', ['-xzf', archive, '-C', work])
  const packedDir = join(work, 'package')
  const packed = JSON.parse(readFileSync(join(packedDir, 'package.json'), 'utf8'))
  assert.equal(packed.name, source.name)
  assert.equal(packed.version, source.version)
  assert.equal(packed.dsh?.compatibility?.dshReleases?.['0.1.7-rc.1'], 'compatible')
  assert.equal(packed.dsh?.compatibility?.dshReleases?.['0.1.7-rc.2'], 'compatible')

  for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']) {
    for (const [name, range] of Object.entries(packed[section] ?? {})) {
      assert.doesNotMatch(range, /^(?:file|link|workspace|npm):|^\//u, `${section}.${name} must not use a local dependency`)
      if (name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')) {
        assert.match(range, /^>=\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u, `${section}.${name} must have no upper version bound`)
      }
    }
  }
  for (const entry of Object.values(packed.exports ?? {})) {
    for (const target of typeof entry === 'string' ? [entry] : Object.values(entry)) {
      assert(names.has(`package/${target.replace(/^\.\//u, '')}`), `missing export ${target}`)
    }
  }
  for (const file of ['cordis.patch.yml', 'README.md', 'README.zh.md', 'lib/index.js', 'lib/client.js']) {
    assert(names.has(`package/${file}`), `missing ${file}`)
  }
  assert(names.has('package/package.json'))
  assert(![...names].some(name => name.includes('/../') || /(?:^|\/)\.env(?:\.|$)/u.test(name)), 'unsafe archive member')

  // A directory symlink needs Developer Mode or elevation on Windows; a
  // junction resolves the same dependencies without either.
  symlinkSync(join(root, 'node_modules'), join(packedDir, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
  const host = await import(pathToFileURL(join(packedDir, 'lib/index.js')).href)
  assert(typeof host.apply === 'function' || typeof host.default === 'function' || typeof host.name === 'string', 'Host export missing')
  const registrations = []
  globalThis.window = { __ModuleLoader__: { load(value) { registrations.push(value) } } }
  await import(pathToFileURL(join(packedDir, 'lib/client.js')).href)
  assert.equal(registrations.length, 1, 'Web client registration missing')
  assert.equal(registrations[0].id, packed.name)
  assert.equal(typeof registrations[0].factory, 'function')
  console.log(`pack check passed: ${report.filename}`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
