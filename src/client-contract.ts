export const MODEL_SWITCH_CONFIG_ID = 'model-switch'
export const MAIN_DEFAULT_CONFIG_ID = 'agent-default-model'
export const PROVIDERS_CONFIG_ID = 'llm-providers-ui'

export interface MainSettingsView { provider: string; model: string; reasoningEffort?: string }
export class MainSettingsConflictError extends Error {
  override readonly name = 'MainSettingsConflictError'
}
export interface ModelSwitchSettingsView {
  subagentMode: 'follow-main' | 'fixed'
  subagentProvider?: string; subagentModel?: string; subagentReasoningEffort?: string
  searchProvider?: string; searchModel?: string
  imageProvider?: string; imageModel?: string
  compactOnSwitch?: boolean
  autoReviewProvider?: string; autoReviewModel?: string
  /** Plan-exit compaction threshold in tokens; absent = the shipped default. */
  planCompactThreshold?: number
}
export interface SubagentSettingsView { mode: 'follow-main' | 'fixed'; provider?: string; model?: string; reasoningEffort?: string }
export interface CapabilityRouteView { provider?: string; model?: string }

export const SUBAGENT_SETTINGS_FIELDS = Object.freeze({ mode: 'subagentMode', provider: 'subagentProvider', model: 'subagentModel', reasoningEffort: 'subagentReasoningEffort' } as const)

/** Instant Subagent header toggle. Off keeps the stored `follow-main` unset token. */
export function subagentModeForEnabled(enabled: boolean): SubagentSettingsView['mode'] {
  return enabled ? 'fixed' : 'follow-main'
}
export const SEARCH_SETTINGS_FIELDS = Object.freeze({ provider: 'searchProvider', model: 'searchModel' } as const)
export const IMAGE_SETTINGS_FIELDS = Object.freeze({ provider: 'imageProvider', model: 'imageModel' } as const)
/** Auto-preset reviewer route; both unset means the reviewer follows the session model. */
export const AUTO_REVIEW_SETTINGS_FIELDS = Object.freeze({ provider: 'autoReviewProvider', model: 'autoReviewModel' } as const)

export function deriveSubagentSettings(settings: ModelSwitchSettingsView): SubagentSettingsView {
  return { mode: settings.subagentMode, ...(settings.subagentProvider === undefined ? {} : { provider: settings.subagentProvider }), ...(settings.subagentModel === undefined ? {} : { model: settings.subagentModel }), ...(settings.subagentReasoningEffort === undefined ? {} : { reasoningEffort: settings.subagentReasoningEffort }) }
}
export function deriveSearchSettings(settings: ModelSwitchSettingsView): CapabilityRouteView { return { ...(settings.searchProvider === undefined ? {} : { provider: settings.searchProvider }), ...(settings.searchModel === undefined ? {} : { model: settings.searchModel }) } }
export function deriveImageSettings(settings: ModelSwitchSettingsView): CapabilityRouteView { return { ...(settings.imageProvider === undefined ? {} : { provider: settings.imageProvider }), ...(settings.imageModel === undefined ? {} : { model: settings.imageModel }) } }
export function deriveAutoReviewSettings(settings: ModelSwitchSettingsView): CapabilityRouteView { return { ...(settings.autoReviewProvider === undefined ? {} : { provider: settings.autoReviewProvider }), ...(settings.autoReviewModel === undefined ? {} : { model: settings.autoReviewModel }) } }
/** Whether both reviewer fields form a complete route; an incomplete pair still follows the session model. */
export function autoReviewRouteConfigured(route: CapabilityRouteView | undefined): boolean {
  return route !== undefined && (route.provider ?? '').trim() !== '' && (route.model ?? '').trim() !== ''
}
