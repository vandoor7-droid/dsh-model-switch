/**
 * Model Switch-owned session-naming row.
 *
 * The official naming rows hardwire the naming route at registration time: the
 * configured provider/model pair wins over the session's own logged route for
 * every session in the profile. This row registers ONE provider of its own and
 * resolves the route PER REQUEST instead, so a session whose provider has a
 * saved group is named through that group's pair while every other session keeps
 * following its own model.
 *
 * The call itself stays inside the official implementation: the exported
 * `generateSessionTitleWithLlm` receives the session-resolved config and records
 * exactly that route in `session/title-llm-request`, so the durable record and
 * the actual request can never disagree. Nothing is remounted when settings
 * change — the route is read through on every naming request — so a settings
 * save can neither interrupt an in-flight naming request nor leave the profile
 * without a registered provider.
 *
 * `cordis.patch.yml` disables the official row (the seam allows one registered
 * provider per context), and this row mirrors the cadence the disabled row
 * declared, so a profile that restated the row as all-prompts keeps its cadence.
 *
 * @module dsh-model-switch/session-title
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Entry, Loader } from '@deepseek-ai/cordis-plugin-loader'
import type {
  SessionTitleAutomaticMode,
  SessionTitleProviderId,
  SessionTitleProviderRequest,
  SessionTitleProviderResult,
  SessionTitleUserMessage,
} from '@deepseek-ai/dsh-session-title'
import type { ResolvedSessionTitleLlmConfig, SessionTitleLlmConfig } from '@deepseek-ai/dsh-session-title-llm'
import type { ModelSwitchSettings } from './host-settings.js'
import { resolveCapabilityRoute, sessionProviderOf, type CapabilityRoute } from './session-route.js'

/** Official session-title provider row this module supersedes. */
const OFFICIAL_TITLE_ROW = 'session-title-llm'

/** The auxiliary-LLM package carrying the shared naming policy and call. */
const TITLE_LLM_PACKAGE = '@deepseek-ai/dsh-session-title-llm'

/** Cordis plugin identity; matches the cordis.patch.yml insert row id. */
export const name = 'model-switch-session-title'

/** The loader names the disabled row, and the seam services the call needs are awaited before the first naming request. */
export const inject = ['loader', 'sessionTitle', 'llm']

/** One official cadence package; the row's own package selects which one this profile runs. */
export interface TitleCadence {
  /** Official npm package that declares this cadence. */
  readonly pkg: string
  /** Provider id recorded with every generated title; mirrors the official registration. */
  readonly id: SessionTitleProviderId
  /** When the service starts automatic generation. */
  readonly automatic: SessionTitleAutomaticMode
  /** Whether only the first human message is framed into the request. */
  readonly firstPromptOnly: boolean
}

/** Both official cadence packages, in the order a profile may declare them. */
export const TITLE_CADENCES: readonly TitleCadence[] = Object.freeze([
  Object.freeze({
    pkg: '@deepseek-ai/dsh-session-title-first-prompt-llm',
    id: 'session-title-first-prompt-llm' as SessionTitleProviderId,
    automatic: 'first-prompt' as SessionTitleAutomaticMode,
    firstPromptOnly: true,
  }),
  Object.freeze({
    pkg: '@deepseek-ai/dsh-session-title-all-prompts-llm',
    id: 'session-title-all-prompts-llm' as SessionTitleProviderId,
    automatic: 'all-prompts' as SessionTitleAutomaticMode,
    firstPromptOnly: false,
  }),
])

/**
 * The cadence one official package name declares.
 * @param pkg - the disabled row's package name.
 * @returns The matching cadence, or undefined for a row this row cannot mirror.
 */
export function titleCadence(pkg: string | undefined): TitleCadence | undefined {
  if (pkg === undefined) return undefined
  return TITLE_CADENCES.find(cadence => cadence.pkg === pkg)
}

/**
 * Overlay the session-resolved route over the row's own validated policy.
 *
 * A resolved route always names both halves. When nothing resolves, the row's
 * own policy is returned unchanged: an explicit pair the profile configured on
 * the official row stays the deployment default, and a row without one keeps
 * following each session's logged route.
 * @param config - policy validated from the disabled official row.
 * @param route - session-resolved naming route, or undefined for the row's own policy.
 * @returns A detached config for one naming request.
 */
export function composeTitleRoute(config: ResolvedSessionTitleLlmConfig, route: CapabilityRoute | undefined): ResolvedSessionTitleLlmConfig {
  if (route === undefined) return config
  return { ...config, provider: route.provider, model: route.model }
}

/**
 * Frame the exact human messages one naming revision represents.
 * @param messages - every eligible human message of the revision.
 * @param firstPromptOnly - cadence flag: true mirrors the first-prompt provider.
 * @returns The selected messages, in order.
 * @throws when a first-prompt cadence receives an empty revision — the official provider's own contract.
 */
export function selectTitleMessages(
  messages: readonly SessionTitleUserMessage[],
  firstPromptOnly: boolean,
): readonly SessionTitleUserMessage[] {
  if (!firstPromptOnly) return messages
  const first = messages[0]
  if (first === undefined) throw new Error('first-prompt title provider requires one human message')
  return [first]
}

/**
 * Locate the official session-title provider row in the loader tree.
 * Disabled entries stay in the tree, so a name-matched disable still matches.
 * @param loader - the host loader, when one is reachable.
 * @returns The official entry, or undefined when this profile has no such row.
 */
export function officialTitleEntry(loader: Loader | undefined): Entry | undefined {
  if (!loader) return undefined
  for (const entry of loader.entries()) {
    if (entry.id === OFFICIAL_TITLE_ROW) return entry
    const pkg = entry.options?.name
    if (typeof pkg === 'string' && TITLE_CADENCES.some(cadence => cadence.pkg === pkg)) return entry
  }
  return undefined
}

/**
 * Copy the official row's stored config, ignoring non-object payloads.
 * @param entry - the official session-title provider entry.
 * @returns A plain object spread; missing or invalid configs become `{}`. The
 * result is untrusted: the profile may be hand-edited, so the official policy
 * validator runs over it before any naming request is served.
 */
export function forwardedConfig(entry: Entry): Partial<SessionTitleLlmConfig> {
  const raw: unknown = entry.options?.config
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Partial<SessionTitleLlmConfig>
  return {}
}

/**
 * The official package name this row mounts (either cadence).
 * @param entry - the official session-title provider entry.
 * @returns The package name, or undefined when the row declares none.
 */
export function officialTitlePackage(entry: Entry): string | undefined {
  const pkg = entry.options?.name
  return typeof pkg === 'string' && pkg.trim() !== '' ? pkg : undefined
}

/**
 * Read live Model Switch settings without requiring the host row.
 *
 * The host is read structurally instead of injected so this row keeps mirroring
 * the official naming behavior when the `model-switch` row is disabled: an
 * unreachable host resolves to the row's own policy rather than to a pinned
 * route.
 * @param ctx - this row's context.
 * @returns The settings, or undefined when the host is unavailable.
 */
function currentSettings(ctx: Context): ModelSwitchSettings | undefined {
  try {
    return ctx.get('modelSwitch', false)?.currentSettings()
  } catch {
    return undefined
  }
}

/** The auxiliary-LLM module surface this row binds to, loaded at activation. */
type TitleLlmModule = typeof import('@deepseek-ai/dsh-session-title-llm')

/** One fixed naming implementation: the resolved policy plus the row's cadence. */
interface NamingPlan {
  readonly cadence: TitleCadence
  readonly config: ResolvedSessionTitleLlmConfig
}

/**
 * Execute one naming request through the official implementation.
 *
 * The route is resolved from the session being titled — its provider selects the
 * saved group, and the flat settings pair is the deployment default — and is
 * handed to `generateSessionTitleWithLlm`, which frames the request, records the
 * exact route in `session/title-llm-request`, and validates the result.
 * @param ctx - this row's context, exposing `llm`.
 * @param module - the loaded auxiliary-LLM module.
 * @param plan - the profile's fixed naming policy.
 * @param request - service-owned session, message revision, and cancellation.
 * @returns The official provider result.
 */
async function generateTitle(
  ctx: Context,
  module: TitleLlmModule,
  plan: NamingPlan,
  request: SessionTitleProviderRequest,
): Promise<SessionTitleProviderResult> {
  const provider = sessionProviderOf(ctx, request.session)
  const route = resolveCapabilityRoute(currentSettings(ctx), provider, 'title')
  return module.generateSessionTitleWithLlm(
    ctx,
    composeTitleRoute(plan.config, route),
    request,
    selectTitleMessages(request.messages, plan.cadence.firstPromptOnly),
    plan.cadence.id,
  )
}

/**
 * Mount the Model Switch session-naming row for this profile.
 *
 * A profile with no official naming row, an unrecognized row package, a missing
 * auxiliary-LLM package, or an invalid stored policy keeps the session-title
 * service's deterministic fallback titles and reports the lost capability
 * explicitly instead of guessing a route. The registration is an effect of this
 * row's fiber, so unloading the profile unregisters the provider.
 * @param ctx - this row's context.
 */
export async function apply(ctx: Context): Promise<void> {
  const entry = officialTitleEntry(ctx.get('loader', false))
  // A `disabled` official row is not an instantiated loader entry, so the row to
  // mirror can be absent even while the profile still declares it. Mirroring the
  // shipped first-prompt default keeps model-backed naming alive in that case:
  // dropping the provider here would silently restore fallback titles, which is
  // exactly the capability this row exists to configure.
  const cadence = titleCadence(entry === undefined ? undefined : officialTitlePackage(entry)) ?? TITLE_CADENCES[0]
  if (cadence === undefined) return
  if (entry === undefined) ctx.logger.info('model-switch: no instantiated official session-title row to mirror; naming uses the first-prompt cadence')
  /** The displaced row's naming policy, or the official defaults when it is absent. */
  const forwarded: Partial<SessionTitleLlmConfig> = entry === undefined ? {} : forwardedConfig(entry)
  let module: TitleLlmModule
  try {
    module = await import(TITLE_LLM_PACKAGE)
  } catch (cause) {
    ctx.logger.error(`model-switch: ${TITLE_LLM_PACKAGE} is unavailable; model-backed session naming cannot run at all`)
    ctx.logger.error(cause)
    return
  }
  let config: ResolvedSessionTitleLlmConfig
  try {
    config = module.resolveSessionTitleLlmConfig(forwarded as SessionTitleLlmConfig)
  } catch (cause) {
    ctx.logger.error('model-switch: the official session-title row has no valid naming policy; naming keeps the deterministic fallback')
    ctx.logger.error(cause)
    return
  }
  const plan: NamingPlan = { cadence, config }
  try {
    ctx.sessionTitle.register({
      id: cadence.id,
      automatic: cadence.automatic,
      generate: request => generateTitle(ctx, module, plan, request),
    })
  } catch (cause) {
    // One provider per context: another row already owns the seam, and this row
    // must report that instead of silently replacing or racing it.
    ctx.logger.error('model-switch: another session-title provider is already registered; the configurable naming route is unavailable')
    ctx.logger.error(cause)
  }
}
