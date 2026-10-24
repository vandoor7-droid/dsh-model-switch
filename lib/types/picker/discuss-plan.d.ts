/**
 * Withdraw a pending plan review so the human can speak instead.
 *
 * The card used to only dismiss the pending question. Inside plan mode that
 * dismissal makes the tool call return `ASK_CANCELLED`, the model answers, and
 * the turn ends as **completed** — and the transcript folds every completed
 * turn's work details at the configured timing (`collapseTiming: 'completion'`
 * by default). The human then has to re-expand the steps they were reading.
 *
 * Interrupting the turn instead ends it as **aborted**, which the transcript's
 * own always-open rule keeps permanently expanded:
 *
 * ```js
 * const reason = turnLocation?.end?.data.reason.kind
 * const alwaysOpen = presentation?.turnClosed === false
 *   || presentation?.hasInterleavedInput === true
 *   || reason === 'aborted' || reason === 'interrupted' || reason === 'error'
 * ```
 *
 * It also returns the composer, because the pending question settles either way.
 * The official Stop button takes the same route (`conversation.cancel()`), so
 * this is a shipped seam rather than a special case.
 *
 * @module dsh-model-switch/picker/discuss-plan
 */
/** How the review was withdrawn. */
export type DiscussOutcome = 'interrupted' | 'dismissed';
/** Session-scoped turn cancellation, when the Host exposes one. */
export type CancelTurn = (sessionId: string) => Promise<void>;
/**
 * Withdraw the review by interrupting the turn, falling back to dismissal.
 *
 * Order matters: cancellation is what keeps the work details expanded, so it is
 * tried first and only genuinely unavailable/refused cancellation falls through
 * to the released withdrawal (which still gives the human the composer back, just
 * without the expansion guarantee).
 *
 * @param cancelTurn - the session cancel seam; absent on a Host without one.
 * @param sessionId - the session whose turn is being withdrawn.
 * @param dismiss - the released `PendingQuestion` withdrawal.
 * @returns Which route withdrew the review.
 */
export declare function discussPlan(cancelTurn: CancelTurn | undefined, sessionId: string, dismiss: () => Promise<void>): Promise<DiscussOutcome>;
