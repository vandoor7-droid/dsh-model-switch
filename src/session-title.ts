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
 * The call itself stays inside the official implementation: the auxiliary-LLM
 * package records exactly the route that was called in `session/title-llm-request`,
 * so the durable record and the actual request can never disagree. Nothing is
 * remounted when settings change — the route is read through on every naming
 * request — so a settings save can neither interrupt an in-flight naming request
 * nor leave the profile without a registered provider.
 *
 * Two official auxiliary-LLM lines are supported, selected at runtime from the
 * module surface, because the 0.2.1 release replaced the shared title call:
 * - Up to DSH 0.2.0 (`generateSessionTitleWithLlm`): the module owns the system
 *   prompt, input framing, and output validation; the shared policy carries the
 *   title-length targets.
 * - DSH 0.2.1+ (`executeSessionTitleLlm`): the provider owns the system prompt,
 *   the input, the reasoning-effort selection, and the output interpretation;
 *   the shared policy carries execution controls only. This row mirrors the
 *   official provider's wording and interpretation so a configured route keeps
 *   the official behavior.
 *
 * A naming request that fails is retried once with a widened output budget
 * (max-token failures only) and then falls through the remaining route
 * candidates — the session group's pair, the deployment-wide pair, the row's own
 * pair, then the session's logged route — so one unavailable model or provider
 * cannot leave the session on its deterministic fallback title forever.
 *
 * `cordis.patch.yml` disables the official rows (the seam allows one registered
 * provider per context), and this row mirrors the cadence a disabled row
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
import type { ResolvedSessionTitleLlmConfig } from '@deepseek-ai/dsh-session-title-llm'
import type { ModelSwitchSettings } from './host-settings.js'
import {
  deploymentRoute,
  groupRoute,
  sessionProviderOf,
  type CapabilityRoute,
  type RouteBearingSettings,
} from './session-route.js'

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

/** Execution controls both official auxiliary-LLM lines validate; defaults mirror the shipped official rows. */
const EXECUTION_DEFAULTS = Object.freeze({ maxInputBytes: 4096, maxOutputTokens: 64, timeoutMs: 60_000 })

/** Provider-owned title-length targets: required by the pre-0.2.1 line and moved into providers by 0.2.1. */
const TARGET_DEFAULTS = Object.freeze({ targetWords: 5, targetCjkCharacters: 10 })

/** Execution keys accepted by both lines; provider-owned keys are excluded on purpose. */
const EXECUTION_KEYS = Object.freeze(['maxInputBytes', 'maxOutputTokens', 'timeoutMs', 'provider', 'model'])

/** Title-length targets that shape the system instruction. */
export interface TitleLengthTargets {
  readonly targetWords: number
  readonly targetCjkCharacters: number
}

/** Route-bearing execution policy shared by both official auxiliary-LLM lines. */
export interface TitleLlmPolicy {
  readonly maxInputBytes: number
  readonly maxOutputTokens: number
  readonly timeoutMs: number
  readonly provider?: string
  readonly model?: string
}

/** The model metadata `executeSessionTitleLlm` hands its reasoning selector. */
export interface TitleModelMetadata {
  readonly reasoning?: { readonly efforts?: readonly { readonly id: string }[] }
}

/** Provider-owned preparation for one 0.2.1+ auxiliary title request. */
export interface PreparedTitleCall {
  readonly system: string
  readonly input: string
  readonly messageSeqs: readonly SessionTitleUserMessage['seq'][]
  readonly selectReasoningEffort: (model: TitleModelMetadata) => string | undefined
}

/** One content block of the assembled 0.2.1+ auxiliary response. */
export interface TitleResponseBlock {
  readonly type: string
  readonly text?: string
}

/** The assembled 0.2.1+ auxiliary response this row interprets. */
export interface TitleLlmResponse {
  readonly blocks: readonly TitleResponseBlock[]
  readonly finish: { readonly kind: string }
  readonly model: { readonly provider: string; readonly model: string }
}

/** The auxiliary-LLM module surface; the call entry point differs per DSH line. */
type TitleLlmModule = typeof import('@deepseek-ai/dsh-session-title-llm')

/** Pre-0.2.1 shared call: it owns framing and returns the finished title. */
type LegacyTitleCall = (
  ctx: Context,
  config: ResolvedSessionTitleLlmConfig,
  request: SessionTitleProviderRequest,
  messages: readonly SessionTitleUserMessage[],
  titleProvider: SessionTitleProviderId,
) => Promise<SessionTitleProviderResult>

/** 0.2.1+ shared call: it returns the assembled response for the provider to interpret. */
type ModernTitleCall = (
  ctx: Context,
  config: TitleLlmPolicy,
  request: SessionTitleProviderRequest,
  titleProvider: SessionTitleProviderId,
  prepared: PreparedTitleCall,
) => Promise<TitleLlmResponse>

/**
 * Read one call entry point without assuming it exists.
 *
 * The module namespace of a host line that does not export the name can throw on
 * access (mocked namespaces do), so a missing entry point reads as undefined
 * instead of failing the row.
 * @param module - the loaded auxiliary-LLM package.
 * @param key - the call entry point to read.
 * @returns The callable, or undefined when this line does not expose it.
 */
function titleCallOf(module: TitleLlmModule, key: 'executeSessionTitleLlm' | 'generateSessionTitleWithLlm'): ((...args: never[]) => unknown) | undefined {
  try {
    const value = (module as unknown as Record<string, unknown>)[key]
    return typeof value === 'function' ? value as (...args: never[]) => unknown : undefined
  } catch {
    return undefined
  }
}

/** The untrusted policy split both lines consume. */
export interface SplitTitlePolicy {
  readonly execution: Record<string, unknown>
  readonly targets: TitleLengthTargets
}

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
export function composeTitleRoute(config: TitleLlmPolicy, route: CapabilityRoute | undefined): TitleLlmPolicy {
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
export function forwardedConfig(entry: Entry): Record<string, unknown> {
  const raw: unknown = entry.options?.config
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  return {}
}

/**
 * The official package name this row mounts (either cadence).
 * @param entry - the official session-title provider entry.
 * @returns The package name, or undefined when the row declares none.
 */
export function officialTitlePackage(entry: Entry): string | undefined {
  const pkg = entry.options?.name
  if (typeof pkg !== 'string' || pkg.trim() === '') return undefined
  return pkg
}

/** A positive integer, or undefined for anything else (blank, fractional, negative, non-number). */
function positiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return undefined
  return value
}

/**
 * Split one untrusted stored policy into the halves both official lines accept.
 *
 * Execution controls pass through untouched (an invalid value still fails the
 * official validator). Absent execution fields fall back to the shipped
 * official defaults, because a profile that mounts no official row has no
 * policy to forward and this row must still run. Title-length targets are read
 * here for the system instruction: the pre-0.2.1 line wants them in its shared
 * config, while 0.2.1 moved them into each provider.
 * @param forwarded - the disabled official row's stored config.
 * @returns The execution subset and the title-length targets.
 */
export function splitTitlePolicy(forwarded: Record<string, unknown>): SplitTitlePolicy {
  const execution: Record<string, unknown> = {}
  for (const key of EXECUTION_KEYS) {
    const value = forwarded[key]
    if (value !== undefined) execution[key] = value
  }
  for (const [key, fallback] of Object.entries(EXECUTION_DEFAULTS)) {
    if (execution[key] === undefined) execution[key] = fallback
  }
  return {
    execution,
    targets: {
      targetWords: positiveInteger(forwarded.targetWords) ?? TARGET_DEFAULTS.targetWords,
      targetCjkCharacters: positiveInteger(forwarded.targetCjkCharacters) ?? TARGET_DEFAULTS.targetCjkCharacters,
    },
  }
}

/**
 * Detect the 0.2.1+ auxiliary-LLM line.
 * @param module - the loaded auxiliary-LLM package.
 * @returns Whether the module exposes the provider-prepared call.
 */
export function isModernTitleModule(module: TitleLlmModule): boolean {
  return titleCallOf(module, 'executeSessionTitleLlm') !== undefined
}

/** One validated naming policy: the execution config plus the targets the system instruction needs. */
export interface ResolvedNamingPolicy {
  readonly config: TitleLlmPolicy
  readonly targets: TitleLengthTargets
}

/**
 * Validate the stored policy through the official validator of the installed line.
 * @param module - the loaded auxiliary-LLM package.
 * @param forwarded - the disabled official row's stored config.
 * @returns The validated execution config and title-length targets.
 * @throws when the official validator rejects the stored policy.
 */
export function resolveNamingPolicy(module: TitleLlmModule, forwarded: Record<string, unknown>): ResolvedNamingPolicy {
  const split = splitTitlePolicy(forwarded)
  const resolve = module.resolveSessionTitleLlmConfig as unknown as (config: unknown) => Partial<TitleLlmPolicy> & Partial<TitleLengthTargets>
  if (isModernTitleModule(module)) {
    // 0.2.1 rejects provider-owned keys in the shared config, so targets stay out.
    return { config: resolve(split.execution) as TitleLlmPolicy, targets: split.targets }
  }
  // Pre-0.2.1 lines require the targets alongside the execution controls.
  const config = resolve({ ...split.execution, ...split.targets })
  return {
    config: config as TitleLlmPolicy,
    targets: {
      targetWords: config.targetWords ?? split.targets.targetWords,
      targetCjkCharacters: config.targetCjkCharacters ?? split.targets.targetCjkCharacters,
    },
  }
}

/**
 * Candidate routes for one naming request, most specific first and deduplicated.
 *
 * The stored session group's pair wins, then the deployment-wide pair, then the
 * row's own configured pair, then the session's logged route. The list is also
 * the fallback order: a failing candidate falls through to the next one.
 * @param settings - live Model Switch settings; undefined skips the stored pairs.
 * @param provider - the delegating session's provider, when one is observable.
 * @param policy - the validated row policy (its own pair is the third candidate).
 * @param requestRoute - the session's logged main-request route, when one exists.
 * @returns The ordered, deduplicated candidates; empty when only the row policy applies.
 */
export function titleRouteCandidates(
  settings: RouteBearingSettings | undefined,
  provider: string | undefined,
  policy: TitleLlmPolicy,
  requestRoute: CapabilityRoute | undefined,
): readonly CapabilityRoute[] {
  const candidates: CapabilityRoute[] = []
  const push = (route: CapabilityRoute | undefined): void => {
    if (route === undefined) return
    if (candidates.some(candidate => candidate.provider === route.provider && candidate.model === route.model)) return
    candidates.push(route)
  }
  push(groupRoute(settings, provider, 'title'))
  push(deploymentRoute(settings, 'title'))
  if (policy.provider !== undefined && policy.model !== undefined) push({ provider: policy.provider, model: policy.model })
  push(requestRoute)
  return candidates
}

/** One route candidate with its composed execution config. */
interface TitleAttempt {
  readonly route: CapabilityRoute | undefined
  readonly config: TitleLlmPolicy
}

/**
 * Whether a failure may be retried on another candidate.
 * A superseded or disposed request keeps no budget, and a deadline that fired is
 * the caller's bound, not the route's fault: both end the attempt loop.
 * @param error - the failure thrown by the auxiliary call.
 * @param request - the service-owned request whose signal bounds the work.
 * @returns Whether another candidate may be tried.
 */
export function shouldTryNextCandidate(error: unknown, request: SessionTitleProviderRequest): boolean {
  if (request.signal.aborted) return false
  const code = (error as { readonly code?: unknown } | null)?.code
  return code !== 'SESSION_TITLE_TIMEOUT'
}

/**
 * Whether the failure is the model filling its output budget before finishing.
 * Official lines report this as `title output reached maxOutputTokens`; a widened
 * budget is the only retry that can succeed for it.
 * @param error - the failure thrown by the auxiliary call.
 * @returns Whether one widened-budget retry is worth trying.
 */
export function isMaxTokensFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return /maxoutputtokens|max[-_ ]tokens/iu.test(error.message)
}

/**
 * A widened output budget for the same route.
 * @param maxOutputTokens - the policy's configured budget.
 * @returns Four times the budget, capped at 4096 tokens.
 */
export function widerTitleBudget(maxOutputTokens: number): number {
  return Math.min(maxOutputTokens * 4, 4096)
}

/** Asterisk emphasis wrapping a whole line, such as `**Title**`. */
const EMPHASIS_WRAPPER = /^(?<marker>\*{1,3})(?<inner>\S(?:.*\S)?)\k<marker>$/u

/** OSC control sequences, such as a title hyperlink. */
const OSC_SEQUENCE = /(?:\u001B\]|\u009D)(?:(?!\u0007|\u001B\\)[\s\S])*(?:\u0007|\u001B\\|$)/gu
/** Control-sequence-introducer escapes such as SGR color codes. */
const CSI_SEQUENCE = /(?:\u001B\[|\u009B)[0-?]*[ -/]*[@-~]/gu
/** Remaining two-byte ESC control sequences. */
const ESC_SEQUENCE = /\u001B[@-_]/gu
/** Non-whitespace C0/C1 control characters. */
const CONTROL_CHARACTER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/gu
/** Directional and invisible controls that can make a displayed title deceptive. */
const DIRECTIONAL_CONTROL = /[\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/gu

/**
 * Normalize one accepted title exactly like the official service.
 * @param input - untrusted title text.
 * @returns A terminal-safe, whitespace-normalized one-line title, possibly empty.
 */
export function normalizeTitleText(input: string): string {
  return input
    .replace(OSC_SEQUENCE, '')
    .replace(CSI_SEQUENCE, '')
    .replace(ESC_SEQUENCE, '')
    .replace(CONTROL_CHARACTER, '')
    .replace(DIRECTIONAL_CONTROL, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

/**
 * Take the title from model output: the first non-empty line, without asterisk
 * emphasis wrapping that whole line. Models that disregard the one-line
 * instruction put the title first and commentary after it.
 * @param text - joined text blocks of the auxiliary response.
 * @returns The candidate title line.
 */
export function titleFromOutput(text: string): string {
  const line = text.split(/\r?\n/u).map(item => item.trim()).find(item => item.length > 0) ?? ''
  const groups = EMPHASIS_WRAPPER.exec(line)?.groups
  const marker = groups?.['marker']
  const inner = groups?.['inner']
  return marker === undefined || inner === undefined || inner.includes(marker) ? line : inner
}

/**
 * Interpret one assembled 0.2.1+ response as a title.
 * Rejects terminal tool-call and max-token outcomes exactly like the official
 * provider, so the row keeps the official acceptance rules.
 * @param response - the assembled auxiliary response.
 * @returns A non-empty normalized title.
 * @throws when the finish reason, a tool-call block, or empty text makes the response unusable.
 */
export function titleFromResponse(response: TitleLlmResponse): string {
  switch (response.finish.kind) {
    case 'stop':
      break
    case 'tool-calls':
      throw new Error('session-title-llm: title output must contain text only')
    case 'max-tokens':
      throw new Error('session-title-llm: title output reached maxOutputTokens')
    default:
      throw new Error(`session-title-llm: unsupported finish reason "${String(response.finish.kind)}"`)
  }
  if (response.blocks.some(block => block.type === 'tool-call')) throw new Error('session-title-llm: title output must contain text only')
  const title = normalizeTitleText(titleFromOutput(response.blocks.filter(block => block.type === 'text').map(block => block.text ?? '').join(' ')))
  if (title.length === 0) throw new Error('session-title-llm: title model produced no text')
  return title
}

/**
 * Select the route's least supported reasoning effort for a title call, as the
 * official 0.2.1 provider does: naming is a short auxiliary task, and a full
 * reasoning budget can consume the whole output allowance.
 * @param model - the prepared model metadata.
 * @returns The first declared effort id, or undefined when the model has none.
 */
export function selectTitleReasoningEffort(model: TitleModelMetadata): string | undefined {
  return model.reasoning?.efforts?.[0]?.id
}

/**
 * The official 0.2.1+ system instruction, including the optional current-title anchor.
 * @param targets - title-length targets.
 * @param hasCurrentTitle - whether the request is anchored to an existing provider title.
 * @returns The system prompt text.
 */
export function titleSystemPrompt(targets: TitleLengthTargets, hasCurrentTitle: boolean): string {
  return [
    'Create a concise title for an AI coding-assistant session from the supplied human messages.',
    'Return only the title on one line, **in plain text of natural language**, with no quotes, prefix, explanation, Markdown, XML, or terminal control codes. No code is allowed.',
    'Use the language of the messages.',
    `Aim for about ${targets.targetWords} words in non-CJK languages or ${targets.targetCjkCharacters} CJK characters.`,
    'If the messages give little to name, still return a short best-effort title, such as Greeting, instead of explaining.',
    ...(hasCurrentTitle
      ? [
          'An existing title is supplied as currentTitle. If it still accurately describes the main topic or task, return it exactly unchanged.',
          'Follow-up questions, additional details within the same topic, acknowledgements such as "thanks", and requests to continue do not by themselves justify a title change.',
          'Do not reword, polish, shorten, or replace synonyms in an adequate title. Keeping its exact wording takes priority over the target length.',
          'Change the title only when the messages materially change or expand the main topic or task so that the existing title is no longer accurate.',
        ]
      : []),
  ].join('\n')
}

/**
 * Frame the exact messages as JSON so user text cannot break structural delimiters.
 * @param messages - the selected human messages.
 * @param currentTitle - the accepted provider title to anchor on, when there is one.
 * @returns The framed user input.
 */
export function frameTitleInput(messages: readonly SessionTitleUserMessage[], currentTitle: string | undefined): string {
  if (currentTitle === undefined) {
    return `Generate the session title from this JSON array of human messages:\n${JSON.stringify(messages)}`
  }
  return `Update the session title from this JSON object:\n${JSON.stringify({ currentTitle, messages })}`
}

/**
 * The accepted provider title of one request, when the service supplied one.
 * Only a provider-sourced title anchors an update; a fallback title does not.
 * @param request - the service-owned naming request.
 * @returns The current title, or undefined when there is nothing to anchor on.
 */
function currentProviderTitle(request: SessionTitleProviderRequest): string | undefined {
  const current = (request as { readonly currentTitle?: { readonly title?: unknown; readonly source?: { readonly kind?: unknown } } }).currentTitle
  if (current === undefined || current.source?.kind !== 'provider' || typeof current.title !== 'string') return undefined
  return current.title
}

/**
 * Run one candidate through the auxiliary-LLM line the profile installed.
 * @param ctx - this row's context, exposing `llm`.
 * @param module - the loaded auxiliary-LLM package.
 * @param plan - the profile's naming policy and cadence.
 * @param request - service-owned session, message revision, and cancellation.
 * @param attempt - one candidate route with its composed config.
 * @returns The official provider result.
 */
async function runTitleCall(
  ctx: Context,
  module: TitleLlmModule,
  plan: NamingPlan,
  request: SessionTitleProviderRequest,
  attempt: TitleAttempt,
): Promise<SessionTitleProviderResult> {
  const messages = selectTitleMessages(request.messages, plan.cadence.firstPromptOnly)
  const execute = titleCallOf(module, 'executeSessionTitleLlm')
  if (execute !== undefined) {
    const anchor = plan.cadence.firstPromptOnly ? undefined : currentProviderTitle(request)
    const prepared: PreparedTitleCall = {
      system: titleSystemPrompt(plan.targets, anchor !== undefined),
      input: frameTitleInput(messages, anchor),
      messageSeqs: messages.map(message => message.seq),
      selectReasoningEffort: selectTitleReasoningEffort,
    }
    const response = await (execute as unknown as ModernTitleCall)(ctx, attempt.config, request, plan.cadence.id, prepared)
    return { title: titleFromResponse(response), messageSeqs: prepared.messageSeqs, model: response.model }
  }
  const legacy = titleCallOf(module, 'generateSessionTitleWithLlm') as LegacyTitleCall | undefined
  if (legacy === undefined) {
    throw new Error(`model-switch: ${TITLE_LLM_PACKAGE} exposes no title call this row understands`)
  }
  // The pre-0.2.1 shared policy requires the provider-owned targets.
  const config: ResolvedSessionTitleLlmConfig = { ...plan.targets, ...attempt.config } as unknown as ResolvedSessionTitleLlmConfig
  return legacy(ctx, config, request, messages, plan.cadence.id)
}

/**
 * Execute one naming request through the official implementation.
 *
 * The route is resolved from the session being titled — its provider selects the
 * saved group, the flat settings pair is the deployment default — and every
 * candidate is tried in order until one succeeds. A max-token failure first gets
 * one widened-budget retry on the same route; every other failure moves on.
 * @param ctx - this row's context, exposing `llm`.
 * @param module - the loaded auxiliary-LLM module.
 * @param plan - the profile's fixed naming policy.
 * @param request - service-owned session, message revision, and cancellation.
 * @returns The official provider result.
 * @throws The last candidate failure when every candidate fails.
 */
async function generateTitle(
  ctx: Context,
  module: TitleLlmModule,
  plan: NamingPlan,
  request: SessionTitleProviderRequest,
): Promise<SessionTitleProviderResult> {
  const candidates = titleRouteCandidates(currentSettings(ctx), sessionProviderOf(ctx, request.session), plan.config, request.route)
  const attempts: readonly TitleAttempt[] = candidates.length === 0
    ? [{ route: undefined, config: plan.config }]
    : candidates.map(route => ({ route, config: composeTitleRoute(plan.config, route) }))
  let lastError: unknown
  for (const attempt of attempts) {
    try {
      return await runTitleCall(ctx, module, plan, request, attempt)
    } catch (error) {
      lastError = error
      if (!shouldTryNextCandidate(error, request)) break
      if (!isMaxTokensFailure(error)) continue
      // The budget, not the route, is the problem: retry this route wider first.
      const widened: TitleAttempt = {
        route: attempt.route,
        config: { ...attempt.config, maxOutputTokens: widerTitleBudget(attempt.config.maxOutputTokens) },
      }
      try {
        return await runTitleCall(ctx, module, plan, request, widened)
      } catch (retryError) {
        lastError = retryError
        if (!shouldTryNextCandidate(retryError, request)) break
      }
    }
  }
  const tried = attempts.map(attempt => attempt.route === undefined ? 'the row policy' : `${attempt.route.provider}/${attempt.route.model}`).join(' → ')
  // A superseded or disposed request is not a route failure; the service owns that cancellation.
  if (!request.signal.aborted) {
    ctx.logger.warn(`model-switch: session title generation failed on every candidate (${tried}): ${String(lastError)}`)
  }
  throw lastError
}

/** One fixed naming implementation: the resolved policy, the length targets, and the row's cadence. */
interface NamingPlan {
  readonly cadence: TitleCadence
  readonly config: TitleLlmPolicy
  readonly targets: TitleLengthTargets
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
  /** The displaced row's naming policy, or the shipped defaults when it is absent. */
  const forwarded: Record<string, unknown> = entry === undefined ? {} : forwardedConfig(entry)
  let module: TitleLlmModule
  try {
    module = await import(TITLE_LLM_PACKAGE)
  } catch (cause) {
    ctx.logger.error(`model-switch: ${TITLE_LLM_PACKAGE} is unavailable; model-backed session naming cannot run at all`)
    ctx.logger.error(cause)
    return
  }
  let policy: ResolvedNamingPolicy
  try {
    policy = resolveNamingPolicy(module, forwarded)
  } catch (cause) {
    ctx.logger.error('model-switch: the official session-title row has no valid naming policy; naming keeps the deterministic fallback')
    ctx.logger.error(cause)
    return
  }
  const plan: NamingPlan = { cadence, config: policy.config, targets: policy.targets }
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
