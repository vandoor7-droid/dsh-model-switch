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

/** A decoded snapshot: the ids recorded at `savedAt`. */
export interface AutoSessionState {
  savedAt: number
  ids: string[]
}

/**
 * What one replay can do right now.
 *
 * `restore` holds the recorded ids that exist in the live session list and can
 * be moved back onto Auto; `remaining` holds the ones no live session claims
 * yet. The remaining ids stay in the file (with their original `savedAt`) so a
 * later claim — or the next start — can still replay them, instead of the
 * replay consuming the whole snapshot and dropping what it could not restore.
 */
export interface AutoSnapshotReplay {
  restore: string[]
  remaining: string[]
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
 * Decode a snapshot written by {@link encodeAutoSessionState}, keeping the
 * timestamp so a partial replay can write the rest back with the original
 * expiry instead of restarting the replay window.
 *
 * Every malformed or stale shape degrades to `undefined`: an unreadable state
 * file must never stop the Auto registration from being released or re-claimed.
 */
export function decodeAutoSessionStatePayload(
  raw: string | undefined,
  now: number,
  maxAgeMs: number = AUTO_SESSION_STATE_MAX_AGE_MS,
): AutoSessionState | undefined {
  if (raw === undefined || raw.trim() === '') return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const { savedAt, ids } = parsed as Partial<AutoSessionStatePayload>
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return undefined
  if (now - savedAt > maxAgeMs) return undefined
  return { savedAt, ids: uniqueIds(ids) }
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
  return decodeAutoSessionStatePayload(raw, now, maxAgeMs)?.ids ?? []
}

/**
 * Union of two id lists, order-preserving and de-duplicated.
 *
 * A release-time snapshot merges what the live read sees with what the
 * continuous record saw earlier, because the live read can run after the
 * official teardown already moved the sessions off Auto — or fail outright.
 */
export function mergeAutoSessionIds(primary: readonly string[], secondary: readonly string[]): string[] {
  return uniqueIds([...primary, ...secondary])
}

/**
 * Split a recorded id list into what one replay can restore now and what has
 * to stay recorded.
 *
 * A recorded id counts as restorable as soon as a live session carries it; ids
 * without a live session (not loaded yet, or already gone) remain in the file.
 */
export function planAutoSnapshotReplay(
  ids: readonly string[],
  live: readonly { id: string }[],
): AutoSnapshotReplay {
  const present = new Set<string>()
  for (const session of live) {
    if (typeof session.id === 'string' && session.id !== '') present.add(session.id)
  }
  const restore: string[] = []
  const remaining: string[] = []
  for (const id of uniqueIds(ids)) {
    if (present.has(id)) restore.push(id)
    else remaining.push(id)
  }
  return { restore, remaining }
}
