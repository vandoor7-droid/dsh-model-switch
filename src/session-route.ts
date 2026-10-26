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

import type { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-projection'
import type { ModelSelection } from '@deepseek-ai/dsh-api-session-controller/types'
import { groupOf, type ProviderGroupConfig, type ProviderGroups } from './provider-group.js'

/** Capabilities whose route can be derived per session. */
export type CapabilityId = 'compaction' | 'autoReview' | 'title' | 'subagent' | 'memory'

/** A complete pinned route; either half missing means "follow the default". */
export interface CapabilityRoute {
  readonly provider: string
  readonly model: string
}

/**
 * Settings fields a route can be derived from. Structurally satisfied by
 * {@link ModelSwitchSettings}; declared separately so the resolver stays pure
 * and testable without a host runtime.
 */
export interface RouteBearingSettings {
  readonly subagentMode?: string
  readonly subagentProvider?: string
  readonly subagentModel?: string
  readonly subagentReasoningEffort?: string
  readonly autoReviewProvider?: string
  readonly autoReviewModel?: string
  readonly compactProvider?: string
  readonly compactModel?: string
  readonly titleProvider?: string
  readonly titleModel?: string
  readonly memoryProvider?: string
  readonly memoryModel?: string
  readonly providerGroups?: ProviderGroups
}

/** Flat deployment-default fields per capability, in group-storage field names. */
const CAPABILITY_FIELDS: Readonly<Record<CapabilityId, { readonly provider: string; readonly model: string }>> = Object.freeze({
  compaction: { provider: 'compactProvider', model: 'compactModel' },
  autoReview: { provider: 'autoReviewProvider', model: 'autoReviewModel' },
  title: { provider: 'titleProvider', model: 'titleModel' },
  subagent: { provider: 'subagentProvider', model: 'subagentModel' },
  memory: { provider: 'memoryProvider', model: 'memoryModel' },
})

/** A non-blank string; blank values behave exactly like an absent field. */
function present(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/** Read one capability's pair from a flat route record; undefined unless both halves are present. */
function pairOf(source: object | undefined, fields: { readonly provider: string; readonly model: string }): CapabilityRoute | undefined {
  if (source === undefined) return undefined
  const record = source as Record<string, unknown>
  const provider = record[fields.provider]
  const model = record[fields.model]
  if (!present(provider) || !present(model)) return undefined
  return { provider, model }
}

/**
 * The deployment-wide route for one capability: the flat settings pair.
 * @param settings - live Model Switch settings; undefined means none are reachable.
 * @param capability - capability whose flat pair is read.
 * @returns The complete pair, or undefined when the capability stays at its official/derived default.
 */
export function deploymentRoute(settings: RouteBearingSettings | undefined, capability: CapabilityId): CapabilityRoute | undefined {
  return pairOf(settings, CAPABILITY_FIELDS[capability])
}

/**
 * The distillation route one deployment should use.
 *
 * Distillation is a background pipeline with no session of its own, so the group
 * key is the deployment default provider (the provider the profile starts
 * sessions on) rather than a session's provider. A provider without a group falls
 * back to the flat memory pair; an empty pair leaves the memory plugin at its own
 * default.
 * @param settings - live Model Switch settings.
 * @param provider - the deployment default provider, when one is observable.
 * @returns The complete pair, or undefined when nothing is pinned.
 */
export function memoryRouteOf(settings: RouteBearingSettings | undefined, provider: string | undefined): CapabilityRoute | undefined {
  return groupRoute(settings, provider, 'memory') ?? deploymentRoute(settings, 'memory')
}

/** One capability's route plus the reasoning effort a subagent spawn also carries. */
export interface SubagentRoute extends CapabilityRoute {
  readonly reasoningEffort?: string
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
export function subagentRouteOf(settings: RouteBearingSettings | undefined, provider: string | undefined): SubagentRoute | undefined {
  const group = groupRoute(settings, provider, 'subagent')
  if (group !== undefined) {
    const effort = groupOf(settings?.providerGroups, provider ?? '')?.subagentReasoningEffort
    return present(effort) ? { ...group, reasoningEffort: effort } : group
  }
  if (settings?.subagentMode !== 'fixed') return undefined
  const fixed = deploymentRoute(settings, 'subagent')
  if (fixed === undefined) return undefined
  return present(settings.subagentReasoningEffort) ? { ...fixed, reasoningEffort: settings.subagentReasoningEffort } : fixed
}

/**
 * One provider's saved route for one capability.
 * @param settings - live Model Switch settings carrying the group table.
 * @param provider - the session's provider; blank or unknown resolves to undefined.
 * @param capability - capability whose group pin is read.
 * @returns The complete group pair, or undefined when the group pins nothing here.
 */
export function groupRoute(
  settings: RouteBearingSettings | undefined,
  provider: string | undefined,
  capability: CapabilityId,
): CapabilityRoute | undefined {
  if (!present(provider)) return undefined
  const group: ProviderGroupConfig | undefined = groupOf(settings?.providerGroups, provider)
  return pairOf(group, CAPABILITY_FIELDS[capability])
}

/**
 * One provider group's pin for one capability, as the settings page shows it.
 */
export interface CapabilityGroupPin {
  /** The provider whose sessions this group applies to. */
  readonly provider: string
  /** The pinned route. */
  readonly route: CapabilityRoute
  /** A subagent spawn's effort; only meaningful for `subagent`. */
  readonly reasoningEffort?: string
}

/**
 * Every provider group that overrides one capability, provider-sorted.
 *
 * Reads the stored table only and never attributes a session, so a caller can
 * describe the layering ("this is the default; these groups override it")
 * without claiming which layer a given session receives.
 * @param groups - the normalized provider → group map.
 * @param capability - capability whose group pins are collected.
 * @returns The complete pins, ordered by provider id; empty when no group pins it.
 */
export function capabilityGroupPins(groups: ProviderGroups | undefined, capability: CapabilityId): readonly CapabilityGroupPin[] {
  const pins: CapabilityGroupPin[] = []
  if (groups === undefined) return pins
  for (const provider of Object.keys(groups).sort()) {
    const group = groups[provider]
    const route = pairOf(group, CAPABILITY_FIELDS[capability])
    if (route === undefined) continue
    const effort = capability === 'subagent' ? group?.subagentReasoningEffort : undefined
    pins.push(present(effort) ? { provider, route, reasoningEffort: effort } : { provider, route })
  }
  return pins
}

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
export function resolveCapabilityRoute(
  settings: RouteBearingSettings | undefined,
  provider: string | undefined,
  capability: CapabilityId,
): CapabilityRoute | undefined {
  return groupRoute(settings, provider, capability) ?? deploymentRoute(settings, capability)
}

/** The subset of the projection registry this module reads; structural so a missing package never breaks a build. */
interface ModelSelectionReader {
  stateOf(session: Session, key: 'modelSelection'): { readonly lastUsed?: ModelSelection | null; readonly pending?: ModelSelection | null } | undefined
}

/**
 * Read the provider from the durable model-selection projection.
 * @param ctx - context that may expose `sessionProjections`.
 * @param session - the session whose selection is read.
 * @returns The pending provider, else the last-used provider, else undefined.
 */
function projectionProvider(ctx: Context, session: Session): string | undefined {
  let state: { readonly lastUsed?: ModelSelection | null; readonly pending?: ModelSelection | null } | undefined
  try {
    const registry = ctx.get('sessionProjections', false) as unknown as ModelSelectionReader | undefined
    state = registry?.stateOf(session, 'modelSelection')
  } catch {
    state = undefined
  }
  if (state === undefined) return undefined
  if (present(state.pending?.provider)) return state.pending.provider
  if (present(state.lastUsed?.provider)) return state.lastUsed.provider
  return undefined
}

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
export function sessionProviderOf(ctx: Context, session: Session | undefined): string | undefined {
  if (session === undefined) return undefined
  const selected = projectionProvider(ctx, session)
  if (selected !== undefined) return selected
  try {
    const context = session.requestContext()?.provider
    if (present(context)) return context
    const header = session.requestHeader()?.config.provider
    if (present(header)) return header
  } catch {
    return undefined
  }
  return undefined
}

/**
 * The subagent route one exact session's spawns should use.
 * @param ctx - context used for the optional session reads.
 * @param session - the delegating session; undefined keeps official inherit.
 * @param settings - live Model Switch settings.
 * @returns The complete route, or undefined for official inherit.
 */
export function sessionSubagentRouteOf(
  ctx: Context,
  session: Session | undefined,
  settings: RouteBearingSettings | undefined,
): SubagentRoute | undefined {
  return subagentRouteOf(settings, sessionProviderOf(ctx, session))
}
