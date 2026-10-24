import type { ProviderGroupsStorage } from './provider-group.js';
export declare const MODEL_SWITCH_CONFIG_ID = "model-switch";
export declare const PROVIDERS_CONFIG_ID = "llm-providers-ui";
export interface ModelSwitchSettingsView {
    subagentMode: 'follow-main' | 'fixed';
    subagentProvider?: string;
    subagentModel?: string;
    subagentReasoningEffort?: string;
    searchProvider?: string;
    searchModel?: string;
    imageProvider?: string;
    imageModel?: string;
    autoReviewProvider?: string;
    autoReviewModel?: string;
    /** Opt-in read-only skip for the Auto reviewer; absent/false keeps every call reviewed. */
    autoReviewSkipReadOnly?: boolean;
    /** Exact tool names, or trailing-`*` patterns, that skip the reviewer when enabled. */
    autoReviewAllowlist?: readonly string[];
    compactProvider?: string;
    compactModel?: string;
    titleProvider?: string;
    titleModel?: string;
    /** Raw saved per-provider groups; edited whole through the provider-groups card. */
    providerGroups?: ProviderGroupsStorage;
}
export interface SubagentSettingsView {
    mode: 'follow-main' | 'fixed';
    provider?: string;
    model?: string;
    reasoningEffort?: string;
}
export interface CapabilityRouteView {
    provider?: string;
    model?: string;
}
export declare const SUBAGENT_SETTINGS_FIELDS: Readonly<{
    readonly mode: "subagentMode";
    readonly provider: "subagentProvider";
    readonly model: "subagentModel";
    readonly reasoningEffort: "subagentReasoningEffort";
}>;
/** Instant Subagent header toggle. Off keeps the stored `follow-main` unset token. */
export declare function subagentModeForEnabled(enabled: boolean): SubagentSettingsView['mode'];
export declare const SEARCH_SETTINGS_FIELDS: Readonly<{
    readonly provider: "searchProvider";
    readonly model: "searchModel";
}>;
export declare const IMAGE_SETTINGS_FIELDS: Readonly<{
    readonly provider: "imageProvider";
    readonly model: "imageModel";
}>;
/** Auto-preset reviewer route; both unset means the reviewer follows the session model. */
export declare const AUTO_REVIEW_SETTINGS_FIELDS: Readonly<{
    readonly provider: "autoReviewProvider";
    readonly model: "autoReviewModel";
}>;
/** Auto-reviewer read-only skip: the switch and its allowlist are edited as one unit. */
export declare const AUTO_REVIEW_ALLOWLIST_FIELDS: Readonly<{
    readonly enabled: "autoReviewSkipReadOnly";
    readonly tools: "autoReviewAllowlist";
}>;
/** One allowlist editor snapshot (switch + entries). */
export interface AutoReviewAllowlistView {
    enabled: boolean;
    tools: readonly string[];
}
/**
 * Derive the allowlist editor's value.
 *
 * An absent list means "never configured" and shows the shipped defaults; an
 * explicitly emptied list stays empty, so clearing it is not undone by a reload.
 */
export declare function deriveAutoReviewAllowlist(settings: ModelSwitchSettingsView): AutoReviewAllowlistView;
/** Compaction summarization route for `/compact` and automatic compaction; both unset means the official default (the conversation target). */
export declare const COMPACTION_SETTINGS_FIELDS: Readonly<{
    readonly provider: "compactProvider";
    readonly model: "compactModel";
}>;
/** Automatic session-title naming route; both unset means the official default (the session's own logged route). */
export declare const TITLE_SETTINGS_FIELDS: Readonly<{
    readonly provider: "titleProvider";
    readonly model: "titleModel";
}>;
export declare function deriveSubagentSettings(settings: ModelSwitchSettingsView): SubagentSettingsView;
export declare function deriveSearchSettings(settings: ModelSwitchSettingsView): CapabilityRouteView;
export declare function deriveImageSettings(settings: ModelSwitchSettingsView): CapabilityRouteView;
export declare function deriveAutoReviewSettings(settings: ModelSwitchSettingsView): CapabilityRouteView;
export declare function deriveCompactionSettings(settings: ModelSwitchSettingsView): CapabilityRouteView;
export declare function deriveTitleSettings(settings: ModelSwitchSettingsView): CapabilityRouteView;
/** Whether both fields of a model route form a complete pair; an incomplete pair stays off. */
export declare function routePairConfigured(route: CapabilityRouteView | undefined): boolean;
/** Live reviewer counters shown beside the allowlist editor. */
export interface ReviewStatusView {
    readonly held: boolean;
    readonly allowedCalls: number;
    readonly skippedReadOnly: number;
    /** Third-party `@log.li/dsh-automode` row this Host adapted, when present. */
    readonly automode?: {
        readonly route?: string | undefined;
        readonly routeSkipped?: string | undefined;
        readonly added: number;
        readonly skipped: number;
    } | undefined;
}
/**
 * Decode the reviewer counters from a `tools` RPC payload.
 * @param value - the RPC result value.
 * @returns The counters, or undefined when the Host does not report them.
 */
export declare function decodeReviewStatus(value: unknown): ReviewStatusView | undefined;
/** One tool row in the allowlist editor, as the Host reports it. */
export interface ToolCatalogRow {
    readonly name: string;
    readonly description: string;
    /** Human source label, e.g. `MCP · wincu`. */
    readonly sourceLabel: string;
    /** Repository of the providing package, when known. */
    readonly repo?: string;
    /** Whether the shipped defaults already allow it. */
    readonly recommended: boolean;
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
export declare function decodeToolCatalog(value: unknown): readonly ToolCatalogRow[] | undefined;
