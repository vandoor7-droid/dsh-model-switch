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
export declare const AUTO_SESSION_STATE_MAX_AGE_MS: number;
/** Serialize the session ids that were on Auto at `savedAt`. */
export declare function encodeAutoSessionState(ids: readonly string[], savedAt: number): string;
/**
 * Decode a snapshot written by {@link encodeAutoSessionState}.
 *
 * Every malformed or stale shape degrades to `[]`: an unreadable state file
 * must never stop the Auto registration from being released or re-claimed.
 */
export declare function decodeAutoSessionState(raw: string | undefined, now: number, maxAgeMs?: number): string[];
