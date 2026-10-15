import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { ModelProviderGroup } from '@deepseek-ai/dsh-api-session-controller/types'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { routePairConfigured, subagentModeForEnabled, type CapabilityRouteView, type ModelSwitchSettingsView, type SubagentSettingsView } from '../client-contract.js'
import { groupOf, normalizeProviderGroups, type ProviderGroupConfig } from '../provider-group.js'
import type { RuntimeCapabilities } from '../runtime-capabilities.js'
import { searchGroupsFromCapabilities, type CapabilitiesSnapshot } from './search-capabilities.js'
import type { ModelSwitchLocaleKey } from './locales.js'
import { isAgentRole, matchCatalogModel } from './antigravity-catalog.ts'
import { deriveRouteChoices, selectRouteModel, useSettingsCatalog, type Choice, type RouteModelSelection } from './main-row-controller.js'
import css from './ModelSwitchSettings.module.css'
import type { ConfigViewForm, ConfigViewOp } from './derived-config-form.js'

export interface ModelSwitchSettingsFace {
  t: (key: ModelSwitchLocaleKey) => string
  hooks: { subagentSettings: ConfigViewForm<SubagentSettingsView>; searchSettings: ConfigViewForm<CapabilityRouteView>; imageSettings: ConfigViewForm<CapabilityRouteView>; autoReviewSettings: ConfigViewForm<CapabilityRouteView>; compactionSettings: ConfigViewForm<CapabilityRouteView>; titleSettings: ConfigViewForm<CapabilityRouteView>; switchSettings: Pick<ConfigForm<ModelSwitchSettingsView>, 'getSnapshot' | 'subscribe'> }
  capabilities: RuntimeCapabilities
  /**
   * Apply one row's changes as a SINGLE revision-fenced write, so a refused
   * write can never leave a half-written provider/model pair behind.
   */
  saveSubagent: (ops: readonly ConfigViewOp<SubagentSettingsView>[]) => Promise<void>
  saveCapability: (route: 'search' | 'image' | 'autoReview' | 'compaction' | 'title', ops: readonly ConfigViewOp<CapabilityRouteView>[]) => Promise<void>
  setCompactOnSwitch: (value: boolean) => Promise<void>
  /** Replace or remove (undefined) one provider's saved capability group. */
  saveProviderGroup: (provider: string, group: ProviderGroupConfig | undefined) => Promise<void>
  loadCatalog: () => Promise<readonly ModelProviderGroup[]>
  /** Host capabilities long-poll; absent in legacy faces, which keep the static-capabilities path. */
  loadCapabilities?: (revision?: number, signal?: AbortSignal) => Promise<CapabilitiesSnapshot>
  subscribeProviderOrder?: (listener: () => void) => () => void
  /** ProviderDirectory-owned role lookup; absent when the owner seam is unavailable. */
  providerRoleOf?: (key: string) => string
}

export type ModelSwitchSettingsProps = PropsRuntime<'settings.section'> & InjectFace<ModelSwitchSettingsFace>
type RouteId = 'subagent' | 'search' | 'image' | 'autoReview' | 'compaction' | 'sessionTitle' | 'providerGroups'
type RouteIconKind = RouteId

function cx(...values: Array<string | undefined | false>): string { return values.filter(Boolean).join(' ') }
function compact(...values: Array<string | undefined>): string { return values.filter((value): value is string => value !== undefined && value !== '').join(' · ') }

/** A complete pinned pair; either half blank leaves the capability at its default. */
function draftPair(provider: string | undefined, model: string | undefined): { provider: string; model: string } | undefined {
  return provider !== undefined && provider.trim() !== '' && model !== undefined && model.trim() !== '' ? { provider, model } : undefined
}

function RouteIcon({ kind }: { kind: RouteIconKind }): ReactNode {
  if (kind === 'providerGroups') return <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M3 5.5h12M3 12.5h12" stroke="currentColor" strokeLinecap="round" /><circle cx="6.5" cy="5.5" r="2" stroke="currentColor" /><circle cx="11.5" cy="12.5" r="2" stroke="currentColor" /></svg>
  if (kind === 'compaction') return <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M5 3.5 9 7.5l4-4M5 14.5 9 10.5l4 4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" /></svg>
  if (kind === 'subagent') return <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><circle cx="6" cy="6" r="2.5" stroke="currentColor" /><circle cx="12.5" cy="11.5" r="2" stroke="currentColor" /><path d="M3 14c.4-2.5 1.6-4 3-4s2.6 1.5 3 4M10 7.5c.5-.8 1.3-1.2 2.2-1.2 1.5 0 2.6 1 2.8 2.7" stroke="currentColor" strokeLinecap="round" /></svg>
  if (kind === 'search') return <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="4.5" stroke="currentColor" /><path d="m11.5 11.5 3.5 3.5" stroke="currentColor" strokeLinecap="round" /></svg>
  if (kind === 'image') return <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><rect x="2.5" y="3" width="13" height="12" rx="2" stroke="currentColor" /><circle cx="6.5" cy="7" r="1.3" stroke="currentColor" /><path d="m4 13 3.5-3 2.2 2 1.8-1.6 2.5 2.6" stroke="currentColor" strokeLinejoin="round" /></svg>
  if (kind === 'autoReview') return <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M9 2.5 14.5 4.8v4.1c0 3.1-2.3 5.7-5.5 6.6-3.2-.9-5.5-3.5-5.5-6.6V4.8L9 2.5Z" stroke="currentColor" strokeLinejoin="round" /><path d="m6.6 8.9 1.7 1.7 3.2-3.4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" /></svg>
  if (kind === 'sessionTitle') return <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M3 4.5h7.5l4.2 4.2-5.7 5.7L3 9.8V4.5Z" stroke="currentColor" strokeLinejoin="round" /><circle cx="6.2" cy="7.2" r="1.1" stroke="currentColor" /></svg>
  return null
}

function RouteCard({ title, summary, hint, icon, open, onToggle, disabled = false, badge, badgeWarn = false, trailing, expandable = true, children }: {
  title: string; summary: string; hint?: string; icon: RouteIconKind; open: boolean; onToggle: () => void; disabled?: boolean; badge?: string; badgeWarn?: boolean; trailing?: ReactNode; expandable?: boolean; children?: ReactNode
}): ReactNode {
  const header = <button type="button" className={css.routeHeader} disabled={disabled} aria-expanded={disabled || !expandable ? undefined : open} onClick={onToggle}>
    <span className={css.routeIcon}><RouteIcon kind={icon} /></span>
    <span className={css.routeCopy}>
      <span className={css.routeName}>{title}{badge === undefined ? null : <i className={cx(css.badge, badgeWarn && css.badgeWarn)}>{badge}</i>}</span>
      <span className={css.routeSummary}>{summary}</span>
      {hint === undefined ? null : <span className={css.hint}>{hint}</span>}
    </span>
    {disabled || !expandable ? null : <svg className={css.chevron} width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="m4 5 3 3 3-3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" /></svg>}
  </button>
  return <article className={cx(css.routeCard, open && css.routeCardOpen, disabled && css.routeCardUnavailable)}>
    {trailing === undefined ? header : <div className={css.routeHeaderRow}>{header}{trailing}</div>}
    {open && !disabled ? <div className={css.cardBody}>{children}</div> : null}
  </article>
}

function InstantSwitch({ checked, disabled, label, onChange }: {
  checked: boolean; disabled: boolean; label: string; onChange: (value: boolean) => void
}): ReactNode {
  return <button type="button" className={cx(css.switch, checked && css.switchOn)} role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => { if (!disabled) onChange(!checked) }}>
    <i />
  </button>
}

function Field({ label, value, disabled, choices, onChange, full = false }: { label: string; value: string | undefined; disabled: boolean; choices: readonly Choice[]; onChange: (value: string) => void; full?: boolean }): ReactNode {
  return <label className={cx(css.field, full && css.fieldFull)}><span className={css.fieldLabel}>{label}</span><select className={css.input} disabled={disabled} value={value ?? ''} onChange={event => { onChange(event.target.value) }}><option value="">—</option>{choices.map(option => <option key={option.id} value={option.id}>{option.name}{option.unavailable === true ? ' ⚠' : ''}</option>)}</select></label>
}

function Actions({ t, busy, disabled, message, extra, onCancel, onSave }: { t: ModelSwitchSettingsFace['t']; busy: boolean; disabled: boolean; message?: string; extra?: ReactNode; onCancel: () => void; onSave: () => void }): ReactNode {
  return <div className={css.cardFooter}>{message === undefined ? null : <p className={cx(css.hint, css.message)}>{message}</p>}{extra}<button type="button" className={cx(css.button, css.secondaryButton)} disabled={busy} onClick={onCancel}>{t('cancel')}</button><button type="button" className={cx(css.button, css.primaryButton)} disabled={disabled} onClick={onSave}>{busy ? t('saving') : t('save')}</button></div>
}

/**
 * One editable row draft.
 *
 * Only a PRISTINE draft follows the accepted snapshot. A draft the user has
 * edited is never overwritten by an incoming snapshot — another tab's write, or
 * the recovery read that follows a refused write, would otherwise discard the
 * typed values and make the page look like it rolled back on its own. The user
 * either saves the draft or cancels it back to the accepted value.
 * @param snapshot - the accepted form snapshot for this row.
 * @returns the draft, its setter, and a reset that re-adopts the accepted value.
 */
function useDraft<T>(snapshot: ConfigFormSnapshot<T>): [T | undefined, (value: T | undefined) => void, () => void] {
  const [draft, setDraft] = useState<T | undefined>(snapshot.value)
  const pristine = useRef(true)
  useEffect(() => {
    if (!pristine.current) return
    setDraft(snapshot.value)
  }, [snapshot.revision, snapshot.value])
  const set = useCallback((value: T | undefined): void => {
    pristine.current = false
    setDraft(value)
  }, [])
  const reset = useCallback((): void => {
    pristine.current = true
    setDraft(snapshot.value)
  }, [snapshot.value])
  return [draft, set, reset]
}

function routeName(groups: readonly ModelProviderGroup[], route: CapabilityRouteView | undefined): string {
  if (route === undefined) return ''
  const provider = groups.find(group => group.id === route.provider)
  const model = matchCatalogModel(provider?.models ?? [], route.model)?.model
  return compact(provider?.name ?? route.provider, model?.name ?? route.model)
}

function routeDefaultEffort(groups: readonly ModelProviderGroup[], route: CapabilityRouteView | undefined): string | undefined {
  if (route === undefined) return undefined
  const matched = matchCatalogModel(groups.find(group => group.id === route.provider)?.models ?? [], route.model)
  return matched?.effort ?? matched?.model.reasoning?.defaultEffort
}

/**
 * The effort caption for the subagent summary: a stored effort is the pinned
 * one ("已固定 · High"); an unset effort follows the provider default and says
 * so ("Provider 默认 · High"), using the same effort-name lookup the picker does.
 */
function subagentEffortSegment(
  t: (key: ModelSwitchLocaleKey) => string,
  matched: ReturnType<typeof matchCatalogModel>,
  pinned: string,
  defaultEffort: string | undefined,
): string {
  const effortName = (id: string): string => matched?.model.reasoning?.efforts.find(level => level.id === id)?.name ?? id
  if (pinned !== '') return compact(t('effortPinned'), effortName(pinned))
  return defaultEffort === undefined ? t('providerDefaultShort') : compact(t('providerDefaultShort'), effortName(defaultEffort))
}

/** The catalog head route; capability switches pin here when turned On. */
function firstCatalogRoute(groups: readonly ModelProviderGroup[]): RouteModelSelection | undefined {
  const provider = groups[0]
  const model = provider?.models[0]
  return provider === undefined || model === undefined ? undefined : selectRouteModel(groups, provider.id, model.id)
}

function capabilityChoices(groups: readonly ModelProviderGroup[], route: CapabilityRouteView | undefined, providers: readonly string[] | undefined, kind: 'search' | 'image'): { providers: Choice[]; models: Choice[] } {
  const choices = deriveRouteChoices(groups, route, providers)
  if (kind === 'image' && route?.provider === 'grok') {
    const models: Choice[] = [{ id: 'grok-imagine-image-quality', name: 'Grok Imagine 1.0' }]
    if (route.model !== undefined && !models.some(model => model.id === route.model)) models.push({ id: route.model, name: route.model, unavailable: true })
    return { providers: choices.providers, models }
  }
  return choices
}

export function ModelSwitchSettings(props: ModelSwitchSettingsProps): ReactNode {
  const { groups, catalogError } = useSettingsCatalog(props)
  const subagent = props.useSubagentSettings(value => value)
  const search = props.useSearchSettings(value => value)
  const image = props.useImageSettings(value => value)
  const autoReview = props.useAutoReviewSettings(value => value)
  const compaction = props.useCompactionSettings(value => value)
  const sessionTitle = props.useTitleSettings(value => value)
  const switchSettings = props.useSwitchSettings(value => value)
  const [open, setOpen] = useState<RouteId | undefined>()
  const [subagentDraft, setSubagentDraft, resetSubagent] = useDraft(subagent)
  const [searchDraft, setSearchDraft, resetSearch] = useDraft(search)
  const [imageDraft, setImageDraft, resetImage] = useDraft(image)
  const [autoReviewDraft, setAutoReviewDraft, resetAutoReview] = useDraft(autoReview)
  const [compactionDraft, setCompactionDraft, resetCompaction] = useDraft(compaction)
  const [titleDraft, setTitleDraft, resetTitle] = useDraft(sessionTitle)
  const [busy, setBusy] = useState<RouteId | undefined>()
  const [message, setMessage] = useState<{ route: RouteId; text: string } | undefined>()
  const [compactBusy, setCompactBusy] = useState(false)
  const [compactError, setCompactError] = useState<string>()
  const [groupProvider, setGroupProvider] = useState<string>('')
  const [groupDraft, setGroupDraft] = useState<ProviderGroupConfig | undefined>(undefined)
  const loadSearchCapabilities = props.loadCapabilities
  const [searchSnapshot, setSearchSnapshot] = useState<CapabilitiesSnapshot | undefined>(undefined)
  const [searchError, setSearchError] = useState<string | undefined>(undefined)
  // One effect owns the Host long-poll chain and its abort signal.
  useEffect(() => {
    if (loadSearchCapabilities === undefined) return
    let live = true
    const scope = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let failures = 0
    let signature: string | undefined
    const poll = async (revision: number | undefined): Promise<void> => {
      try {
        const snapshot = await loadSearchCapabilities(revision, scope.signal)
        if (!live) return
        // Revisions belong to an RPC owner; compare content to accept restarts without heartbeat renders.
        const nextSignature = JSON.stringify(snapshot)
        if (signature !== nextSignature || failures > 0) {
          signature = nextSignature
          setSearchSnapshot(snapshot)
          setSearchError(undefined)
        }
        failures = 0
        void poll(snapshot.revision)
      } catch (error) {
        if (!live || scope.signal.aborted) return
        failures = Math.min(failures + 1, 8)
        if (failures >= 3) setSearchError(error instanceof Error ? error.message : props.t('catalogFailed'))
        // Stay fail-closed but recover without remounting; retry delay is capped at the Host heartbeat.
        timer = setTimeout(() => { if (live) void poll(undefined) }, Math.min(250 * 2 ** (failures - 1), 20_000))
      }
    }
    void poll(undefined)
    return () => { live = false; scope.abort(); if (timer !== undefined) clearTimeout(timer) }
  }, [loadSearchCapabilities])
  const providerGroups = normalizeProviderGroups(switchSettings.value?.providerGroups)
  /**
   * Seed an unsaved group from the live routes.
   *
   * Only the two per-session capabilities are seeded: a group carrying a
   * compaction or reviewer pin would store a value no consumer reads (see
   * src/session-route.ts), which is worse than storing nothing.
   */
  const seedGroupFromActive = (): ProviderGroupConfig => {
    const title = sessionTitle.value !== undefined && routePairConfigured(sessionTitle.value)
      ? { provider: sessionTitle.value.provider ?? '', model: sessionTitle.value.model ?? '' }
      : undefined
    const fixedSubagent = subagent.value !== undefined && subagent.value.mode === 'fixed' && routePairConfigured(subagent.value)
      ? { provider: subagent.value.provider ?? '', model: subagent.value.model ?? '', reasoningEffort: subagent.value.reasoningEffort }
      : undefined
    return {
      ...(title === undefined ? {} : { titleProvider: title.provider, titleModel: title.model }),
      ...(fixedSubagent === undefined ? {} : {
        subagentProvider: fixedSubagent.provider,
        subagentModel: fixedSubagent.model,
        ...(fixedSubagent.reasoningEffort === undefined ? {} : { subagentReasoningEffort: fixedSubagent.reasoningEffort }),
      }),
    }
  }
  /** Reload the editor draft: the saved group when one exists, else a seed from the live routes. */
  const resyncGroupDraft = (): void => {
    if (groupProvider === '') {
      setGroupDraft(undefined)
      return
    }
    setGroupDraft(groupOf(providerGroups, groupProvider) ?? seedGroupFromActive())
  }
  /** Open the editor on the provider in use: the first configured group, else the catalog head. */
  useEffect(() => {
    if (groupProvider !== '') return
    const configured = Object.keys(providerGroups)[0]
    const initial = configured ?? groups[0]?.id
    if (initial !== undefined && initial.trim() !== '') setGroupProvider(initial)
  }, [groupProvider, providerGroups, groups])
  useEffect(() => { resyncGroupDraft() }, [groupProvider, switchSettings.value, subagent.value, autoReview.value, compaction.value, sessionTitle.value])
  if ([subagent, search, image, switchSettings, sessionTitle].some(form => form.mode === 'memory')) {
    return <main className={css.section}>
      <h1 className={css.title}>{props.t('title')}</h1>
      <p role="status" className={css.hint}>{props.t('remoteSettingsUnavailable')}</p>
    </main>
  }
  const unavailable = (key: keyof RuntimeCapabilities): string => { const reason = props.capabilities[key].reason; return reason === undefined ? props.t('unavailable') : props.t(('reason.' + reason) as ModelSwitchLocaleKey) }
  const toggle = (route: RouteId): void => { setOpen(current => current === route ? undefined : route); setMessage(undefined) }
  const subagentRoute = subagentDraft === undefined ? undefined : { ...(subagentDraft.provider === undefined ? {} : { provider: subagentDraft.provider }), ...(subagentDraft.model === undefined ? {} : { model: subagentDraft.model }) }
  const subagentCatalogModel = matchCatalogModel(groups.find(group => group.id === subagentDraft?.provider)?.models ?? [], subagentDraft?.model)
  const subagentChoices = deriveRouteChoices(groups, subagentCatalogModel === undefined ? subagentRoute : { ...subagentRoute, model: subagentCatalogModel.model.id })
  const subagentEfforts = ((): Choice[] => {
    const matched = subagentCatalogModel
    const efforts = (matched?.model.reasoning?.efforts ?? []).map(effort => ({ id: effort.id, name: effort.name }))
    if (subagentDraft?.reasoningEffort !== undefined && !efforts.some(option => option.id === subagentDraft.reasoningEffort)) efforts.push({ id: subagentDraft.reasoningEffort, name: subagentDraft.reasoningEffort })
    return efforts
  })()
  const defaultEffort = routeDefaultEffort(groups, subagentRoute)
  const searchLive = searchSnapshot?.capabilities
  const searchGroups = searchGroupsFromCapabilities(searchLive)
  const searchChoices = capabilityChoices(searchGroups, searchDraft, undefined, 'search')
  const searchAvailable = searchLive?.searchProviderAdapters.available ?? false
  const imageChoices = capabilityChoices(groups, imageDraft, props.capabilities.imageProviderAdapters.providers ?? [], 'image')
  const autoReviewChoices = deriveRouteChoices(groups, autoReviewDraft)
  const autoReviewOn = routePairConfigured(autoReview.value)
  const compactionChoices = deriveRouteChoices(groups, compactionDraft)
  const compactionOn = routePairConfigured(compaction.value)
  const titleChoices = deriveRouteChoices(groups, titleDraft)
  const titleOn = routePairConfigured(sessionTitle.value)
  const synced = [subagent, search, image, autoReview, compaction, sessionTitle].every(snapshot => snapshot.status === 'ready')
  /**
   * Run one row save with a visible outcome that ALWAYS settles.
   *
   * A stalled write used to latch the page on "保存中…" forever, because `busy`
   * was only cleared by the settling promise. The 30s deadline reports the stall
   * instead; a late result is ignored by the race, so it can never overwrite a
   * newer draft either.
   * @param route - the row whose save is running, for busy and message routing.
   * @param operation - the single fenced write to perform.
   * @returns whether the write was accepted.
   */
  const run = async (route: RouteId, operation: () => Promise<void>): Promise<boolean> => {
    if (busy !== undefined) return false
    const timeoutMs = 30_000
    setBusy(route); setMessage(undefined)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        operation(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error(props.t('saveTimeout'))), timeoutMs)
        }),
      ])
      setMessage({ route, text: props.t('saved') })
      return true
    } catch (error) {
      setMessage({ route, text: error instanceof Error ? error.message : props.t('requestFailed') })
      return false
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      setBusy(undefined)
    }
  }
  const saveSubagent = (): void => {
    if (subagentDraft === undefined || subagentDraft.mode !== 'fixed') return
    const matched = subagentCatalogModel
    const provider = (subagentDraft.provider ?? '').trim()
    const model = (matched?.model.id ?? subagentDraft.model ?? '').trim()
    if (provider === '' || model === '') return
    const nextEffort = subagentDraft.reasoningEffort === '' ? undefined : subagentDraft.reasoningEffort || matched?.effort
    void run('subagent', () => props.saveSubagent([
      { field: 'provider', value: provider },
      { field: 'model', value: model },
      { field: 'reasoningEffort', value: nextEffort },
    ]))
  }
  const persistSubagentEnabled = (enabled: boolean): void => {
    if (subagentDraft === undefined || busy === 'subagent' || !subagent.writable) return
    const mode = subagentModeForEnabled(enabled)
    void run('subagent', () => props.saveSubagent([{ field: 'mode', value: mode }])).then(accepted => {
      // A refused write must not leave the switch showing a state the profile
      // never accepted, and it must not sit on a draft the host disagrees with.
      if (!accepted) { resetSubagent(); return }
      setSubagentDraft({ ...subagentDraft, mode })
      setOpen(current => enabled ? 'subagent' : current === 'subagent' ? undefined : current)
    })
  }
  /** Both halves of one pinned capability route, written together in one mutation. */
  const pairOps = (next: CapabilityRouteView): ConfigViewOp<CapabilityRouteView>[] => [
    { field: 'provider', value: next.provider },
    { field: 'model', value: next.model },
  ]
  const saveCapability = (route: 'search' | 'image', next: CapabilityRouteView | undefined): void => {
    if (next === undefined) return
    const provider = (next.provider ?? '').trim()
    const model = (next.model ?? '').trim()
    if (provider === '' || model === '') return
    void run(route, () => props.saveCapability(route, [{ field: 'provider', value: provider }, { field: 'model', value: model }]))
  }
  const saveAutoReview = (): void => {
    if (autoReviewDraft === undefined || (autoReviewDraft.provider ?? '').trim() === '' || (autoReviewDraft.model ?? '').trim() === '') return
    void run('autoReview', () => props.saveCapability('autoReview', pairOps(autoReviewDraft)))
  }
  const saveCompaction = (): void => {
    if (compactionDraft === undefined || (compactionDraft.provider ?? '').trim() === '' || (compactionDraft.model ?? '').trim() === '') return
    void run('compaction', () => props.saveCapability('compaction', pairOps(compactionDraft)))
  }
  const saveTitle = (): void => {
    if (titleDraft === undefined || (titleDraft.provider ?? '').trim() === '' || (titleDraft.model ?? '').trim() === '') return
    void run('sessionTitle', () => props.saveCapability('title', pairOps(titleDraft)))
  }
  /**
   * The reviewer switch: Off unsets both stored fields (follow the session
   * model); On pins the route to the catalog head so the pin takes effect
   * immediately and stays editable below. A failed write reports, never
   * flips silently.
   */
  const persistAutoReviewEnabled = (enabled: boolean): void => {
    if (busy === 'autoReview' || !autoReview.writable || autoReview.value === undefined) return
    if (!enabled) {
      setOpen(current => current === 'autoReview' ? undefined : current)
      void run('autoReview', () => props.saveCapability('autoReview', [{ field: 'provider', value: undefined }, { field: 'model', value: undefined }]))
      return
    }
    const seed = firstCatalogRoute(groups)
    if (seed === undefined) return
    void run('autoReview', () => props.saveCapability('autoReview', pairOps(seed))).then(accepted => {
      if (!accepted) return
      setAutoReviewDraft({ provider: seed.provider, model: seed.model })
      setOpen('autoReview')
    })
  }
  /**
   * The compaction switch: Off unsets both stored fields (official default =
   * the conversation target); On pins the route to the catalog head so the
   * pin takes effect immediately and stays editable below. A failed write
   * reports, never flips silently.
   */
  const persistCompactionEnabled = (enabled: boolean): void => {
    if (busy === 'compaction' || !compaction.writable || compaction.value === undefined) return
    if (!enabled) {
      setOpen(current => current === 'compaction' ? undefined : current)
      void run('compaction', () => props.saveCapability('compaction', [{ field: 'provider', value: undefined }, { field: 'model', value: undefined }]))
      return
    }
    const seed = firstCatalogRoute(groups)
    if (seed === undefined) return
    void run('compaction', () => props.saveCapability('compaction', pairOps(seed))).then(accepted => {
      if (!accepted) return
      setCompactionDraft({ provider: seed.provider, model: seed.model })
      setOpen('compaction')
    })
  }
  /**
   * The session-title switch: Off unsets both stored fields (naming follows
   * the session's own logged route); On pins the route to the catalog head so
   * the pin takes effect immediately and stays editable below. A failed write
   * reports, never flips silently.
   */
  const persistTitleEnabled = (enabled: boolean): void => {
    if (busy === 'sessionTitle' || !sessionTitle.writable || sessionTitle.value === undefined) return
    if (!enabled) {
      setOpen(current => current === 'sessionTitle' ? undefined : current)
      void run('sessionTitle', () => props.saveCapability('title', [{ field: 'provider', value: undefined }, { field: 'model', value: undefined }]))
      return
    }
    const seed = firstCatalogRoute(groups)
    if (seed === undefined) return
    void run('sessionTitle', () => props.saveCapability('title', pairOps(seed))).then(accepted => {
      if (!accepted) return
      setTitleDraft({ provider: seed.provider, model: seed.model })
      setOpen('sessionTitle')
    })
  }
  const subagentRole = subagentDraft?.mode === 'fixed' && subagentDraft.provider !== undefined && subagentDraft.provider !== '' ? props.providerRoleOf?.(subagentDraft.provider) : undefined
  const subagentOn = subagentDraft?.mode === 'fixed'
  const subagentSummary = subagentDraft === undefined ? props.t('loading') : subagentOn
    ? compact(routeName(groups, subagentRoute), isAgentRole(subagentRole) ? props.t('agentBadge') : undefined, subagentEffortSegment(props.t, subagentCatalogModel, (subagentDraft.reasoningEffort ?? '').trim(), defaultEffort))
    : props.t('subagentOff')
  const subagentDisabled = subagent.status !== 'ready' || !subagent.writable || subagentDraft === undefined || busy === 'subagent' || !subagentOn || (subagentDraft.provider ?? '').trim() === '' || (subagentDraft.model ?? '').trim() === ''
  const capabilityDisabled = (route: 'search' | 'image', snapshot: ConfigFormSnapshot<CapabilityRouteView>, next: CapabilityRouteView | undefined): boolean => snapshot.status !== 'ready' || !snapshot.writable || next === undefined || busy === route || (next.provider ?? '').trim() === '' || (next.model ?? '').trim() === ''
  const autoReviewDisabled = autoReview.status !== 'ready' || !autoReview.writable || autoReviewDraft === undefined || busy === 'autoReview' || !autoReviewOn || (autoReviewDraft.provider ?? '').trim() === '' || (autoReviewDraft.model ?? '').trim() === ''
  const compactionDisabled = compaction.status !== 'ready' || !compaction.writable || compactionDraft === undefined || busy === 'compaction' || !compactionOn || (compactionDraft.provider ?? '').trim() === '' || (compactionDraft.model ?? '').trim() === ''
  const titleDisabled = sessionTitle.status !== 'ready' || !sessionTitle.writable || titleDraft === undefined || busy === 'sessionTitle' || !titleOn || (titleDraft.provider ?? '').trim() === '' || (titleDraft.model ?? '').trim() === ''
  const configuredGroupCount = Object.keys(providerGroups).length
  const groupControlsDisabled = busy === 'providerGroups' || switchSettings.status !== 'ready' || !switchSettings.writable
  const groupProviderChoices = deriveRouteChoices(groups, groupProvider === '' ? undefined : { provider: groupProvider })
    .providers.map(choice => groupOf(providerGroups, choice.id) === undefined ? choice : { ...choice, name: choice.name + ' ✓' })
  const groupTitle = groupDraft === undefined ? undefined : draftPair(groupDraft.titleProvider, groupDraft.titleModel)
  const groupSubagent = groupDraft === undefined ? undefined : draftPair(groupDraft.subagentProvider, groupDraft.subagentModel)
  const groupTitleChoices = deriveRouteChoices(groups, groupTitle)
  const groupSubagentChoices = deriveRouteChoices(groups, groupSubagent)
  const groupSubMatched = matchCatalogModel(groups.find(group => group.id === (groupDraft?.subagentProvider ?? ''))?.models ?? [], groupDraft?.subagentModel ?? '')
  const groupSubEfforts = ((): Choice[] => {
    const efforts: Choice[] = (groupSubMatched?.model.reasoning?.efforts ?? []).map(effort => ({ id: effort.id, name: effort.name }))
    const current = groupDraft?.subagentReasoningEffort
    if (current !== undefined && current !== '' && !efforts.some(option => option.id === current)) efforts.push({ id: current, name: current })
    return efforts
  })()
  /**
   * Enable a capability row by pinning it: to that capability's live route
   * when one is configured, else to the catalog head (same sources the
   * editor's first-edit seed uses).
   *
   * Only the two capabilities with a public per-session seam are editable here
   * (see src/session-route.ts): compaction records the summarizer that wrote
   * each summary durably and auto review carries no session identity at its
   * interception point, so both stay deployment-wide cards.
   */
  const enableGroupCapability = (kind: 'sessionTitle' | 'subagent'): void => {
    const active = seedGroupFromActive()
    const seed = firstCatalogRoute(groups)
    setGroupDraft(draft => {
      if (draft === undefined) return draft
      if (kind === 'sessionTitle') {
        const provider = active.titleProvider ?? seed?.provider
        const model = active.titleModel ?? seed?.model
        if (provider === undefined || model === undefined) return draft
        return { ...draft, titleProvider: provider, titleModel: model }
      }
      const provider = active.subagentProvider ?? seed?.provider
      const model = active.subagentModel ?? seed?.model
      if (provider === undefined || model === undefined) return draft
      const effort = active.subagentProvider !== undefined ? active.subagentReasoningEffort : seed?.reasoningEffort
      return { ...draft, subagentProvider: provider, subagentModel: model, ...(effort === undefined || effort === '' ? {} : { subagentReasoningEffort: effort }) }
    })
  }
  const disableGroupCapability = (kind: 'sessionTitle' | 'subagent'): void => {
    setGroupDraft(draft => {
      if (draft === undefined) return draft
      if (kind === 'sessionTitle') return { ...draft, titleProvider: '', titleModel: '' }
      return { ...draft, subagentProvider: '', subagentModel: '', subagentReasoningEffort: '' }
    })
  }
  const saveProviderGroupCard = (): void => {
    if (groupProvider === '' || groupDraft === undefined) return
    void run('providerGroups', () => props.saveProviderGroup(groupProvider, groupDraft))
  }
  const deleteProviderGroupCard = (): void => {
    if (groupProvider === '') return
    void run('providerGroups', () => props.saveProviderGroup(groupProvider, undefined))
  }

  return <main className={css.section}>
    <h1 className={css.title}>{props.t('title')}</h1>
    <p className={css.intro}>{props.t('subtitle')}</p>
    <p className={css.saved}><i className={css.savedDot} />{synced ? props.t('settingsSynced') : props.t('loading')}</p>
    {catalogError === undefined ? null : <p className={cx(css.hint, css.message)}>{catalogError}</p>}

    <section className={css.group}><h2 className={css.groupLabel}>{props.t('sendProtection')}</h2>
      <div className={css.rowCard}>
        <span className={css.routeIcon} aria-hidden="true"><svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 5.5h10M4 9h7M4 12.5h5" stroke="currentColor" strokeLinecap="round" /><path d="M13 11.5v3.5l2-1.6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
        <div className={css.rowCopy}>
          <span className={css.rowTitle}>{props.t('compactOnSwitch')}</span>
          <p className={css.hint}>{props.t('compactOnSwitchHelp')}</p>
          {compactError === undefined ? null : <p className={cx(css.hint, css.message)}>{compactError}</p>}
        </div>
        <InstantSwitch checked={switchSettings.value?.compactOnSwitch !== false} disabled={!switchSettings.writable || compactBusy} label={props.t('compactOnSwitch')} onChange={value => {
          setCompactBusy(true)
          setCompactError(undefined)
          void props.setCompactOnSwitch(value).then(
            () => { setCompactBusy(false) },
            error => {
              setCompactBusy(false)
              setCompactError(error instanceof Error ? error.message : props.t('requestFailed'))
            },
          )
        }} />
      </div>
    </section>

    <section className={css.group}><h2 className={css.groupLabel}>{props.t('conversationRoutes')}</h2>
      {props.capabilities.centralSubagentRouting.available ? <RouteCard title={props.t('subagent')} summary={subagentSummary} hint={props.t('subagentHelp')} icon="subagent" open={open === 'subagent' && subagentOn} onToggle={() => { if (subagentOn) toggle('subagent') }} expandable={subagentOn} trailing={subagentDraft === undefined ? undefined : <InstantSwitch checked={subagentOn} disabled={busy === 'subagent' || !subagent.writable} label={props.t('subagent')} onChange={persistSubagentEnabled} />}>
        {subagentDraft === undefined ? <p className={css.hint}>{props.t('loading')}</p> : <><div className={css.formGrid}>
          <Field label={props.t('provider')} value={subagentDraft.provider ?? ''} disabled={busy === 'subagent' || !subagent.writable} choices={subagentChoices.providers} onChange={provider => { const first = groups.find(group => group.id === provider)?.models[0]; setSubagentDraft({ mode: 'fixed', ...selectRouteModel(groups, provider, first?.id ?? subagentDraft.model ?? '') }) }} /><Field label={props.t('model')} value={subagentCatalogModel?.model.id ?? subagentDraft.model ?? ''} disabled={busy === 'subagent' || !subagent.writable} choices={subagentChoices.models} onChange={model => { setSubagentDraft({ mode: 'fixed', ...selectRouteModel(groups, subagentDraft.provider ?? '', model) }) }} /><Field label={props.t('effort')} value={subagentDraft.reasoningEffort || subagentCatalogModel?.effort || ''} disabled={busy === 'subagent' || !subagent.writable} choices={subagentEfforts} onChange={effort => { const matched = subagentCatalogModel; setSubagentDraft({ ...subagentDraft, ...(matched?.model.id === undefined ? {} : { model: matched.model.id }), reasoningEffort: effort }) }} />
        </div><Actions t={props.t} busy={busy === 'subagent'} disabled={subagentDisabled} {...(message?.route === 'subagent' ? { message: message.text } : {})} onCancel={() => { resetSubagent(); setMessage(undefined) }} onSave={saveSubagent} /></>}
      </RouteCard> : <RouteCard title={props.t('subagent')} summary={unavailable('centralSubagentRouting')} icon="subagent" open={false} onToggle={() => {}} disabled badge={props.t('unavailable')} badgeWarn />}
    </section>

    <section className={css.group}><h2 className={css.groupLabel}>{props.t('capabilityRoutes')}</h2>
      {searchAvailable ? <RouteCard title={props.t('search')} summary={searchDraft === undefined ? props.t('loading') : routeName(searchGroups, searchDraft)} icon="search" open={open === 'search'} onToggle={() => { toggle('search') }}>
        {searchDraft === undefined ? <p className={css.hint}>{props.t('loading')}</p> : <><p className={css.hint}>{props.t('searchHelp')}</p>{searchError === undefined ? null : <p className={css.hint}>{searchError}</p>}<div className={css.formGrid}>
          <Field label={props.t('provider')} value={searchDraft.provider} disabled={busy === 'search' || !search.writable || searchError !== undefined} choices={searchChoices.providers} onChange={provider => { const first = searchGroups.find(group => group.id === provider)?.models[0]; setSearchDraft({ provider, ...(first === undefined ? {} : { model: first.id }) }) }} />
          <Field label={props.t('model')} value={searchDraft.model} disabled={busy === 'search' || !search.writable || searchError !== undefined} choices={searchChoices.models} onChange={model => { setSearchDraft({ ...searchDraft, model }) }} />
        </div><Actions t={props.t} busy={busy === 'search'} disabled={capabilityDisabled('search', search, searchDraft) || searchError !== undefined || !searchGroups.some(group => group.id === searchDraft.provider && group.models.some(model => model.id === searchDraft.model))} {...(message?.route === 'search' ? { message: message.text } : {})} onCancel={() => { resetSearch(); setMessage(undefined) }} onSave={() => { saveCapability('search', searchDraft) }} /></>}
      </RouteCard> : <RouteCard title={props.t('search')} summary={searchError ?? unavailable('searchProviderAdapters')} icon="search" open={false} onToggle={() => {}} disabled badge={props.t('unavailable')} badgeWarn />}

      {props.capabilities.imageProviderAdapters.available ? <RouteCard title={props.t('image')} summary={imageDraft === undefined ? props.t('loading') : routeName(groups, imageDraft)} icon="image" open={open === 'image'} onToggle={() => { toggle('image') }}>
        {imageDraft === undefined ? <p className={css.hint}>{props.t('loading')}</p> : <><p className={css.hint}>{props.t('imageHelp')}</p><div className={css.formGrid}>
          <Field label={props.t('provider')} value={imageDraft.provider} disabled={busy === 'image' || !image.writable} choices={imageChoices.providers} onChange={provider => { const model = provider === 'grok' ? 'grok-imagine-image-quality' : groups.find(group => group.id === provider)?.models[0]?.id; setImageDraft({ provider, ...(model === undefined ? {} : { model }) }) }} />
          <Field label={props.t('model')} value={imageDraft.model} disabled={busy === 'image' || !image.writable} choices={imageChoices.models} onChange={model => { setImageDraft({ ...imageDraft, model }) }} />
        </div><Actions t={props.t} busy={busy === 'image'} disabled={capabilityDisabled('image', image, imageDraft)} {...(message?.route === 'image' ? { message: message.text } : {})} onCancel={() => { resetImage(); setMessage(undefined) }} onSave={() => { saveCapability('image', imageDraft) }} /></>}
      </RouteCard> : <RouteCard title={props.t('image')} summary={unavailable('imageProviderAdapters')} icon="image" open={false} onToggle={() => {}} disabled badge={props.t('unavailable')} badgeWarn />}

      <RouteCard title={props.t('autoReview')} summary={autoReviewDraft === undefined ? props.t('loading') : autoReviewOn ? routeName(groups, autoReviewDraft) : props.t('autoReviewFollow')} hint={props.t('autoReviewHelp')} icon="autoReview" open={open === 'autoReview' && autoReviewOn} onToggle={() => { if (autoReviewOn) toggle('autoReview') }} expandable={autoReviewOn} trailing={autoReviewDraft === undefined ? undefined : <InstantSwitch checked={autoReviewOn} disabled={busy === 'autoReview' || !autoReview.writable} label={props.t('autoReview')} onChange={persistAutoReviewEnabled} />}>
        {autoReviewDraft === undefined ? <p className={css.hint}>{props.t('loading')}</p> : <><p className={css.hint}>{props.t('autoReviewRouteHelp')}</p><div className={css.formGrid}>
          <Field label={props.t('provider')} value={autoReviewDraft.provider ?? ''} disabled={busy === 'autoReview' || !autoReview.writable} choices={autoReviewChoices.providers} onChange={provider => { const first = groups.find(group => group.id === provider)?.models[0]; setAutoReviewDraft({ provider, ...(first === undefined ? {} : { model: first.id }) }) }} />
          <Field label={props.t('model')} value={autoReviewDraft.model ?? ''} disabled={busy === 'autoReview' || !autoReview.writable} choices={autoReviewChoices.models} onChange={model => { setAutoReviewDraft({ ...autoReviewDraft, model }) }} />
        </div><Actions t={props.t} busy={busy === 'autoReview'} disabled={autoReviewDisabled} {...(message?.route === 'autoReview' ? { message: message.text } : {})} onCancel={() => { resetAutoReview(); setMessage(undefined) }} onSave={saveAutoReview} /></>}
      </RouteCard>

      <RouteCard title={props.t('compaction')} summary={compactionDraft === undefined ? props.t('loading') : compactionOn ? routeName(groups, compactionDraft) : props.t('compactionFollow')} hint={props.t('compactionHelp')} icon="compaction" open={open === 'compaction' && compactionOn} onToggle={() => { if (compactionOn) toggle('compaction') }} expandable={compactionOn} trailing={compactionDraft === undefined ? undefined : <InstantSwitch checked={compactionOn} disabled={busy === 'compaction' || !compaction.writable} label={props.t('compaction')} onChange={persistCompactionEnabled} />}>
        {compactionDraft === undefined ? <p className={css.hint}>{props.t('loading')}</p> : <><p className={css.hint}>{props.t('compactionRouteHelp')}</p><div className={css.formGrid}>
          <Field label={props.t('provider')} value={compactionDraft.provider ?? ''} disabled={busy === 'compaction' || !compaction.writable} choices={compactionChoices.providers} onChange={provider => { const first = groups.find(group => group.id === provider)?.models[0]; setCompactionDraft({ provider, ...(first === undefined ? {} : { model: first.id }) }) }} />
          <Field label={props.t('model')} value={compactionDraft.model ?? ''} disabled={busy === 'compaction' || !compaction.writable} choices={compactionChoices.models} onChange={model => { setCompactionDraft({ ...compactionDraft, model }) }} />
        </div><Actions t={props.t} busy={busy === 'compaction'} disabled={compactionDisabled} {...(message?.route === 'compaction' ? { message: message.text } : {})} onCancel={() => { resetCompaction(); setMessage(undefined) }} onSave={saveCompaction} /></>}
      </RouteCard>

      <RouteCard title={props.t('sessionTitle')} summary={titleDraft === undefined ? props.t('loading') : titleOn ? routeName(groups, titleDraft) : props.t('titleFollow')} hint={props.t('titleHelp')} icon="sessionTitle" open={open === 'sessionTitle' && titleOn} onToggle={() => { if (titleOn) toggle('sessionTitle') }} expandable={titleOn} trailing={titleDraft === undefined ? undefined : <InstantSwitch checked={titleOn} disabled={busy === 'sessionTitle' || !sessionTitle.writable} label={props.t('sessionTitle')} onChange={persistTitleEnabled} />}>
        {titleDraft === undefined ? <p className={css.hint}>{props.t('loading')}</p> : <><p className={css.hint}>{props.t('titleRouteHelp')}</p><div className={css.formGrid}>
          <Field label={props.t('provider')} value={titleDraft.provider ?? ''} disabled={busy === 'sessionTitle' || !sessionTitle.writable} choices={titleChoices.providers} onChange={provider => { const first = groups.find(group => group.id === provider)?.models[0]; setTitleDraft({ provider, ...(first === undefined ? {} : { model: first.id }) }) }} />
          <Field label={props.t('model')} value={titleDraft.model ?? ''} disabled={busy === 'sessionTitle' || !sessionTitle.writable} choices={titleChoices.models} onChange={model => { setTitleDraft({ ...titleDraft, model }) }} />
        </div><Actions t={props.t} busy={busy === 'sessionTitle'} disabled={titleDisabled} {...(message?.route === 'sessionTitle' ? { message: message.text } : {})} onCancel={() => { resetTitle(); setMessage(undefined) }} onSave={saveTitle} /></>}
      </RouteCard>
    </section>

    <section className={css.group}><h2 className={css.groupLabel}>{props.t('providerGroups')}</h2>
      <RouteCard title={props.t('providerGroupsCard')} summary={props.t('providerGroupsSummary')} hint={props.t('providerGroupsHelp')} icon="providerGroups" open={open === 'providerGroups'} onToggle={() => { toggle('providerGroups') }} {...(configuredGroupCount > 0 ? { badge: String(configuredGroupCount) } : {})}>
        <p className={css.hint}>{props.t('providerGroupsBodyHelp')}</p>
        <div className={css.formGrid}>
          <Field label={props.t('provider')} value={groupProvider} disabled={groupControlsDisabled} choices={groupProviderChoices} onChange={setGroupProvider} />
        </div>
        {groupProvider === '' || groupDraft === undefined ? <p className={css.hint}>{props.t('providerGroupPick')}</p> : <>
          <div className={css.rowCard}>
            <div className={css.rowCopy}>
              <span className={css.rowTitle}>{props.t('sessionTitle')}</span>
              <p className={css.hint}>{groupTitle === undefined ? props.t('titleFollow') : routeName(groups, groupTitle)}</p>
            </div>
            <InstantSwitch checked={groupTitle !== undefined} disabled={groupControlsDisabled} label={props.t('sessionTitle')} onChange={value => { if (value) enableGroupCapability('sessionTitle'); else disableGroupCapability('sessionTitle') }} />
          </div>
          {groupTitle === undefined ? null : <div className={css.formGrid}>
            <Field label={props.t('provider')} value={groupTitle.provider} disabled={groupControlsDisabled} choices={groupTitleChoices.providers} onChange={provider => { const first = groups.find(item => item.id === provider)?.models[0]; setGroupDraft(draft => draft === undefined ? draft : { ...draft, titleProvider: provider, titleModel: first?.id ?? '' }) }} />
            <Field label={props.t('model')} value={groupTitle.model} disabled={groupControlsDisabled} choices={groupTitleChoices.models} onChange={model => { setGroupDraft(draft => draft === undefined ? draft : { ...draft, titleModel: model }) }} />
          </div>}

          <div className={css.rowCard}>
            <div className={css.rowCopy}>
              <span className={css.rowTitle}>{props.t('subagent')}</span>
              <p className={css.hint}>{groupSubagent === undefined ? props.t('subagentOff') : routeName(groups, groupSubagent)}</p>
            </div>
            <InstantSwitch checked={groupSubagent !== undefined} disabled={groupControlsDisabled} label={props.t('subagent')} onChange={value => { if (value) enableGroupCapability('subagent'); else disableGroupCapability('subagent') }} />
          </div>
          {groupSubagent === undefined ? null : <div className={css.formGrid}>
            <Field label={props.t('provider')} value={groupSubagent.provider} disabled={groupControlsDisabled} choices={groupSubagentChoices.providers} onChange={provider => { const first = groups.find(item => item.id === provider)?.models[0]; const routed = selectRouteModel(groups, provider, first?.id ?? groupSubagent.model); setGroupDraft(draft => draft === undefined ? draft : { ...draft, subagentProvider: routed.provider, subagentModel: routed.model, subagentReasoningEffort: routed.reasoningEffort ?? '' }) }} />
            <Field label={props.t('model')} value={groupSubagent.model} disabled={groupControlsDisabled} choices={groupSubagentChoices.models} onChange={model => { const routed = selectRouteModel(groups, groupSubagent.provider, model); setGroupDraft(draft => draft === undefined ? draft : { ...draft, subagentProvider: routed.provider, subagentModel: routed.model, subagentReasoningEffort: routed.reasoningEffort ?? '' }) }} />
            <Field label={props.t('effort')} value={groupDraft.subagentReasoningEffort ?? ''} disabled={groupControlsDisabled} choices={groupSubEfforts} onChange={effort => { setGroupDraft(draft => draft === undefined ? draft : { ...draft, subagentReasoningEffort: effort }) }} />
          </div>}

          <Actions t={props.t} busy={busy === 'providerGroups'} disabled={groupControlsDisabled || groupProvider === ''}
            {...(message?.route === 'providerGroups' ? { message: message.text } : {})}
            extra={<button type="button" className={cx(css.button, css.secondaryButton)} disabled={groupControlsDisabled || groupOf(providerGroups, groupProvider) === undefined} onClick={deleteProviderGroupCard}>{props.t('providerGroupDelete')}</button>}
            onCancel={() => { resyncGroupDraft(); setMessage(undefined) }}
            onSave={saveProviderGroupCard} />
        </>}
      </RouteCard>
    </section>

  </main>
}
