import { useCallback, useEffect, useRef, useState } from 'react'
import type { ModelCatalogFailure, ModelProviderGroup } from '@deepseek-ai/dsh-api-session-controller/types'
import type { CapabilityRouteView } from '../client-contract.js'
import type { ModelSwitchLocaleKey } from './locales.js'

export interface Choice { id: string; name: string; unavailable?: true }
/** A concrete provider/model/effort triple; route editors copy these fields. */
export interface RouteModelSelection { provider: string; model: string; reasoningEffort?: string }
/** Build a settings route for a newly selected model using only that model's default effort. */
export function selectRouteModel(groups: readonly ModelProviderGroup[], provider: string, model: string): RouteModelSelection {
  const defaultEffort = groups.find(group => group.id === provider)?.models.find(item => item.id === model)?.reasoning?.defaultEffort
  return { provider, model, ...(defaultEffort === undefined ? {} : { reasoningEffort: defaultEffort }) }
}
export function deriveRouteChoices(groups: readonly ModelProviderGroup[], route: CapabilityRouteView | undefined, allowedProviders?: readonly string[]): { providers: Choice[]; models: Choice[] } {
  const allowed = allowedProviders === undefined ? undefined : new Set(allowedProviders)
  const providers: Choice[] = groups.filter(group => allowed === undefined || allowed.has(group.id)).map(group => ({ id: group.id, name: group.name }))
  if (route?.provider !== undefined && !providers.some(option => option.id === route.provider)) providers.push({ id: route.provider, name: route.provider, unavailable: true })
  const group = groups.find(item => item.id === route?.provider)
  const models: Choice[] = (group?.models ?? []).map(model => ({ id: model.id, name: model.name }))
  if (route?.model !== undefined && !models.some(option => option.id === route.model)) models.push({ id: route.model, name: route.model, unavailable: true })
  return { providers, models }
}
/**
 * Provider choices for the provider-group editor.
 *
 * The live catalog cannot represent a group whose provider was deleted, so a
 * catalog-only list makes that group unreachable: the row stays stored, no
 * selection can open it, and nothing can delete it. Union in every configured
 * group's provider and mark the missing ones unavailable so the editor can still
 * open and remove them. Feed this the merged list from `withCatalogFailures` so
 * a provider that merely failed to load stays selectable instead of looking
 * deleted.
 * @param groups - the live model catalog merged with the host's load failures.
 * @param configured - provider ids that still have a stored group.
 * @param current - the group being edited, kept listed even when it is unknown.
 * @returns catalog choices first (original order), then the missing providers.
 */
export function groupProviderChoices(groups: readonly ModelProviderGroup[], configured: readonly string[], current: string | undefined): Choice[] {
  const route = current === undefined || current.trim() === '' ? undefined : { provider: current }
  const choices = deriveRouteChoices(groups, route).providers
  const seen = new Set(choices.map(choice => choice.id))
  for (const provider of configured) {
    if (provider.trim() === '' || seen.has(provider)) continue
    seen.add(provider)
    choices.push({ id: provider, name: provider, unavailable: true })
  }
  return choices
}

/** One provider whose model catalog lookup failed on the Host (`ModelCatalogFailure`). */
export type CatalogFailure = ModelCatalogFailure
/** What one catalog load resolves with: successful groups plus the host's isolated failures. */
export interface SettingsCatalogPayload {
  readonly groups: readonly ModelProviderGroup[]
  readonly failures: readonly CatalogFailure[]
}
/** How many attempts one catalog load makes before the settings page gives up. */
export const CATALOG_LOAD_ATTEMPTS = 3
/** Backoff between catalog retries: a busy Host clears within seconds, not minutes. */
export const CATALOG_RETRY_DELAYS_MS: readonly number[] = [400, 1200]

export interface CatalogRetryOptions {
  attempts?: number
  delaysMs?: readonly number[]
  sleep?: (ms: number) => Promise<void>
  cancelled?: () => boolean
}

/**
 * Load the model catalog with bounded backoff.
 *
 * The catalog RPC is one read against a live Host; a transient failure (a busy
 * Host, a reconnecting remote, a background task saturating the provider
 * lookups) must recover on its own instead of leaving the settings page stuck
 * on an empty catalog. Each attempt re-runs `load`; a cancelled load rethrows
 * the last error without further attempts.
 */
export async function loadCatalogWithRetry(load: () => Promise<SettingsCatalogPayload>, options: CatalogRetryOptions = {}): Promise<SettingsCatalogPayload> {
  const attempts = options.attempts ?? CATALOG_LOAD_ATTEMPTS
  const delaysMs = options.delaysMs ?? CATALOG_RETRY_DELAYS_MS
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => { setTimeout(resolve, ms) }))
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await sleep(delaysMs[Math.min(attempt - 1, delaysMs.length - 1)] ?? 0)
    if (options.cancelled?.() === true) break
    try {
      return await load()
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('catalog load failed')
}

/**
 * Merge the host's load failures into the catalog as model-less groups.
 *
 * A failed provider is KNOWN (the Host listed it) but temporarily unavailable.
 * Rendering it as absent would mark every stored route for it "unavailable ⚠"
 * and lock the provider-group editor while a background task hiccups. A
 * model-less group keeps the provider selectable without inventing model rows;
 * seeding logic skips it because `models[0]` is undefined.
 */
export function withCatalogFailures(groups: readonly ModelProviderGroup[], failures: readonly CatalogFailure[]): ModelProviderGroup[] {
  const known = new Set(groups.map(group => group.id))
  const extra = failures
    .filter(failure => failure.id.trim() !== '' && !known.has(failure.id))
    .map(failure => ({ id: failure.id, name: failure.name.trim() === '' ? failure.id : failure.name, models: [] }))
  return [...groups, ...extra]
}

export type SettingsCatalogStatus = 'loading' | 'ready' | 'failed'

export interface SettingsCatalogState {
  status: SettingsCatalogStatus
  /** Live groups merged with the host's load failures; the last good list survives a later failure. */
  groups: readonly ModelProviderGroup[]
  failures: readonly CatalogFailure[]
  /** Localized failure message; undefined while loading or ready. */
  error: string | undefined
  /** Reload now (used by the retry button and provider-order changes). */
  reload(): void
}

export interface SettingsCatalogInputs {
  loadCatalog(): Promise<SettingsCatalogPayload>
  subscribeProviderOrder?: (listener: () => void) => () => void
  t(key: ModelSwitchLocaleKey): string
}

/**
 * Load the model catalog backing every route editor, with bounded retries.
 *
 * A failed load keeps the last successful groups (the editor stays usable and
 * honest via the error hint) instead of collapsing to an empty catalog; a
 * provider-order change or `reload()` starts a fresh attempt, and only the
 * newest attempt may land.
 */
export function useSettingsCatalog(input: SettingsCatalogInputs): SettingsCatalogState {
  const [state, setState] = useState<Omit<SettingsCatalogState, 'reload'>>({ status: 'loading', groups: [], failures: [], error: undefined })
  // The face recreates loadCatalog/subscribe per render; read the latest through
  // a ref so the load effect runs once per mount instead of chasing identities.
  const latest = useRef(input)
  latest.current = input
  const runRef = useRef(0)
  const run = useCallback((): void => {
    const runId = runRef.current + 1
    runRef.current = runId
    setState(previous => ({ ...previous, status: 'loading' }))
    void loadCatalogWithRetry(() => latest.current.loadCatalog(), { cancelled: () => runId !== runRef.current })
      .then(payload => {
        if (runId !== runRef.current) return
        setState({ status: 'ready', groups: withCatalogFailures(payload.groups, payload.failures), failures: payload.failures, error: undefined })
      })
      .catch(() => {
        if (runId !== runRef.current) return
        // Keep the previous groups/failures: a transient failure must not wipe
        // the editor back to an all-⚠ empty catalog.
        setState(previous => ({ ...previous, status: 'failed', error: latest.current.t('catalogFailed') }))
      })
  }, [])
  const subscribeRef = useRef(input.subscribeProviderOrder)
  subscribeRef.current = input.subscribeProviderOrder
  useEffect(() => {
    run()
    // Provider-order changes replace the sorted catalog; reload through the same retry path.
    const stop = subscribeRef.current?.(() => { run() })
    return () => { runRef.current += 1; stop?.() }
  }, [run])
  return { ...state, reload: run }
}
