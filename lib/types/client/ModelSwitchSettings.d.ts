import { type ReactNode } from 'react';
import type { ModelProviderGroup } from '@deepseek-ai/dsh-api-session-controller/types';
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { type CapabilityRouteView, type ModelSwitchSettingsView, type ReviewStatusView, type SubagentSettingsView, type ToolCatalogRow } from '../client-contract.js';
import { type ProviderGroupConfig } from '../provider-group.js';
import type { RuntimeCapabilities } from '../runtime-capabilities.js';
import { type CapabilitiesSnapshot } from './search-capabilities.js';
import type { ModelSwitchLocaleKey } from './locales.js';
import type { ConfigViewForm, ConfigViewOp } from './derived-config-form.js';
export interface ModelSwitchSettingsFace {
    t: (key: ModelSwitchLocaleKey) => string;
    hooks: {
        subagentSettings: ConfigViewForm<SubagentSettingsView>;
        searchSettings: ConfigViewForm<CapabilityRouteView>;
        imageSettings: ConfigViewForm<CapabilityRouteView>;
        autoReviewSettings: ConfigViewForm<CapabilityRouteView>;
        compactionSettings: ConfigViewForm<CapabilityRouteView>;
        titleSettings: ConfigViewForm<CapabilityRouteView>;
        memorySettings: ConfigViewForm<CapabilityRouteView>;
        switchSettings: Pick<ConfigForm<ModelSwitchSettingsView>, 'getSnapshot' | 'subscribe'>;
    };
    capabilities: RuntimeCapabilities;
    /**
     * Apply one row's changes as a SINGLE revision-fenced write, so a refused
     * write can never leave a half-written provider/model pair behind.
     */
    saveSubagent: (ops: readonly ConfigViewOp<SubagentSettingsView>[]) => Promise<void>;
    saveCapability: (route: 'search' | 'image' | 'autoReview' | 'compaction' | 'title' | 'memory', ops: readonly ConfigViewOp<CapabilityRouteView>[]) => Promise<void>;
    /** Persist the read-only skip switch and its allowlist as one atomic write. */
    saveReviewAllowlist: (value: {
        enabled: boolean;
        tools: readonly string[];
    }) => Promise<void>;
    /** Persist the reviewer stream idle timeout; undefined restores provider default. */
    saveReviewTimeout: (value: number | undefined) => Promise<void>;
    /** The Host's live tool catalog; absent on a Host without the `tools` RPC endpoint. */
    scanTools?: () => Promise<{
        rows: readonly ToolCatalogRow[];
        status?: ReviewStatusView;
    }>;
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
