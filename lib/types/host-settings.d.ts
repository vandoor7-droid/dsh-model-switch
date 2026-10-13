import type { Volatile } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
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
    compactOnSwitch: boolean;
    /** Reviewer provider for the Auto preset; both fields unset = follow the session model. */
    autoReviewProvider?: string;
    /** Reviewer model for the Auto preset; set together with `autoReviewProvider`. */
    autoReviewModel?: string;
    /** Summarization provider for `/compact` and automatic compaction; both fields unset = official default (the conversation target). */
    compactProvider?: string;
    /** Summarization model for `/compact` and automatic compaction; set together with `compactProvider`. */
    compactModel?: string;
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
    compactOnSwitch: Volatile<boolean>;
    autoReviewProvider: Volatile<string | undefined>;
    autoReviewModel: Volatile<string | undefined>;
    compactProvider: Volatile<string | undefined>;
    compactModel: Volatile<string | undefined>;
}
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    subagentMode: z<"follow-main" | "fixed", "follow-main" | "fixed", "volatile-defined">;
    subagentProvider: z<string, string, "volatile">;
    subagentModel: z<string, string, "volatile">;
    subagentReasoningEffort: z<string, string, "volatile">;
    searchProvider: z<string, string, "volatile">;
    searchModel: z<string, string, "volatile">;
    imageProvider: z<string, string, "volatile">;
    imageModel: z<string, string, "volatile">;
    compactOnSwitch: z<boolean, boolean, "volatile-defined">;
    autoReviewProvider: z<string, string, "volatile">;
    autoReviewModel: z<string, string, "volatile">;
    compactProvider: z<string, string, "volatile">;
    compactModel: z<string, string, "volatile">;
}>>, Schemastery.ObjectT<NoInfer<{
    subagentMode: z<"follow-main" | "fixed", "follow-main" | "fixed", "volatile-defined">;
    subagentProvider: z<string, string, "volatile">;
    subagentModel: z<string, string, "volatile">;
    subagentReasoningEffort: z<string, string, "volatile">;
    searchProvider: z<string, string, "volatile">;
    searchModel: z<string, string, "volatile">;
    imageProvider: z<string, string, "volatile">;
    imageModel: z<string, string, "volatile">;
    compactOnSwitch: z<boolean, boolean, "volatile-defined">;
    autoReviewProvider: z<string, string, "volatile">;
    autoReviewModel: z<string, string, "volatile">;
    compactProvider: z<string, string, "volatile">;
    compactModel: z<string, string, "volatile">;
}>>, "plain">;
export declare function readConfig(config: Config): ModelSwitchSettings;
