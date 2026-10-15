import type { Context } from '@deepseek-ai/cordis'
import type { Entry, Loader } from '@deepseek-ai/cordis-plugin-loader'
import type { BasicCompactionConfig } from '@deepseek-ai/dsh-compaction-basic'
import type {} from '@deepseek-ai/dsh-compaction'
import type { ModelSwitchSettings } from './host-settings.js'

/** Official compaction row this module supersedes. */
const OFFICIAL_COMPACTION_ROW = 'compaction-basic'

/** Official compaction package this module mounts in its place. */
const OFFICIAL_COMPACTION_PACKAGE = '@deepseek-ai/dsh-compaction-basic'

/** Cordis plugin identity; matches the cordis.patch.yml insert row id. */
export const name = 'model-switch-compaction'

/** The loader is awaited at row activation; settings and the official row are still read structurally so stock compaction survives a disabled Model Switch row. */
export const inject = ['loader']

type EngineModule = typeof import('@deepseek-ai/dsh-compaction-basic')
type EngineClass = EngineModule['default']
/** The awaited form: awaiting the plugin wrapper collapses the PromiseLike intersection to plain Fiber. */
type MountedEngine = Awaited<ReturnType<Context['plugin']>>

/**
 * Both identifiers trimmed and non-empty; undefined means "official default".
 *
 * The summarization route stays deployment-wide on purpose. The official
 * compaction transaction durably records the provider/model that wrote the
 * summary, so a per-session rewrite of the summarization call would make that
 * record false; a deployment that needs provider-scoped summarization uses the
 * official exact-target `modelPolicies` table, which this row forwards
 * verbatim from the profile's `compaction-basic` row config.
 */
export interface CompactionRoute {
  readonly provider: string
  readonly model: string
}

/** Reconcile ledger for one compaction row lifetime. */
interface CompactionRowState {
  /** Serializes remounts so overlapping triggers never double-mount the service. */
  chain: Promise<void>
  /** Set while a reconcile is queued but not started, so a burst of settings updates collapses into one pass. */
  queued: boolean
  /** Signature of the composed config already attempted while an engine state exists. */
  signature: string | null
  /** Live engine fiber; undefined while the compaction service is unmounted. */
  engine: MountedEngine | undefined
  /** Set once after logging the absent-official-row skip. */
  missingRow: boolean
}

/**
 * Resolve the configurable summarization route from live settings.
 * @param settings - Model Switch settings carrying the optional compaction pair.
 * @returns Both identifiers trimmed and non-empty, or undefined (official default).
 */
export function compactionRouteOf(settings: {
  readonly compactProvider?: string
  readonly compactModel?: string
} | undefined): CompactionRoute | undefined {
  const provider = settings?.compactProvider?.trim()
  const model = settings?.compactModel?.trim()
  if (provider === undefined || provider === '' || model === undefined || model === '') return undefined
  return { provider, model }
}

/**
 * Merge the resolved route over the official row's own config.
 * @param forwarded - config the official compaction-basic row was configured with.
 * @param route - resolved summarization route; undefined keeps official behavior.
 * @returns A detached config safe to hand to a fresh engine construction.
 */
export function composeCompactionConfig(
  forwarded: BasicCompactionConfig,
  route: CompactionRoute | undefined,
): BasicCompactionConfig {
  if (!route) return { ...forwarded }
  return { ...forwarded, summarizationProvider: route.provider, summarizationModel: route.model }
}

/**
 * Locate the official compaction row in the loader tree.
 * Disabled entries stay in the tree, so a name-matched disable still matches.
 * @param loader - the host loader, when one is reachable.
 * @returns The official entry, or undefined when this profile has no such row.
 */
export function officialCompactionEntry(loader: Loader | undefined): Entry | undefined {
  if (!loader) return undefined
  for (const entry of loader.entries()) {
    if (entry.id === OFFICIAL_COMPACTION_ROW) return entry
    if (entry.options?.name === OFFICIAL_COMPACTION_PACKAGE) return entry
  }
  return undefined
}

/**
 * Copy the official row's stored config, ignoring non-object payloads.
 * @param entry - the official compaction entry.
 * @returns A plain object spread; missing or invalid configs become `{}`.
 */
export function forwardedConfig(entry: Entry): BasicCompactionConfig {
  const raw: unknown = entry.options?.config
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as BasicCompactionConfig
  return {}
}

/**
 * Read the live summarization route from the Model Switch host.
 *
 * The host is read structurally instead of injected so this row keeps mounting
 * the official engine (on official defaults) when the `model-switch` row is
 * disabled.
 * @param ctx - this row's context.
 * @returns The configured route, or undefined when unset or host-unavailable.
 */
function currentCompactionRoute(ctx: Context): CompactionRoute | undefined {
  let settings: ModelSwitchSettings | undefined
  try {
    settings = ctx.get('modelSwitch', false)?.currentSettings()
  } catch {
    settings = undefined
  }
  if (!settings) {
    ctx.logger.info('model-switch: host settings unavailable; compaction uses the official summarization default')
    return undefined
  }
  return compactionRouteOf(settings)
}

/**
 * Whether the compaction capability is actually served from this context.
 *
 * Awaiting a plugin fiber settles even when the plugin's injections were never
 * satisfied, so the mount is confirmed through the public service instead of by
 * the absence of an error: an unactivated engine must never be recorded as the
 * live engine, or the row would stop retrying while `/compact` had no service.
 * @param ctx - this row's context.
 * @returns true when `ctx.compaction` exposes the engine's public entry points.
 */
export function engineActive(ctx: Context): boolean {
  try {
    const service = ctx.get('compaction', false)
    return service !== undefined && typeof service.compactIfNeeded === 'function'
  } catch {
    return false
  }
}

/**
 * Load and mount the official basic compaction engine under `config`.
 * @param ctx - this row's context; the engine mounts unisolated so `/compact` sees it.
 * @param config - composed engine config.
 * @param label - which config attempt failed, for the error message.
 * @returns The mounted fiber, or undefined with an explicit error log.
 */
async function mountEngine(
  ctx: Context,
  config: BasicCompactionConfig,
  label: string,
): Promise<MountedEngine | undefined> {
  let loaded: EngineModule
  try {
    loaded = await import('@deepseek-ai/dsh-compaction-basic')
  } catch (cause) {
    ctx.logger.error('model-switch: failed to load the official compaction engine package')
    ctx.logger.error(cause)
    return undefined
  }
  let fiber: MountedEngine | undefined
  try {
    fiber = ctx.plugin(loaded.default as EngineClass, config)
    await fiber
  } catch (cause) {
    if (fiber) {
      try {
        await fiber.dispose()
      } catch {
        // The failed fiber is already reported through the original cause.
      }
    }
    ctx.logger.error(`model-switch: failed to mount the compaction engine with ${label}`)
    ctx.logger.error(cause)
    return undefined
  }
  if (engineActive(ctx)) return fiber
  ctx.logger.error(`model-switch: the compaction engine mounted with ${label} but never activated; unloading it so the next settings change retries`)
  try {
    await fiber.dispose()
  } catch (cause) {
    ctx.logger.error('model-switch: failed to unload the unactivated compaction engine')
    ctx.logger.error(cause)
  }
  return undefined
}

/**
 * Dispose the live engine, keeping the ledger clean for the next mount.
 * @param ctx - this row's context.
 * @param state - the row's reconcile ledger.
 */
async function disposeEngine(ctx: Context, state: CompactionRowState): Promise<void> {
  const previous = state.engine
  state.engine = undefined
  if (!previous) return
  try {
    await previous.dispose()
  } catch (cause) {
    ctx.logger.error('model-switch: failed to dispose the previous compaction engine')
    ctx.logger.error(cause)
  }
}

/**
 * Reconcile one compaction mount: remount only when the composed config changed.
 *
 * A settings change that leaves the composed config identical — every session
 * naming, subagent, or provider-group save — returns after the signature check,
 * so the engine is never unloaded for settings it does not read. A mount that
 * fails to activate stays unmounted with an explicit error and the next settings
 * change retries with a fresh read.
 * @param ctx - this row's context.
 * @param state - the row's reconcile ledger.
 */
async function runReconcile(ctx: Context, state: CompactionRowState): Promise<void> {
  const entry = officialCompactionEntry(ctx.get('loader', false))
  if (!entry) {
    if (!state.missingRow) {
      state.missingRow = true
      ctx.logger.info('model-switch: no official compaction-basic row in this profile; the compaction engine stays unmounted')
    }
    return
  }
  state.missingRow = false
  const config = composeCompactionConfig(forwardedConfig(entry), currentCompactionRoute(ctx))
  const signature = JSON.stringify(config)
  if (state.signature === signature && state.engine) return
  await disposeEngine(ctx, state)
  state.signature = signature
  const fiber = await mountEngine(ctx, config, 'the configured summarization route')
  if (fiber) {
    state.engine = fiber
    return
  }
  ctx.logger.error('model-switch: compaction engine is unmounted; /compact and automatic compaction are unavailable until settings change')
}

/**
 * Queue one reconcile behind the row's serialized chain, absorbing failures.
 * @param ctx - this row's context.
 * @param state - the row's reconcile ledger.
 * @param coalesce - collapse a burst of triggers into the single pass that reads the settled settings.
 * @returns The chain tail; never rejects.
 */
function scheduleReconcile(ctx: Context, state: CompactionRowState, coalesce: boolean): Promise<void> {
  if (coalesce) {
    if (state.queued) return state.chain
    state.queued = true
  }
  state.chain = state.chain.then(async () => {
    state.queued = false
    await runReconcile(ctx, state)
  }).catch(cause => {
    state.queued = false
    ctx.logger.error('model-switch: compaction engine reconcile failed')
    ctx.logger.error(cause)
  })
  return state.chain
}

/**
 * Mount the Model Switch compaction engine for this profile.
 *
 * Installs a sibling row that replaces the official compaction-basic engine
 * with the same package under the configurable summarization route. Host
 * settings and the loader are read structurally so a disabled `model-switch`
 * row leaves official compaction untouched. Reconciles run on
 * `model-switch/settings-update` (emitted by the host at construction, on
 * volatile commits, and on ordinary saves) and read the settled settings, so one
 * save costs at most one remount; the listener is global so instances of this
 * row inside agent-preset realms still hear the host row's emission. The initial
 * reconcile is awaited so `/compact` resolves the service as soon as this row
 * completes.
 * @param ctx - this row's context.
 */
export async function apply(ctx: Context): Promise<void> {
  const state: CompactionRowState = { chain: Promise.resolve(), queued: false, signature: null, engine: undefined, missingRow: false }
  ctx.on('model-switch/settings-update', () => {
    void scheduleReconcile(ctx, state, true)
  }, { global: true })
  await scheduleReconcile(ctx, state, false)
}
