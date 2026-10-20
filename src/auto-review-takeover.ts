/**
 * Model Switch's takeover of the official Auto-review row.
 *
 * `permissionPresets.registerAuto` is a single registration, and the official
 * gate's `tools/pre-execute` probe is unshielded — it resolves the presets
 * service's `sessionProjections` injection on every tool call and dies with
 * `cannot get required service "sessionProjections" in inactive context` when
 * that chain breaks. Two live rows are therefore not survivable: the row that
 * loses `registerAuto` fails mid-effect (its probe listener half-applied, every
 * later tool call failing on the raw probe error), and the row that wins runs
 * unguarded. The plugin-manager toggle makes this reachable at runtime by
 * writing `disabled: false` for the official row into the profile patch layer.
 *
 * This module keeps exactly one row on the seam by taking the official row out
 * of the composition and letting this plugin's row claim the registration —
 * the same released-seam choreography the session-title takeover uses:
 * `loader/patch-context`, `Entry.update`, `loader/partial-dispose`.
 *
 * The yield is **synchronous** on purpose: `loader/patch-context` is a
 * synchronous waterfall whose `next()` returns straight into the entry's
 * `registry.plugin(...)` mount, so the official `registerAuto` runs in the same
 * turn. An awaited yield would still collide; a synchronous release hands the
 * registration over cleanly (the official row then applies in full and is
 * disposed cleanly, never half-applied).
 *
 * @module dsh-model-switch/auto-review-takeover
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Entry, Loader } from '@deepseek-ai/cordis-plugin-loader'

/** The loader row id the official Auto-review bundle declares. */
export const OFFICIAL_AUTO_REVIEW_ROW = 'auto-review'
/**
 * The official package identity — the only handle on the row this plugin
 * trusts. Matching by id alone could reach a group or another plugin's row, and
 * a matched row is disabled (its fiber disposed).
 */
export const OFFICIAL_AUTO_REVIEW_PACKAGE = '@deepseek-ai/dsh-experimental-auto-review'

/** Bounded takeover attempts before the seam is reported lost. */
export const TAKEOVER_MAX_ATTEMPTS = 60
/** Delay between takeover attempts; the first attempt is immediate. */
export const TAKEOVER_RETRY_DELAY_MS = 50
/**
 * Delays for the late re-claims after the attempt loop gave up (ms).
 *
 * `Entry.update({ disabled: true })` starts the displaced fiber's disposal but
 * the loader does not await it, and a disposal that tears down a mounted gate,
 * restores permission presets and unwinds fibers can take longer than the
 * attempt loop's budget. These re-claims keep trying for a few more seconds so a
 * hot-swapped install converges instead of needing a restart.
 */
export const TAKEOVER_LATE_RETRY_DELAYS_MS = [500, 1_000, 1_500] as const

/** The seam this row's gate owns; the takeover drives it around the official row. */
export interface AutoReviewSeam {
  /**
   * Synchronously free the Auto registration so a displacing row can register
   * cleanly. Keeping the admit callback is the seam's business; claiming puts
   * the registration back.
   */
  yieldRegistration(): void
  /** Make this row's Auto registration live; true once it is held. */
  claim(): Promise<boolean>
  /** Run one takeover step without losing the sessions' Auto selection. */
  preserveAuto(action: () => Promise<void>): Promise<void>
}

/** Whether one loader entry is the official Auto-review row (strict package identity). */
export function isOfficialAutoReviewRow(entry: Entry | undefined): boolean {
  if (entry === undefined) return false
  const pkg = entry.options?.name
  return typeof pkg === 'string' && pkg === OFFICIAL_AUTO_REVIEW_PACKAGE
}

/** The first composed official Auto-review row, if the profile declares one. */
export function officialAutoReviewEntry(loader: Loader | undefined): Entry | undefined {
  if (loader === undefined || typeof loader.entries !== 'function') return undefined
  for (const entry of loader.entries()) {
    if (isOfficialAutoReviewRow(entry)) return entry
  }
  return undefined
}

/** The id one entry is known by (the loader's leaf id, not a nested path). */
function leafId(entry: Entry): string | undefined {
  const raw = entry.options?.id
  return typeof raw === 'string' ? raw : undefined
}

/** A loader entry the loader has not created a fiber for yet. */
function alreadyDisabled(entry: Entry): boolean {
  return (entry as { readonly disabled?: boolean }).disabled === true
}

/**
 * Displace the official Auto-review row and take the registration back.
 *
 * The official row is disabled through the public `Entry.update` (which starts
 * its fiber's disposal — the loader does not await it, so the claim retries
 * until the displaced registration actually released). The Auto selection of
 * live sessions is preserved around the displacement: the official gate's
 * disposal moves `auto` sessions to `danger-full-access` by design, and this
 * row's registration puts them back.
 *
 * @param ctx - this row's context, used only for logging.
 * @param entry - the official row to displace.
 * @param seam - the Auto-registration seam to yield and reclaim.
 * @returns a promise settling once the takeover attempt loop finished.
 */
export async function reclaimOfficialAutoReviewRow(ctx: Context, entry: Entry, seam: AutoReviewSeam): Promise<void> {
  const label = String(leafId(entry) ?? OFFICIAL_AUTO_REVIEW_ROW)
  /** One disable-then-claim step; true once this row holds the registration. */
  const attempt = async (): Promise<boolean> => {
    try {
      await entry.update({ disabled: true })
      ctx.logger.info(`model-switch: disabled the official auto-review row ${label} (${OFFICIAL_AUTO_REVIEW_PACKAGE}); Model Switch's auto-review row owns the reviewer seam (configurable reviewer route)`)
    } catch (cause) {
      // A profile layer may refuse the write; the in-memory disable stands and
      // the next startup simply repeats this takeover.
      ctx.logger.info('model-switch: the displaced auto-review row could not be persisted as disabled; the takeover repeats next startup')
      ctx.logger.info(String(cause))
    }
    return await seam.claim()
  }
  await seam.preserveAuto(async () => {
    for (let index = 0; index < TAKEOVER_MAX_ATTEMPTS; index += 1) {
      await new Promise(resolve => setTimeout(resolve, index === 0 ? 0 : TAKEOVER_RETRY_DELAY_MS))
      if (await attempt()) {
        ctx.logger.info(`model-switch: displaced the official auto-review row ${label}; Auto review runs under the configurable reviewer route`)
        return
      }
    }
    ctx.logger.error(`model-switch: the official auto-review row ${label} kept the Auto registration; the reviewer route override is unavailable this session`)
  })
  scheduleLateReclaims(ctx, label, seam)
}

/**
 * Keep re-claiming for a few seconds after the attempt loop gave up.
 *
 * The displaced fiber's disposal starts on `Entry.update` but is not awaited by
 * the loader, so it can outlast the attempt loop — which is exactly the hot-swap
 * window where the official (unshielded) gate keeps serving. These bounded
 * re-claims converge that window instead of leaving it to a restart. Timers are
 * cleared when this row unloads.
 *
 * @param ctx - this row's context, used for logging and timer disposal.
 * @param label - the official row's id, for diagnostics.
 * @param seam - the Auto-registration seam to reclaim.
 */
function scheduleLateReclaims(ctx: Context, label: string, seam: AutoReviewSeam): void {
  let stopped = false
  const timers: Array<ReturnType<typeof setTimeout>> = []
  const stop = (): void => {
    stopped = true
    for (const timer of timers.splice(0)) clearTimeout(timer)
  }
  ctx.effect(function* () {
    yield stop
  }, 'model-switch: auto-review late takeover retries')
  const run = (index: number): void => {
    if (stopped || index >= TAKEOVER_LATE_RETRY_DELAYS_MS.length) return
    const timer = setTimeout(() => {
      void (async () => {
        if (stopped) return
        if (await seam.claim()) {
          ctx.logger.info(`model-switch: reclaimed the Auto registration late from the official auto-review row ${label}; Auto review runs under the configurable reviewer route`)
          stop()
          return
        }
        run(index + 1)
      })()
    }, TAKEOVER_LATE_RETRY_DELAYS_MS[index])
    timers.push(timer)
  }
  run(0)
}

/**
 * Install the takeover choreography for an official row that activates later.
 *
 * The plugin manager can re-enable the official row at any time (it writes
 * `disabled: false` into the profile patch layer, which applies after every
 * bundle layer). The `loader/patch-context` listener yields this row's
 * registration **synchronously** before the entry's plugin `apply` runs, so the
 * official row applies cleanly instead of colliding; the reclaim then disables
 * it and takes the registration back.
 *
 * @param ctx - this row's context.
 * @param seam - the Auto-registration seam to yield and reclaim.
 * @returns the guarded reclaim function, so the caller's startup takeover and
 * the listeners share one in-flight guard per entry.
 */
export function installAutoReviewTakeover(ctx: Context, seam: AutoReviewSeam): (entry: Entry) => Promise<void> {
  /** Entries already handled, so a repeated patch-context does not loop. */
  const handled = new Set<Entry>()
  /** Reclaims in flight, shared so two triggers for one entry join one cycle. */
  const reclaiming = new Map<Entry, Promise<void>>()

  /** Disable the official row and take the registration back, once per entry. */
  const reclaim = (entry: Entry): Promise<void> => {
    const running = reclaiming.get(entry)
    if (running !== undefined) return running
    const run = reclaimOfficialAutoReviewRow(ctx, entry, seam).finally(() => {
      reclaiming.delete(entry)
    })
    reclaiming.set(entry, run)
    return run
  }

  /**
   * The row an event names.
   *
   * The loader hands the emitting entry as the event's `this`, but cordis does
   * not rebind `this` for listeners added through `ctx.on`, so a listener can
   * also receive the payload as its first argument. Both shapes are accepted;
   * the real Host always provides one of them.
   */
  const entryOfEvent = (self: unknown, first: unknown): Entry | undefined => {
    const candidate = self ?? first
    return candidate !== null && typeof candidate === 'object' && 'options' in candidate ? candidate as Entry : undefined
  }

  const listeners: Array<() => void> = []
  const listen = <T>(event: string, listener: T): void => {
    const dispose = (ctx as unknown as {
      on?(name: string, handler: T): (() => void) | undefined
    }).on?.(event, listener)
    if (dispose !== undefined) listeners.push(dispose)
  }
  listen('loader/patch-context', function (this: unknown, first: unknown, second?: unknown) {
    // Waterfall listeners get only `next`; a plain emission carries the payload
    // first. Accept both shapes.
    const nextFn = (typeof first === 'function' ? first : second) as (() => unknown) | undefined
    const entry = entryOfEvent(this, typeof first === 'function' ? undefined : first)
    if (entry === undefined || typeof nextFn !== 'function' || !isOfficialAutoReviewRow(entry) || handled.has(entry)) {
      return nextFn === undefined ? undefined : nextFn()
    }
    handled.add(entry)
    // The yield must land before `next()` returns: the loader runs this entry's
    // plugin `apply` — and with it the official `registerAuto` — immediately
    // after the waterfall completes.
    seam.yieldRegistration()
    void reclaim(entry)
    return nextFn()
  })
  // A removed or reconfigured official row releases whatever it held; claim it.
  listen('loader/partial-dispose', function (this: unknown, first?: unknown) {
    const entry = entryOfEvent(this, first)
    if (entry === undefined || !isOfficialAutoReviewRow(entry)) return
    handled.delete(entry)
    void seam.claim()
  })
  // Rows composed before this row ran are swept once: an already-active row
  // holds the registration and must be displaced before this row claims it.
  const loader = ctx.get('loader', false) as Loader | undefined
  if (loader !== undefined && typeof loader.entries === 'function') {
    for (const candidate of loader.entries()) {
      if (!isOfficialAutoReviewRow(candidate)) continue
      if (alreadyDisabled(candidate)) continue
      void reclaim(candidate)
    }
  }
  // The listeners are effects of this row's fiber on a real Host, so unloading
  // the profile unregisters them; a structural context keeps the same lifetime.
  const disposable = (): void => {
    for (const dispose of listeners.splice(0)) dispose()
  }
  const effect = (ctx as unknown as { effect?: (body: () => unknown, label: string) => unknown }).effect
  if (effect !== undefined) {
    const registration = effect(function* () {
      yield disposable
    }, 'model-switch: auto-review takeover')
    if (typeof registration === 'function') listeners.push(registration as () => void)
  }
  return reclaim
}
