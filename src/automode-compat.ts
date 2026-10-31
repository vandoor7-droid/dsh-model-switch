/**
 * Adapt the third-party `@log.li/dsh-automode` row to this plugin's routes.
 *
 * @deprecated 2026-10-31 冻结：本插件不再支持 `@log.li/dsh-automode`，
 * `model-switch-automode-compat` 行已从 `cordis.patch.yml` 移除，本模块不再被挂载。
 * 保留源码仅为可回退，下个大版本删除；不再修 bug、不再适配新版本。
 *
 * ## Why this exists
 *
 * `dsh-automode` owns a completely different decision pipeline: its own
 * `auto-mode` permission preset, a `tools/pre-execute` gate, and a two-stage
 * classifier that calls `ctx.llm.stream()` with
 * `classifier.provider` / `classifier.model` (`resolveRoute`, falling back to
 * the session header when both are empty). It reads the pure-read allowance from
 * `config.readOnlyTools` with an exact `includes()` match
 * (`src/pre-execute.ts`), so a call that hits it is allowed before the
 * classifier runs — still after the plugin's own hard-deny regex band.
 *
 * Both knobs live in that row's own config. There is no public seam to inject a
 * route or a tool list from outside, and the user asked for the adaptation to
 * happen inside the plugin layer: no profile editing, no second plugin. This
 * module is that adapter. It rewrites the automode row's **runtime** option
 * object right before the loader mounts it and on every remount:
 *
 * - `classifier.provider` / `classifier.model` are filled from this plugin's
 *   Auto-review route **only when the row leaves them empty**; an explicit route
 *   in the profile always wins.
 * - `readOnlyTools` is the union of the row's own list and this plugin's
 *   allowlist — but only while the "skip pure-read tools" switch is on. Entries
 *   that carry a `*` cannot transfer (the third-party check is exact-match) and
 *   are reported instead of silently dropped.
 *
 * Nothing is persisted: `entry.options` is the loader's live options object, and
 * `Entry.update()` (which writes the profile layer) is deliberately never called
 * here. Restarting the Host re-applies the same in-memory view.
 *
 * Every failure is contained. If the row shape or the loader internals change,
 * this adapter logs one warning and the rest of the plugin keeps working.
 *
 * @module
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Entry, Loader } from '@deepseek-ai/cordis-plugin-loader'
import { applyFiberConfig } from './fiber-hot-update.js'
import type { ModelSwitchSettings } from './host-settings.js'
import { DEFAULT_READ_ONLY_TOOLS } from './tool-allowlist.js'

/** Cordis plugin identity; matches the `cordis.patch.yml` insert row id. */
export const name = 'model-switch-automode-compat'

/** The loader is the only seam this row needs besides this plugin's settings. */
export const inject = ['loader']

/** Third-party package this row adapts (strict package identity, never a prefix). */
export const AUTOMODE_PACKAGE = '@log.li/dsh-automode'

/**
 * Why the route was not injected.
 *
 * - `user-set`: the row already names a provider and a model.
 * - `no-route`: this plugin has no Auto-review route configured right now.
 */
export type AutomodeRouteSkip = 'user-set' | 'no-route'

/** Result of adapting one row's config object. */
export interface AutomodeCompatApplied {
  /** `provider/model` written into the row, when it was empty before. */
  readonly route?: string | undefined
  /** Set when the route was left alone. */
  readonly routeSkipped?: AutomodeRouteSkip | undefined
  /** Allowlist entries merged into `readOnlyTools`. */
  readonly added: readonly string[]
  /** Allowlist entries that cannot transfer because they are pattern-shaped. */
  readonly skipped: readonly string[]
}

/** One adaptation result: the config to install plus what changed. */
export interface AutomodeCompatPlan {
  /** The config object to assign to the row. */
  readonly config: Record<string, unknown>
  /** Whether `config` differs from the input (false means "leave it alone"). */
  readonly changed: boolean
  /** What was applied, for the status line and the log. */
  readonly applied: AutomodeCompatApplied
}

/** Live adapter state, surfaced next to the allowlist editor. */
export const automodeCompatStatus = {
  /** A `@log.li/dsh-automode` row exists in this Host. */
  installed: false,
  /** `provider/model` this adapter wrote, when it wrote one. */
  route: undefined as string | undefined,
  /** Why the route was skipped, when it was. */
  routeSkipped: undefined as AutomodeRouteSkip | undefined,
  /** Tools merged into the row's `readOnlyTools`. */
  added: [] as string[],
  /** Pattern-shaped entries that cannot transfer. */
  skipped: [] as string[],
  /** How many rows were rewritten (remounts included). */
  applied: 0,
  /** Last hot-reload outcome, once a changed route was pushed into the live row. */
  hot: undefined as 'applied' | 'restart-required' | undefined,
  /** Why the last hot reload did not take, when it did not. */
  hotReason: undefined as string | undefined,
  /**
   * Whether the Host's `permission` row still carries the `auto-mode` preset the
   * third-party bundle patch inserts. A profile patch that restates
   * `permission.presets` replaces that whole config key, so the row keeps working
   * while the preset silently disappears from the permission picker.
   */
  preset: undefined as AutomodePresetState | undefined,
}

/** Where the `auto-mode` permission preset stands in the composed config. */
export type AutomodePresetState = 'present' | 'missing' | 'unknown'

/**
 * Read the composed `permission` row and look for the `auto-mode` preset.
 *
 * @param loader - the Host loader, when this row can read it.
 * @returns `missing` only when the row's `presets` map is readable and lacks the
 * key; anything this adapter cannot read stays `unknown` instead of guessing.
 */
export function permissionPresetState(loader: Loader | undefined): AutomodePresetState {
  if (loader === undefined || typeof loader.entries !== 'function') return 'unknown'
  let row: unknown
  try {
    for (const entry of loader.entries()) {
      if ((entry as { options?: { id?: unknown } } | undefined)?.options?.id === 'permission') {
        row = entry
        break
      }
    }
  } catch {
    return 'unknown'
  }
  const config = asRecord((row as { options?: { config?: unknown } } | undefined)?.options?.config)
  const presets = asRecord(config?.presets)
  if (presets === undefined) return 'unknown'
  return Object.hasOwn(presets, 'auto-mode') ? 'present' : 'missing'
}

type AnyRecord = Record<string, unknown>

/** Plain-object guard: arrays and `null` are not config objects. */
function asRecord(value: unknown): AnyRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as AnyRecord
    : undefined
}

/** Trimmed string or empty, so whitespace-only config reads as "unset". */
function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Whether one loader entry is the third-party auto-mode row.
 * @param entry - anything the loader hands over (an entry, or an event payload).
 * @returns true only for the exact package name.
 */
export function isAutomodeEntry(entry: unknown): boolean {
  const row = (entry as { options?: { name?: unknown } } | undefined)?.options
  return typeof row?.name === 'string' && row.name === AUTOMODE_PACKAGE
}

/**
 * Decide the config one automode row should run with.
 *
 * Pure and side-effect free so the policy is unit-testable.
 *
 * @param config - the row's current config (any JSON-ish value).
 * @param route - this plugin's Auto-review route; empty strings mean "unset".
 * @param allowlist - tool names to merge into `readOnlyTools`; pass an empty
 *   list while the skip switch is off.
 * @param adoptedRoute - a `provider/model` this adapter wrote on an earlier
 *   pass; seeing it again means the row is still ours to rewrite.
 * @returns the config to install, whether it changed, and what was applied.
 */
export function planAutomodeCompat(
  config: unknown,
  route: { readonly provider?: string; readonly model?: string },
  allowlist: readonly string[],
  adoptedRoute?: string,
): AutomodeCompatPlan {
  const base = asRecord(config)
  if (base === undefined) {
    return { config: {}, changed: false, applied: { added: [], skipped: [] } }
  }
  const next: AnyRecord = { ...base }
  let changed = false

  const provider = text(route.provider)
  const model = text(route.model)
  const classifier = asRecord(base.classifier) ?? {}
  const declaredProvider = text(classifier.provider)
  const declaredModel = text(classifier.model)
  const declaredRoute = declaredProvider !== '' && declaredModel !== '' ? `${declaredProvider}/${declaredModel}` : undefined
  const ours = declaredRoute !== undefined && adoptedRoute !== undefined && declaredRoute === adoptedRoute
  let routeApplied: string | undefined
  let routeSkipped: AutomodeRouteSkip | undefined
  if (!ours && (declaredProvider !== '' || declaredModel !== '')) {
    // Either half counts as user intent: never overwrite a deliberate route.
    routeSkipped = 'user-set'
  } else if (provider === '' || model === '') {
    routeSkipped = 'no-route'
  } else {
    next.classifier = { ...classifier, provider, model }
    routeApplied = `${provider}/${model}`
    changed = true
  }

  const existing = Array.isArray(base.readOnlyTools)
    ? base.readOnlyTools.filter((item): item is string => typeof item === 'string')
    : []
  const added: string[] = []
  const skipped: string[] = []
  for (const candidate of allowlist) {
    const tool = text(candidate)
    if (tool === '') continue
    // The third-party gate matches names exactly, so a pattern can never fire there.
    if (tool.includes('*')) {
      if (!skipped.includes(tool)) skipped.push(tool)
      continue
    }
    if (!existing.includes(tool) && !added.includes(tool)) added.push(tool)
  }
  if (added.length > 0) {
    next.readOnlyTools = [...existing, ...added]
    changed = true
  }

  return { config: next, changed, applied: { route: routeApplied, routeSkipped, added, skipped } }
}

/** The Auto-review route this plugin is configured to use. */
function routeOf(settings: ModelSwitchSettings): { provider: string; model: string } {
  return { provider: text(settings.autoReviewProvider), model: text(settings.autoReviewModel) }
}

/** Tools to merge into the third-party row, honouring the skip switch. */
function allowlistOf(settings: ModelSwitchSettings): readonly string[] {
  if (settings.autoReviewSkipReadOnly !== true) return []
  const saved = settings.autoReviewAllowlist
  return saved !== undefined && saved.length > 0 ? saved : DEFAULT_READ_ONLY_TOOLS
}

/** Record one applied plan on the shared status object. */
function reflect(plan: AutomodeCompatPlan): void {
  automodeCompatStatus.installed = true
  if (plan.applied.route !== undefined) {
    automodeCompatStatus.route = plan.applied.route
    automodeCompatStatus.routeSkipped = undefined
  } else if (automodeCompatStatus.route === undefined) {
    automodeCompatStatus.routeSkipped = plan.applied.routeSkipped
  }
  for (const tool of plan.applied.added) if (!automodeCompatStatus.added.includes(tool)) automodeCompatStatus.added.push(tool)
  for (const tool of plan.applied.skipped) if (!automodeCompatStatus.skipped.includes(tool)) automodeCompatStatus.skipped.push(tool)
}

/** Read one entry's live config object, if it has one. */
function configOf(entry: Entry): UnknownConfig {
  return (entry.options as unknown as { config?: UnknownConfig }).config
}

type UnknownConfig = unknown

/** Assign the adapted config back onto the entry's live options. */
function writeConfig(entry: Entry, config: AnyRecord): void {
  (entry.options as unknown as { config?: AnyRecord }).config = config
}

/**
 * Adapt one row in memory, containing every failure.
 *
 * @param entry - the loader entry to adapt.
 * @param settings - current plugin settings, read per application.
 * @param log - row logger for the one-line report.
 * @param adoptedRoute - the route this adapter already wrote, when it wrote one.
 * @returns the plan that was applied, or undefined when nothing ran.
 */
function adaptEntry(
  entry: Entry,
  settings: () => ModelSwitchSettings,
  log: { warn(line: string): void },
  adoptedRoute?: string,
): AutomodeCompatPlan | undefined {
  try {
    const current = settings()
    const plan = planAutomodeCompat(configOf(entry), routeOf(current), allowlistOf(current), adoptedRoute)
    automodeCompatStatus.installed = true
    if (!plan.changed) {
      reflect(plan)
      return plan
    }
    writeConfig(entry, plan.config)
    automodeCompatStatus.applied += 1
    reflect(plan)
    return plan
  } catch (error) {
    log.warn(`model-switch: could not adapt the dsh-automode row (${String(error)}); its own route and read-only list stay as configured`)
    return undefined
  }
}

/** One-line human summary of a plan, for the startup log. */
export function describeAutomodePlan(plan: AutomodeCompatPlan): string {
  const parts: string[] = []
  parts.push(plan.applied.route === undefined
    ? `route ${plan.applied.routeSkipped ?? 'unset'}`
    : `route ${plan.applied.route}`)
  parts.push(`+${plan.applied.added.length} read-only tools`)
  if (plan.applied.skipped.length > 0) parts.push(`${plan.applied.skipped.length} pattern entries skipped`)
  return parts.join(', ')
}

/** Last adaptation summary, reused when a settings change replays the adapter. */
let lastSummary = ''

/** Shape the settings card renders for the third-party row, or undefined when absent. */
export interface AutomodeCompatView {
  readonly installed: boolean
  /** `provider/model` written into the row, when one was. */
  readonly route?: string | undefined
  /** Why no route was written, when none was. */
  readonly routeSkipped?: AutomodeRouteSkip | undefined
  /** How many tools were merged in. */
  readonly added: number
  /** How many pattern-shaped entries could not transfer. */
  readonly skipped: number
  /** Last hot-reload outcome, when a changed route was pushed into the live row. */
  readonly hot?: 'applied' | 'restart-required' | undefined
  /** Why the last hot reload did not take, when it did not. */
  readonly hotReason?: string | undefined
  /** Whether the composed `permission` config still lists the `auto-mode` preset. */
  readonly preset?: AutomodePresetState | undefined
}

/**
 * Snapshot for the RPC/UI layer.
 * @returns the view, or undefined when this Host has no automode row.
 */
export function automodeCompatView(): AutomodeCompatView | undefined {
  if (!automodeCompatStatus.installed) return undefined
  return {
    installed: true,
    route: automodeCompatStatus.route,
    routeSkipped: automodeCompatStatus.routeSkipped,
    added: automodeCompatStatus.added.length,
    skipped: automodeCompatStatus.skipped.length,
    hot: automodeCompatStatus.hot,
    hotReason: automodeCompatStatus.hotReason,
    preset: automodeCompatStatus.preset,
  }
}

/**
 * Install the adapter: adapt live rows now, and every row the loader mounts later.
 *
 * The loader applies the profile patch layer and mounts the entry's plugin right
 * after the `loader/patch-context` waterfall returns, so rewriting the entry's
 * `options.config` from that waterfall is what makes the adapted values the ones
 * the plugin activates with. No profile write happens here.
 *
 * @param ctx - this row's context.
 * @param loader - the loader service, when the Host provides it.
 * @param settings - reads the current plugin settings.
 * @returns a disposer that detaches the listeners, plus a replay for live rows.
 */
export function installAutomodeCompat(
  ctx: Context,
  loader: Loader | undefined,
  settings: () => ModelSwitchSettings,
): { dispose: () => void; replay: () => boolean } {
  const log = ctx.logger
  /** Entry → last plan applied, so remounts only log when the outcome changes. */
  const applied = new Map<Entry, string>()
  /** Entry → the route this adapter wrote, so a replay may rewrite its own value. */
  const adopted = new Map<Entry, string>()
  /** Entries whose fiber reload is in flight, so one change cannot restart twice. */
  const reloading = new Set<Entry>()
  /** One warning per Host, so a broken preset does not flood the log on every replay. */
  let presetWarned = false
  /**
   * Refresh the `auto-mode` preset diagnosis the status surface reports.
   *
   * The permission picker renders whatever `permission.presets` the composed tree
   * carries, so this adapter never injects a preset itself — it only reports the
   * gap, because a silently missing "Auto mode" is otherwise indistinguishable
   * from the row not loading at all.
   *
   * @param warn - whether a newly detected gap should also be logged (once).
   */
  const refreshPreset = (warn: boolean): void => {
    const state = permissionPresetState(loader)
    automodeCompatStatus.preset = state
    if (state !== 'missing' || presetWarned) return
    presetWarned = true
    if (warn) {
      log.warn('model-switch: the dsh-automode row is mounted but the composed permission config has no "auto-mode" preset, so the permission picker hides Auto mode — a profile patch that restates permission.presets replaces the whole config key; add the auto-mode preset there or delete that row')
    }
  }
  /**
   * Push a changed route into the row that is already running.
   *
   * `dsh-automode` passes its raw config through `Config(rawConfig)` (a zod
   * schema) at activation, so the running instance holds a parsed copy: rewriting
   * `entry.options.config` cannot reach it. Only a fiber reload re-runs `apply`
   * with the adapted config. The reload disposes that instance, so its verdict
   * cache and per-session breaker counters are gone afterwards.
   *
   * A reload that cannot run (`no-fiber` / `not-active`) is not an error: nothing
   * is running that could be stale, and the next mount reads the adapted config.
   */
  const hotApply = (entry: Entry, plan: AutomodeCompatPlan, previous: string | undefined): void => {
    const route = plan.applied.route
    if (route === undefined || route === previous || reloading.has(entry)) return
    reloading.add(entry)
    void applyFiberConfig(entry, plan.config).then((result) => {
      reloading.delete(entry)
      if (result.outcome === 'updated') {
        automodeCompatStatus.hot = 'applied'
        automodeCompatStatus.hotReason = undefined
        log.info(`model-switch: reloaded dsh-automode with ${route} (verdict cache and breaker counters were reset)`)
        return
      }
      if (result.outcome !== 'failed') return
      automodeCompatStatus.hot = 'restart-required'
      automodeCompatStatus.hotReason = result.error ?? 'reload failed'
      log.warn(`model-switch: the dsh-automode reload with ${route} failed (${result.error ?? 'unknown error'}); the new route applies after a Host restart`)
    })
  }
  const applying = (entry: Entry, hot: boolean): void => {
    const previous = adopted.get(entry)
    const plan = adaptEntry(entry, settings, log, previous)
    if (plan === undefined) return
    if (plan.applied.route !== undefined) adopted.set(entry, plan.applied.route)
    else if (plan.applied.routeSkipped === 'user-set') adopted.delete(entry)
    if (hot) hotApply(entry, plan, previous)
    const summary = describeAutomodePlan(plan)
    lastSummary = summary
    if (!plan.changed) return
    if (applied.get(entry) === summary) return
    applied.set(entry, summary)
    log.info(`model-switch: adapted dsh-automode (${summary})`)
  }

  if (loader !== undefined && typeof loader.entries === 'function') {
    for (const entry of loader.entries()) if (isAutomodeEntry(entry)) applying(entry, false)
  }
  refreshPreset(true)

  const dispose = ctx.on('loader/patch-context', function (this: unknown, first: unknown, second?: unknown) {
    // Waterfall listeners receive `(entry, next)`; accept a `this`-bound entry too.
    const nextFn = (typeof first === 'function' ? first : second) as (() => unknown) | undefined
    const candidate = typeof first === 'function' ? this : first
    if (isAutomodeEntry(candidate)) applying(candidate as Entry, false)
    return nextFn === undefined ? undefined : nextFn()
  })
  /** Re-adapt every live row (settings changed under us) and reload the ones whose route moved. */
  const replay = (): boolean => {
    let any = false
    refreshPreset(false)
    for (const entry of loader?.entries?.() ?? []) {
      if (!isAutomodeEntry(entry)) continue
      any = true
      applying(entry, true)
    }
    return any
  }
  return { dispose, replay }
}

/**
 * Row entry point: adapt the third-party row on activation and on remount.
 * @param ctx - this row's context.
 */
export function apply(outer: Context): void {
  // Optional dependency: a hard inject would leave this row (and every row composed
  // after it) pending when the provider is absent, while a bare ctx.get never
  // resolves outside a dependent scope. The scoped inject waits without blocking
  // composition and hands the adapter a context that can read the service.
  outer.inject(['modelSwitch'], (ctx: Context) => {
    const runtime = ctx.modelSwitch
    const loader = ctx.get('loader', false) as Loader | undefined
    const settings = () => runtime.currentSettings()
    const adapter = installAutomodeCompat(ctx, loader, settings)
    ctx.effect(function* () {
      yield adapter.dispose
      yield ctx.on('model-switch/settings-update', () => {
        if (adapter.replay()) ctx.logger.info(`model-switch: re-applied the dsh-automode adaptation after a settings change (${lastSummary})`)
      })
    }, 'model-switch: keep the dsh-automode adapter aligned with the settings')
  })
}
