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
import type { Context } from '@deepseek-ai/cordis';
import type { Entry, Loader } from '@deepseek-ai/cordis-plugin-loader';
import type { SessionTitleAutomaticMode, SessionTitleProviderId, SessionTitleProviderRequest, SessionTitleUserMessage } from '@deepseek-ai/dsh-session-title';
import { type CapabilityRoute, type RouteBearingSettings } from './session-route.js';
/** Cordis plugin identity; matches the cordis.patch.yml insert row id. */
export declare const name = "model-switch-session-title";
/** The loader names the disabled row, and the seam services the call needs are awaited before the first naming request. */
export declare const inject: string[];
/** One official cadence package; the row's own package selects which one this profile runs. */
export interface TitleCadence {
    /** Official npm package that declares this cadence. */
    readonly pkg: string;
    /** Provider id recorded with every generated title; mirrors the official registration. */
    readonly id: SessionTitleProviderId;
    /** When the service starts automatic generation. */
    readonly automatic: SessionTitleAutomaticMode;
    /** Whether only the first human message is framed into the request. */
    readonly firstPromptOnly: boolean;
}
/** Both official cadence packages, in the order a profile may declare them. */
export declare const TITLE_CADENCES: readonly TitleCadence[];
/** Title-length targets that shape the system instruction. */
export interface TitleLengthTargets {
    readonly targetWords: number;
    readonly targetCjkCharacters: number;
}
/** Route-bearing execution policy shared by both official auxiliary-LLM lines. */
export interface TitleLlmPolicy {
    readonly maxInputBytes: number;
    readonly maxOutputTokens: number;
    readonly timeoutMs: number;
    readonly provider?: string;
    readonly model?: string;
}
/** The model metadata `executeSessionTitleLlm` hands its reasoning selector. */
export interface TitleModelMetadata {
    readonly reasoning?: {
        readonly efforts?: readonly {
            readonly id: string;
        }[];
    };
}
/** Provider-owned preparation for one 0.2.1+ auxiliary title request. */
export interface PreparedTitleCall {
    readonly system: string;
    readonly input: string;
    readonly messageSeqs: readonly SessionTitleUserMessage['seq'][];
    readonly selectReasoningEffort: (model: TitleModelMetadata) => string | undefined;
}
/** One content block of the assembled 0.2.1+ auxiliary response. */
export interface TitleResponseBlock {
    readonly type: string;
    readonly text?: string;
}
/** The assembled 0.2.1+ auxiliary response this row interprets. */
export interface TitleLlmResponse {
    readonly blocks: readonly TitleResponseBlock[];
    readonly finish: {
        readonly kind: string;
    };
    readonly model: {
        readonly provider: string;
        readonly model: string;
    };
}
/** The auxiliary-LLM module surface; the call entry point differs per DSH line. */
type TitleLlmModule = typeof import('@deepseek-ai/dsh-session-title-llm');
/** The untrusted policy split both lines consume. */
export interface SplitTitlePolicy {
    readonly execution: Record<string, unknown>;
    readonly targets: TitleLengthTargets;
}
/**
 * The cadence one official package name declares.
 * @param pkg - the disabled row's package name.
 * @returns The matching cadence, or undefined for a row this row cannot mirror.
 */
export declare function titleCadence(pkg: string | undefined): TitleCadence | undefined;
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
export declare function composeTitleRoute(config: TitleLlmPolicy, route: CapabilityRoute | undefined): TitleLlmPolicy;
/**
 * Frame the exact human messages one naming revision represents.
 * @param messages - every eligible human message of the revision.
 * @param firstPromptOnly - cadence flag: true mirrors the first-prompt provider.
 * @returns The selected messages, in order.
 * @throws when a first-prompt cadence receives an empty revision — the official provider's own contract.
 */
export declare function selectTitleMessages(messages: readonly SessionTitleUserMessage[], firstPromptOnly: boolean): readonly SessionTitleUserMessage[];
/**
 * Locate the official session-title provider row in the loader tree.
 *
 * Disabled entries stay in the tree, so a name-matched disable still matches.
 * The all-prompts row wins when it is present: that row only exists while the
 * experimental session-titles bundle is composed, and its presence is exactly
 * the user's choice to update titles with every prompt. The default
 * first-prompt row is the fallback when that bundle is off.
 * @param loader - the host loader, when one is reachable.
 * @returns The official entry to mirror, or undefined when this profile has no such row.
 */
export declare function officialTitleEntry(loader: Loader | undefined): Entry | undefined;
/**
 * Copy the official row's stored config, ignoring non-object payloads.
 * @param entry - the official session-title provider entry.
 * @returns A plain object spread; missing or invalid configs become `{}`. The
 * result is untrusted: the profile may be hand-edited, so the official policy
 * validator runs over it before any naming request is served.
 */
export declare function forwardedConfig(entry: Entry): Record<string, unknown>;
/**
 * The official package name this row mounts (either cadence).
 * @param entry - the official session-title provider entry.
 * @returns The package name, or undefined when the row declares none.
 */
export declare function officialTitlePackage(entry: Entry): string | undefined;
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
export declare function splitTitlePolicy(forwarded: Record<string, unknown>): SplitTitlePolicy;
/**
 * Detect the 0.2.1+ auxiliary-LLM line.
 * @param module - the loaded auxiliary-LLM package.
 * @returns Whether the module exposes the provider-prepared call.
 */
export declare function isModernTitleModule(module: TitleLlmModule): boolean;
/** One validated naming policy: the execution config plus the targets the system instruction needs. */
export interface ResolvedNamingPolicy {
    readonly config: TitleLlmPolicy;
    readonly targets: TitleLengthTargets;
}
/**
 * Validate the stored policy through the official validator of the installed line.
 * @param module - the loaded auxiliary-LLM package.
 * @param forwarded - the disabled official row's stored config.
 * @returns The validated execution config and title-length targets.
 * @throws when the official validator rejects the stored policy.
 */
export declare function resolveNamingPolicy(module: TitleLlmModule, forwarded: Record<string, unknown>): ResolvedNamingPolicy;
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
export declare function titleRouteCandidates(settings: RouteBearingSettings | undefined, provider: string | undefined, policy: TitleLlmPolicy, requestRoute: CapabilityRoute | undefined): readonly CapabilityRoute[];
/**
 * Whether a failure may be retried on another candidate.
 * A superseded or disposed request keeps no budget, and a deadline that fired is
 * the caller's bound, not the route's fault: both end the attempt loop.
 * @param error - the failure thrown by the auxiliary call.
 * @param request - the service-owned request whose signal bounds the work.
 * @returns Whether another candidate may be tried.
 */
export declare function shouldTryNextCandidate(error: unknown, request: SessionTitleProviderRequest): boolean;
/**
 * Whether the failure is the model filling its output budget before finishing.
 * Official lines report this as `title output reached maxOutputTokens`; a widened
 * budget is the only retry that can succeed for it.
 * @param error - the failure thrown by the auxiliary call.
 * @returns Whether one widened-budget retry is worth trying.
 */
export declare function isMaxTokensFailure(error: unknown): boolean;
/**
 * A widened output budget for the same route.
 * @param maxOutputTokens - the policy's configured budget.
 * @returns Four times the budget, capped at 4096 tokens.
 */
export declare function widerTitleBudget(maxOutputTokens: number): number;
/**
 * Normalize one accepted title exactly like the official service.
 * @param input - untrusted title text.
 * @returns A terminal-safe, whitespace-normalized one-line title, possibly empty.
 */
export declare function normalizeTitleText(input: string): string;
/**
 * Take the title from model output: the first non-empty line, without asterisk
 * emphasis wrapping that whole line. Models that disregard the one-line
 * instruction put the title first and commentary after it.
 * @param text - joined text blocks of the auxiliary response.
 * @returns The candidate title line.
 */
export declare function titleFromOutput(text: string): string;
/**
 * Interpret one assembled 0.2.1+ response as a title.
 * Rejects terminal tool-call and max-token outcomes exactly like the official
 * provider, so the row keeps the official acceptance rules.
 * @param response - the assembled auxiliary response.
 * @returns A non-empty normalized title.
 * @throws when the finish reason, a tool-call block, or empty text makes the response unusable.
 */
export declare function titleFromResponse(response: TitleLlmResponse): string;
/**
 * Select the route's least supported reasoning effort for a title call, as the
 * official 0.2.1 provider does: naming is a short auxiliary task, and a full
 * reasoning budget can consume the whole output allowance.
 * @param model - the prepared model metadata.
 * @returns The first declared effort id, or undefined when the model has none.
 */
export declare function selectTitleReasoningEffort(model: TitleModelMetadata): string | undefined;
/**
 * The official 0.2.1+ system instruction, including the optional current-title anchor.
 * @param targets - title-length targets.
 * @param hasCurrentTitle - whether the request is anchored to an existing provider title.
 * @returns The system prompt text.
 */
export declare function titleSystemPrompt(targets: TitleLengthTargets, hasCurrentTitle: boolean): string;
/**
 * Frame the exact messages as JSON so user text cannot break structural delimiters.
 * @param messages - the selected human messages.
 * @param currentTitle - the accepted provider title to anchor on, when there is one.
 * @returns The framed user input.
 */
export declare function frameTitleInput(messages: readonly SessionTitleUserMessage[], currentTitle: string | undefined): string;
/** Timing knobs for the takeover choreography (exported for tests). */
export declare const TAKEOVER_RETRY_DELAY_MS = 10;
/** How many times the takeover re-checks after disabling the official row. */
export declare const TAKEOVER_MAX_ATTEMPTS = 20;
/**
 * Whether one loader entry declares an official naming provider this row supersedes.
 *
 * The package name is the authoritative identity: the takeover disables the
 * matched entry, which disposes its fiber, so an id-only match could reach a
 * group or an unrelated plugin's row with a recycled id.
 */
export declare function isOfficialTitleRow(entry: Entry | undefined): boolean;
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
export declare function apply(ctx: Context): Promise<void>;
export {};
