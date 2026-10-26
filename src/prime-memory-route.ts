/**
 * Model Switch's adapter to `dsh-prime-memory`'s distillation route.
 *
 * prime-memory owns its distillation route: a `distillChain` in the volatile
 * `live` settings section (`distillProvider`/`distillModel` before 0.x chains
 * existed), read through its own settings handle and committed with
 * `ctx.settings.update('dsh-memory', { live })` — a volatile-only commit that
 * does not remount the plugin. This module only builds the write Model Switch
 * offers; it never runs a distillation call, never rewrites the plugin, and
 * never changes a route the user did not ask to change.
 *
 * All functions here are pure.
 */

/** One entry of prime-memory's distillation route chain. */
export interface DistillChainEntry {
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
}

/** The loader row id prime-memory is composed under (fixed by its bundle patch). */
export const PRIME_MEMORY_ENTRY_ID = 'dsh-memory'

/** The package name that identifies the row; the authoritative identity. */
export const PRIME_MEMORY_PACKAGE = 'dsh-prime-memory'

/** The subset of a loader entry this adapter reads. */
export interface RowLike {
  readonly options?: { readonly id?: unknown; readonly name?: unknown }
}

/** A non-blank string; blank values behave exactly like an absent field. */
function present(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/**
 * Whether one loader entry is prime-memory.
 *
 * The package name wins over the row id: a profile layer may rename the row,
 * while an unrelated row could recycle the id.
 * @param entry - the loader entry to test.
 * @returns True for prime-memory's row.
 */
export function isPrimeMemoryRow(entry: RowLike | undefined): boolean {
  const name = entry?.options?.name
  if (present(name)) return name === PRIME_MEMORY_PACKAGE
  return entry?.options?.id === PRIME_MEMORY_ENTRY_ID
}

/**
 * The prime-memory rows present in one loader tree.
 * @param entries - the loader's entries.
 * @returns Matching rows, in loader order.
 */
export function primeMemoryRows<T extends RowLike>(entries: Iterable<T>): T[] {
  const rows: T[] = []
  for (const entry of entries) if (isPrimeMemoryRow(entry)) rows.push(entry)
  return rows
}

/**
 * The chain prime-memory should use, given the route Model Switch wants.
 *
 * The chosen route goes first; the entries prime-memory already had follow in
 * their own order, minus any route that duplicates the chosen one (a duplicate
 * is a guaranteed second failure, not a fallback). An empty chosen route leaves
 * the existing chain untouched.
 * @param primary - the route Model Switch wants first, if any.
 * @param existing - prime-memory's current chain, as read from its settings.
 * @returns The chain to write; empty when neither side has a complete route.
 */
export function planDistillChain(
  primary: { readonly provider?: string; readonly model?: string; readonly reasoningEffort?: string } | undefined,
  existing: readonly DistillChainEntry[] | undefined,
): readonly DistillChainEntry[] {
  const chain: DistillChainEntry[] = []
  const seen = new Set<string>()
  const push = (entry: DistillChainEntry): void => {
    const key = `${entry.provider}\u0000${entry.model}`
    if (seen.has(key)) return
    seen.add(key)
    chain.push(entry)
  }
  if (primary !== undefined && present(primary.provider) && present(primary.model)) {
    const effort = primary.reasoningEffort
    push(present(effort)
      ? { provider: primary.provider, model: primary.model, reasoningEffort: effort }
      : { provider: primary.provider, model: primary.model })
  }
  for (const entry of existing ?? []) {
    if (!present(entry.provider) || !present(entry.model)) continue
    push(present(entry.reasoningEffort)
      ? { provider: entry.provider, model: entry.model, reasoningEffort: entry.reasoningEffort }
      : { provider: entry.provider, model: entry.model })
  }
  return chain
}

/**
 * The settings patch that writes one distillation chain.
 *
 * Only the `distillChain` key is produced: prime-memory's `live` section carries
 * unrelated switches (capture, trace, embedding, memory mutation), and a patch
 * naming them would rewrite the user's choices.
 * @param chain - the chain to write.
 * @returns The `live` patch to pass to `ctx.settings.update`.
 */
export function distillChainPatch(chain: readonly DistillChainEntry[]): { readonly live: { readonly distillChain: readonly DistillChainEntry[] } } {
  return { live: { distillChain: chain } }
}
