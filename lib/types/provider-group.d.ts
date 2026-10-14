/**
 * Provider configuration groups: per-provider presets for the compaction,
 * subagent, and auto-review routes.
 *
 * A group stores the exact flat settings fields it will write, so applying a
 * group is a plain settings-layer write: every capability consumer keeps
 * reading the live values unchanged. All functions here are pure and never
 * throw on malformed storage.
 */
import type { SubagentMode } from './host-settings.js';
/** Flat settings fields a provider group can pin — exactly what an application writes. */
export type ProviderGroupRouteField = 'compactProvider' | 'compactModel' | 'autoReviewProvider' | 'autoReviewModel' | 'subagentProvider' | 'subagentModel' | 'subagentReasoningEffort';
/** Stored entry: the owning provider plus every route field; '' means the capability stays at its default. */
export interface ProviderGroupEntry {
    provider: string;
    compactProvider: string;
    compactModel: string;
    autoReviewProvider: string;
    autoReviewModel: string;
    subagentProvider: string;
    subagentModel: string;
    subagentReasoningEffort: string;
}
/** Normalized view of one provider's group; absent fields follow their default state. */
export type ProviderGroupConfig = Partial<Record<ProviderGroupRouteField, string>>;
/** Normalized provider → group map. */
export type ProviderGroups = Readonly<Record<string, ProviderGroupConfig>>;
/** Storage shape of the volatile `providerGroups` config field: one entry per provider. */
export type ProviderGroupsStorage = readonly ProviderGroupEntry[];
/**
 * Strip a raw stored value to well-formed groups; never throws. Both storage
 * shapes are accepted: the stored entry array (keys live in each entry's
 * `provider` field) and a hand-written provider → routes map (keys are the
 * providers). All-empty entries stay: they pin a provider to every default.
 */
export declare function normalizeProviderGroups(raw: unknown): ProviderGroups;
/**
 * The saved group for a provider.
 * @returns the normalized group, or undefined when the provider has no group —
 * which is what leaves the live routes untouched during a switch.
 */
export declare function groupOf(groups: ProviderGroups | undefined, provider: string): ProviderGroupConfig | undefined;
/** One application write; `value` undefined means "unset this field". */
export type ProviderGroupWrite = {
    readonly field: 'subagentMode';
    readonly mode: SubagentMode;
} | {
    readonly field: ProviderGroupRouteField;
    readonly value: string | undefined;
};
/**
 * Ordered writes applying one group with full-replacement semantics: pinned
 * capabilities land as pairs, everything else reverts to its default state
 * (compaction/review follow the session model; Subagent follows official
 * inherit). The mode write comes last so a fixed route never publishes with
 * the previous provider's fields still half-written.
 */
export declare function providerGroupWrites(group: ProviderGroupConfig): ProviderGroupWrite[];
/** Storage entry for one provider's group; absent or blank route fields become ''. */
export declare function entryOf(provider: string, group: ProviderGroupConfig): ProviderGroupEntry;
/**
 * The stored entry list with one provider's group replaced (an entry) or
 * removed (undefined). Every entry is re-normalized and de-duplicated so a
 * save can never write junk back; the input is never mutated. A blank
 * provider only normalizes.
 */
export declare function withProviderGroup(storage: unknown, provider: string, group: ProviderGroupConfig | undefined): ProviderGroupsStorage;
/** Minimal writable settings surface an application needs; satisfied by the owned ConfigForm. */
export interface ProviderGroupSink {
    set(field: 'subagentMode' | ProviderGroupRouteField, value: string): Promise<unknown>;
    unset(field: ProviderGroupRouteField): Promise<unknown>;
}
/**
 * Apply a saved group's routes to the live flat settings.
 * @returns true when a group existed and every write settled; false when the
 * provider has no group (nothing was written). A rejected write propagates.
 */
export declare function applyProviderGroupTo(sink: ProviderGroupSink, groups: ProviderGroups | undefined, provider: string): Promise<boolean>;
