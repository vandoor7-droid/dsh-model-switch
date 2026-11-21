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
export type ProviderGroupRouteField = 'compactProvider' | 'compactModel' | 'autoReviewProvider' | 'autoReviewModel' | 'subagentProvider' | 'subagentModel' | 'subagentReasoningEffort' | 'titleProvider' | 'titleModel' | 'memoryProvider' | 'memoryModel' | 'memoryReasoningEffort' | 'visionProvider' | 'visionModel';
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
    /** Distillation route for the memory plugin; '' keeps that plugin's own default. */
    memoryProvider: string;
    memoryModel: string;
    /** Distillation reasoning effort; '' keeps the memory plugin's auto resolution. */
    memoryReasoningEffort: string;
    /** Vision backend route for dsh-vision-router; '' keeps that plugin's own chain. */
    visionProvider: string;
    visionModel: string;
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
 * `-vision` twin groups fold into their base provider (see {@link foldTwinGroups}).
 */
export declare function normalizeProviderGroups(raw: unknown): ProviderGroups;
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
export declare function canonicalGroupProvider(provider: string): string;
/**
 * The saved group for a provider.
 * @returns the normalized group, or undefined when the provider has no group —
 * which is what leaves the live routes untouched during a switch.
 */
export declare function groupOf(groups: ProviderGroups | undefined, provider: string): ProviderGroupConfig | undefined;
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
export declare function groupOfCanonical(groups: ProviderGroups | undefined, provider: string): ProviderGroupConfig | undefined;
/** Storage entry for one provider's group; absent or blank route fields become ''. */
export declare function entryOf(provider: string, group: ProviderGroupConfig): ProviderGroupEntry;
/**
 * The stored entry list with one provider's group replaced (an entry) or
 * removed (undefined). Every entry is re-normalized and de-duplicated so a
 * save can never write junk back; the input is never mutated. A blank
 * provider only normalizes.
 */
export declare function withProviderGroup(storage: unknown, provider: string, group: ProviderGroupConfig | undefined): ProviderGroupsStorage;
