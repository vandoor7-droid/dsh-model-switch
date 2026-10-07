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
 * A commit and the compensation of the Host's own deployment-default write are
 * separate facts: only a failed commit may hold the answer back, because the
 * Host persists a Session selection as the deployment default on several
 * releases and this plugin restores the captured Main default afterwards. A
 * failed restore is announced, never fatal — the Session selection the human
 * asked for is already installed.
 */
export interface PlanCommitOutcome {
    /** The Session now runs the requested provider/model/effort. */
    committed: boolean;
    /** The captured Main default is the effective one again. */
    mainDefaultRestored: boolean;
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
export declare function approvePlanReview(args: {
    select: (selection: ModelSelection) => Promise<PlanCommitOutcome>;
    selection: ModelSelection;
    current?: ModelSelection | null;
    answer: () => Promise<void>;
    /** Announced after a successful answer when the Main default could not be restored. */
    onNotRestored?: (notice: string) => void;
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
