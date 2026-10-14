import { Context, Service } from '@deepseek-ai/cordis';
import { Config, type Config as ModelSwitchSettingsConfig, type ModelSwitchSettings } from './host-settings.js';
import { ModelSwitchAdapterRegistry } from './adapter-registry.js';
declare module '@deepseek-ai/cordis' {
    interface Context {
        modelSwitch: ModelSwitchRuntime;
    }
    interface Events {
        /** Model Switch settings changed; reread via `modelSwitch.currentSettings()`. */
        'model-switch/settings-update'(): void;
    }
}
/** Host owner for Model Switch settings. */
export declare class ModelSwitchRuntime extends Service {
    static Config: import("@deepseek-ai/schemastery").default<any, Config, "plain">;
    get capabilities(): {
        searchProviderAdapters: {
            available: boolean;
            providers: string[];
            catalog: readonly import("./adapter-registry.js").SearchProviderMetadata[];
        };
        mainDefaults: Readonly<{
            available: true;
        }>;
        settings: Readonly<{
            available: true;
        }>;
        centralSubagentRouting: Readonly<{
            available: true;
        }>;
        packagedPresetRoots: Readonly<{
            available: false;
            reason: "packaged-preset-roots";
        }>;
        toolOwnerSuppression: Readonly<{
            available: false;
            reason: "tool-owner-suppression";
        }>;
        visionProviderAdapters: Readonly<{
            available: false;
            reason: "vision-provider-adapters";
        }>;
        imageProviderAdapters: Readonly<{
            available: true;
            providers: readonly string[];
        }>;
    };
    readonly adapters: ModelSwitchAdapterRegistry;
    private source;
    constructor(ctx: Context, entry: ModelSwitchSettingsConfig);
    currentSettings(): ModelSwitchSettings;
}
