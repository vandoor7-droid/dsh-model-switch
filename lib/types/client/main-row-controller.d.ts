import type { ModelProviderGroup } from '@deepseek-ai/dsh-api-session-controller/types';
import type { CapabilityRouteView } from '../client-contract.js';
import type { ModelSwitchLocaleKey } from './locales.js';
export interface Choice {
    id: string;
    name: string;
    unavailable?: true;
}
/** A concrete provider/model/effort triple; route editors copy these fields. */
export interface RouteModelSelection {
    provider: string;
    model: string;
    reasoningEffort?: string;
}
/** Build a settings route for a newly selected model using only that model's default effort. */
export declare function selectRouteModel(groups: readonly ModelProviderGroup[], provider: string, model: string): RouteModelSelection;
export declare function deriveRouteChoices(groups: readonly ModelProviderGroup[], route: CapabilityRouteView | undefined, allowedProviders?: readonly string[]): {
    providers: Choice[];
    models: Choice[];
};
/**
 * Provider choices for the provider-group editor.
 *
 * The live catalog cannot represent a group whose provider was deleted, so a
 * catalog-only list makes that group unreachable: the row stays stored, no
 * selection can open it, and nothing can delete it. Union in every configured
 * group's provider and mark the missing ones unavailable so the editor can still
 * open and remove them.
 * @param groups - the live model catalog.
 * @param configured - provider ids that still have a stored group.
 * @param current - the group being edited, kept listed even when it is unknown.
 * @returns catalog choices first (original order), then the missing providers.
 */
export declare function groupProviderChoices(groups: readonly ModelProviderGroup[], configured: readonly string[], current: string | undefined): Choice[];
export interface SettingsCatalogInputs {
    loadCatalog(): Promise<readonly ModelProviderGroup[]>;
    subscribeProviderOrder?: (listener: () => void) => () => void;
    t(key: ModelSwitchLocaleKey): string;
}
/** Load the model catalog backing every route editor, reloading on provider-order changes. */
export declare function useSettingsCatalog(input: SettingsCatalogInputs): {
    groups: readonly ModelProviderGroup[];
    catalogError: string | undefined;
};
