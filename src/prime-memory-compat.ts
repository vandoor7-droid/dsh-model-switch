/**
 * Adapt `dsh-prime-memory`'s distillation route to this plugin's route.
 *
 * The memory plugin resolves its distillation route from its own runtime
 * settings section (`live.distillChain`, legacy `live.distillProvider/Model`,
 * else the deployment default model), and it WRITES that section through the
 * host's settings-forms service:
 *
 *   await forms.update('dsh-memory', { live: next })
 *
 * Its row config is read once at plugin init, so patching
 * `entry.options.config.llm.*` afterwards has no effect (verified on 0.2.1-rc.3:
 * the model kept being the deployment default). This adapter therefore writes
 * the same section the plugin itself writes, and only that key:
 *
 * - a chain that is already set and is not the one this adapter wrote counts as
 *   user intent and is left alone (`user-set`);
 * - an empty Model Switch route means "leave it alone" (`no-route`);
 * - nothing is persisted by us beyond that section, and no other `live` key
 *   (capture, trace, embedding, memory mutation) is touched.
 *
 * The route itself is provider-group based: the group of the deployment default
 * provider (read from the `agent-default-model` row), falling back to the flat
 * memory pair.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Entry } from '@deepseek-ai/cordis-plugin-loader'
import { memoryRouteOf, type CapabilityRoute } from './session-route.js'
import { distillChainPatch, isPrimeMemoryRow, planDistillChain, type DistillChainEntry } from './prime-memory-route.js'

/** Row name and dependencies, mirroring the sibling adapter row. */
export const name = 'model-switch-prime-memory-compat'
export const inject = ['loader', 'modelSwitch']

/** The loader row id prime-memory is composed under (fixed by its bundle patch). */
const MEMORY_ENTRY_ID = 'dsh-memory'

/** Why the adapter stayed out of the way. */
export type PrimeMemoryRouteSkip = 'user-set' | 'no-route'

/** Live adapter state, surfaced next to the settings card. */
export interface PrimeMemoryCompatStatus {
  /** Whether at least one write reached the memory plugin's settings. */
  installed: boolean
  /** The `provider/model` written on the last pass. */
  route?: string | undefined
  /** Why the route was not written, when it was not. */
  routeSkipped?: PrimeMemoryRouteSkip | undefined
}

/** The state the settings page reads. */
export const primeMemoryCompatStatus: PrimeMemoryCompatStatus = { installed: false }

/** The settings-forms seam the memory plugin itself writes through. */
interface SettingsForms {
  get?(name: string): unknown
  update?(name: string, patch: unknown): Promise<void>
}

/** A non-blank string. */
function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Read a value as a plain record. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

/**
 * The distillation chain a settings section currently carries.
 *
 * Accepts the chain form and the legacy provider/model pair, so a user who set
 * the old two fields is still recognised as user intent.
 * @param section - the `live` section (or a whole settings view) to read.
 * @returns The chain entries; empty when nothing is set.
 */
export function chainOf(section: unknown): readonly DistillChainEntry[] {
  const live = asRecord(section)
  if (live === undefined) return []
  const chain = live.distillChain
  if (Array.isArray(chain)) {
    const entries: DistillChainEntry[] = []
    for (const item of chain) {
      const entry = asRecord(item)
      const provider = text(entry?.provider)
      const model = text(entry?.model)
      if (provider === '' || model === '') continue
      const effort = text(entry?.reasoningEffort)
      entries.push(effort === '' ? { provider, model } : { provider, model, reasoningEffort: effort })
    }
    return entries
  }
  const provider = text(live.distillProvider)
  const model = text(live.distillModel)
  return provider === '' || model === '' ? [] : [{ provider, model }]
}

/** What one memory row's config decides, kept pure for the unit tests. */
export interface PrimeMemoryPlan {
  /** The config to install (unchanged when `changed` is false). */
  readonly config: Record<string, unknown>
  /** Whether the config differs from the input. */
  readonly changed: boolean
  /** The `provider/model` written on this pass. */
  readonly route?: string | undefined
  /** Why nothing was written. */
  readonly skipped?: PrimeMemoryRouteSkip | undefined
}

/**
 * Decide the route config one memory row would run with from its config alone.
 *
 * Kept for the settings-free path (a profile that pins `config.llm.*`): the
 * runtime path writes the settings section instead, because the plugin reads its
 * config only at init.
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

/** The settings-forms service, when the host exposes it. */
function formsOf(ctx: Context): SettingsForms | undefined {
  try {
    return ctx.get('settingsForms', false) as SettingsForms | undefined
  } catch {
    return undefined
  }
}

/**
 * Install the adapter for the whole profile.
 *
 * Writes the memory plugin's own `live` section on activation, on every
 * `loader/patch-context`, on `loader/entry-init`, once more after a short delay
 * (a bundle-inserted row is often composed after this one), and again whenever
 * this plugin's settings change.
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
  /** The route this adapter wrote last, so it may replace its own value only. */
  let adoptedRoute: string | undefined
  let writing = false

  const memoryRowPresent = (): boolean => {
    for (const entry of loader?.entries?.() ?? []) if (isPrimeMemoryRow(entry)) return true
    return false
  }

  const sync = (): boolean => {
    if (!memoryRowPresent()) return false
    const route = routeOf()
    const provider = text(route?.provider)
    const model = text(route?.model)
    if (provider === '' || model === '') {
      primeMemoryCompatStatus.routeSkipped = 'no-route'
      return true
    }
    const forms = formsOf(ctx)
    if (forms?.update === undefined) {
      primeMemoryCompatStatus.routeSkipped = 'no-route'
      return true
    }
    const current = chainOf(forms.get?.(MEMORY_ENTRY_ID))
    const wanted = `${provider}/${model}`
    if (current.length > 0 && adoptedRoute !== wanted) {
      // Someone set a chain that is not ours: leave it alone.
      primeMemoryCompatStatus.routeSkipped = 'user-set'
      primeMemoryCompatStatus.route = undefined
      return true
    }
    const chain = planDistillChain({ provider, model }, current)
    if (writing) return true
    writing = true
    void forms.update(MEMORY_ENTRY_ID, distillChainPatch(chain)).then(() => {
      adoptedRoute = wanted
      primeMemoryCompatStatus.installed = true
      primeMemoryCompatStatus.route = wanted
      delete primeMemoryCompatStatus.routeSkipped
    }).catch((cause: unknown) => {
      primeMemoryCompatStatus.routeSkipped = 'no-route'
      ctx.logger.warn(`model-switch: could not write the dsh-prime-memory distillation route (${String(cause)})`)
    }).finally(() => { writing = false })
    return true
  }

  const replay = (): boolean => sync()

  sync()

  const offPatch = ctx.on('loader/patch-context', function (this: unknown, first: unknown, second?: unknown) {
    const nextFn = (typeof first === 'function' ? first : second) as (() => unknown) | undefined
    const candidate = typeof first === 'function' ? this : first
    if (isPrimeMemoryRow(candidate as Entry | undefined)) sync()
    return nextFn === undefined ? undefined : nextFn()
  })
  const offInit = ctx.on('loader/entry-init', function (this: unknown, first?: unknown) {
    const candidate = (this ?? first) as Entry | undefined
    if (candidate !== undefined && isPrimeMemoryRow(candidate)) sync()
  })
  const lateSweep = setTimeout(() => { sync() }, 1_500)
  return {
    dispose: () => {
      offPatch()
      offInit()
      clearTimeout(lateSweep)
    },
    replay,
  }
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
