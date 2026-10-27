import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

interface CompatibilityLogger {
  warn(message: string): void
}

type CompatibilityManifest = {
  dsh?: {
    compatibility?: {
      dshReleases?: Record<string, unknown>
      blocklist?: Record<string, unknown>
      /** Open-ended floor: every runtime at or above it is declared compatible. */
      dshRuntime?: unknown
    }
  }
}

/** One parsed `major.minor.patch[-prerelease]` version. */
interface ParsedVersion {
  readonly base: readonly [number, number, number]
  readonly pre: readonly string[]
}

/**
 * Parse a dotted DSH version, tolerating a prerelease suffix.
 * @param version - the raw version text.
 * @returns the parsed parts, or undefined when the shape is unknown.
 */
function parseVersion(version: string): ParsedVersion | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version.trim())
  if (match === null) return undefined
  return {
    base: [Number(match[1]), Number(match[2]), Number(match[3])],
    pre: match[4] === undefined ? [] : match[4].split('.'),
  }
}

/** Semver prerelease ordering for one identifier pair. */
function compareIdentifier(left: string, right: string): number {
  const leftNumeric = /^\d+$/.test(left)
  const rightNumeric = /^\d+$/.test(right)
  if (leftNumeric && rightNumeric) return Number(left) - Number(right)
  if (leftNumeric) return -1
  if (rightNumeric) return 1
  return left < right ? -1 : left > right ? 1 : 0
}

/**
 * Order two DSH versions with prerelease semantics (`rc.2 < rc.3 < release`).
 * @param left - first version.
 * @param right - second version.
 * @returns -1/0/1, or undefined when either side is unparsable.
 */
export function compareDshVersions(left: string, right: string): number | undefined {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (a === undefined || b === undefined) return undefined
  for (let index = 0; index < 3; index += 1) {
    const difference = a.base[index]! - b.base[index]!
    if (difference !== 0) return difference < 0 ? -1 : 1
  }
  if (a.pre.length === 0 && b.pre.length === 0) return 0
  // A release outranks any prerelease of the same base version.
  if (a.pre.length === 0) return 1
  if (b.pre.length === 0) return -1
  const shared = Math.min(a.pre.length, b.pre.length)
  for (let index = 0; index < shared; index += 1) {
    const difference = compareIdentifier(a.pre[index]!, b.pre[index]!)
    if (difference !== 0) return difference < 0 ? -1 : 1
  }
  if (a.pre.length === b.pre.length) return 0
  return a.pre.length < b.pre.length ? -1 : 1
}

/**
 * Read the floor out of a declared runtime range.
 *
 * Only the open-ended `>=x.y.z` form is understood: the declaration promises
 * "this release and everything after it", so a bounded range is a different
 * statement and is ignored rather than half-honoured.
 *
 * @param range - the declared range text.
 * @returns the floor version, or undefined when absent/misunderstood.
 */
export function runtimeFloorOf(range: unknown): string | undefined {
  if (typeof range !== 'string') return undefined
  const match = /^\s*>=\s*([0-9A-Za-z.-]+)\s*$/.exec(range)
  return match === null ? undefined : match[1]
}

export type DshRuntimeClassification =
  | { kind: 'verified' }
  | { kind: 'unverified' }
  | { kind: 'blocked'; reason: string }

/**
 * Classify one runtime without treating the verified table as an allowlist.
 *
 * Precedence: a blocked version wins over everything; a version named in the
 * evidence table is verified; otherwise a declared `dshRuntime` floor marks every
 * runtime at or above it verified. Anything else stays unverified, and the mount
 * path remains fail-open for it.
 *
 * @param version - Resolved DSH runtime version.
 * @param verified - Releases with direct compatibility evidence.
 * @param blocklist - Versions excluded after reproduced failures.
 * @param runtimeRange - Declared open-ended floor (`>=x.y.z`).
 * @returns The fail-open mount decision.
 */
export function classifyDshRuntime(
  version: string,
  verified: ReadonlySet<string>,
  blocklist: Readonly<Record<string, unknown>> = {},
  runtimeRange?: unknown,
): DshRuntimeClassification {
  const reason = blocklist[version]
  if (typeof reason === 'string' && reason.trim() !== '') return { kind: 'blocked', reason }
  if (verified.has(version)) return { kind: 'verified' }
  const floor = runtimeFloorOf(runtimeRange)
  if (floor !== undefined) {
    const order = compareDshVersions(version, floor)
    if (order !== undefined && order >= 0) return { kind: 'verified' }
  }
  return { kind: 'unverified' }
}

/**
 * Apply the fail-open decision and emit at most one visible warning.
 * @param logger - Host logger receiving compatibility warnings.
 * @param pluginName - Plugin identifier used in diagnostics.
 * @param version - Resolved DSH runtime version.
 * @param verified - Releases with direct compatibility evidence.
 * @param blocklist - Versions excluded after reproduced failures.
 * @param runtimeRange - Declared open-ended floor (`>=x.y.z`).
 * @returns Whether the host mount should continue.
 */
export function shouldMountDshRuntime(
  logger: CompatibilityLogger,
  pluginName: string,
  version: string,
  verified: ReadonlySet<string>,
  blocklist: Readonly<Record<string, unknown>> = {},
  runtimeRange?: unknown,
): boolean {
  const decision = classifyDshRuntime(version, verified, blocklist, runtimeRange)
  if (decision.kind === 'blocked') {
    logger.warn(`[${pluginName}] blocked on DSH ${version}: ${decision.reason}; see package.json#dsh.compatibility.blocklist`)
    return false
  }
  if (decision.kind === 'unverified') logger.warn(`[${pluginName}] best-effort on unverified runtime ${version}`)
  return true
}

function readManifest(): CompatibilityManifest {
  try {
    return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as CompatibilityManifest
  } catch {
    // A missing manifest must not turn compatibility metadata into a load failure.
    return {}
  }
}

function packageVersion(packageName: string): string | undefined {
  try {
    const require = createRequire(import.meta.url)
    let directory = dirname(require.resolve(packageName))
    for (;;) {
      try {
        const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as { version?: unknown }
        if (typeof manifest.version === 'string' && manifest.version !== '') return manifest.version
      } catch {
        // Keep walking until the package root is exhausted.
      }
      const parent = dirname(directory)
      if (parent === directory) return undefined
      directory = parent
    }
  } catch {
    return undefined
  }
}

/**
 * Warn once for an unknown runtime while keeping the normal host mount path.
 * @param logger - Host logger receiving compatibility warnings.
 * @param pluginName - Plugin identifier used in diagnostics.
 * @param candidates - DSH peer packages used to resolve the host version.
 * @returns Whether the host mount should continue.
 */
export function allowDshRuntime(logger: CompatibilityLogger, pluginName: string, candidates: readonly string[]): boolean {
  const version = process.env.DSH_VERSION?.trim() || candidates.map(packageVersion).find(value => value !== undefined) || 'unknown'
  const compatibility = readManifest().dsh?.compatibility
  const verified = new Set(Object.entries(compatibility?.dshReleases ?? {})
    .filter(([, status]) => status === 'compatible' || status === 'verified')
    .map(([release]) => release))
  return shouldMountDshRuntime(logger, pluginName, version, verified, compatibility?.blocklist, compatibility?.dshRuntime)
}
