import type { ModelCatalogFailure, ModelProviderGroup } from '@deepseek-ai/dsh-api-session-controller/types';
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
 * open and remove them. Feed this the merged list from `withCatalogFailures` so
 * a provider that merely failed to load stays selectable instead of looking
 * deleted.
 * @param groups - the live model catalog merged with the host's load failures.
 * @param configured - provider ids that still have a stored group.
 * @param current - the group being edited, kept listed even when it is unknown.
 * @returns catalog choices first (original order), then the missing providers.
 */
export declare function groupProviderChoices(groups: readonly ModelProviderGroup[], configured: readonly string[], current: string | undefined): Choice[];
/** One provider whose model catalog lookup failed on the Host (`ModelCatalogFailure`). */
export type CatalogFailure = ModelCatalogFailure;
/** What one catalog load resolves with: successful groups plus the host's isolated failures. */
export interface SettingsCatalogPayload {
    readonly groups: readonly ModelProviderGroup[];
    readonly failures: readonly CatalogFailure[];
}
/** How many attempts one catalog load makes before the settings page gives up. */
export declare const CATALOG_LOAD_ATTEMPTS = 3;
/** Backoff between catalog retries: a busy Host clears within seconds, not minutes. */
export declare const CATALOG_RETRY_DELAYS_MS: readonly number[];
export interface CatalogRetryOptions {
    attempts?: number;
    delaysMs?: readonly number[];
    sleep?: (ms: number) => Promise<void>;
    cancelled?: () => boolean;
}
/**
 * Load the model catalog with bounded backoff.
 *
 * The catalog RPC is one read against a live Host; a transient failure (a busy
 * Host, a reconnecting remote, a background task saturating the provider
 * lookups) must recover on its own instead of leaving the settings page stuck
 * on an empty catalog. Each attempt re-runs `load`; a cancelled load rethrows
 * the last error without further attempts.
 */
export declare function loadCatalogWithRetry(load: () => Promise<SettingsCatalogPayload>, options?: CatalogRetryOptions): Promise<SettingsCatalogPayload>;
/**
 * Merge the host's load failures into the catalog as model-less groups.
 *
 * A failed provider is KNOWN (the Host listed it) but temporarily unavailable.
 * Rendering it as absent would mark every stored route for it "unavailable ⚠"
 * and lock the provider-group editor while a background task hiccups. A
 * model-less group keeps the provider selectable without inventing model rows;
 * seeding logic skips it because `models[0]` is undefined.
 */
export declare function withCatalogFailures(groups: readonly ModelProviderGroup[], failures: readonly CatalogFailure[]): ModelProviderGroup[];
export type SettingsCatalogStatus = 'loading' | 'ready' | 'failed';
export interface SettingsCatalogState {
    status: SettingsCatalogStatus;
    /** Live groups merged with the host's load failures; the last good list survives a later failure. */
    groups: readonly ModelProviderGroup[];
    failures: readonly CatalogFailure[];
    /** Localized failure message; undefined while loading or ready. */
    error: string | undefined;
    /** Reload now (used by the retry button and provider-order changes). */
    reload(): void;
}
export interface SettingsCatalogInputs {
    loadCatalog(): Promise<SettingsCatalogPayload>;
    subscribeProviderOrder?: (listener: () => void) => () => void;
    t(key: ModelSwitchLocaleKey): string;
}
/**
 * Load the model catalog backing every route editor, with bounded retries.
 *
 * A failed load keeps the last successful groups (the editor stays usable and
 * honest via the error hint) instead of collapsing to an empty catalog; a
 * provider-order change or `reload()` starts a fresh attempt, and only the
 * newest attempt may land.
 */
export declare function useSettingsCatalog(input: SettingsCatalogInputs): SettingsCatalogState;
