/**
 * Adapt `dsh-prime-memory`'s distillation route to this plugin's route.
 *
 * The memory plugin resolves its distillation route as
 * `config.llm.provider/model` → its own runtime chain → the deployment default
 * model. Model Switch owns the deployment's per-provider routes, so this adapter
 * fills the FIRST tier with the route this plugin resolved — but only while that
 * row is still following its own default:
 *
 * - a deliberate `provider`/`model` in the row's config is never overwritten
 *   (`user-set`), and neither is a route this adapter wrote earlier unless it
 *   matches what it wrote (`adopted`);
 * - an empty Model Switch route means "leave it alone" (`no-route`);
 * - nothing is persisted: the row's live config object is patched in memory, so
 *   the memory plugin's own settings page keeps showing "follow the default
 *   model" and a restart simply re-applies this adapter.
 *
 * The route itself is provider-group based: the group of the deployment default
 * provider (read from the `agent-default-model` row), falling back to the flat
 * memory pair.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Entry } from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import { memoryRouteOf, type CapabilityRoute } from './session-route.js'
import { isPrimeMemoryRow } from './prime-memory-route.js'

/** Why the adapter stayed out of the way. */
export type PrimeMemoryRouteSkip = 'user-set' | 'no-route'

/** Row name and dependencies, mirroring the sibling adapter row. */
export const name = 'model-switch-prime-memory-compat'
export const inject = ['loader', 'modelSwitch']

/** Live adapter state, surfaced next to the settings card. */
export interface PrimeMemoryCompatStatus {
  /** Whether at least one memory row was seen and adapted. */
  installed: boolean
  /** The `provider/model` written on the last pass. */
  route?: string | undefined
  /** Why the route was not written, when it was not. */
  routeSkipped?: PrimeMemoryRouteSkip | undefined
}

/** The state the settings page reads. */
export const primeMemoryCompatStatus: PrimeMemoryCompatStatus = { installed: false }

/** One row's config, read/written structurally so a bad shape never throws. */
type UnknownConfig = Record<string, unknown>

/** Read a value as a plain record. */
function asRecord(value: unknown): UnknownConfig | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownConfig : undefined
}

/** A non-blank string. */
function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** The route one plan installs, or why it installs nothing. */
export interface PrimeMemoryPlan {
  /** The config to install (unchanged when `changed` is false). */
  readonly config: UnknownConfig
  /** Whether the config differs from the input. */
  readonly changed: boolean
  /** The `provider/model` written on this pass. */
  readonly route?: string | undefined
  /** Why nothing was written. */
  readonly skipped?: PrimeMemoryRouteSkip | undefined
}

/**
 * Decide the config one memory row should run with.
 *
 * Pure and side-effect free so the policy is unit-testable.
 * @param config - the row's current config (any JSON-ish value).
 * @param route - this plugin's distillation route; an incomplete pair counts as unset.
 * @param adoptedRoute - a `provider/model` this adapter wrote on an earlier pass.
 * @returns The config to install, whether it changed, and what was applied.
 */
export function planPrimeMemoryRoute(
  config: unknown,
  route: CapabilityRoute | undefined,
  adoptedRoute?: string,
): PrimeMemoryPlan {
  const base = asRecord(config)
  if (base === undefined) return { config: {}, changed: false, skipped: 'no-route' }
  const llm = asRecord(base.llm) ?? {}
  const declaredProvider = text(llm.provider)
  const declaredModel = text(llm.model)
  const declaredRoute = declaredProvider !== '' && declaredModel !== '' ? `${declaredProvider}/${declaredModel}` : undefined
  const ours = declaredRoute !== undefined && adoptedRoute !== undefined && declaredRoute === adoptedRoute
  if (!ours && (declaredProvider !== '' || declaredModel !== '')) {
    // Either half counts as user intent: never overwrite a deliberate route.
    return { config: base, changed: false, skipped: 'user-set' }
  }
  const provider = text(route?.provider)
  const model = text(route?.model)
  if (provider === '' || model === '') return { config: base, changed: false, skipped: 'no-route' }
  return { config: { ...base, llm: { ...llm, provider, model } }, changed: true, route: `${provider}/${model}` }
}

/** What the adapter needs from the loader. */
interface Loader {
  entries?(): Iterable<Entry>
}

/** The `agent-default-model` row's provider: the deployment default. */
function defaultProviderOf(loader: Loader | undefined): string | undefined {
  if (typeof loader?.entries !== 'function') return undefined
  for (const entry of loader.entries()) {
    const id = (entry.options as { id?: unknown } | undefined)?.id
    if (id !== 'agent-default-model') continue
    const config = asRecord((entry.options as { config?: unknown } | undefined)?.config)
    const provider = text(config?.provider)
    if (provider !== '') return provider
  }
  return undefined
}

/** Replace the row's route-consuming config in memory (never a profile write). */
function install(entry: Entry, config: UnknownConfig): void {
  const options = entry.options as unknown as { config?: unknown }
  Object.defineProperty(options, 'config', { value: config, enumerable: true, writable: true, configurable: true })
}

/**
 * Install the adapter for the whole profile.
 *
 * Adapts on activation, on every `loader/patch-context`, and again whenever this
 * plugin's settings change, so a saved route reaches a row that is already live.
 * @param ctx - this row's context.
 * @param loader - the loader service, when present.
 * @param routeOf - resolves this plugin's distillation route for one settings snapshot.
 * @returns The disposer and a replay hook.
 */
export function installPrimeMemoryCompat(
  ctx: Context,
  loader: Loader | undefined,
  routeOf: () => CapabilityRoute | undefined,
): { dispose: () => void; replay: () => boolean } {
  /** What this adapter wrote per row, so it may rewrite its own value only. */
  const adopted = new WeakMap<Entry, string>()
  const applying = (entry: Entry): void => {
    const route = routeOf()
    const plan = planPrimeMemoryRoute((entry.options as { config?: unknown } | undefined)?.config, route, adopted.get(entry))
    primeMemoryCompatStatus.installed = true
    if (plan.route !== undefined) {
      install(entry, plan.config)
      adopted.set(entry, plan.route)
      primeMemoryCompatStatus.route = plan.route
      delete primeMemoryCompatStatus.routeSkipped
      return
    }
    primeMemoryCompatStatus.routeSkipped = plan.skipped
    if (plan.skipped === 'user-set') primeMemoryCompatStatus.route = undefined
  }

  if (typeof loader?.entries === 'function') {
    for (const entry of loader.entries()) if (isPrimeMemoryRow(entry)) applying(entry)
  }

  const dispose = ctx.on('loader/patch-context', function (this: unknown, first: unknown, second?: unknown) {
    const nextFn = (typeof first === 'function' ? first : second) as (() => unknown) | undefined
    const candidate = typeof first === 'function' ? this : first
    if (isPrimeMemoryRow(candidate as Entry | undefined)) applying(candidate as Entry)
    return nextFn === undefined ? undefined : nextFn()
  })

  /** Re-adapt every live row (settings changed under us). */
  const replay = (): boolean => {
    let any = false
    for (const entry of loader?.entries?.() ?? []) {
      if (!isPrimeMemoryRow(entry)) continue
      any = true
      applying(entry)
    }
    return any
  }
  return { dispose, replay }
}

/**
 * Row entry point: adapt the memory plugin on activation and on remount.
 * @param ctx - this row's context.
 */
export function apply(ctx: Context): void {
  const loader = ctx.get('loader', false) as Loader | undefined
  const routeOf = (): CapabilityRoute | undefined => memoryRouteOf(ctx.modelSwitch.currentSettings(), defaultProviderOf(loader))
  const adapter = installPrimeMemoryCompat(ctx, loader, routeOf)
  ctx.effect(function* () {
    yield adapter.dispose
    yield ctx.on('model-switch/settings-update', () => {
      if (adapter.replay()) ctx.logger.info('model-switch: re-applied the dsh-prime-memory distillation route after a settings change')
    })
  }, 'model-switch: keep the dsh-prime-memory route aligned with the settings')
}
