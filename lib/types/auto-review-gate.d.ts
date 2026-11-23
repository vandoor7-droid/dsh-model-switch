/**
 * Model Switch's owned Auto-review gate (the "purge takeover").
 *
 * The official `@deepseek-ai/dsh-experimental-auto-review` row this plugin
 * mounts is host-plane code: a third-party host patch (dsh-purge-community
 * 1.7.20, applied 2026-11-23) inserted `return next()` as the first line of
 * its `tools/pre-execute` listener, which silently disabled review for every
 * call regardless of the permission preset. This module forks that review
 * pipeline — snapshot assembly, reviewer request, decision protocol, denial
 * surfaces — verbatim from the official 0.2.2-rc.5 implementation, so the
 * review path lives in this plugin's own source and survives host-package
 * patches. The official package keeps only the registration choreography
 * (`registerAuto`, teardown, dependency gating) it still mounts.
 *
 * Calibration source: `@deepseek-ai/dsh-experimental-auto-review` 0.2.2-rc.5
 * `lib/index.js` (behavior ported line-for-line; the snapshot logic and the
 * REVIEW_POLICY text must track that file — compat-watch diffs it per line).
 *
 * The gate is armed only when the profile started the dsh-purge-community
 * bundle and the `autoReviewOwnGate` setting is not explicitly off; the
 * official gate stays mounted either way, and the two never double-review:
 * whichever listener engages first marks the ambient call context, and the
 * `permissionPresets` shadow in `./auto-review.ts` answers `custom` for the
 * other (see the coordination notes on {@link OwnGateCallContext}).
 *
 * @module dsh-model-switch/auto-review-gate
 */
import type { GenerateOptions } from '@deepseek-ai/dsh-llm';
import type { Session } from '@deepseek-ai/dsh-session';
import type { PreToolDecision } from '@deepseek-ai/dsh-tools';
import type { Context } from '@deepseek-ai/cordis';
/** The decision surface the pre-execute waterfall expects (dsh-tools' own shape). */
type GateDecision = PreToolDecision;
/**
 * Minimal structural faces of the session log the snapshot reads.
 *
 * These mirror the official gate's reads; the shapes are part of the released
 * session format and are covered by compat-watch.
 */
export interface ReviewEvent {
    readonly type: string;
    readonly seq: number;
    readonly data: any;
}
/** The pending execution's face (subset of dsh-tools' ToolExecution). */
export interface OwnGateExecution {
    readonly name: string;
    readonly arguments: unknown;
    readonly rootCallId: string;
    readonly callId: string;
    readonly parent: unknown | undefined;
    readonly signal: AbortSignal;
    readonly agent: {
        readonly session: Session;
    } | undefined;
    readonly schema: {
        readonly name: string;
        readonly description: string;
        readonly parameters: unknown;
    } | undefined;
}
/** What one own-gate review carries in the ambient call context. */
export interface OwnGateCallContext {
    /** Marks a call whose review decision another listener already made. */
    handled: boolean;
    /** Marks a call the official gate's listener is engaging with. */
    officialEngaged: boolean;
}
/** One frozen reviewer snapshot. */
export interface AutoReviewSnapshot {
    readonly provider: string;
    readonly model: string;
    readonly cwd: string;
    readonly history: readonly unknown[];
    readonly pending: {
        readonly key: string;
        readonly schema: {
            name: string;
            description: string;
            parameters: unknown;
        };
    };
}
/**
 * Freeze the reviewer input from one session and pending execution (official parity).
 * @param session - the session whose durable surface and request header authorize the call.
 * @param exec - immutable pending execution.
 * @param cwd - the session's current working directory.
 * @param shown - schemas earlier reviews of this session showed.
 * @returns the exact route, environment, and history ending with the pending call.
 */
export declare function snapshotAutoReview(session: Session, exec: OwnGateExecution, cwd: string, shown: ReadonlyMap<string, {
    name: string;
    description: string;
    parameters: unknown;
}>): AutoReviewSnapshot;
/** Render the environment and one message per retained item (official parity). */
export declare function reviewMessages(snapshot: AutoReviewSnapshot): Array<{
    role: 'user';
    content: Array<{
        type: 'text';
        text: string;
    }>;
}>;
/** Count members in the raw top-level JSON object. */
export declare function topLevelMemberCount(text: string): number;
/** One parsed reviewer decision. */
export interface ReviewDecision {
    readonly risk: 'low' | 'medium' | 'high';
    readonly decision: 'allow' | 'deny';
    readonly reason?: string;
}
/** Parse the closed risk/decision protocol and its fixed safety combinations. */
export declare function parseDecision(text: string): ReviewDecision;
/** Consume zero or more reasoning blocks, one JSON text block, and one terminal stop. */
export declare function readDecision(stream: AsyncIterable<unknown>): Promise<ReviewDecision>;
/** Minimal llm face the gate uses (it calls exactly `stream`). */
export interface GateLlm {
    stream(options: GenerateOptions): AsyncIterable<unknown>;
}
/** Structural face of the workingDirectory service the gate reads. */
export interface GateWorkingDirectory {
    ensure(agent: {
        readonly session: Session;
    }, signal: AbortSignal): Promise<string>;
}
/** Structural face of the approval service the gate reads. */
export interface GateApproval {
    overrideOf(session: Session): string;
}
/** Review one frozen pending action with the fixed policy and the scoped llm route. */
export declare function classifyRisk(deps: {
    readonly llm: GateLlm;
    readonly workingDirectory: GateWorkingDirectory;
}, session: Session, exec: OwnGateExecution, signal: AbortSignal, shown: Map<string, {
    name: string;
    description: string;
    parameters: unknown;
}>): Promise<ReviewDecision>;
/** Materialize the fixed model-facing final Auto denial plus optional UI detail. */
export declare function denied(exec: OwnGateExecution, reason: string | undefined): GateDecision;
/** Ask the user to decide one call the reviewer denied. */
export declare function askUser(exec: OwnGateExecution, reason: string | undefined): GateDecision;
/** Materialize a reviewer failure as its own error rather than a denial. */
export declare function failed(exec: OwnGateExecution, error: unknown): GateDecision;
/** The ambient call context shape the own gate coordinates through. */
export interface OwnGateAmbient {
    readonly session: Session | undefined;
    readonly tool: string;
    /** Marks a call whose review decision another listener already made. */
    handled?: boolean;
    /** Marks a call the official gate's listener is engaging with. */
    officialEngaged?: boolean;
}
/** Wiring the own gate needs from the mounting row. */
export interface OwnGateOptions {
    /** The ambient store shared with the correlation wrapper and the preset shadow. */
    readonly activeSession: {
        getStore(): OwnGateAmbient | undefined;
    };
    /** Whether the own gate should engage (purge bundle present and the setting on). */
    readonly isActive: () => boolean;
    /** The raw preset read (the real service — never the defensive shadow). */
    readonly currentPreset: (session: Session) => string;
    /** Whether the tool is allowlisted (the live settings read). */
    readonly skipReadOnly: (tool: string) => boolean;
    /** Count one read-only skip on the shared status counter. */
    readonly countReadOnlySkip: () => void;
}
/**
 * Register this row's own review listener on the gate context.
 *
 * The listener is registered with `{ prepend: true }` after the official gate's
 * apply, so it sits ahead of the official listener in the waterfall; the
 * correlation wrapper (bound later, also prepended) stays outermost. Whichever
 * listener engages first marks the ambient context (`handled` for ours, the
 * shadow's `custom` answer for the official probe), so a call is never reviewed
 * twice regardless of mount ordering.
 *
 * @param gateCtx - the context the official gate mounted under (services resolve
 * through the review scope: the llm proxy routes the reviewer, the shadowed
 * permissionPresets is bypassed via {@link OwnGateOptions.currentPreset}).
 * @param options - the wiring from the mounting row.
 */
export declare function installOwnReviewGate(gateCtx: Context, options: OwnGateOptions): void;
export {};
