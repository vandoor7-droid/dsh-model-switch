import type { Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

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
  compactOnSwitch: boolean
  /** Reviewer provider for the Auto preset; both fields unset = follow the session model. */
  autoReviewProvider?: string
  /** Reviewer model for the Auto preset; set together with `autoReviewProvider`. */
  autoReviewModel?: string
  /** Plan-exit compaction threshold in tokens; 0 disables the mechanism. */
  planCompactThreshold: number
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
  compactOnSwitch: Volatile<boolean>
  autoReviewProvider: Volatile<string | undefined>
  autoReviewModel: Volatile<string | undefined>
  planCompactThreshold: Volatile<number>
}

export const Config = z.object({
  subagentMode: z.union(['follow-main', 'fixed'] as const).default('follow-main').volatile(),
  subagentProvider: z.string().volatile(),
  subagentModel: z.string().volatile(),
  subagentReasoningEffort: z.string().volatile(),
  searchProvider: z.string().volatile(),
  searchModel: z.string().volatile(),
  imageProvider: z.string().volatile(),
  imageModel: z.string().volatile(),
  compactOnSwitch: z.boolean().default(true).volatile(),
  autoReviewProvider: z.string().volatile(),
  autoReviewModel: z.string().volatile(),
  // Schemastery exposes no numeric validators; the runner treats any value
  // below 1 or not finite as "disabled", and the Settings UI rejects negatives.
  planCompactThreshold: z.number().default(200_000).volatile(),
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
  return {
    subagentMode: config.subagentMode.get(),
    ...(subagentProvider === undefined ? {} : { subagentProvider }),
    ...(subagentModel === undefined ? {} : { subagentModel }),
    ...(subagentReasoningEffort === undefined ? {} : { subagentReasoningEffort }),
    ...(searchProvider === undefined ? {} : { searchProvider }),
    ...(searchModel === undefined ? {} : { searchModel }),
    ...(imageProvider === undefined ? {} : { imageProvider }),
    ...(imageModel === undefined ? {} : { imageModel }),
    compactOnSwitch: config.compactOnSwitch.get(),
    ...(autoReviewProvider === undefined || autoReviewProvider === '' ? {} : { autoReviewProvider }),
    ...(autoReviewModel === undefined || autoReviewModel === '' ? {} : { autoReviewModel }),
    planCompactThreshold: config.planCompactThreshold.get(),
  }
}
