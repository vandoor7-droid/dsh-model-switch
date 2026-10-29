/**
 * Configurable Auto-reviewer stream idle timeout.
 *
 * The reviewer call is a normal llm stream, so its idle watchdog is the one
 * `@deepseek-ai/dsh-llm-pi-ai` puts on the **provider profile**:
 * `providers.<id>.streamIdleTimeoutMs` (default 300 000 ms). There is no
 * per-request override — `GenerateOptions` carries no timeout fields and the
 * adapter reads the profile per call — so the only way to change the reviewer's
 * timeout is to write that provider-profile key.
 *
 * Consequences, all surfaced in the UI copy:
 *
 * - The key lives on the provider, so it applies to **every** call through that
 *   provider (reviewer, main chat, other routes), not only the reviewer.
 * - "Cancel the timeout" is legal only as the upstream ceiling
 *   (`MAX_TIMER_DELAY_MS` = 2147483647 ms ≈ 24.86 days); upstream rejects 0,
 *   negatives and Infinity, so the UI writes the ceiling and says so.
 * - The profile document is the durable copy. After writing it, the running
 *   pi-ai row is reloaded through the loader fiber so the value applies without
 *   a Host restart; that reload drops the provider's in-flight calls. When the
 *   reload cannot run (no live row, a vetoed update, a failed validation) the
 *   value still lands at the next Host start, and the status line says so.
 *
 * Restoring is symmetric: the value a provider carried before the first
 * overwrite is recorded in this plugin's own settings
 * (`autoReviewTimeoutPrevious`) and written back when the setting returns to
 * "follow the provider default", so clearing the setting never leaves an
 * adapter-written value behind.
 *
 * @module
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Entry, Loader } from '@deepseek-ai/cordis-plugin-loader';
import type { ModelSwitchSettings } from './host-settings.js';
/** Cordis plugin identity; matches the `cordis.patch.yml` insert row id. */
export declare const name = "model-switch-review-timeout";
/** This row needs the Host's settings service (for `documentPath` and our ns). */
export declare const inject: string[];
/** The pi-ai row whose provider profiles carry `streamIdleTimeoutMs`. */
export declare const PI_AI_ROW = "llm-pi-ai";
/** Live state surfaced next to the reviewer card through the capabilities RPC. */
export declare const reviewTimeoutStatus: {
    configuredMs: number | undefined;
    applied: string[];
    skipped: string[];
    /** Providers whose running row was reloaded with the new timeout. */
    hotApplied: string[];
    /** Whether the running row took the value, or the next start has to. */
    hot: "applied" | "restart-required" | undefined;
    /** Why the running row did not take the value, when it did not. */
    hotReason: string | undefined;
};
/** One resolved write decision. */
export interface ReviewTimeoutPlan {
    /** Milliseconds to write per provider; undefined means "restore / follow default". */
    readonly timeoutMs: number | undefined;
    /** Reviewer provider ids collected from the global route and every group. */
    readonly providers: readonly string[];
}
/**
 * Resolve the stored setting into concrete write values.
 *
 * Stored values are user intent: absent = follow the provider default, `0` =
 * cancelled (written as the upstream ceiling), anything else is clamped into
 * the upstream-legal range so a hand-edited profile cannot produce a rejected
 * value.
 *
 * @param settings - the plugin's current settings.
 * @returns the write value and the reviewer providers to apply it to.
 */
export declare function planReviewTimeout(settings: ModelSwitchSettings): ReviewTimeoutPlan;
/** Why a provider was left untouched. */
export type ReviewTimeoutSkip = 'missing-row' | 'missing-provider' | 'unrecorded';
/** Result of one document patch attempt. */
export interface ReviewTimeoutPatch {
    readonly text: string;
    readonly outcome: 'written' | 'unchanged' | ReviewTimeoutSkip;
}
/**
 * Set or remove one pi-ai provider's `streamIdleTimeoutMs` in the profile
 * document, touching only that provider's block.
 *
 * The pi-ai row's layout is fixed by its schema: the provider sits at six
 * spaces under `providers:`, its fields at eight. The patch inserts the key at
 * the top of the provider block, replaces it in place, or removes it, and never
 * touches another provider or row.
 *
 * @param text - the full profile document.
 * @param provider - the pi-ai provider id.
 * @param timeoutMs - the value to write, or undefined to remove the key.
 * @returns the patched text and what happened.
 */
export declare function patchProviderIdleTimeout(text: string, provider: string, timeoutMs: number | undefined): ReviewTimeoutPatch;
/**
 * Read a provider's current `streamIdleTimeoutMs` from the document.
 *
 * Used to record the pre-overwrite value so a later reset restores it.
 *
 * @param text - the full profile document.
 * @param provider - the pi-ai provider id.
 * @returns the value, or null when the key is absent.
 */
export declare function readProviderIdleTimeout(text: string, provider: string): number | null;
/**
 * Build the pi-ai row config with one provider's idle timeout set or removed.
 *
 * Pure: the caller decides whether to hand the result to the loader, and a shape
 * this function does not recognize returns `undefined` instead of a guess.
 *
 * @param config - the row's current config object.
 * @param provider - the pi-ai provider id inside `providers`.
 * @param timeoutMs - the value to set, or undefined to remove the key.
 * @returns the next config, or undefined when the current one is not an object.
 */
export declare function planProviderConfig(config: unknown, provider: string, timeoutMs: number | undefined): Record<string, unknown> | undefined;
/**
 * Find the loader row that owns the pi-ai provider profiles.
 *
 * @param loader - the Host loader service, when present.
 * @returns the row entry, or undefined when the profile does not load it.
 */
export declare function findPiAiEntry(loader: Loader | undefined): Entry | undefined;
/**
 * Row entry point: apply the configured timeout to the reviewer providers'
 * pi-ai profiles in the profile document.
 *
 * Every failure is contained and logged; a broken document must never take the
 * Host down. The write is idempotent: replays find the value already in place
 * and do nothing.
 *
 * @param ctx - this row's context.
 */
export declare function apply(ctx: Context): void;
