/**
 * Re-apply a plugin row's config in the running Host, without a Host restart.
 *
 * Cordis exposes this seam on the fiber that owns one loader row
 * (`@deepseek-ai/cordis` `lib/types/fiber.d.ts`):
 *
 *   update(config: any, noSave?: boolean): void
 *   // Validate and apply new config, then restart the plugin. Runs the
 *   // `internal/update` waterfall first, so update hooks (and HMR) can veto or
 *   // replace the restart. `noSave` — hint for persistence hooks not to write
 *   // the change back.
 *
 * So a row can be "remounted" with a config this plugin computed, while the
 * profile document stays ours to write (or untouched, for rows this plugin only
 * adapts in memory). Two consequences are deliberately the caller's business:
 *
 * - the remount disposes the running plugin instance, so whatever runtime state
 *   that instance held (a verdict cache, breaker counters, open streams) is
 *   gone afterwards;
 * - `noSave` is a *hint*, not a guarantee — a loader with a persistence hook may
 *   still write the merged config back.
 *
 * This module only owns the mechanics: pick the fiber, refuse to touch a row
 * that is not settled, contain every failure, and report what happened. It never
 * throws and never persists anything itself.
 *
 * @module
 */

import type { Entry } from '@deepseek-ai/cordis-plugin-loader'

/**
 * `FiberState.ACTIVE`. The enum is a `const enum`, so the numeric value is what
 * the running build carries; comparing it here keeps the check independent of
 * an import that may be erased by the compiler.
 */
const FIBER_ACTIVE = 2

/** How one hot config application ended. */
export type HotUpdateOutcome =
  /** The row was reloaded with the new config. */
  | 'updated'
  /** The row has no fiber (not mounted, or already torn down). */
  | 'no-fiber'
  /** The row is mid-transition; the change was skipped on purpose. */
  | 'not-active'
  /** The new config failed the plugin's own validation, or the reload threw. */
  | 'failed'

/** Result of one hot config application. */
export interface HotUpdateResult {
  /** What happened. */
  readonly outcome: HotUpdateOutcome
  /** The failure text, when `outcome === 'failed'`. */
  readonly error?: string | undefined
}

/** Render an unknown throwable for a log line. */
function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/**
 * Apply `config` to one live row by restarting its fiber with that config.
 *
 * The caller keeps responsibility for *when* this is safe (for example: only
 * when the value actually changed, and only for rows whose restart cannot cut a
 * call the user is waiting on). This function does not validate that policy.
 *
 * @param entry - the loader row to reload; `undefined` is reported, not thrown.
 * @param config - the complete raw config the row should run with.
 * @returns the outcome; never throws.
 */
export async function applyFiberConfig(entry: Entry | undefined, config: unknown): Promise<HotUpdateResult> {
  const fiber = entry?.fiber
  if (entry === undefined || fiber === undefined) return { outcome: 'no-fiber' }
  if (fiber.state !== FIBER_ACTIVE) return { outcome: 'not-active' }
  try {
    fiber.update(config, true)
  } catch (cause: unknown) {
    return { outcome: 'failed', error: messageOf(cause) }
  }
  try {
    // Resolves once the reload settled; a startup error from the new config
    // surfaces here (the row is left FAILED, which the status line reports).
    await fiber.await()
  } catch (cause: unknown) {
    return { outcome: 'failed', error: messageOf(cause) }
  }
  return { outcome: 'updated' }
}
