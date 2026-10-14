/**
 * Provider configuration groups: per-provider presets for the compaction,
 * subagent, and auto-review routes.
 *
 * A group stores the exact flat settings fields it will write, so applying a
 * group is a plain settings-layer write: every capability consumer keeps
 * reading the live values unchanged. All functions here are pure and never
 * throw on malformed storage.
 */

import type { SubagentMode } from './host-settings.js'

/** Flat settings fields a provider group can pin — exactly what an application writes. */
export type ProviderGroupRouteField =
  | 'compactProvider'
  | 'compactModel'
  | 'autoReviewProvider'
  | 'autoReviewModel'
  | 'subagentProvider'
  | 'subagentModel'
  | 'subagentReasoningEffort'

/** Stored entry: the owning provider plus every route field; '' means the capability stays at its default. */
export interface ProviderGroupEntry {
  provider: string
  compactProvider: string
  compactModel: string
  autoReviewProvider: string
  autoReviewModel: string
  subagentProvider: string
  subagentModel: string
  subagentReasoningEffort: string
}

/** Normalized view of one provider's group; absent fields follow their default state. */
export type ProviderGroupConfig = Partial<Record<ProviderGroupRouteField, string>>

/** Normalized provider → group map. */
export type ProviderGroups = Readonly<Record<string, ProviderGroupConfig>>

/** Storage shape of the volatile `providerGroups` config field: one entry per provider. */
export type ProviderGroupsStorage = readonly ProviderGroupEntry[]

const ROUTE_FIELDS: readonly ProviderGroupRouteField[] = Object.freeze([
  'compactProvider',
  'compactModel',
  'autoReviewProvider',
  'autoReviewModel',
  'subagentProvider',
  'subagentModel',
  'subagentReasoningEffort',
])

/** Own data property, so a literal '__proto__' provider id can never touch a prototype. */
function setKey(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true })
}

/** A non-blank string. Blank values behave exactly like an absent field. */
function present(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/** Normalize one raw entry to its owning provider and route view; undefined for non-object junk. */
function normalizeEntry(value: unknown): { provider: string; group: ProviderGroupConfig } | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const source = value as Record<string, unknown>
  const group: ProviderGroupConfig = {}
  for (const field of ROUTE_FIELDS) {
    const item = source[field]
    if (present(item)) group[field] = item
  }
  const provider = present(source.provider) ? source.provider : ''
  return { provider, group }
}

/**
 * Strip a raw stored value to well-formed groups; never throws. Both storage
 * shapes are accepted: the stored entry array (keys live in each entry's
 * `provider` field) and a hand-written provider → routes map (keys are the
 * providers). All-empty entries stay: they pin a provider to every default.
 */
export function normalizeProviderGroups(raw: unknown): ProviderGroups {
  const groups: Record<string, ProviderGroupConfig> = {}
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const view = normalizeEntry(entry)
      if (view === undefined || view.provider === '') continue
      setKey(groups, view.provider, view.group)
    }
    return groups
  }
  if (raw !== null && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw)) {
      if (key.trim() === '') continue
      const view = normalizeEntry(value)
      if (view === undefined) continue
      setKey(groups, key, view.group)
    }
  }
  return groups
}

/**
 * The saved group for a provider.
 * @returns the normalized group, or undefined when the provider has no group —
 * which is what leaves the live routes untouched during a switch.
 */
export function groupOf(groups: ProviderGroups | undefined, provider: string): ProviderGroupConfig | undefined {
  if (groups === undefined || provider.trim() === '') return undefined
  if (!Object.prototype.hasOwnProperty.call(groups, provider)) return undefined
  return groups[provider]
}

/** One application write; `value` undefined means "unset this field". */
export type ProviderGroupWrite =
  | { readonly field: 'subagentMode'; readonly mode: SubagentMode }
  | { readonly field: ProviderGroupRouteField; readonly value: string | undefined }

/** A complete pinned pair; either half missing leaves the capability at its default. */
function pair(group: ProviderGroupConfig, providerField: ProviderGroupRouteField, modelField: ProviderGroupRouteField): { provider: string; model: string } | undefined {
  const provider = group[providerField]
  const model = group[modelField]
  return present(provider) && present(model) ? { provider, model } : undefined
}

/**
 * Ordered writes applying one group with full-replacement semantics: pinned
 * capabilities land as pairs, everything else reverts to its default state
 * (compaction/review follow the session model; Subagent follows official
 * inherit). The mode write comes last so a fixed route never publishes with
 * the previous provider's fields still half-written.
 */
export function providerGroupWrites(group: ProviderGroupConfig): ProviderGroupWrite[] {
  const compact = pair(group, 'compactProvider', 'compactModel')
  const review = pair(group, 'autoReviewProvider', 'autoReviewModel')
  const subagent = pair(group, 'subagentProvider', 'subagentModel')
  const effort = subagent !== undefined && present(group.subagentReasoningEffort) ? group.subagentReasoningEffort : undefined
  return [
    { field: 'compactProvider', value: compact?.provider },
    { field: 'compactModel', value: compact?.model },
    { field: 'autoReviewProvider', value: review?.provider },
    { field: 'autoReviewModel', value: review?.model },
    { field: 'subagentProvider', value: subagent?.provider },
    { field: 'subagentModel', value: subagent?.model },
    { field: 'subagentReasoningEffort', value: effort },
    { field: 'subagentMode', mode: subagent !== undefined ? 'fixed' : 'follow-main' },
  ]
}

/** Storage entry for one provider's group; absent or blank route fields become ''. */
export function entryOf(provider: string, group: ProviderGroupConfig): ProviderGroupEntry {
  return {
    provider,
    compactProvider: group.compactProvider ?? '',
    compactModel: group.compactModel ?? '',
    autoReviewProvider: group.autoReviewProvider ?? '',
    autoReviewModel: group.autoReviewModel ?? '',
    subagentProvider: group.subagentProvider ?? '',
    subagentModel: group.subagentModel ?? '',
    subagentReasoningEffort: group.subagentReasoningEffort ?? '',
  }
}

/**
 * The stored entry list with one provider's group replaced (an entry) or
 * removed (undefined). Every entry is re-normalized and de-duplicated so a
 * save can never write junk back; the input is never mutated. A blank
 * provider only normalizes.
 */
export function withProviderGroup(storage: unknown, provider: string, group: ProviderGroupConfig | undefined): ProviderGroupsStorage {
  const groups: Record<string, ProviderGroupConfig> = { ...normalizeProviderGroups(storage) }
  if (provider.trim() !== '') {
    if (group === undefined) {
      delete groups[provider]
    } else {
      setKey(groups, provider, group)
    }
  }
  return Object.entries(groups).map(([key, value]) => entryOf(key, value))
}

/** Minimal writable settings surface an application needs; satisfied by the owned ConfigForm. */
export interface ProviderGroupSink {
  set(field: 'subagentMode' | ProviderGroupRouteField, value: string): Promise<unknown>
  unset(field: ProviderGroupRouteField): Promise<unknown>
}

/**
 * Apply a saved group's routes to the live flat settings.
 * @returns true when a group existed and every write settled; false when the
 * provider has no group (nothing was written). A rejected write propagates.
 */
export async function applyProviderGroupTo(sink: ProviderGroupSink, groups: ProviderGroups | undefined, provider: string): Promise<boolean> {
  const group = groupOf(groups, provider)
  if (group === undefined) return false
  for (const write of providerGroupWrites(group)) {
    if (write.field === 'subagentMode') {
      await sink.set('subagentMode', write.mode)
    } else if (write.value === undefined) {
      await sink.unset(write.field)
    } else {
      await sink.set(write.field, write.value)
    }
  }
  return true
}
