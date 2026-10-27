import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compareDshVersions, runtimeFloorOf, shouldMountDshRuntime } from '../src/compatibility.ts'

const VERIFIED = new Set(['0.1.2-alpha.4', '0.1.2-rc.1'])

function logger(warnings: string[]) {
  return { warn(message: string): void { warnings.push(message) } }
}

describe('DSH forward compatibility policy', () => {
  it('warns once and still attempts an unverified future runtime', () => {
    const warnings: string[] = []
    let mountAttempts = 0
    const allowed = shouldMountDshRuntime(logger(warnings), 'test-plugin', '9.9.9', VERIFIED)
    if (allowed) mountAttempts += 1
    expect(mountAttempts).toBe(1)
    expect(warnings).toEqual(['[test-plugin] best-effort on unverified runtime 9.9.9'])
  })

  it('blocks only an explicitly reproduced version and leaves a visible reason', () => {
    const warnings: string[] = []
    let mountAttempts = 0
    const allowed = shouldMountDshRuntime(logger(warnings), 'test-plugin', '9.9.9', VERIFIED, {
      '9.9.9': 'reproduced startup failure in the test harness',
    })
    if (allowed) mountAttempts += 1
    expect(mountAttempts).toBe(0)
    expect(warnings).toEqual([
      '[test-plugin] blocked on DSH 9.9.9: reproduced startup failure in the test harness; see package.json#dsh.compatibility.blocklist',
    ])
  })

  it('does not warn for a verified runtime', () => {
    const warnings: string[] = []
    expect(shouldMountDshRuntime(logger(warnings), 'test-plugin', '0.1.2-rc.1', VERIFIED)).toBe(true)
    expect(warnings).toEqual([])
  })

  it('declares open-ended DSH dependencies and optional peers', () => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      devDependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
      peerDependenciesMeta?: Record<string, { optional?: boolean }>
    }
    for (const section of ['peerDependencies', 'devDependencies'] as const) {
      const dependencies = Object.entries(manifest[section] ?? {}).filter(([name]) => name.startsWith('@deepseek-ai/dsh-'))
      expect(dependencies.length).toBeGreaterThan(0)
      for (const [name, range] of dependencies) {
        expect(range).toMatch(/^>=\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u)
        if (section === 'peerDependencies') expect(manifest.peerDependenciesMeta?.[name]?.optional).toBe(true)
      }
    }
  })
})

describe('shipped compatibility table', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    dsh?: { compatibility?: { dshReleases?: Record<string, unknown> } }
  }
  const releases = manifest.dsh?.compatibility?.dshReleases ?? {}

  it('keeps every verified line, including the oldest supported one', () => {
    for (const release of ['0.1.7-alpha.2', '0.1.7-rc.2', '0.2.0-rc.2', '0.2.1-rc.2', '0.2.1-rc.3']) {
      expect(releases[release], release).toBe('compatible')
    }
  })

  it('mounts the rc.3 line without an unverified warning', () => {
    const warnings: string[] = []
    const verified = new Set(Object.keys(releases))
    expect(shouldMountDshRuntime(logger(warnings), 'test-plugin', '0.2.1-rc.3', verified)).toBe(true)
    expect(warnings).toEqual([])
  })
})

describe('open-ended dshRuntime floor', () => {
  it('orders prereleases below their release and between rc numbers', () => {
    expect(compareDshVersions('0.2.1-rc.4', '0.2.1-rc.3')).toBe(1)
    expect(compareDshVersions('0.2.1', '0.2.1-rc.9')).toBe(1)
    expect(compareDshVersions('0.1.9', '0.2.0-rc.2')).toBe(-1)
    expect(compareDshVersions('0.2.0-rc.2', '0.2.0-rc.2')).toBe(0)
    expect(compareDshVersions('garbage', '0.2.0')).toBeUndefined()
  })

  it('reads only the open-ended form', () => {
    expect(runtimeFloorOf('>=0.2.0-rc.2')).toBe('0.2.0-rc.2')
    expect(runtimeFloorOf(' >=0.2.0 ')).toBe('0.2.0')
    expect(runtimeFloorOf('^0.2.0')).toBeUndefined()
    expect(runtimeFloorOf(undefined)).toBeUndefined()
  })

  it('verifies every runtime at or above the floor without naming it', () => {
    const warnings: string[] = []
    for (const version of ['0.2.0-rc.2', '0.2.1-rc.4', '0.3.0', '1.0.0']) {
      expect(shouldMountDshRuntime(logger(warnings), 'test-plugin', version, new Set(), {}, '>=0.2.0-rc.2')).toBe(true)
    }
    expect(warnings).toEqual([])
  })

  it('still warns below the floor and keeps honouring the blocklist', () => {
    const warnings: string[] = []
    expect(shouldMountDshRuntime(logger(warnings), 'test-plugin', '0.2.0-rc.1', new Set(), {}, '>=0.2.0-rc.2')).toBe(true)
    expect(warnings).toEqual(['[test-plugin] best-effort on unverified runtime 0.2.0-rc.1'])

    const blocked: string[] = []
    expect(shouldMountDshRuntime(logger(blocked), 'test-plugin', '0.3.0', new Set(), { '0.3.0': 'reproduced failure' }, '>=0.2.0-rc.2')).toBe(false)
    expect(blocked).toEqual([
      '[test-plugin] blocked on DSH 0.3.0: reproduced failure; see package.json#dsh.compatibility.blocklist',
    ])
  })

  it('declares the floor in the manifest itself', () => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      dsh?: { compatibility?: { dshRuntime?: unknown } }
    }
    expect(manifest.dsh?.compatibility?.dshRuntime).toBe('>=0.2.0-rc.2')
  })
})
