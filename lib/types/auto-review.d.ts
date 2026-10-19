/**
 * Model Switch-owned Auto reviewer row.
 *
 * The official `@deepseek-ai/dsh-experimental-auto-review` gate hardwires its
 * reviewer to the session's own request route (`header.config`). This row runs
 * the official `apply` under a scoped child context whose `llm` service is
 * shadowed by a wrapper that rewrites only `stream()`'s provider/model — and
 * only when the reviewing session's derived route (its provider group's
 * reviewer pair, else the deployment-wide reviewer card) pins one. With no
 * route pinned the wrapper passes options through by identity, so the reviewer
 * follows the session model exactly.
 *
 * Although the official gate omits `sessionId` and `purpose` from its frozen
 * `GenerateOptions`, its `tools/pre-execute` waterfall listener receives
 * `exec.agent` (`exec.agent.session`). After running `official.apply(scope)`,
 * this module registers a `{ prepend: true }` `tools/pre-execute` listener on
 * the same scope — which Cordis places ahead of the official gate's listener in
 * the waterfall — and binds `exec.agent?.session` in an `AsyncLocalStorage`
 * scope around `next()`. Every `scope.llm.stream()` call from `classifyRisk`
 * therefore resolves the exact session being reviewed, with zero cross-session
 * interference when multiple sessions review tool calls concurrently.
 *
 * The official gate stays an opt-in capability: the row mounts it only when
 * the profile actually started with the experimental-auto-review bundle.
 * `cordis.patch.yml` disables the official row (one `registerAuto` per
 * context), so this row is its replacement rather than a second registration.
 *
 * @module dsh-model-switch/auto-review
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Context } from '@deepseek-ai/cordis';
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { Session } from '@deepseek-ai/dsh-session';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "model-switch-auto-review";
/**
 * Only the services this row's own code touches.
 *
 * The official gate used to run inside this row's fiber, so this list had to
 * mirror every service the official `apply` reads. DSH 0.2.1 added
 * `workingDirectory` to the official gate and the mirror went stale, which made
 * every tool call fail with `cannot get property "workingDirectory" without
 * inject`. The gate is now mounted as its own plugin (see {@link autoReviewGate}),
 * so cordis resolves the official dependency list — including future additions —
 * and this row declares only what it reads itself.
 */
export declare const inject: string[];
/** Pinned reviewer route; both identifiers are non-empty. */
export interface AutoReviewRoute {
    readonly provider: string;
    readonly model: string;
}
/** Minimal public llm face the official gate uses (it calls exactly `stream`). */
export interface ReviewLlm {
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
/**
 * Resolve the pinned reviewer route from live settings.
 * @param settings - Model Switch settings carrying the optional reviewer pair.
 * @returns Both identifiers trimmed and non-empty, or undefined (follow session).
 */
export declare function autoReviewRouteOf(settings: {
    readonly autoReviewProvider?: string;
    readonly autoReviewModel?: string;
} | undefined): AutoReviewRoute | undefined;
/**
 * Wrap the real llm service so only `stream()` route fields are rewritten.
 *
 * Non-`stream` members pass through bound to the real service (Proxy reads
 * would otherwise hand methods the proxy as `this`). The route is re-read per
 * call so a settings change applies to the very next review without a reload.
 *
 * @param real - the host's `ctx.llm`.
 * @param route - live route resolver; undefined means "do not rewrite".
 * @returns A structurally compatible llm face for the scoped context.
 */
export declare function reviewLlm(real: ReviewLlm, route: () => AutoReviewRoute | undefined): ReviewLlm;
/**
 * Resolve the reviewer route for one session (or deployment-wide when no session is bound).
 *
 * @param ctx - host context whose modelSwitch settings and sessionProjections derive the route.
 * @param session - the session whose tool call is being reviewed, when known.
 * @returns The derived reviewer route, or undefined to follow the session model.
 */
export declare function resolveSessionAutoReviewRoute(ctx: Context, session?: Session): AutoReviewRoute | undefined;
/**
 * Install the outer `tools/pre-execute` correlation listener ahead of the official gate.
 *
 * Because Cordis `on(..., { prepend: true })` unshifts onto the event hook list,
 * registering this listener AFTER `official.apply(scope)` places it at index 0
 * — directly ahead of the official gate's own prepended listener — so
 * `activeSession.run(exec.agent?.session, next)` wraps the entire official
 * review execution.
 *
 * @param scope - the review scope context where the gate is mounted.
 * @param activeSession - AsyncLocalStorage holding the session under review.
 */
export declare function bindAutoReviewSessionCorrelation(scope: Context, activeSession: AsyncLocalStorage<Session | undefined>): void;
/**
 * Build the scoped context the official gate runs under.
 * @param ctx - host context whose modelSwitch settings pin the reviewer route.
 * @param activeSession - optional AsyncLocalStorage correlating each `tools/pre-execute` call to its session.
 * @returns A child context shadowing the llm service and, when the permission
 * preset service is reachable, that service too.
 */
export declare function reviewScope(ctx: Context, activeSession?: AsyncLocalStorage<Session | undefined>): Context;
/** The permission-preset face the official gate reads; structural so a missing package never breaks a build. */
export interface PermissionPresetsFace {
    current(session: Session): string;
    set(session: Session, preset: string): unknown;
    registerAuto(admit: () => void): unknown;
}
/**
 * Wrap the permission-preset service so the official gate's per-call probe can
 * never fail a tool call.
 *
 * DSH's Auto gate starts every `tools/pre-execute` with
 * `permissionPresets.current(session)`, and that method resolves the presets
 * service's own `sessionProjections` injection. When the presets fiber has
 * turned inactive the probe throws `cannot get required service
 * "sessionProjections" in inactive context` outside the gate's reviewer error
 * wrapper, so every tool call dies. This wrapper degrades the probe to
 * `custom` (the gate then skips review and calls `next()`), reports the lost
 * capability once, and keeps the tool backend alive; the registration and
 * teardown paths degrade the same way instead of throwing.
 *
 * @param real - the host's permission-preset service.
 * @param log - the row logger used for the single degradation report.
 * @returns A structurally compatible preset face.
 */
export declare function defensivePermissionPresets(real: PermissionPresetsFace, log: {
    warn(line: string): void;
}): PermissionPresetsFace;
/**
 * Structural view of the official gate's plugin face.
 *
 * `name` and `inject` are part of the module's released plugin contract; the
 * gate is mounted through cordis rather than called directly so its own
 * dependency list is what the fiber resolves.
 */
export interface OfficialAutoReviewGate {
    readonly apply: (ctx: Context) => void;
    readonly inject?: readonly string[];
    readonly name?: string;
}
/** The plugin face handed to cordis, with the official dependency list kept. */
export interface MountedAutoReviewGate {
    readonly name: string;
    readonly inject?: string[];
    readonly apply: (gateCtx: Context) => void;
}
/**
 * Wrap the official gate as a plugin that declares its own dependencies.
 *
 * Directly calling `official.apply(scope)` ran the gate's code on this row's
 * fiber, so every service the gate reads had to be mirrored in this row's
 * `inject`. Mounting it instead lets cordis resolve the official list, which is
 * what keeps a released Host's new dependency (0.2.1's `workingDirectory`) from
 * breaking every tool call. The hooks let the caller observe whether the gate
 * actually ran before it binds the session-correlation listener.
 *
 * @param gate - the official module (or an equivalent structural gate).
 * @param hooks - applied/failure observers; the failure is rethrown.
 * @returns A cordis plugin mounting the official gate unchanged.
 */
export declare function autoReviewGate(gate: OfficialAutoReviewGate, hooks?: {
    readonly onApplied?: () => void;
    readonly onFailure?: (error: unknown) => void;
}): MountedAutoReviewGate;
/**
 * Mount the official gate under the reviewer-route scope.
 *
 * A profile that never enabled the optional bundle keeps no Auto preset and no
 * reviewer; a deployment missing the official package reports the lost
 * capability explicitly instead of guessing another path.
 */
export declare function apply(ctx: Context): Promise<void>;
