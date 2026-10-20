/**
 * Durable snapshot of the sessions that were on the Auto preset when this row
 * released the Auto registration.
 *
 * The official auto-review gate's teardown moves live `auto` sessions to the
 * fallback preset (`danger-full-access`) by design. That teardown runs whenever
 * a gate is disposed — including every hot recompose of this row, where nothing
 * of ours stays mounted long enough to restore the selection. This module owns
 * the pure encode/decode half of the workaround: the ids are written before the
 * release and replayed on the next mount.
 */

/**
 * How long a snapshot stays replayable. A flip caused by our own release is
 * followed by a re-claim within seconds; anything older is a different restart
 * and must not resurrect a preset the user may have chosen since.
 */
export const AUTO_SESSION_STATE_MAX_AGE_MS = 15 * 60 * 1000

interface AutoSessionStatePayload {
  savedAt: number
  ids: string[]
}

function uniqueIds(values: unknown): string[] {
  const unique: string[] = []
  if (!Array.isArray(values)) return unique
  for (const value of values) {
    if (typeof value === 'string' && value !== '' && !unique.includes(value)) unique.push(value)
  }
  return unique
}

/** Serialize the session ids that were on Auto at `savedAt`. */
export function encodeAutoSessionState(ids: readonly string[], savedAt: number): string {
  const payload: AutoSessionStatePayload = { savedAt, ids: uniqueIds(ids) }
  return JSON.stringify(payload)
}

/**
 * Decode a snapshot written by {@link encodeAutoSessionState}.
 *
 * Every malformed or stale shape degrades to `[]`: an unreadable state file
 * must never stop the Auto registration from being released or re-claimed.
 */
export function decodeAutoSessionState(
  raw: string | undefined,
  now: number,
  maxAgeMs: number = AUTO_SESSION_STATE_MAX_AGE_MS,
): string[] {
  if (raw === undefined || raw.trim() === '') return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (typeof parsed !== 'object' || parsed === null) return []
  const { savedAt, ids } = parsed as Partial<AutoSessionStatePayload>
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return []
  if (now - savedAt > maxAgeMs) return []
  return uniqueIds(ids)
}
