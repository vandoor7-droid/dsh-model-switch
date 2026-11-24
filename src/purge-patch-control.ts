import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'

/**
 * Controls the dsh-purge-community "official auto-review soft intercept" patch.
 *
 * The purge inserts `return next(); // [dsh-purge] official auto-review soft
 * intercept disabled` as the first line of the official auto-review listener.
 * Removing that line restores the official review; re-inserting it re-disables.
 *
 * This module also writes the purge's tuning.json so the purge's own
 * re-application respects the choice: `{"permissionPatches": false}` stops
 * the permission patch group from re-applying on the next purge apply.
 */

const NEUTER_LINE = 'return next(); // [dsh-purge] official auto-review soft intercept disabled'
const LISTENER_OPENER = 'yield ctx.on("tools/pre-execute", async (exec, next) => {'

/** Find the dsh-experimental-auto-review/lib/index.js file on this host. */
function findAutoReviewFile(): string | undefined {
  const require = createRequire(import.meta.url)
  try {
    // The plugin runs inside the DSH host; resolving the sibling package works.
    return require.resolve('@deepsearch-ai/dsh-experimental-auto-review/lib/index.js')
  } catch {
    return undefined
  }
}

/** The purge's tuning file path (dsh-purge/tuning.json under DSH home). */
function tuningFilePath(): string {
  const home = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')
  return path.join(home, 'dsh-purge', 'tuning.json')
}

/** Read the purge tuning, or `{}` when absent. */
export function readTuning(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(tuningFilePath(), 'utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

/** Write the purge tuning with `permissionPatches` set; returns true on success. */
function writeTuning(permissionPatches: boolean): boolean {
  const file = tuningFilePath()
  try {
    const tuning = readTuning()
    tuning.permissionPatches = permissionPatches
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(tuning, null, 2) + '\n', 'utf8')
    return true
  } catch {
    return false
  }
}

/**
 * Whether the official auto-review file currently carries the purge neuter line.
 * `undefined` when the file cannot be resolved or read.
 */
export function isNeutered(): boolean | undefined {
  const file = findAutoReviewFile()
  if (file === undefined) return undefined
  try {
    return fs.readFileSync(file, 'utf8').includes(NEUTER_LINE)
  } catch {
    return undefined
  }
}

/**
 * Enable (restore) the official auto-review by removing the neuter line
 * and writing `permissionPatches: false` to the purge tuning.
 * Returns a human-readable result for the settings card.
 */
export function enableOfficialReview(): { ok: boolean; message: string } {
  const file = findAutoReviewFile()
  if (file === undefined) {
    return { ok: false, message: 'auto-review package not found on this host' }
  }
  let restored = false
  try {
    const text = fs.readFileSync(file, 'utf8')
    if (text.includes(NEUTER_LINE)) {
      const cleaned = text.replace(NEUTER_LINE + '\n', '').replace(NEUTER_LINE, '')
      fs.writeFileSync(file, cleaned, 'utf8')
      restored = true
    } else {
      restored = true // already clean
    }
  } catch (cause) {
    return { ok: false, message: `could not patch the auto-review file (${String(cause)})` }
  }
  const tuning = writeTuning(false)
  return {
    ok: restored,
    message: restored
      ? tuning
        ? 'official auto-review restored; purge permission patches disabled in tuning (restart DSH to load the clean code)'
        : 'official auto-review restored (tuning write failed; purge may re-patch on next apply)'
      : 'auto-review file was already clean',
  }
}

/**
 * Disable the official auto-review by re-inserting the neuter line
 * and restoring `permissionPatches: true` in the purge tuning.
 */
export function disableOfficialReview(): { ok: boolean; message: string } {
  const file = findAutoReviewFile()
  if (file === undefined) {
    return { ok: false, message: 'auto-review package not found on this host' }
  }
  let patched = false
  try {
    const text = fs.readFileSync(file, 'utf8')
    if (!text.includes(NEUTER_LINE)) {
      const idx = text.indexOf(LISTENER_OPENER)
      if (idx === -1) {
        return { ok: false, message: 'auto-review listener not found; the file layout changed' }
      }
      const insertAt = idx + LISTENER_OPENER.length
      const line = '\n\t\t\t' + NEUTER_LINE
      fs.writeFileSync(file, text.slice(0, insertAt) + line + text.slice(insertAt), 'utf8')
      patched = true
    } else {
      patched = true // already neutered
    }
  } catch (cause) {
    return { ok: false, message: `could not patch the auto-review file (${String(cause)})` }
  }
  const tuning = writeTuning(true)
  return {
    ok: patched,
    message: patched
      ? tuning
        ? 'official auto-review neutered; purge permission patches re-enabled (restart DSH to load the patched code)'
        : 'official auto-review neutered (tuning write failed; purge may not re-patch)'
      : 'auto-review file was already neutered',
  }
}
