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
import type { Context } from '@deepseek-ai/cordis';
import type { Entry, Loader } from '@deepseek-ai/cordis-plugin-loader';
import type { SessionTitleAutomaticMode, SessionTitleProviderId, SessionTitleUserMessage } from '@deepseek-ai/dsh-session-title';
import type { ResolvedSessionTitleLlmConfig, SessionTitleLlmConfig } from '@deepseek-ai/dsh-session-title-llm';
import { type CapabilityRoute } from './session-route.js';
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
export declare function composeTitleRoute(config: ResolvedSessionTitleLlmConfig, route: CapabilityRoute | undefined): ResolvedSessionTitleLlmConfig;
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
 * Disabled entries stay in the tree, so a name-matched disable still matches.
 * @param loader - the host loader, when one is reachable.
 * @returns The official entry, or undefined when this profile has no such row.
 */
export declare function officialTitleEntry(loader: Loader | undefined): Entry | undefined;
/**
 * Copy the official row's stored config, ignoring non-object payloads.
 * @param entry - the official session-title provider entry.
 * @returns A plain object spread; missing or invalid configs become `{}`. The
 * result is untrusted: the profile may be hand-edited, so the official policy
 * validator runs over it before any naming request is served.
 */
export declare function forwardedConfig(entry: Entry): Partial<SessionTitleLlmConfig>;
/**
 * The official package name this row mounts (either cadence).
 * @param entry - the official session-title provider entry.
 * @returns The package name, or undefined when the row declares none.
 */
export declare function officialTitlePackage(entry: Entry): string | undefined;
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
