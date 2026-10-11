/**
 * Model Switch-owned Auto reviewer row.
 *
 * The official `@deepseek-ai/dsh-experimental-auto-review` gate hardwires its
 * reviewer to the session's own request route (`header.config`). This row runs
 * the official `apply` under a scoped child context whose `llm` service is
 * shadowed by a wrapper that rewrites only `stream()`'s provider/model — and
 * only while the profile has a complete reviewer route configured. With no
 * route configured the wrapper passes options through by identity, so the
 * reviewer follows the session model exactly.
 *
 * The official gate stays an opt-in capability: the row mounts it only when
 * the profile actually started with the experimental-auto-review bundle.
 * `cordis.patch.yml` disables the official row (one `registerAuto` per
 * context), so this row is its replacement rather than a second registration.
 *
 * @module dsh-model-switch/auto-review
 */

import type { Context } from '@deepseek-ai/cordis'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type {} from './host-runtime.js'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'model-switch-auto-review'
/** The official gate's host services plus Model Switch's settings owner. */
export const inject = ['modelSwitch', 'approval', 'llm', 'permissionPresets', 'sessions', 'tools']

/** Optional bundle whose composition opts a profile into Auto review. */
const AUTO_REVIEW_BUNDLE = '@deepseek-ai/dsh-experimental-auto-review'

/** Pinned reviewer route; both identifiers are non-empty. */
export interface AutoReviewRoute {
  readonly provider: string
  readonly model: string
}

/** Minimal public llm face the official gate uses (it calls exactly `stream`). */
export interface ReviewLlm {
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>
}

/**
 * Resolve the pinned reviewer route from live settings.
 * @param settings - Model Switch settings carrying the optional reviewer pair.
 * @returns Both identifiers trimmed and non-empty, or undefined (follow session).
 */
export function autoReviewRouteOf(settings: {
  readonly autoReviewProvider?: string
  readonly autoReviewModel?: string
} | undefined): AutoReviewRoute | undefined {
  const provider = settings?.autoReviewProvider?.trim()
  const model = settings?.autoReviewModel?.trim()
  if (provider === undefined || provider === '' || model === undefined || model === '') return undefined
  return { provider, model }
}

/**
 * Wrap the real llm service so only `stream()` route fields are rewritten.
 *
 * Non-`stream` members pass through bound to the real service (Proxy reads
 * would otherwise hand methods the proxy as `this`). The route is re-read per
 * call so a settings change applies to the very next review without a reload.
 *
 * @param real - the host's `ctx.llm`.
 * @param route - live route resolver; undefined means "do not rewrite".
 * @returns A structurally compatible llm face for the scoped context.
 */
export function reviewLlm(real: ReviewLlm, route: () => AutoReviewRoute | undefined): ReviewLlm {
  return new Proxy(real, {
    get(target, property, _receiver) {
      if (property === 'stream') {
        return (options: GenerateOptions): AsyncIterable<StreamChunk> => {
          const pinned = route()
          return pinned === undefined
            ? target.stream(options)
            : target.stream({ ...options, provider: pinned.provider, model: pinned.model })
        }
      }
      const value = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

/**
 * Build the scoped context the official gate runs under.
 * @param ctx - host context whose modelSwitch settings pin the reviewer route.
 * @returns A child context shadowing only the llm service.
 */
export function reviewScope(ctx: Context): Context {
  return ctx.extend({
    llm: reviewLlm(ctx.llm, () => autoReviewRouteOf(ctx.modelSwitch.currentSettings())),
  })
}

/** Structural read of launcher-provided profile facts (the app-boot seam). */
function autoReviewBundleActive(ctx: Context): boolean {
  let profile: unknown
  try {
    profile = (ctx as unknown as { get(name: string, strict: boolean): unknown }).get('profileContext', false)
  } catch {
    return false
  }
  if (profile === null || typeof profile !== 'object') return false
  const bundles = (profile as { readonly startedBundles?: unknown }).startedBundles
  return Array.isArray(bundles) && bundles.includes(AUTO_REVIEW_BUNDLE)
}

/**
 * Mount the official gate under the reviewer-route scope.
 *
 * A profile that never enabled the optional bundle keeps no Auto preset and no
 * reviewer; a deployment missing the official package reports the lost
 * capability explicitly instead of guessing another path.
 */
export async function apply(ctx: Context): Promise<void> {
  if (!autoReviewBundleActive(ctx)) {
    ctx.logger.info('model-switch: auto-review bundle is not active in this profile; the reviewer route override stays unmounted')
    return
  }
  let official: typeof import('@deepseek-ai/dsh-experimental-auto-review')
  try {
    official = await import('@deepseek-ai/dsh-experimental-auto-review')
  } catch (cause) {
    ctx.logger.error('model-switch: @deepseek-ai/dsh-experimental-auto-review is unavailable; the Auto reviewer cannot run at all')
    ctx.logger.error(cause)
    return
  }
  try {
    official.apply(reviewScope(ctx))
  } catch (cause) {
    // registerAuto is single-registration: an already-active official row owns
    // the gate, and a second one must fail loudly without tearing it down.
    ctx.logger.error('model-switch: the official auto-review row is already active; the reviewer route override is unavailable')
    ctx.logger.error(cause)
  }
}
