import type { Context } from '@deepseek-ai/cordis';
import { type ConnectionRpcHandler } from '@deepseek-ai/dsh-client-connection';
import type { ModelSwitchAdapterRegistry } from './adapter-registry.js';
import type { RuntimeCapabilities } from './runtime-capabilities.js';
import { type ToolCatalogSnapshot } from './tool-catalog.js';
/** Live reviewer counters surfaced next to the allowlist editor. */
export interface ReviewStatus {
    readonly held: boolean;
    readonly allowedCalls: number;
    readonly skippedReadOnly: number;
    /** Third-party `@log.li/dsh-automode` row, when this Host mounts one. */
    readonly automode?: {
        readonly installed: boolean;
        readonly route?: string | undefined;
        readonly routeSkipped?: string | undefined;
        readonly added: number;
        readonly skipped: number;
        readonly hot?: 'applied' | 'restart-required' | undefined;
        readonly hotReason?: string | undefined;
    } | undefined;
    /** Review-timeout adapter state: the write and the runtime reload behind it. */
    readonly reviewTimeout?: {
        readonly configuredMs?: number | undefined;
        readonly applied: readonly string[];
        readonly hotApplied: readonly string[];
        readonly hot?: 'applied' | 'restart-required' | undefined;
        readonly hotReason?: string | undefined;
    } | undefined;
}
export declare const CAPABILITIES_RPC_METHOD = "plugin-rpc/model-switch";
export interface CapabilitiesSnapshot {
    readonly revision: number;
    readonly capabilities: RuntimeCapabilities;
}
/** Bounded long-poll on the existing registry; each caller owns and disposes its subscription. */
export declare function capabilitiesRpc(registry: ModelSwitchAdapterRegistry, snapshot: () => RuntimeCapabilities, lifetime: AbortSignal, catalog?: () => ToolCatalogSnapshot, 
/** Live Auto-reviewer counters (see `autoReviewStatus`), shown next to the allowlist. */
status?: () => ReviewStatus): ConnectionRpcHandler;
export declare function installCapabilitiesRpc(ctx: Context, registry: ModelSwitchAdapterRegistry, snapshot: () => RuntimeCapabilities): void;
