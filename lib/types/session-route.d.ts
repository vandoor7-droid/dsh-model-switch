/**
 * Per-session capability route derivation.
 *
 * Model Switch stores one deployment-wide route per capability (the flat
 * settings fields) plus, per provider, a saved provider group. Nothing is
 * written when a session changes provider: this module DERIVES the route a
 * capability should use for one session from (a) the session's own provider and
 * (b) the stored group table. Two sessions on different providers therefore
 * resolve independently, and no session's actions rewrite another session's
 * route.
 *
 * The session's provider is read from durable, official state in this order:
 * the `modelSelection` session projection (`pending` before `lastUsed`, so a
 * selection the user just made counts), then the latest logged request-context
 * route, then the latest `request/header` route. Every read is optional: a
 * session with no observable provider, an unregistered projection, or a
 * profile without the projection package all resolve to the deployment default,
 * which is exactly the pre-derivation behavior.
 *
 * All functions are pure except the readers, which never throw and never write.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Session } from '@deepseek-ai/dsh-session';
import { type ProviderGroups } from './provider-group.js';
/** Capabilities whose route can be derived per session. */
export type CapabilityId = 'compaction' | 'autoReview' | 'title' | 'subagent';
/** A complete pinned route; either half missing means "follow the default". */
export interface CapabilityRoute {
    readonly provider: string;
    readonly model: string;
}
/**
 * Settings fields a route can be derived from. Structurally satisfied by
 * {@link ModelSwitchSettings}; declared separately so the resolver stays pure
 * and testable without a host runtime.
 */
export interface RouteBearingSettings {
    readonly subagentMode?: string;
    readonly subagentProvider?: string;
    readonly subagentModel?: string;
    readonly subagentReasoningEffort?: string;
    readonly autoReviewProvider?: string;
    readonly autoReviewModel?: string;
    readonly compactProvider?: string;
    readonly compactModel?: string;
    readonly titleProvider?: string;
    readonly titleModel?: string;
    readonly providerGroups?: ProviderGroups;
}
/**
 * The deployment-wide route for one capability: the flat settings pair.
 * @param settings - live Model Switch settings; undefined means none are reachable.
 * @param capability - capability whose flat pair is read.
 * @returns The complete pair, or undefined when the capability stays at its official/derived default.
 */
export declare function deploymentRoute(settings: RouteBearingSettings | undefined, capability: CapabilityId): CapabilityRoute | undefined;
/** One capability's route plus the reasoning effort a subagent spawn also carries. */
export interface SubagentRoute extends CapabilityRoute {
    readonly reasoningEffort?: string;
}
/**
 * The route a subagent spawn should use for one parent-session provider.
 *
 * A saved group for that provider pins the spawn; otherwise the flat Subagent
 * card pins it, but only in `fixed` mode — `follow-main` IS the official inherit
 * path, expressed by leaving the request untouched rather than by naming it.
 * @param settings - live Model Switch settings.
 * @param provider - the delegating session's provider, when one is observable.
 * @returns The complete route, or undefined for official inherit.
 */
export declare function subagentRouteOf(settings: RouteBearingSettings | undefined, provider: string | undefined): SubagentRoute | undefined;
/**
 * One provider's saved route for one capability.
 * @param settings - live Model Switch settings carrying the group table.
 * @param provider - the session's provider; blank or unknown resolves to undefined.
 * @param capability - capability whose group pin is read.
 * @returns The complete group pair, or undefined when the group pins nothing here.
 */
export declare function groupRoute(settings: RouteBearingSettings | undefined, provider: string | undefined, capability: CapabilityId): CapabilityRoute | undefined;
/**
 * The route one capability should use for one session.
 *
 * A saved provider group for the session's provider wins; otherwise the flat
 * deployment default applies. An unknown session provider skips every group, so
 * a session Model Switch cannot attribute keeps the deployment default.
 * @param settings - live Model Switch settings.
 * @param provider - the session's provider, when one is observable.
 * @param capability - capability being resolved.
 * @returns The complete pair, or undefined for the capability's official default.
 */
export declare function resolveCapabilityRoute(settings: RouteBearingSettings | undefined, provider: string | undefined, capability: CapabilityId): CapabilityRoute | undefined;
/**
 * The provider one session is using, from official durable state.
 *
 * Preferred source is the session's own model selection (it covers a switch the
 * client has sent but no request has consumed yet); the logged request-context
 * and request-header routes cover profiles without the projection package and
 * replayed sessions that never emitted a selection.
 * @param ctx - context used for the optional projection read.
 * @param session - the session to resolve; undefined resolves to undefined.
 * @returns The provider, or undefined when nothing durable names one.
 */
export declare function sessionProviderOf(ctx: Context, session: Session | undefined): string | undefined;
/**
 * The subagent route one exact session's spawns should use.
 * @param ctx - context used for the optional session reads.
 * @param session - the delegating session; undefined keeps official inherit.
 * @param settings - live Model Switch settings.
 * @returns The complete route, or undefined for official inherit.
 */
export declare function sessionSubagentRouteOf(ctx: Context, session: Session | undefined, settings: RouteBearingSettings | undefined): SubagentRoute | undefined;
