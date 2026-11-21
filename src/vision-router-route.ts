/**
 * Model Switch's adapter to `dsh-vision-router`'s backend chain.
 *
 * dsh-vision-router owns the vision backend chain: an ordered `providers` list
 * of `{ provider, model, fallbacks }` rows in its `vision-router` row config,
 * each row a host llm provider/model the chain tries in order. This module only
 * builds the chain Model Switch offers; it never runs a vision call, never
 * rewrites another row, and never touches a route the user did not ask to
 * change.
 *
 * Managed-head semantics: a configured route owns the chain's FIRST row (the
 * primary backend); the rows the user already had stay below in their own order
 * as fallbacks. Unlike the memory adapter there is no `user-set` skip: the
 * chain is an ordered fallback table that is never empty (the built-in free
 * endpoint is the runtime's last resort), so the head is the routing decision
 * and a user-set head is exactly what a configured route replaces.
 *
 * All functions here are pure.
 */

/** One row of dsh-vision-router's backend chain. */
export interface VisionProviderEntry {
  readonly provider: string
  readonly model: string
  readonly fallbacks: readonly string[]
}

/** The loader row id dsh-vision-router is composed under (fixed by its bundle patch). */
export const VISION_ROUTER_ENTRY_ID = 'vision-router'

/** The package name that identifies the row; the authoritative identity. */
export const VISION_ROUTER_PACKAGE = 'dsh-vision-router'

/** dsh-vision-router's runtime cap on backend rows (`MAX_RUNTIME_PROVIDER_ROWS`). */
export const MAX_VISION_PROVIDER_ROWS = 32

/** dsh-vision-router's per-identifier length cap (`MAX_RUNTIME_MODEL_ID_CHARS`). */
export const MAX_VISION_ID_CHARS = 512

/** The subset of a loader entry this adapter reads. */
export interface RowLike {
  readonly options?: { readonly id?: unknown; readonly name?: unknown }
}

/** A non-blank string within dsh-vision-router's identifier budget. */
function validIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_VISION_ID_CHARS
}

/**
 * Whether one loader entry is dsh-vision-router.
 *
 * The package name wins over the row id: a profile layer may rename the row,
 * while an unrelated row could recycle the id.
 * @param entry - the loader entry to test.
 * @returns True for dsh-vision-router's row.
 */
export function isVisionRouterRow(entry: RowLike | undefined): boolean {
  const name = entry?.options?.name
  if (typeof name === 'string' && name.trim() !== '') return name === VISION_ROUTER_PACKAGE
  return entry?.options?.id === VISION_ROUTER_ENTRY_ID
}

/**
 * The dsh-vision-router rows present in one loader tree.
 * @param entries - the loader's entries.
 * @returns Matching rows, in loader order.
 */
export function visionRouterRows<T extends RowLike>(entries: Iterable<T>): T[] {
  const rows: T[] = []
  for (const entry of entries) if (isVisionRouterRow(entry)) rows.push(entry)
  return rows
}

/**
 * Strip a raw providers value to well-formed chain rows.
 *
 * Mirrors dsh-vision-router's own runtime normalization: entries without a
 * valid provider and model are dropped, fallbacks are kept as strings, and the
 * chain is capped at the plugin's row limit.
 * @param value - the raw `providers` config value, when present.
 * @returns The valid rows, in stored order.
 */
export function normalizeVisionProviderEntries(value: unknown): readonly VisionProviderEntry[] {
  if (!Array.isArray(value)) return []
  const rows: VisionProviderEntry[] = []
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue
    const source = entry as Record<string, unknown>
    if (!validIdentifier(source.provider) || !validIdentifier(source.model)) continue
    const fallbacks = Array.isArray(source.fallbacks)
      ? source.fallbacks.filter((item): item is string => validIdentifier(item))
      : []
    rows.push({ provider: source.provider, model: source.model, fallbacks })
    if (rows.length >= MAX_VISION_PROVIDER_ROWS) break
  }
  return rows
}

/** What one plan decided about the backend chain. */
export interface VisionProvidersPlan {
  /** The chain to install (unchanged when `changed` is false). */
  readonly providers: readonly VisionProviderEntry[]
  /** Whether the chain differs from the input. */
  readonly changed: boolean
  /** The `provider/model` this plan pins, when it pins one. */
  readonly route?: string | undefined
  /** Why nothing was written. */
  readonly skipped?: 'no-route' | undefined
}

/**
 * The backend chain dsh-vision-router should run, given the route Model Switch wants.
 *
 * The chosen route goes first; the entries the plugin already had follow in
 * their own order, minus any duplicate of the chosen pair (a duplicate is a
 * guaranteed second failure, not a fallback) and minus the entry this adapter
 * wrote on an earlier pass (identified by `adopted`, so a route change
 * replaces in place instead of accumulating). An empty chosen route leaves the
 * existing chain untouched.
 * @param existing - the raw `providers` config value as currently stored.
 * @param route - the route Model Switch wants first, if any.
 * @param adopted - the `provider/model` this adapter wrote on an earlier pass.
 * @returns The chain to write, whether it changed, and what was applied.
 */
export function planVisionProviders(
  existing: unknown,
  route: { readonly provider?: string; readonly model?: string } | undefined,
  adopted?: string,
): VisionProvidersPlan {
  const chain = normalizeVisionProviderEntries(existing)
  const provider = typeof route?.provider === 'string' ? route.provider.trim() : ''
  const model = typeof route?.model === 'string' ? route.model.trim() : ''
  if (provider === '' || model === '') return { providers: chain, changed: false, skipped: 'no-route' }
  const head = chain[0]
  if (head !== undefined && head.provider === provider && head.model === model) {
    return { providers: chain, changed: false, route: `${provider}/${model}` }
  }
  const rest = chain.filter(entry => {
    if (entry.provider === provider && entry.model === model) return false
    if (adopted !== undefined && `${entry.provider}/${entry.model}` === adopted) return false
    return true
  })
  const providers = [{ provider, model, fallbacks: [] as readonly string[] }, ...rest].slice(0, MAX_VISION_PROVIDER_ROWS)
  return { providers, changed: true, route: `${provider}/${model}` }
}
