import type { SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'
import { withProviderGroup, type ProviderGroupConfig } from '../provider-group.js'

/** The revision-fenced settings form one provider-group save writes through. */
export interface ProviderGroupForm {
  getSnapshot(): {
    readonly revision: number | undefined
    readonly value: { readonly providerGroups?: readonly ProviderGroupConfig[] } | undefined
  }
  mutate(ops: readonly SettingsPathOpView[], expectedRevision?: number): Promise<boolean>
}

/** The JSON value one `set` path op carries. */
type SettingsPathOpValue = Extract<SettingsPathOpView, { op: 'set' }>['value']

/** How many times one save re-reads and retries after a refused write. */
export const PROVIDER_GROUP_SAVE_ATTEMPTS = 3

/**
 * Save one provider group through the revision fence, retrying a refusal.
 *
 * Every attempt re-reads the form snapshot: another card, another window, or
 * the runtime's own capture write can move the fence between the read and the
 * write, and a refused write must cost one retry instead of a lost save. The
 * whole update therefore lands as one atomic `set`/`unset` op under the
 * revision that was actually read.
 * @param form - the settings form the provider groups live in.
 * @param provider - provider key whose group is being edited.
 * @param group - replacement group, or undefined to drop the provider's group.
 * @returns nothing; rejects with `settings-rejected` after every attempt is refused.
 */
export async function saveProviderGroupFenced(
  form: ProviderGroupForm,
  provider: string,
  group: ProviderGroupConfig | undefined,
): Promise<void> {
  for (let attempt = 0; attempt < PROVIDER_GROUP_SAVE_ATTEMPTS; attempt += 1) {
    const snapshot = form.getSnapshot()
    const current = snapshot.value?.providerGroups
    const next = withProviderGroup(current, provider, group)
    if (next.length === 0) {
      if (current === undefined) return
      if (await form.mutate([{ op: 'unset', path: ['providerGroups'] }], snapshot.revision)) return
      continue
    }
    if (await form.mutate([{ op: 'set', path: ['providerGroups'], value: next as unknown as SettingsPathOpValue }], snapshot.revision)) return
  }
  throw new Error('settings-rejected')
}
