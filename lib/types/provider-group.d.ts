/**
 * Provider configuration groups: per-provider presets for the compaction,
 * auto-review, session-naming, and subagent routes.
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
/** Flat settings fields a provider group carries across all four per-session capabilities. */
export type ProviderGroupRouteField = 'compactProvider' | 'compactModel' | 'autoReviewProvider' | 'autoReviewModel' | 'subagentProvider' | 'subagentModel' | 'subagentReasoningEffort' | 'titleProvider' | 'titleModel';
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
    titleProvider: string;
    titleModel: string;
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
/** Storage entry for one provider's group; absent or blank route fields become ''. */
export declare function entryOf(provider: string, group: ProviderGroupConfig): ProviderGroupEntry;
/**
 * The stored entry list with one provider's group replaced (an entry) or
 * removed (undefined). Every entry is re-normalized and de-duplicated so a
 * save can never write junk back; the input is never mutated. A blank
 * provider only normalizes.
 */
export declare function withProviderGroup(storage: unknown, provider: string, group: ProviderGroupConfig | undefined): ProviderGroupsStorage;
