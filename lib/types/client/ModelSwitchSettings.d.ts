import { type ReactNode } from 'react';
import type { ModelProviderGroup } from '@deepseek-ai/dsh-api-session-controller/types';
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { type CapabilityRouteView, type ModelSwitchSettingsView, type SubagentSettingsView } from '../client-contract.js';
import { type ProviderGroupConfig } from '../provider-group.js';
import type { RuntimeCapabilities } from '../runtime-capabilities.js';
import { type CapabilitiesSnapshot } from './search-capabilities.js';
import type { ModelSwitchLocaleKey } from './locales.js';
import type { ConfigViewForm } from './derived-config-form.js';
export interface ModelSwitchSettingsFace {
    t: (key: ModelSwitchLocaleKey) => string;
    hooks: {
        subagentSettings: ConfigViewForm<SubagentSettingsView>;
        searchSettings: ConfigViewForm<CapabilityRouteView>;
        imageSettings: ConfigViewForm<CapabilityRouteView>;
        autoReviewSettings: ConfigViewForm<CapabilityRouteView>;
        compactionSettings: ConfigViewForm<CapabilityRouteView>;
        switchSettings: Pick<ConfigForm<ModelSwitchSettingsView>, 'getSnapshot' | 'subscribe'>;
    };
    capabilities: RuntimeCapabilities;
    setSubagent: (field: 'mode' | 'provider' | 'model' | 'reasoningEffort', value: string | undefined) => Promise<void>;
    setCapability: (route: 'search' | 'image' | 'autoReview' | 'compaction', field: 'provider' | 'model', value: string | undefined) => Promise<void>;
    setCompactOnSwitch: (value: boolean) => Promise<void>;
    /** Replace or remove (undefined) one provider's saved capability group. */
    saveProviderGroup: (provider: string, group: ProviderGroupConfig | undefined) => Promise<void>;
    loadCatalog: () => Promise<readonly ModelProviderGroup[]>;
    /** Host capabilities long-poll; absent in legacy faces, which keep the static-capabilities path. */
    loadCapabilities?: (revision?: number, signal?: AbortSignal) => Promise<CapabilitiesSnapshot>;
    subscribeProviderOrder?: (listener: () => void) => () => void;
    /** ProviderDirectory-owned role lookup; absent when the owner seam is unavailable. */
    providerRoleOf?: (key: string) => string;
}
export type ModelSwitchSettingsProps = PropsRuntime<'settings.section'> & InjectFace<ModelSwitchSettingsFace>;
export declare function ModelSwitchSettings(props: ModelSwitchSettingsProps): ReactNode;
