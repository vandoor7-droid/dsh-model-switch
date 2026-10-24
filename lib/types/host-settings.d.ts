import type { Volatile } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { type ProviderGroupEntry, type ProviderGroups } from './provider-group.js';
export type SubagentMode = 'follow-main' | 'fixed';
/** Resolved live values consumed by Model Switch. */
export interface ModelSwitchSettings {
    subagentMode: SubagentMode;
    subagentProvider?: string;
    subagentModel?: string;
    subagentReasoningEffort?: string;
    searchProvider?: string;
    searchModel?: string;
    imageProvider?: string;
    imageModel?: string;
    /** Reviewer provider for the Auto preset; both fields unset = follow the session model. */
    autoReviewProvider?: string;
    /** Reviewer model for the Auto preset; set together with `autoReviewProvider`. */
    autoReviewModel?: string;
    /**
     * Opt-in: pure-read tools from {@link autoReviewAllowlist} run without the Auto
     * reviewer. Absent/false keeps every call reviewed (the shipped default).
     */
    autoReviewSkipReadOnly?: boolean;
    /**
     * Tool names that skip the reviewer when {@link autoReviewSkipReadOnly} is on.
     *
     * Exact names, plus a trailing `*` pattern for tools whose name carries a
     * renameable owner (the QQ bot extension suffixes its tools with the bot's
     * name). A bare `*` is rejected by the settings editor and never matches.
     */
    autoReviewAllowlist?: readonly string[];
    /** Summarization provider for `/compact` and automatic compaction; both fields unset = official default (the conversation target). */
    compactProvider?: string;
    /** Summarization model for `/compact` and automatic compaction; set together with `compactProvider`. */
    compactModel?: string;
    /** Naming provider for automatic session titles; both fields unset = official default (the session's own logged route). */
    titleProvider?: string;
    /** Naming model for automatic session titles; set together with `titleProvider`. */
    titleModel?: string;
    /** Per-provider compaction/subagent/review presets, keyed by provider id; absent when no group is saved. */
    providerGroups?: ProviderGroups;
}
/** Loader-owned references; every field is directly editable in the profile form. */
export interface Config {
    subagentMode: Volatile<SubagentMode>;
    subagentProvider: Volatile<string | undefined>;
    subagentModel: Volatile<string | undefined>;
    subagentReasoningEffort: Volatile<string | undefined>;
    searchProvider: Volatile<string | undefined>;
    searchModel: Volatile<string | undefined>;
    imageProvider: Volatile<string | undefined>;
    imageModel: Volatile<string | undefined>;
    autoReviewProvider: Volatile<string | undefined>;
    autoReviewModel: Volatile<string | undefined>;
    /** Opt-in: skip the Auto reviewer for allowlisted pure-read tools (default off). */
    autoReviewSkipReadOnly: Volatile<boolean>;
    /** Tool names (exact, or a trailing `*` pattern) that skip the Auto reviewer. */
    autoReviewAllowlist: Volatile<readonly string[]>;
    compactProvider: Volatile<string | undefined>;
    compactModel: Volatile<string | undefined>;
    titleProvider: Volatile<string | undefined>;
    titleModel: Volatile<string | undefined>;
    /** Saved per-provider capability groups as one entry per provider; entry route fields are '' when the capability stays at its default. */
    providerGroups: Volatile<readonly ProviderGroupEntry[]>;
}
/**
 * Annotated rather than inferred: the nested entry schema's inferred type
 * expands to cosmokit internals (`Dict`) that cannot be named in the emitted
 * declaration, and the annotation pins the output shape to this interface.
 */
export declare const Config: z<any, Config, 'plain'>;
export declare function readConfig(config: Config): ModelSwitchSettings;
