export type RuntimeCapabilityReason = 'central-subagent-routing' | 'packaged-preset-roots' | 'tool-owner-suppression' | 'search-provider-adapters' | 'vision-provider-adapters' | 'image-provider-adapters' | 'auto-review-takeover'
import type { SearchProviderMetadata } from './adapter-registry.js'
export interface RuntimeCapability { readonly available: boolean; readonly reason?: RuntimeCapabilityReason; readonly providers?: readonly string[]; readonly catalog?: readonly SearchProviderMetadata[] }
export interface RuntimeCapabilities {
  readonly mainDefaults: RuntimeCapability; readonly settings: RuntimeCapability; readonly centralSubagentRouting: RuntimeCapability; readonly packagedPresetRoots: RuntimeCapability; readonly toolOwnerSuppression: RuntimeCapability
  readonly searchProviderAdapters: RuntimeCapability; readonly visionProviderAdapters: RuntimeCapability; readonly imageProviderAdapters: RuntimeCapability
  /**
   * Whether this row currently holds the official Auto reviewer route.
   *
   * `false` means the official row kept the single `registerAuto` slot (or has
   * not released it yet): the reviewer route is not configurable, and the
   * tool-call safety net allows unreviewed calls instead of failing them.
   */
  readonly autoReview: RuntimeCapability
}
export const RUNTIME_CAPABILITIES = Object.freeze({
  mainDefaults: Object.freeze({ available: true }), settings: Object.freeze({ available: true }),
  centralSubagentRouting: Object.freeze({ available: true }),
  packagedPresetRoots: Object.freeze({ available: false, reason: 'packaged-preset-roots' as const }),
  toolOwnerSuppression: Object.freeze({ available: false, reason: 'tool-owner-suppression' as const }),
  searchProviderAdapters: Object.freeze({ available: false, reason: 'search-provider-adapters' as const, providers: Object.freeze([]) }),
  visionProviderAdapters: Object.freeze({ available: false, reason: 'vision-provider-adapters' as const }),
  imageProviderAdapters: Object.freeze({ available: true, providers: Object.freeze(['codex', 'grok']) }),
  autoReview: Object.freeze({ available: true }),
}) satisfies RuntimeCapabilities
