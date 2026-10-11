import type { Context } from '@deepseek-ai/cordis';
import { type ConnectionRpcHandler } from '@deepseek-ai/dsh-client-connection';
import type { ModelSwitchAdapterRegistry } from './adapter-registry.js';
import type { RuntimeCapabilities } from './runtime-capabilities.js';
import type { PlanCompactRunner } from './plan-compact.js';
export declare const CAPABILITIES_RPC_METHOD = "plugin-rpc/model-switch";
export interface CapabilitiesSnapshot {
    readonly revision: number;
    readonly capabilities: RuntimeCapabilities;
}
/** Bounded long-poll on the existing registry; each caller owns and disposes its subscription. */
export declare function capabilitiesRpc(registry: ModelSwitchAdapterRegistry, snapshot: () => RuntimeCapabilities, lifetime: AbortSignal, planCompact?: PlanCompactRunner): ConnectionRpcHandler;
export declare function installCapabilitiesRpc(ctx: Context, registry: ModelSwitchAdapterRegistry, snapshot: () => RuntimeCapabilities, planCompact?: PlanCompactRunner): void;
