/**
 * Safe reads of the optional Model Switch settings service for the naming row.
 *
 * The session-naming row must keep the official naming behavior when the
 * `model-switch` row is absent, so `modelSwitch` can never join the row's own
 * `inject` list: Cordis waits for every declared dependency before a fiber
 * loads (there is no "optional" inject), and a never-provided service would
 * leave the row pending forever.
 *
 * Two reads are tried per call, in this order:
 *
 * 1. `ctx.get('modelSwitch')` with Cordis' default strict mode — the active
 *    implementation only, or undefined. This is the read the shipped row used
 *    and it keeps working across a settings-row rebuild because the store
 *    entry is replaced, not cached here.
 * 2. A scoped `ctx.inject(['modelSwitch'])` child fiber, which binds a
 *    dependent scope and resets it on dispose. This covers compositions where
 *    the strict store read is invisible from the row's own entry context.
 *
 * The returned function identity is stable for the row's lifetime and every
 * call re-reads, so a settings save or a service rebuild needs no remount.
 * Reads never throw: a missing face, a disposed scope, or a throwing read all
 * answer undefined, which means "official behavior" to the caller.
 *
 * @module dsh-model-switch/title-settings-reader
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ModelSwitchSettings } from './host-settings.js';
/**
 * Create the settings reader for one naming row context.
 * @param ctx - this row's context (the row fiber's own scope).
 * @returns The reader: per-request live settings, or undefined when unavailable.
 */
export declare function titleSettingsReaderOf(ctx: Context): () => ModelSwitchSettings | undefined;
