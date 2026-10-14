import { useEffect, useState } from 'react'
import type { ModelProviderGroup } from '@deepseek-ai/dsh-api-session-controller/types'
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

export interface SettingsCatalogInputs {
  loadCatalog(): Promise<readonly ModelProviderGroup[]>
  subscribeProviderOrder?: (listener: () => void) => () => void
  t(key: ModelSwitchLocaleKey): string
}

/** Load the model catalog backing every route editor, reloading on provider-order changes. */
export function useSettingsCatalog(input: SettingsCatalogInputs) {
  const [groups, setGroups] = useState<readonly ModelProviderGroup[]>([])
  const [catalogError, setCatalogError] = useState<string | undefined>()
  useEffect(() => {
    let live = true
    const load = (): void => {
      void input.loadCatalog().then(value => { if (live) { setGroups(value); setCatalogError(undefined) } }).catch(() => { if (live) setCatalogError(input.t('catalogFailed')) })
    }
    load()
    const stop = input.subscribeProviderOrder?.(() => { if (live) load() })
    return () => { live = false; stop?.() }
  }, [input.loadCatalog, input.subscribeProviderOrder, input.t])
  return { groups, catalogError }
}
