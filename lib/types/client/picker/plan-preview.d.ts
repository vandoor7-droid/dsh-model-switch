/**
 * Restore the official full-plan sidebar preview under the takeover card.
 *
 * The takeover replaces the official QuestionComposer in the
 * `conversation.composer` chain, and that composer is the only entry allowed
 * to render `conversation.plan-review.actions` (the SlotRegistry enforces one
 * declarer per child key, and `renderSlot` dispatch checks the *rendering*
 * entry's own children table). This module therefore drives ui-plan's own
 * registered opener — its inject face owns the `dsh-resource://plan-review`
 * address, the logged-plan branch, and the sidebar-mounted gate — instead of
 * re-deriving any of them here. If ui-plan is absent, every operation
 * degrades to "unavailable" and the card keeps working.
 */
import type { StoredEntry } from '@deepseek-ai/dsh-client-ui-slots';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { PlanReview } from '@deepseek-ai/dsh-client-ui-user-questions/client';
/** Minimal registry face the binding reads (the public slot ledger snapshot). */
export interface PlanPreviewSlots {
    entries(key: string): readonly StoredEntry[];
}
/** Sideways navigation controls for the full plan document in the right sidebar. */
export interface PlanPreviewBinding {
    /** Whether ui-plan's opener entry is registered right now. */
    available(): boolean;
    /** Open the full plan immediately; returns false when unavailable. */
    open(sessionId: SessionId, review: PlanReview, requestKey: string): boolean;
    /** Open once as soon as a Session is on screen; idempotent per review identity. */
    autoOpen(sessionId: SessionId, review: PlanReview, requestKey: string): () => void;
}
/**
 * Stable identity of one review's sidebar preview.
 * @param sessionId - session that owns the review.
 * @param review - narrowed plan review.
 * @param requestKey - pending-question request key.
 * @returns `session:call:<callId>` for a logged plan, else `session:review:<requestKey>`.
 */
export declare function planPreviewIdentity(sessionId: SessionId, review: PlanReview, requestKey: string): string;
/**
 * Whether this process already opened the preview for one review identity.
 * @param identity - value from {@link planPreviewIdentity}.
 * @returns True once opened.
 */
export declare function wasPlanPreviewOpened(identity: string): boolean;
/**
 * Bind the preview navigation to one slot registry.
 * @param slots - the live registry ledger.
 * @returns an idempotent binding usable from the card's render and effects.
 */
export declare function createPlanPreviewBinding(slots: PlanPreviewSlots): PlanPreviewBinding;
