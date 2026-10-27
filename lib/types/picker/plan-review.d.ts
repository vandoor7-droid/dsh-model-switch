import type { ModelSelection } from '@deepseek-ai/dsh-api-session-controller/types';
import type { ComposerChainProps } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { PendingQuestion, PlanReview } from '@deepseek-ai/dsh-client-ui-user-questions/client';
export type { PlanReview } from '@deepseek-ai/dsh-client-ui-user-questions/client';
export type PlanReviewOption = PlanReview['approve'];
type QuestionItem = PendingQuestion['questions'][number];
export declare function planReviewOf(questions: readonly QuestionItem[]): PlanReview | undefined;
export declare function selectPlanReview(owner: ComposerChainProps): PendingQuestion | null;
export declare class PlanApprovalResponseError extends Error {
    constructor(message: string, options?: {
        cause?: unknown;
    });
}
/**
 * Result of committing the draft execution model before answering a review.
 *
 * Only a failed commit may hold the answer back: once `committed` is true the
 * Session runs the requested selection, and the answer proceeds under it.
 */
export interface PlanCommitOutcome {
    /** The Session now runs the requested provider/model/effort. */
    committed: boolean;
}
/**
 * Diagnostic text for one failed action, keeping the wire code visible.
 * Official Remote failures carry a code that names the owning domain
 * (`session/writer-held`, `session/model-unavailable`, …); dropping it leaves
 * the human with copy they cannot act on.
 * @param cause - the thrown value.
 * @returns The message, prefixed with the nearest available code.
 */
export declare function planErrorText(cause: unknown): string;
/**
 * Commit the execution model a Plan card holds, then run its exit.
 *
 * Shared by every exit (approve, keep, discuss, run-as-goal): the card's picker
 * is a draft, so an exit that skipped this call left the session on the model
 * the review opened with. An unchanged selection short-circuits without a
 * second commit, and a refused commit returns `false` **without** running the
 * exit, so the caller can keep the card open and show the error.
 *
 * @param args.select - commits one selection onto the session.
 * @param args.selection - the execution model the card currently holds.
 * @param args.current - the session's committed selection, for the short-circuit.
 * @param args.answer - the exit to run once the commit landed.
 * @returns whether the exit ran.
 */
export declare function approvePlanReview(args: {
    select: (selection: ModelSelection) => Promise<PlanCommitOutcome>;
    selection: ModelSelection;
    current?: ModelSelection | null;
    answer: () => Promise<void>;
}): Promise<boolean>;
export interface PlanActionState {
    busy: boolean;
    blocked: boolean;
    error: string | null;
}
export interface PlanActionView {
    approveDisabled: boolean;
    error: string | null;
}
export declare function planActionView(state: PlanActionState, available: boolean, hasExecution: boolean): PlanActionView;
export declare function settlePlanAction(send: () => Promise<void>, update: (state: PlanActionState) => void): Promise<boolean>;
