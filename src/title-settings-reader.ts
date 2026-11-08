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

import type { Context } from '@deepseek-ai/cordis'
import type { ModelSwitchSettings } from './host-settings.js'

/** The one service face this reader consumes. */
interface SettingsService {
  currentSettings(): ModelSwitchSettings
}

/** Accept only a settings object; anything else is the official "no settings" answer. */
function settingsOf(value: unknown): ModelSwitchSettings | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const service = value as SettingsService
  if (typeof service.currentSettings !== 'function') return undefined
  const settings = service.currentSettings()
  return settings !== null && typeof settings === 'object' ? settings : undefined
}

/**
 * Create the settings reader for one naming row context.
 * @param ctx - this row's context (the row fiber's own scope).
 * @returns The reader: per-request live settings, or undefined when unavailable.
 */
export function titleSettingsReaderOf(ctx: Context): () => ModelSwitchSettings | undefined {
  let scoped: Context | undefined
  ctx.inject(['modelSwitch'], (scope: Context) => {
    scope.effect(() => {
      scoped = scope
      return () => {
        if (scoped === scope) scoped = undefined
      }
    }, 'model-switch: session-title settings reader')
  })
  return (): ModelSwitchSettings | undefined => {
    try {
      const direct = settingsOf((ctx as Context).get('modelSwitch'))
      if (direct !== undefined) return direct
    } catch {
      // A row context that cannot read the store falls through to the scope.
    }
    const scope = scoped
    if (scope === undefined) return undefined
    try {
      return settingsOf((scope as unknown as { readonly modelSwitch?: unknown }).modelSwitch)
    } catch {
      return undefined
    }
  }
}
