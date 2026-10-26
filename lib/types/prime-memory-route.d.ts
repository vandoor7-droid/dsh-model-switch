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
    readonly provider: string;
    readonly model: string;
    readonly reasoningEffort?: string;
}
/** The loader row id prime-memory is composed under (fixed by its bundle patch). */
export declare const PRIME_MEMORY_ENTRY_ID = "dsh-memory";
/** The package name that identifies the row; the authoritative identity. */
export declare const PRIME_MEMORY_PACKAGE = "dsh-prime-memory";
/** The subset of a loader entry this adapter reads. */
export interface RowLike {
    readonly options?: {
        readonly id?: unknown;
        readonly name?: unknown;
    };
}
/**
 * Whether one loader entry is prime-memory.
 *
 * The package name wins over the row id: a profile layer may rename the row,
 * while an unrelated row could recycle the id.
 * @param entry - the loader entry to test.
 * @returns True for prime-memory's row.
 */
export declare function isPrimeMemoryRow(entry: RowLike | undefined): boolean;
/**
 * The prime-memory rows present in one loader tree.
 * @param entries - the loader's entries.
 * @returns Matching rows, in loader order.
 */
export declare function primeMemoryRows<T extends RowLike>(entries: Iterable<T>): T[];
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
export declare function planDistillChain(primary: {
    readonly provider?: string;
    readonly model?: string;
    readonly reasoningEffort?: string;
} | undefined, existing: readonly DistillChainEntry[] | undefined): readonly DistillChainEntry[];
/**
 * The settings patch that writes one distillation chain.
 *
 * Only the `distillChain` key is produced: prime-memory's `live` section carries
 * unrelated switches (capture, trace, embedding, memory mutation), and a patch
 * naming them would rewrite the user's choices.
 * @param chain - the chain to write.
 * @returns The `live` patch to pass to `ctx.settings.update`.
 */
export declare function distillChainPatch(chain: readonly DistillChainEntry[]): {
    readonly live: {
        readonly distillChain: readonly DistillChainEntry[];
    };
};
