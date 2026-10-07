/**
 * Hand a reviewed plan to the Host's goal domain before its review is answered.
 *
 * Goal state is owned by `@deepseek-ai/dsh-goal`: this module only drives the
 * released client remote (`ctx.remote.goals`), keeps no goal state of its own,
 * and never schedules continuation — `dsh-goal-round-driver` owns that. The
 * shape below mirrors the published remote face structurally so the plugin
 * neither imports generated client modules nor hard-requires the goal package
 * in a deployment that does not mount it.
 *
 * Goal creation is deliberately outside DSH's own goal surface ("Goal creation
 * remains outside this package"), so the published `remote.goals.create` is the
 * one seam this feature relies on; if a future Host drops it, the capability
 * reports `unsupported` instead of guessing another path.
 */
/** Compare-and-set identity of the current goal; carried by every live view. */
export interface GoalRef {
    readonly id: string;
    readonly revision: number;
}
/** Detached live view a client reads back from the goal remote. */
export interface GoalView extends GoalRef {
    readonly phase: 'active' | 'paused' | 'blocked' | 'complete';
    readonly activation: 'armed' | 'disarmed';
}
/** Envelope every generated remote method resolves to on the wire. */
export type GoalRemoteResult<T> = {
    readonly ok: true;
    readonly value: T;
} | {
    readonly ok: false;
    readonly error: {
        readonly code: string;
        readonly message: string;
    };
};
/** The released `ctx.remote.goals` surface this feature uses. */
export interface GoalRemote {
    /** Create and arm a goal for the session's live Agent. */
    create(sessionId: string, request: {
        readonly objective: string;
    }): Promise<GoalRemoteResult<{
        readonly ref: GoalRef;
    }>>;
    /** Current goal for the session, absent before the first create and after a clear. */
    get(sessionId: string): Promise<GoalRemoteResult<GoalView | null | undefined>>;
    /** Remove the current goal; its history stays in the session log. */
    clear(sessionId: string, ref: GoalRef): Promise<GoalRemoteResult<unknown>>;
}
/** Outcome of setting a plan as the session's goal. */
export type GoalHandoff = {
    readonly kind: 'created';
} | {
    readonly kind: 'replaced';
}
/** The deployment mounts no goal service; the caller must not proceed. */
 | {
    readonly kind: 'unsupported';
} | {
    readonly kind: 'failed';
    readonly code?: string;
    readonly message: string;
};
/**
 * Make the plan text this session's armed goal, replacing any unfinished goal.
 *
 * Ordering mirrors the card's own commit-then-answer rule: a refusal here keeps
 * the Plan pending instead of approving work that no goal tracks. The replace
 * path clears rather than edits so a new plan receives a fresh round budget —
 * `edit` would inherit the rounds the previous goal already spent.
 *
 * @param remote - the released goal remote, absent when no goal package is mounted.
 * @param sessionId - the session that owns both the review and the goal.
 * @param plan - the plan markdown under review.
 * @returns Whether the goal now tracks this plan, or why it does not.
 */
export declare function setPlanAsGoal(remote: GoalRemote | undefined, sessionId: string, plan: string): Promise<GoalHandoff>;
