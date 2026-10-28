import type { ProviderGroupsStorage } from './provider-group.js'
import { DEFAULT_READ_ONLY_TOOLS, isAllowedByList } from './tool-allowlist.js'

export const MODEL_SWITCH_CONFIG_ID = 'model-switch'
export const PROVIDERS_CONFIG_ID = 'llm-providers-ui'

export interface ModelSwitchSettingsView {
  subagentMode: 'follow-main' | 'fixed'
  subagentProvider?: string; subagentModel?: string; subagentReasoningEffort?: string
  searchProvider?: string; searchModel?: string
  imageProvider?: string; imageModel?: string
  autoReviewProvider?: string; autoReviewModel?: string
  /** Opt-in read-only skip for the Auto reviewer; absent/false keeps every call reviewed. */
  autoReviewSkipReadOnly?: boolean
  /** Exact tool names, or trailing-`*` patterns, that skip the reviewer when enabled. */
  autoReviewAllowlist?: readonly string[]
  /**
   * Reviewer stream idle timeout in ms; `0` = cancelled (written as the upstream
   * ceiling); absent = follow the provider default.
   */
  autoReviewTimeoutMs?: number
  compactProvider?: string; compactModel?: string
  titleProvider?: string; titleModel?: string
  /** Distillation route for the memory plugin; both unset means it keeps its own default. */
  memoryProvider?: string; memoryModel?: string
  /** Raw saved per-provider groups; edited whole through the provider-groups card. */
  providerGroups?: ProviderGroupsStorage
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
/** Auto-reviewer read-only skip: the switch and its allowlist are edited as one unit. */
export const AUTO_REVIEW_ALLOWLIST_FIELDS = Object.freeze({ enabled: 'autoReviewSkipReadOnly', tools: 'autoReviewAllowlist' } as const)
/** Auto-reviewer stream idle timeout: one stored value; absent keeps the provider default. */
export const AUTO_REVIEW_TIMEOUT_FIELD = 'autoReviewTimeoutMs' as const
/** Upstream ceiling enforced by `@deepseek-ai/dsh-timeout` (MAX_TIMER_DELAY_MS). */
export const UPSTREAM_MAX_IDLE_TIMEOUT_MS = 2_147_483_647
/** Upstream default (300 s) when the provider profile leaves the field unset. */
export const UPSTREAM_DEFAULT_IDLE_TIMEOUT_MS = 300_000

/** One allowlist editor snapshot (switch + entries). */
export interface AutoReviewAllowlistView { enabled: boolean; tools: readonly string[] }

/**
 * Derive the allowlist editor's value.
 *
 * An absent list means "never configured" and shows the shipped defaults; an
 * explicitly emptied list stays empty, so clearing it is not undone by a reload.
 */
export function deriveAutoReviewAllowlist(settings: ModelSwitchSettingsView): AutoReviewAllowlistView {
  return {
    enabled: settings.autoReviewSkipReadOnly === true,
    tools: Array.isArray(settings.autoReviewAllowlist) ? [...settings.autoReviewAllowlist] : [...DEFAULT_READ_ONLY_TOOLS],
  }
}
/** Compaction summarization route for `/compact` and automatic compaction; both unset means the official default (the conversation target). */
export const COMPACTION_SETTINGS_FIELDS = Object.freeze({ provider: 'compactProvider', model: 'compactModel' } as const)
/** Automatic session-title naming route; both unset means the official default (the session's own logged route). */
export const TITLE_SETTINGS_FIELDS = Object.freeze({ provider: 'titleProvider', model: 'titleModel' } as const)
/** Distillation route handed to the memory plugin when it follows its own default. */
export const MEMORY_SETTINGS_FIELDS = Object.freeze({ provider: 'memoryProvider', model: 'memoryModel' } as const)

export function deriveSubagentSettings(settings: ModelSwitchSettingsView): SubagentSettingsView {
  return { mode: settings.subagentMode, ...(settings.subagentProvider === undefined ? {} : { provider: settings.subagentProvider }), ...(settings.subagentModel === undefined ? {} : { model: settings.subagentModel }), ...(settings.subagentReasoningEffort === undefined ? {} : { reasoningEffort: settings.subagentReasoningEffort }) }
}
export function deriveSearchSettings(settings: ModelSwitchSettingsView): CapabilityRouteView { return { ...(settings.searchProvider === undefined ? {} : { provider: settings.searchProvider }), ...(settings.searchModel === undefined ? {} : { model: settings.searchModel }) } }
export function deriveImageSettings(settings: ModelSwitchSettingsView): CapabilityRouteView { return { ...(settings.imageProvider === undefined ? {} : { provider: settings.imageProvider }), ...(settings.imageModel === undefined ? {} : { model: settings.imageModel }) } }
export function deriveAutoReviewSettings(settings: ModelSwitchSettingsView): CapabilityRouteView { return { ...(settings.autoReviewProvider === undefined ? {} : { provider: settings.autoReviewProvider }), ...(settings.autoReviewModel === undefined ? {} : { model: settings.autoReviewModel }) } }
export function deriveCompactionSettings(settings: ModelSwitchSettingsView): CapabilityRouteView { return { ...(settings.compactProvider === undefined ? {} : { provider: settings.compactProvider }), ...(settings.compactModel === undefined ? {} : { model: settings.compactModel }) } }
export function deriveTitleSettings(settings: ModelSwitchSettingsView): CapabilityRouteView { return { ...(settings.titleProvider === undefined ? {} : { provider: settings.titleProvider }), ...(settings.titleModel === undefined ? {} : { model: settings.titleModel }) } }
export function deriveMemorySettings(settings: ModelSwitchSettingsView): CapabilityRouteView { return { ...(settings.memoryProvider === undefined ? {} : { provider: settings.memoryProvider }), ...(settings.memoryModel === undefined ? {} : { model: settings.memoryModel }) } }
/** Whether both fields of a model route form a complete pair; an incomplete pair stays off. */
export function routePairConfigured(route: CapabilityRouteView | undefined): boolean {
  return route !== undefined && (route.provider ?? '').trim() !== '' && (route.model ?? '').trim() !== ''
}

/** Live reviewer counters shown beside the allowlist editor. */
export interface ReviewStatusView {
  readonly held: boolean
  readonly allowedCalls: number
  readonly skippedReadOnly: number
  /** Third-party `@log.li/dsh-automode` row this Host adapted, when present. */
  readonly automode?: {
    readonly route?: string | undefined
    readonly routeSkipped?: string | undefined
    readonly added: number
    readonly skipped: number
  } | undefined
}

/**
 * Decode the reviewer counters from a `tools` RPC payload.
 * @param value - the RPC result value.
 * @returns The counters, or undefined when the Host does not report them.
 */
export function decodeReviewStatus(value: unknown): ReviewStatusView | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const raw = (value as { status?: unknown }).status
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const status = raw as { held?: unknown; allowedCalls?: unknown; skippedReadOnly?: unknown; automode?: unknown }
  const count = (input: unknown): number => (typeof input === 'number' && Number.isFinite(input) && input >= 0 ? input : 0)
  const route = (input: unknown): string | undefined => (typeof input === 'string' && input.trim() !== '' ? input.trim() : undefined)
  const automode = status.automode !== null && typeof status.automode === 'object' && !Array.isArray(status.automode)
    ? (() => {
        const row = status.automode as { installed?: unknown; route?: unknown; routeSkipped?: unknown; added?: unknown; skipped?: unknown }
        if (row.installed !== true) return undefined
        return { route: route(row.route), routeSkipped: route(row.routeSkipped), added: count(row.added), skipped: count(row.skipped) }
      })()
    : undefined
  return {
    held: status.held === true,
    allowedCalls: count(status.allowedCalls),
    skippedReadOnly: count(status.skippedReadOnly),
    automode,
  }
}

/** One tool row in the allowlist editor, as the Host reports it. */
export interface ToolCatalogRow {
  readonly name: string
  readonly description: string
  /** Human source label, e.g. `MCP · wincu`. */
  readonly sourceLabel: string
  /** Repository of the providing package, when known. */
  readonly repo?: string
  /** Whether the shipped defaults already allow it. */
  readonly recommended: boolean
}

/**
 * Decode the `tools` RPC payload.
 *
 * Malformed entries are skipped rather than failing the page: the catalog is a
 * convenience view over the Host's tools, and a partial list is still useful.
 *
 * @param value - the RPC result value.
 * @returns The rows, or undefined when the payload is not a catalog at all.
 */
export function decodeToolCatalog(value: unknown): readonly ToolCatalogRow[] | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const listed = (value as { tools?: unknown }).tools
  if (!Array.isArray(listed)) return undefined
  const rows: ToolCatalogRow[] = []
  for (const entry of listed) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue
    const raw = entry as { name?: unknown; description?: unknown; source?: unknown }
    if (typeof raw.name !== 'string' || raw.name === '') continue
    const source: { label?: unknown; repo?: unknown } = raw.source !== null && typeof raw.source === 'object' && !Array.isArray(raw.source)
      ? raw.source as { label?: unknown; repo?: unknown }
      : {}
    rows.push({
      name: raw.name,
      description: typeof raw.description === 'string' ? raw.description : '',
      sourceLabel: typeof source.label === 'string' ? source.label : '未知来源',
      ...(typeof source.repo === 'string' ? { repo: source.repo } : {}),
      recommended: isAllowedByList(raw.name, DEFAULT_READ_ONLY_TOOLS),
    })
  }
  return rows
}
