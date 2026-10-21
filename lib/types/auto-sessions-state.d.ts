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
/** A decoded snapshot: the ids recorded at `savedAt`. */
export interface AutoSessionState {
    savedAt: number;
    ids: string[];
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
    restore: string[];
    remaining: string[];
}
/** Serialize the session ids that were on Auto at `savedAt`. */
export declare function encodeAutoSessionState(ids: readonly string[], savedAt: number): string;
/**
 * Decode a snapshot written by {@link encodeAutoSessionState}, keeping the
 * timestamp so a partial replay can write the rest back with the original
 * expiry instead of restarting the replay window.
 *
 * Every malformed or stale shape degrades to `undefined`: an unreadable state
 * file must never stop the Auto registration from being released or re-claimed.
 */
export declare function decodeAutoSessionStatePayload(raw: string | undefined, now: number, maxAgeMs?: number): AutoSessionState | undefined;
/**
 * Decode a snapshot written by {@link encodeAutoSessionState}.
 *
 * Every malformed or stale shape degrades to `[]`: an unreadable state file
 * must never stop the Auto registration from being released or re-claimed.
 */
export declare function decodeAutoSessionState(raw: string | undefined, now: number, maxAgeMs?: number): string[];
/**
 * Union of two id lists, order-preserving and de-duplicated.
 *
 * A release-time snapshot merges what the live read sees with what the
 * continuous record saw earlier, because the live read can run after the
 * official teardown already moved the sessions off Auto — or fail outright.
 */
export declare function mergeAutoSessionIds(primary: readonly string[], secondary: readonly string[]): string[];
/**
 * Split a recorded id list into what one replay can restore now and what has
 * to stay recorded.
 *
 * A recorded id counts as restorable as soon as a live session carries it; ids
 * without a live session (not loaded yet, or already gone) remain in the file.
 */
export declare function planAutoSnapshotReplay(ids: readonly string[], live: readonly {
    id: string;
}[]): AutoSnapshotReplay;
