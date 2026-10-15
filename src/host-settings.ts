import type { Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { normalizeProviderGroups, type ProviderGroupEntry, type ProviderGroups } from './provider-group.js'

export type SubagentMode = 'follow-main' | 'fixed'

/** Resolved live values consumed by Model Switch. */
export interface ModelSwitchSettings {
  subagentMode: SubagentMode
  subagentProvider?: string
  subagentModel?: string
  subagentReasoningEffort?: string
  searchProvider?: string
  searchModel?: string
  imageProvider?: string
  imageModel?: string
  /** Reviewer provider for the Auto preset; both fields unset = follow the session model. */
  autoReviewProvider?: string
  /** Reviewer model for the Auto preset; set together with `autoReviewProvider`. */
  autoReviewModel?: string
  /** Summarization provider for `/compact` and automatic compaction; both fields unset = official default (the conversation target). */
  compactProvider?: string
  /** Summarization model for `/compact` and automatic compaction; set together with `compactProvider`. */
  compactModel?: string
  /** Naming provider for automatic session titles; both fields unset = official default (the session's own logged route). */
  titleProvider?: string
  /** Naming model for automatic session titles; set together with `titleProvider`. */
  titleModel?: string
  /** Per-provider compaction/subagent/review presets, keyed by provider id; absent when no group is saved. */
  providerGroups?: ProviderGroups
}

/** Loader-owned references; every field is directly editable in the profile form. */
export interface Config {
  subagentMode: Volatile<SubagentMode>
  subagentProvider: Volatile<string | undefined>
  subagentModel: Volatile<string | undefined>
  subagentReasoningEffort: Volatile<string | undefined>
  searchProvider: Volatile<string | undefined>
  searchModel: Volatile<string | undefined>
  imageProvider: Volatile<string | undefined>
  imageModel: Volatile<string | undefined>
  autoReviewProvider: Volatile<string | undefined>
  autoReviewModel: Volatile<string | undefined>
  compactProvider: Volatile<string | undefined>
  compactModel: Volatile<string | undefined>
  titleProvider: Volatile<string | undefined>
  titleModel: Volatile<string | undefined>
  /** Saved per-provider capability groups as one entry per provider; entry route fields are '' when the capability stays at its default. */
  providerGroups: Volatile<readonly ProviderGroupEntry[]>
}

/**
 * Annotated rather than inferred: the nested entry schema's inferred type
 * expands to cosmokit internals (`Dict`) that cannot be named in the emitted
 * declaration, and the annotation pins the output shape to this interface.
 */
export const Config: z<any, Config, 'plain'> = z.object({
  subagentMode: z.union(['follow-main', 'fixed'] as const).default('follow-main').volatile(),
  subagentProvider: z.string().volatile(),
  subagentModel: z.string().volatile(),
  subagentReasoningEffort: z.string().volatile(),
  searchProvider: z.string().volatile(),
  searchModel: z.string().volatile(),
  imageProvider: z.string().volatile(),
  imageModel: z.string().volatile(),
  autoReviewProvider: z.string().volatile(),
  autoReviewModel: z.string().volatile(),
  compactProvider: z.string().volatile(),
  compactModel: z.string().volatile(),
  titleProvider: z.string().volatile(),
  titleModel: z.string().volatile(),
  providerGroups: z.array(z.object({
    provider: z.string().default(''),
    compactProvider: z.string().default(''),
    compactModel: z.string().default(''),
    autoReviewProvider: z.string().default(''),
    autoReviewModel: z.string().default(''),
    subagentProvider: z.string().default(''),
    subagentModel: z.string().default(''),
    subagentReasoningEffort: z.string().default(''),
    titleProvider: z.string().default(''),
    titleModel: z.string().default(''),
  })).default([]).volatile(),
})

export function readConfig(config: Config): ModelSwitchSettings {
  const subagentProvider = config.subagentProvider.get()
  const subagentModel = config.subagentModel.get()
  const subagentReasoningEffort = config.subagentReasoningEffort.get()
  const searchProvider = config.searchProvider.get()
  const searchModel = config.searchModel.get()
  const imageProvider = config.imageProvider.get()
  const imageModel = config.imageModel.get()
  const autoReviewProvider = config.autoReviewProvider.get()
  const autoReviewModel = config.autoReviewModel.get()
  const compactProvider = config.compactProvider.get()
  const compactModel = config.compactModel.get()
  const titleProvider = config.titleProvider.get()
  const titleModel = config.titleModel.get()
  const providerGroups = normalizeProviderGroups(config.providerGroups.get())
  return {
    subagentMode: config.subagentMode.get(),
    ...(subagentProvider === undefined ? {} : { subagentProvider }),
    ...(subagentModel === undefined ? {} : { subagentModel }),
    ...(subagentReasoningEffort === undefined ? {} : { subagentReasoningEffort }),
    ...(searchProvider === undefined ? {} : { searchProvider }),
    ...(searchModel === undefined ? {} : { searchModel }),
    ...(imageProvider === undefined ? {} : { imageProvider }),
    ...(imageModel === undefined ? {} : { imageModel }),
    ...(autoReviewProvider === undefined || autoReviewProvider === '' ? {} : { autoReviewProvider }),
    ...(autoReviewModel === undefined || autoReviewModel === '' ? {} : { autoReviewModel }),
    ...(compactProvider === undefined || compactProvider === '' ? {} : { compactProvider }),
    ...(compactModel === undefined || compactModel === '' ? {} : { compactModel }),
    ...(titleProvider === undefined || titleProvider === '' ? {} : { titleProvider }),
    ...(titleModel === undefined || titleModel === '' ? {} : { titleModel }),
    ...(Object.keys(providerGroups).length === 0 ? {} : { providerGroups }),
  }
}
