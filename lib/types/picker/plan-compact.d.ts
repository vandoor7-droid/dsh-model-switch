/**
 * Plan-exit compaction vocabulary shared by the card and the Host RPC.
 *
 * The card decides *when* to ask (only an approval that switches the execution
 * model); the Host owns measurement, threshold policy, and the compaction
 * itself. Failures are explicit: the Plan stays pending and can be retried,
 * while an empty history is a completed attempt that may proceed.
 *
 * @module dsh-model-switch/picker/plan-compact
 */
/** One plan-exit compaction request: the session and its switched-to route. */
export interface PlanCompactRequest {
    readonly sessionId: string;
    readonly provider: string;
    readonly model: string;
}
/**
 * Outcome of one plan-exit compaction request.
 *
 * - `disabled` — the threshold is 0; execution proceeds untouched.
 * - `skipped` — the estimate is at or below the threshold (or unknown); proceed.
 * - `compacted` — a useful range was summarized with the switched-to model.
 * - `empty` — nothing safe could be compacted; proceed with a notice.
 * - `error` — compaction did not complete; the Plan must stay pending.
 */
export type PlanCompactStatus = 'disabled' | 'skipped' | 'compacted' | 'empty' | 'error';
export interface PlanCompactOutcome {
    readonly status: PlanCompactStatus;
    /** Estimated next-request input tokens, when measurement succeeded. */
    readonly estimate?: number;
    /** The token threshold applied to this decision. */
    readonly threshold?: number;
    /** Failure detail; required only for `error`. */
    readonly message?: string;
}
/** Resolve the Host's verdict for one measured context against the threshold. */
export type PlanCompactDecision = 'disabled' | 'skip' | 'compact';
/** Whether the user's threshold arms the plan-exit mechanism at all. */
export declare function planCompactEnabled(threshold: number): boolean;
/**
 * Decide whether a plan exit must compact before it switches models.
 * @param threshold — user-configured token threshold; 0 disables the mechanism.
 * @param estimate — measured next-request input tokens.
 * @returns `disabled` when off, `compact` only above the threshold, else `skip`.
 */
export declare function planCompactDecision(threshold: number, estimate: number): PlanCompactDecision;
/** Runtime guard for the wire value returned by the Host RPC. */
export declare function isPlanCompactOutcome(value: unknown): value is PlanCompactOutcome;
