/**
 * Dismissal seam for one pending question card.
 *
 * The published `PendingQuestion` renamed its "user closed this card" verb:
 * the 0.1.x generation rejected the Host waterfall through `cancel()`
 * (documented as *Reject the Host waterfall because the user closed the
 * question*), while the 0.2.x generation splits hiding from cancelling and
 * exposes only `dismiss()`. Both mean the same product action here — the user
 * takes the turn back to speak — because plan mode maps `ASK_CANCELLED` to
 * "the user dismissed the plan review to speak instead; stay in plan mode,
 * stop here, and wait for their message".
 *
 * Probe the method instead of the version: a Host may ship either generation,
 * and neither seam means the takeover must fail loudly rather than answer.
 */

export type PendingDismissal = 'dismiss' | 'cancel'

/** The card surface this module needs; every generation satisfies a subset. */
export interface PendingDismissible {
  /** 0.2.x: withdraw the card (and end an unnamed request); request stays live for a named card. */
  dismiss?: () => Promise<void>
  /** 0.1.x: reject the Host waterfall so the user can speak instead. */
  cancel?: () => Promise<void>
}

/** Raised when the running Host exposes neither withdrawal verb. */
export class PlanDismissalUnsupportedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlanDismissalUnsupportedError'
  }
}

/**
 * Withdraw a pending card so the human can talk instead, on either generation.
 * @param wait - the matched pending question carrier.
 * @returns Which verb withdrew the card.
 * @throws {PlanDismissalUnsupportedError} when the carrier exposes neither verb.
 */
export async function dismissPendingQuestion(wait: PendingDismissible): Promise<PendingDismissal> {
  if (typeof wait.dismiss === 'function') {
    await wait.dismiss()
    return 'dismiss'
  }
  if (typeof wait.cancel === 'function') {
    await wait.cancel()
    return 'cancel'
  }
  throw new PlanDismissalUnsupportedError(
    'this DSH Host exposes neither PendingQuestion.dismiss() (0.2.x) nor PendingQuestion.cancel() (0.1.x)',
  )
}
