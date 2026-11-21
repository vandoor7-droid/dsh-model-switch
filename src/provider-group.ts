/**
 * Provider configuration groups: per-provider presets for the compaction,
 * auto-review, session-naming, subagent, memory-distillation, and vision routes.
 *
 * A group is a DERIVED policy, not a write: `src/session-route.ts` resolves the
 * routes one session should use from its own provider plus this stored table, so
 * switching a session's provider never rewrites deployment-wide settings and two
 * sessions on different providers cannot overwrite each other. The field names
 * below are the flat settings field names a group pins, which keeps the stored
 * shape identical across releases.
 *
 * All functions here are pure and never throw on malformed storage.
 */

/** Flat settings fields a provider group carries across all capabilities. */
export type ProviderGroupRouteField =
  | 'compactProvider'
  | 'compactModel'
  | 'autoReviewProvider'
  | 'autoReviewModel'
  | 'subagentProvider'
  | 'subagentModel'
  | 'subagentReasoningEffort'
  | 'titleProvider'
  | 'titleModel'
  | 'memoryProvider'
  | 'memoryModel'
  | 'memoryReasoningEffort'
  | 'visionProvider'
  | 'visionModel'

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
  titleProvider: string
  titleModel: string
  /** Distillation route for the memory plugin; '' keeps that plugin's own default. */
  memoryProvider: string
  memoryModel: string
  /** Distillation reasoning effort; '' keeps the memory plugin's auto resolution. */
  memoryReasoningEffort: string
  /** Vision backend route for dsh-vision-router; '' keeps that plugin's own chain. */
  visionProvider: string
  visionModel: string
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
  'titleProvider',
  'titleModel',
  'memoryProvider',
  'memoryModel',
  'memoryReasoningEffort',
  'visionProvider',
  'visionModel',
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
 * `-vision` twin groups fold into their base provider (see {@link foldTwinGroups}).
 */
export function normalizeProviderGroups(raw: unknown): ProviderGroups {
  const groups: Record<string, ProviderGroupConfig> = {}
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const view = normalizeEntry(entry)
      if (view === undefined || view.provider === '') continue
      setKey(groups, view.provider, view.group)
    }
  } else if (raw !== null && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw)) {
      if (key.trim() === '') continue
      const view = normalizeEntry(value)
      if (view === undefined) continue
      setKey(groups, key, view.group)
    }
  }
  return foldTwinGroups(groups)
}

/**
 * The base provider id a dsh-vision-router twin route resolves to.
 *
 * dsh-vision-router materializes a `${provider}-vision` twin route for every
 * enabled text provider (its own sync skips ids ending in `-vision`), and a
 * session with vision on runs on that twin. Groups are keyed by the base
 * provider: one group per provider whether vision is on or off.
 * @param provider - the provider id a session or the deployment default names.
 * @returns the base id (one trailing `-vision` stripped when the rest is non-empty), else the input unchanged.
 */
export function canonicalGroupProvider(provider: string): string {
  if (!provider.endsWith('-vision')) return provider
  const base = provider.slice(0, -'-vision'.length)
  return base === '' ? provider : base
}

/**
 * Fold `-vision` twin groups into their base provider (read-side merge).
 *
 * A session with vision on keys its provider as `${base}-vision`, so a group
 * saved under that twin id belongs to the same provider. The base entry wins
 * on conflicts, the twin fills only fields the base leaves empty, and a twin
 * without a base entry is rekeyed to its base. Storage converges on the next
 * save, which re-emits entries from this normalized view.
 */
function foldTwinGroups(groups: Record<string, ProviderGroupConfig>): ProviderGroups {
  const source = new Map(Object.entries(groups).map(([key, value]) => [key, value]))
  for (const [key, twin] of source) {
    const base = canonicalGroupProvider(key)
    if (base === key) continue
    const existing = source.get(base)
    if (existing === undefined) {
      source.set(base, twin)
    } else {
      for (const field of ROUTE_FIELDS) {
        if (existing[field] === undefined && twin[field] !== undefined) existing[field] = twin[field]
      }
    }
    source.delete(key)
  }
  const folded: Record<string, ProviderGroupConfig> = {}
  for (const [key, value] of source) setKey(folded, key, value)
  return folded
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

/**
 * The saved group for a provider, resolving a vision twin to its base first.
 *
 * The base key wins over the raw twin key, which is what merges a twin group
 * into its base; the raw key stays as a fallback so a group saved under a
 * twin-only key still resolves before the stored entry is folded.
 * @param groups - the normalized provider → group map.
 * @param provider - the provider a session runs on or the deployment default names.
 * @returns the normalized group, or undefined when neither key has one.
 */
export function groupOfCanonical(groups: ProviderGroups | undefined, provider: string): ProviderGroupConfig | undefined {
  if (groups === undefined || provider.trim() === '') return undefined
  const canonical = canonicalGroupProvider(provider)
  if (canonical !== provider && Object.prototype.hasOwnProperty.call(groups, canonical)) return groups[canonical]
  if (Object.prototype.hasOwnProperty.call(groups, provider)) return groups[provider]
  return undefined
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
    titleProvider: group.titleProvider ?? '',
    titleModel: group.titleModel ?? '',
    memoryProvider: group.memoryProvider ?? '',
    memoryModel: group.memoryModel ?? '',
    memoryReasoningEffort: group.memoryReasoningEffort ?? '',
    visionProvider: group.visionProvider ?? '',
    visionModel: group.visionModel ?? '',
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
