import type { SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client';
import { type ProviderGroupConfig } from '../provider-group.js';
/** The revision-fenced settings form one provider-group save writes through. */
export interface ProviderGroupForm {
    getSnapshot(): {
        readonly revision: number | undefined;
        readonly value: {
            readonly providerGroups?: readonly ProviderGroupConfig[];
        } | undefined;
    };
    mutate(ops: readonly SettingsPathOpView[], expectedRevision?: number): Promise<boolean>;
}
/** How many times one save re-reads and retries after a refused write. */
export declare const PROVIDER_GROUP_SAVE_ATTEMPTS = 3;
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
export declare function saveProviderGroupFenced(form: ProviderGroupForm, provider: string, group: ProviderGroupConfig | undefined): Promise<void>;
