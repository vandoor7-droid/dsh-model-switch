/**
 * Plan-exit compaction on the Host: measure, threshold, then summarize the
 * history with the switched-to model before the approval resumes the session.
 *
 * The approval answer lands inside a still-open `exit_plan_mode` tool call, so
 * the agent phase is `running` and the idle-only `compactNow` seam is off
 * limits. This module therefore uses `compactIfNeeded(agent, 'context-overflow')`
 * — the same turn-safe, threshold-free operation official overflow recovery
 * uses — under an isolated `compaction-basic` engine configured to summarize
 * with the route the human just chose. The user's threshold decides *whether*
 * to call it; the engine's overflow policy guarantees one useful balanced
 * reduction whenever a safe range exists.
 *
 * @module dsh-model-switch/plan-compact
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { type Session } from '@deepseek-ai/dsh-session';
import type { ModelSwitchSettings } from './host-settings.js';
import { type PlanCompactOutcome, type PlanCompactRequest } from './picker/plan-compact.js';
import { type SwitchRoute } from './switch-compact.js';
/** Receives one card-initiated compaction request over the plugin RPC. */
export type PlanCompactRunner = (request: PlanCompactRequest, signal: AbortSignal) => Promise<PlanCompactOutcome>;
/** The compaction engine face this module drives (compaction-basic's service). */
export interface PlanCompactEngine {
    compactIfNeeded(agent: Agent, trigger: 'context-overflow', signal: AbortSignal): Promise<unknown>;
}
/** Minimal measurement face so unit tests can price a stubbed session. */
export interface PlanCompactMeter {
    measure(session: Session, header?: unknown): {
        totalTokens: number;
    };
}
/**
 * Estimate the next request's input tokens under both envelopes.
 *
 * Takes the larger of the target-route heuristic price and the previous
 * envelope's anchored price — the same conservative stance the send-time
 * switch guard takes, so dense histories cannot under-trigger the threshold.
 *
 * @param meter — replay token meter.
 * @param session — session about to resume.
 * @param route — the switched-to provider/model.
 * @returns Estimated tokens, or undefined when no prior request exists to price.
 */
export declare function estimatePlanExitTokens(meter: PlanCompactMeter, session: Session, route: SwitchRoute): number | undefined;
/** Shape compaction-basic's default export exposes to this module. */
export interface PlanCompactEngineModule {
    default: new (ctx: Context, config: {
        auto: false;
        summarizationProvider: string;
        summarizationModel: string;
        compactionRetries: 0;
    }) => unknown;
}
/**
 * Drive one compaction through an already-mounted isolated engine.
 * @param engine — engine whose overflow policy selects the range.
 * @param agent — live agent owning the session.
 * @param signal — cancellation scoped to this request.
 * @returns `empty` when no safe range exists, `compacted` after a summary, `error` on failure.
 */
export declare function planCompactWithEngine(engine: Pick<PlanCompactEngine, 'compactIfNeeded'>, agent: Agent, signal: AbortSignal): Promise<PlanCompactOutcome>;
/**
 * Mount an isolated compaction-basic engine pinned to the switched-to route
 * and run one overflow-policy reduction over the agent's session.
 * @param ctx — host context that owns token metering and session state.
 * @param agent — live agent about to resume the approved plan.
 * @param route — provider/model whose model must write the summary.
 * @param signal — cancellation scoped to this request.
 * @param loadEngine — dynamic import seam (tests inject the fake module).
 * @returns The compaction outcome for this request.
 */
export declare function runPlanCompaction(ctx: Context, agent: Agent, route: SwitchRoute, signal: AbortSignal, loadEngine?: () => Promise<PlanCompactEngineModule>): Promise<PlanCompactOutcome>;
/**
 * Build the `plan-compact` RPC runner bound to this host's live settings.
 * @param ctx — host context resolving the live agent registry.
 * @param settings — live Model Switch settings (`planCompactThreshold`).
 * @param loadEngine — dynamic import seam (tests inject the fake module).
 * @returns The runner the connection RPC dispatches to.
 */
export declare function planCompactRunner(ctx: Context, settings: () => ModelSwitchSettings, loadEngine?: () => Promise<PlanCompactEngineModule>): PlanCompactRunner;
