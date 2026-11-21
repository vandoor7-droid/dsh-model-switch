/**
 * Adapt `dsh-vision-router`'s backend chain to this plugin's vision route.
 *
 * The vision plugin owns an ordered `providers` chain in its `vision-router`
 * row config and reads it live. The write crosses the same boundary the
 * plugin's own settings facade uses: `ctx.configEditor.edit(entry, change)` —
 * the released core ConfigEditor seam. The edit validates through the plugin's
 * own Config schema (`providers` is declared there), persists into the profile
 * patch row, and hot-reloads just that entry, so a provider switch applies
 * without a Host restart. The plugin's HTTP local-settings transport stays
 * unused: its BrowserAuth fence only admits an authenticated local browser,
 * not a plugin fiber.
 *
 * The route itself is provider-group based: the group of the deployment
 * default provider (canonicalized — a twin `${provider}-vision` default keys
 * its base), falling back to the flat vision pair. Chain semantics are the
 * managed head documented in `./vision-router-route.ts`: a configured route
 * owns the first row, the user's own rows stay below as fallbacks, and an
 * empty route leaves the chain untouched.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Entry } from '@deepseek-ai/cordis-plugin-loader'
import { visionRouteOf, type CapabilityRoute } from './session-route.js'
import { isVisionRouterRow, planVisionProviders } from './vision-router-route.js'
import { deploymentDefaultProviderOf } from './prime-memory-route.js'

/** Row name and dependencies, mirroring the sibling adapter rows. */
export const name = 'model-switch-vision-router-compat'
export const inject = ['loader']

/** Why the adapter stayed out of the way. */
export type VisionRouterRouteSkip = 'no-row' | 'no-route' | 'no-seam' | 'rejected'

/** Live adapter state, surfaced next to the settings card. */
export interface VisionRouterCompatStatus {
  /** Whether at least one write reached the vision plugin's row config. */
  installed: boolean
  /** The `provider/model` written on the last pass. */
  route?: string | undefined
  /** Why the route was not written, when it was not. */
  routeSkipped?: VisionRouterRouteSkip | undefined
  /** How many settings-update replays this adapter has run (diagnostics). */
  replays: number
}

/** The state the settings page reads. */
export const visionRouterCompatStatus: VisionRouterCompatStatus = { installed: false, replays: 0 }

/** What this adapter needs from the released ConfigEditor service. */
interface ConfigEditorLike {
  entries?(): Iterable<Entry>
  edit?(entry: Entry, change: (current: Record<string, unknown>, inherited: Record<string, unknown>) => Record<string, unknown>): Promise<void>
}

/** What this adapter needs from the loader. */
interface Loader {
  entries?(): Iterable<Entry>
}

/** A non-blank string. */
function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Read a value as a plain record. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

/** The config one loader entry currently runs with. */
function configOf(entry: Entry | undefined): Record<string, unknown> | undefined {
  return asRecord((entry?.options as { config?: unknown } | undefined)?.config)
}

/** The ConfigEditor service, when this Host exposes the released seam. */
function editorOf(ctx: Context): ConfigEditorLike | undefined {
  try {
    return ctx.get('configEditor', false) as ConfigEditorLike | undefined
  } catch {
    return undefined
  }
}

/** The vision plugin's addressable row, as currently composed. */
function visionRouterEntryOf(editor: ConfigEditorLike): Entry | undefined {
  for (const candidate of editor.entries?.() ?? []) {
    if (isVisionRouterRow(candidate)) return candidate
  }
  return undefined
}

/**
 * Install the adapter for the whole profile.
 *
 * Runs on activation, on every `loader/patch-context` and `loader/entry-init`
 * that concerns the vision plugin's row, once more after a short delay (the
 * row is often composed after this one), when the `configEditor` service
 * appears, and whenever this plugin's settings change. Every pass compares
 * before writing: a ConfigEditor edit reconciles the profile and re-enters
 * this adapter, so an unchanged head must not produce another write.
 * @param ctx - this row's context.
 * @param routeOf - resolves this plugin's vision route for one settings snapshot.
 * @returns The disposer and a replay hook.
 */
export function installVisionRouterCompat(
  ctx: Context,
  routeOf: () => CapabilityRoute | undefined,
): { dispose: () => void; replay: () => boolean } {
  /** The route this adapter wrote last, so it may replace its own value only. */
  let adoptedRoute: string | undefined
  let pending: Promise<void> | undefined
  let attempt = 0
  const timers: ReturnType<typeof setTimeout>[] = []

  const scheduleRetry = (): void => {
    if (attempt >= 8) return
    const delay = Math.min(4_000, 200 * 2 ** attempt)
    attempt += 1
    const timer = setTimeout(() => { void run() }, delay)
    timer.unref?.()
    timers.push(timer)
  }

  const run = async (): Promise<void> => {
    if (pending !== undefined) return pending
    const editor = editorOf(ctx)
    if (editor === undefined || typeof editor.entries !== 'function' || typeof editor.edit !== 'function') {
      visionRouterCompatStatus.routeSkipped = 'no-seam'
      return
    }
    const entry = visionRouterEntryOf(editor)
    if (entry === undefined) {
      // The vision plugin may simply not be installed; a bounded retry also
      // covers a row that is still being composed after this one.
      visionRouterCompatStatus.routeSkipped = 'no-row'
      scheduleRetry()
      return
    }
    // Bound while the guard above still narrows: extracting the method without
    // the receiver would throw on the real class-backed service (the async
    // closure below cannot keep the optional-method narrowing on its own).
    const editRow = editor.edit.bind(editor)
    const route = routeOf()
    const provider = text(route?.provider)
    const model = text(route?.model)
    if (provider === '' || model === '') {
      visionRouterCompatStatus.routeSkipped = 'no-route'
      return
    }
    // Compare first: an unchanged head must not rewrite the document, because
    // every ConfigEditor write reconciles the profile and re-enters this
    // adapter (the recompose loop the memory adapter measured at ~6 s a turn).
    const preview = planVisionProviders(configOf(entry)?.providers, route, adoptedRoute)
    if (!preview.changed) {
      adoptedRoute = preview.route ?? adoptedRoute
      if (preview.route !== undefined) {
        visionRouterCompatStatus.installed = true
        visionRouterCompatStatus.route = preview.route
        delete visionRouterCompatStatus.routeSkipped
      }
      return
    }
    const wanted = `${provider}/${model}`
    pending = (async () => {
      try {
        await editRow(entry, (current) => {
          const base = asRecord(current) ?? {}
          // Re-plan inside the fence: the locked read may differ from the
          // preview above, and the edit must land exactly what this pass wants.
          const plan = planVisionProviders(base.providers, route, adoptedRoute)
          return { ...base, providers: plan.providers }
        })
        // Read back from the live composition: the reconcile an edit triggers
        // may replace the entry object, so re-find it instead of trusting the
        // captured reference. Only a write the running row shows counts.
        const verify = planVisionProviders(configOf(visionRouterEntryOf(editor))?.providers, route, adoptedRoute)
        if (!verify.changed) {
          adoptedRoute = verify.route ?? wanted
          attempt = 0
          visionRouterCompatStatus.installed = true
          visionRouterCompatStatus.route = wanted
          delete visionRouterCompatStatus.routeSkipped
        } else {
          visionRouterCompatStatus.routeSkipped = 'rejected'
        }
      } catch (cause: unknown) {
        visionRouterCompatStatus.routeSkipped = 'rejected'
        ctx.logger.warn(`model-switch: could not write the dsh-vision-router backend chain (${String(cause)})`)
        scheduleRetry()
      } finally {
        pending = undefined
      }
    })()
    return pending
  }

  const replay = (): boolean => {
    visionRouterCompatStatus.replays += 1
    void run()
    return true
  }

  void run()

  const offPatch = ctx.on('loader/patch-context', function (this: unknown, first: unknown, second?: unknown) {
    const nextFn = (typeof first === 'function' ? first : second) as (() => unknown) | undefined
    const candidate = typeof first === 'function' ? this : first
    if (isVisionRouterRow(candidate as Entry | undefined)) void run()
    return nextFn === undefined ? undefined : nextFn()
  })
  const offInit = ctx.on('loader/entry-init', function (this: unknown, first?: unknown) {
    const candidate = (this ?? first) as Entry | undefined
    if (candidate !== undefined && isVisionRouterRow(candidate)) void run()
  })
  const offService = ctx.on('internal/service', (name: unknown) => {
    if (name === 'configEditor') void run()
  })
  const lateSweep = setTimeout(() => { void run() }, 1_500)
  lateSweep.unref?.()
  return {
    dispose: () => {
      offPatch()
      offInit()
      offService()
      clearTimeout(lateSweep)
      for (const timer of timers) clearTimeout(timer)
    },
    replay,
  }
}

/**
 * Row entry point: adapt the vision plugin on activation and on remount.
 * @param ctx - this row's context.
 */
export function apply(ctx: Context): void {
  // Optional dependencies on purpose: a hard inject on this row leaves it
  // pending whenever a service is absent, and a pending row blocks every row
  // composed after it. Scoped ctx.inject waits without blocking the row.
  ctx.inject(['modelSwitch'], (withProvider: Context) => {
    withProvider.inject(['configEditor'], (scope: Context) => scope.effect(() => {
      const runtime = scope.modelSwitch
      const loader = scope.get('loader', false) as Loader | undefined
      const routeOf = (): CapabilityRoute | undefined => visionRouteOf(runtime.currentSettings(), deploymentDefaultProviderOf(loader))
      const adapter = installVisionRouterCompat(scope, routeOf)
      const off = scope.on('model-switch/settings-update', () => {
        if (adapter.replay()) scope.logger.info('model-switch: re-applied the dsh-vision-router backend chain after a settings change')
      })
      return () => { off(); adapter.dispose() }
    }, 'model-switch: keep the dsh-vision-router route aligned with the settings'))
  })
}
