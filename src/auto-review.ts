/**
 * Model Switch-owned Auto reviewer row.
 *
 * The official `@deepseek-ai/dsh-experimental-auto-review` gate hardwires its
 * reviewer to the session's own request route (`header.config`). This row runs
 * the official `apply` under a scoped child context whose `llm` service is
 * shadowed by a wrapper that rewrites only `stream()`'s provider/model — and
 * only when the reviewing session's derived route (its provider group's
 * reviewer pair, else the deployment-wide reviewer card) pins one. With no
 * route pinned the wrapper passes options through by identity, so the reviewer
 * follows the session model exactly.
 *
 * Although the official gate omits `sessionId` and `purpose` from its frozen
 * `GenerateOptions`, its `tools/pre-execute` waterfall listener receives
 * `exec.agent` (`exec.agent.session`). After running `official.apply(scope)`,
 * this module registers a `{ prepend: true }` `tools/pre-execute` listener on
 * the same scope — which Cordis places ahead of the official gate's listener in
 * the waterfall — and binds `exec.agent?.session` in an `AsyncLocalStorage`
 * scope around `next()`. Every `scope.llm.stream()` call from `classifyRisk`
 * therefore resolves the exact session being reviewed, with zero cross-session
 * interference when multiple sessions review tool calls concurrently.
 *
 * The official gate stays an opt-in capability: the row mounts it only when
 * the profile actually started with the experimental-auto-review bundle. Two
 * rows cannot share the seam — `permissionPresets.registerAuto` is a single
 * registration and the official probe is unshielded — so this row also
 * **takes the seam over** (see `./auto-review-takeover.ts`): a composed or
 * re-enabled official row is displaced through the released loader seams, the
 * registration is handed over and reclaimed around that displacement, and the
 * gate this row mounts keeps the defensive `permissionPresets` shadow so a
 * degraded preset service can never fail a tool call again.
 *
 * @module dsh-model-switch/auto-review
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { Session } from '@deepseek-ai/dsh-session'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'
import type { ModelSwitchSettings } from './host-settings.js'
import { resolveCapabilityRoute, sessionProviderOf } from './session-route.js'
import { decodeAutoSessionState, encodeAutoSessionState } from './auto-sessions-state.js'
import {
  installAutoReviewTakeover,
  officialAutoReviewEntry,
  type AutoReviewSeam,
} from './auto-review-takeover.js'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'model-switch-auto-review'
/**
 * Only the services this row's own code touches.
 *
 * The official gate used to run inside this row's fiber, so this list had to
 * mirror every service the official `apply` reads. DSH 0.2.1 added
 * `workingDirectory` to the official gate and the mirror went stale, which made
 * every tool call fail with `cannot get property "workingDirectory" without
 * inject`. The gate is now mounted as its own plugin (see {@link autoReviewGate}),
 * so cordis resolves the official dependency list — including future additions —
 * and this row declares only what it reads itself (`loader` drives the
 * takeover).
 */
export const inject = ['llm', 'modelSwitch', 'loader']

/** Optional bundle whose composition opts a profile into Auto review. */
const AUTO_REVIEW_BUNDLE = '@deepseek-ai/dsh-experimental-auto-review'

/** The Auto preset name; `registerAuto` is what publishes it. */
const AUTO_PRESET = 'auto'

/**
 * Live Auto-reviewer takeover status, read by the runtime-capability snapshot.
 *
 * `held: false` means the official row kept the single `registerAuto` slot (or
 * has not released it yet): the reviewer route is not configurable and the
 * tool-call safety net allows unreviewed calls instead of failing them.
 * `allowedCalls` counts the calls the net let through in that state, so the
 * settings card can tell the human how much review was skipped.
 */
export const autoReviewStatus = { held: false, allowedCalls: 0 }

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
 * Resolve the reviewer route for one session (or deployment-wide when no session is bound).
 *
 * @param ctx - host context whose modelSwitch settings and sessionProjections derive the route.
 * @param session - the session whose tool call is being reviewed, when known.
 * @returns The derived reviewer route, or undefined to follow the session model.
 */
export function resolveSessionAutoReviewRoute(ctx: Context, session?: Session): AutoReviewRoute | undefined {
  let settings: ModelSwitchSettings | undefined
  try {
    settings = ctx.modelSwitch.currentSettings()
  } catch {
    settings = undefined
  }
  const provider = sessionProviderOf(ctx, session)
  return resolveCapabilityRoute(settings, provider, 'autoReview')
}

/**
 * Install the outer `tools/pre-execute` correlation listener ahead of the official gate.
 *
 * Because Cordis `on(..., { prepend: true })` unshifts onto the event hook list,
 * registering this listener AFTER `official.apply(scope)` places it at index 0
 * — directly ahead of the official gate's own prepended listener — so
 * `activeSession.run(exec.agent?.session, next)` wraps the entire official
 * review execution.
 *
 * @param scope - the review scope context where the gate is mounted.
 * @param activeSession - AsyncLocalStorage holding the session under review.
 */
export function bindAutoReviewSessionCorrelation(
  scope: Context,
  activeSession: AsyncLocalStorage<Session | undefined>,
): void {
  scope.effect(function* () {
    yield scope.on('tools/pre-execute', (exec, next) => activeSession.run(exec.agent?.session, next), { prepend: true })
  }, 'model-switch: auto-review session correlation')
}

/**
 * Signatures of a broken reviewer seam, never of a real denial.
 *
 * The official gate's `tools/pre-execute` probe resolves its own
 * `sessionProjections` injection before anything can catch it; when that fiber
 * chain breaks it throws `cannot get required service ... in inactive context`
 * (or, on older lines, `cannot get property ... without inject`) straight into
 * the tool call. `TRANSPORT` covers a reviewer that cannot reach its route at
 * all. A denial is a *return* (`{ kind: 'deny' }`), so it never matches.
 */
const REVIEWER_INFRA_FAILURE_SIGNATURES = [
  'inactive context',
  'cannot get required service',
  'cannot get property',
  'without inject',
  'TRANSPORT',
] as const

/**
 * Whether a reviewer-path throw is a broken seam rather than a real decision.
 * @param cause - whatever the waterfall threw.
 * @returns true when the reviewer itself could not run.
 */
export function isReviewerInfrastructureFailure(cause: unknown): boolean {
  const text = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause)
  return REVIEWER_INFRA_FAILURE_SIGNATURES.some(signature => text.includes(signature))
}

/**
 * Keep a broken reviewer seam from failing tool calls.
 *
 * Registered on this row's own context through `{ prepend: true }`, so it sits
 * ahead of the official gate's listener and stays live even when the gate could
 * not be mounted (the takeover lost `registerAuto`, or the displaced row has
 * not released it yet). That is the one window the defensive
 * `permissionPresets` shadow cannot cover: the shadow lives in this row's review
 * scope, while the serving gate resolves the real service from the profile.
 *
 * The waterfall only decides whether the body runs; the body dispatches after
 * it returns, so allowing here never masks a tool failure. Reviewer transport
 * and quota errors keep failing closed — only seam breakage is allowed through.
 *
 * @param ctx - this row's context (the listener lives and dies with the plugin).
 * @param options - diagnostics plus the degraded-state predicate.
 */
export function installToolCallSafetyNet(
  ctx: Context,
  options: {
    /** Diagnostic fiber dump appended to the first report. */
    fiberChain?: (() => string) | undefined
    /**
     * Whether this row currently knows the reviewer route is not held.
     *
     * The net only fails open in that state: another plugin's broken listener
     * must keep failing closed, and a held route already has the defensive
     * shadow in front of it. Defaults to always degraded (direct callers).
     */
    isDegraded?: (() => boolean) | undefined
  } = {},
): void {
  let reported = false
  const handler = async (_exec: ToolExecution, next: () => Promise<PreToolDecision>): Promise<PreToolDecision> => {
    try {
      return await next()
    } catch (cause) {
      if (!isReviewerInfrastructureFailure(cause)) throw cause
      if (options.isDegraded !== undefined && !options.isDegraded()) throw cause
      if (!reported) {
        reported = true
        const detail = options.fiberChain === undefined ? '' : `; fiber chain: ${options.fiberChain()}`
        ctx.logger.warn(`model-switch: the Auto reviewer path is broken (${String(cause)}); tool calls run unreviewed instead of failing${detail}`)
      }
      autoReviewStatus.allowedCalls += 1
      return { kind: 'allow' }
    }
  }
  ctx.effect(function* () {
    yield ctx.on('tools/pre-execute', handler, { prepend: true })
  }, 'model-switch: reviewer-path safety net')
}

/** The preset name the service reports when no configured preset matches. */
const CUSTOM_PRESET = 'custom'

/** The permission-preset face the official gate reads; structural so a missing package never breaks a build. */
export interface PermissionPresetsFace {
  current(session: Session): string
  set(session: Session, preset: string): unknown
  registerAuto(admit: () => void): unknown
}

/**
 * The managed face: what the gate sees, plus the registration handle the
 * takeover drives.
 */
export interface ManagedPermissionPresetsFace extends PermissionPresetsFace {
  /** Synchronously release the live Auto registration, keeping the admit callback. */
  releaseForTakeover(): void
  /** Take the Auto registration back; true once it is live. */
  reclaimRegistration(): boolean
  /** Whether this face currently holds the Auto registration. */
  readonly registered: boolean
}

/** Read the live permission-preset service without requiring an injection. */
function permissionPresetsOf(ctx: Context): PermissionPresetsFace | undefined {
  try {
    const face = (ctx as unknown as { get(name: string, strict: boolean): unknown }).get('permissionPresets', false)
    return face !== null && typeof face === 'object' ? face as PermissionPresetsFace : undefined
  } catch {
    return undefined
  }
}

/** The fiber facts a diagnostic chain dump reads. */
interface FiberFacts {
  readonly uid?: number | null
  readonly state?: number
  readonly name?: string
  readonly inject?: Record<string, unknown>
  readonly parent?: unknown
}

/**
 * A compact dump of the fiber chain a service resolution walks.
 *
 * `cannot get required service "sessionProjections" in inactive context` is
 * thrown by the first fiber in the caller's chain that declares the service
 * without a resolved snapshot; the chain names that fiber directly.
 * @param ctx - the context whose chain is walked.
 * @returns One `uid/state/name/inject` segment per fiber, outermost last.
 */
function fiberChainOf(ctx: Context): string {
  const parts: string[] = []
  let node: unknown = ctx
  for (let step = 0; step < 8; step += 1) {
    const fiber = (node as { fiber?: FiberFacts } | undefined)?.fiber
    if (fiber === undefined) break
    const injects = Object.keys(fiber.inject ?? {}).join('|')
    parts.push(`uid=${String(fiber.uid)} state=${String(fiber.state)} name=${String(fiber.name)} inject=[${injects}]`)
    node = fiber.parent
  }
  return parts.length === 0 ? 'no fiber chain' : parts.join(' -> ')
}

/**
 * Wrap the permission-preset service so the official gate's per-call probe can
 * never fail a tool call, and broker its single Auto registration.
 *
 * DSH's Auto gate starts every `tools/pre-execute` with
 * `permissionPresets.current(session)`, and that method resolves the presets
 * service's own `sessionProjections` injection. When the presets fiber has
 * turned inactive the probe throws `cannot get required service
 * "sessionProjections" in inactive context` outside the gate's reviewer error
 * wrapper, so every tool call dies. This wrapper resolves the service lazily
 * (so the shadow is in place even while the service is still activating),
 * degrades the probe to `custom` (the gate then skips review and calls
 * `next()`), and reports the lost capability once — with the fiber chain that
 * failed resolution, so the next occurrence names the inactive fiber.
 *
 * `registerAuto` is **brokered**: the gate yields the disposer into its own
 * effect, but the takeover must be able to hand the single registration to a
 * displacing row and take it back without unmounting the gate (the gate's
 * disposal would move live `auto` sessions to `danger-full-access`).
 *
 * @param resolve - resolves the host's permission-preset service per call.
 * @param log - the row logger used for the single degradation report.
 * @param chain - diagnostic dump of the resolution chain; defaults to empty.
 * @returns A managed preset face.
 */
export function defensivePermissionPresets(
  resolve: () => PermissionPresetsFace | undefined,
  log: { warn(line: string): void },
  chain: () => string = () => '',
): ManagedPermissionPresetsFace {
  let reported = false
  let admit: (() => void) | undefined
  let release: (() => unknown) | undefined
  const degrade = (operation: string, error: unknown): void => {
    if (reported) return
    reported = true
    log.warn(`model-switch: the permission-preset service refused ${operation} (${String(error)}); the Auto reviewer passes tool calls through instead of blocking them [chain: ${chain()}]`)
  }
  const requireService = (): PermissionPresetsFace => {
    const face = resolve()
    if (face === undefined) throw new Error('permission: the permission-preset service is unavailable')
    return face
  }
  return {
    current(session) {
      try {
        return requireService().current(session)
      } catch (error) {
        degrade('current()', error)
        return CUSTOM_PRESET
      }
    },
    set(session, preset) {
      try {
        return requireService().set(session, preset)
      } catch (error) {
        degrade('set()', error)
        return undefined
      }
    },
    registerAuto(next) {
      admit = next
      release = requireService().registerAuto(next) as (() => unknown) | undefined
      return () => {
        admit = undefined
        const dispose = release
        release = undefined
        return dispose?.()
      }
    },
    releaseForTakeover() {
      const dispose = release
      release = undefined
      dispose?.()
    },
    reclaimRegistration() {
      if (release !== undefined) return true
      if (admit === undefined) return false
      try {
        release = requireService().registerAuto(admit) as (() => unknown) | undefined
        return true
      } catch {
        // Still held by the displaced row; the takeover loop retries until its
        // fiber unloads. A broken service reads the same way and is reported by
        // the takeover's final error line.
        return false
      }
    },
    get registered() { return release !== undefined },
  }
}

/**
 * Build the scoped context the official gate runs under.
 * @param ctx - host context whose modelSwitch settings pin the reviewer route.
 * @param activeSession - optional AsyncLocalStorage correlating each `tools/pre-execute` call to its session.
 * @param presets - optional managed preset face shared with the row's takeover.
 * @returns A child context shadowing the llm service and the permission-preset
 * service (always: a gate that sees the raw service can fail a tool call).
 */
export function reviewScope(
  ctx: Context,
  activeSession: AsyncLocalStorage<Session | undefined> = new AsyncLocalStorage<Session | undefined>(),
  presets: ManagedPermissionPresetsFace = defensivePermissionPresets(() => permissionPresetsOf(ctx), ctx.logger, () => fiberChainOf(ctx)),
): Context {
  return ctx.extend({
    llm: reviewLlm(ctx.llm, () => resolveSessionAutoReviewRoute(ctx, activeSession.getStore())),
    permissionPresets: presets,
  } as never)
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

/** Structural read of the loader service the takeover drives. */
function loaderOf(ctx: Context): Parameters<typeof officialAutoReviewEntry>[0] {
  try {
    const loader = (ctx as unknown as { get(name: string, strict: boolean): unknown }).get('loader', false)
    return loader !== null && typeof loader === 'object' ? loader as Parameters<typeof officialAutoReviewEntry>[0] : undefined
  } catch {
    return undefined
  }
}

/**
 * Structural view of the official gate's plugin face.
 *
 * `name` and `inject` are part of the module's released plugin contract; the
 * gate is mounted through cordis rather than called directly so its own
 * dependency list is what the fiber resolves.
 */
export interface OfficialAutoReviewGate {
  readonly apply: (ctx: Context) => void
  readonly inject?: readonly string[]
  readonly name?: string
}

/** The plugin face handed to cordis, with the official dependency list kept. */
export interface MountedAutoReviewGate {
  readonly name: string
  readonly inject?: string[]
  readonly apply: (gateCtx: Context) => void
}

/**
 * Wrap the official gate as a plugin that declares its own dependencies.
 *
 * Directly calling `official.apply(scope)` ran the gate's code on this row's
 * fiber, so every service the gate reads had to be mirrored in this row's
 * `inject`. Mounting it instead lets cordis resolve the official list, which is
 * what keeps a released Host's new dependency (0.2.1's `workingDirectory`) from
 * breaking every tool call. The hooks let the caller observe whether the gate
 * actually ran before it binds the session-correlation listener.
 *
 * @param gate - the official module (or an equivalent structural gate).
 * @param hooks - applied/failure observers; the failure is rethrown.
 * @returns A cordis plugin mounting the official gate unchanged.
 */
export function autoReviewGate(
  gate: OfficialAutoReviewGate,
  hooks: { readonly onApplied?: () => void; readonly onFailure?: (error: unknown) => void } = {},
): MountedAutoReviewGate {
  return {
    name: gate.name ?? 'experimental-auto-review',
    ...(gate.inject === undefined ? {} : { inject: [...gate.inject] }),
    apply(gateCtx: Context): void {
      try {
        gate.apply(gateCtx)
      } catch (error) {
        hooks.onFailure?.(error)
        throw error
      }
      hooks.onApplied?.()
    },
  }
}

/** The fiber face this row keeps so a re-applied row can unload its gate first. */
interface GateFiber {
  readonly dispose: () => Promise<void>
}

/**
 * The gate fiber mounted by the current row instance.
 *
 * `registerAuto` is a single live registration owned by the gate's effect
 * lifetime, and its disposer is what clears the Auto preset. A re-applied row
 * must await the previous gate's unloading before the next registration runs,
 * otherwise the new `registerAuto` throws `already registered` and its effect
 * cleanup leaves the catalog without Auto.
 */
let lastGateFiber: GateFiber | undefined

/**
 * Mount the official gate under the reviewer-route scope and own the seam.
 *
 * A profile that never enabled the optional bundle keeps no Auto preset and no
 * reviewer; a deployment missing the official package reports the lost
 * capability explicitly instead of guessing another path. A composed (or
 * plugin-manager re-enabled) official row is displaced first — see
 * `./auto-review-takeover.ts` for the choreography and why the yield is
 * synchronous.
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

  const presets = defensivePermissionPresets(() => permissionPresetsOf(ctx), ctx.logger, () => fiberChainOf(ctx))
  const activeSession = new AsyncLocalStorage<Session | undefined>()
  const scope = reviewScope(ctx, activeSession, presets)
  // Live from the first tool call, before the takeover runs: a lost
  // `registerAuto` leaves the official (unshielded) gate serving, and its probe
  // must not be able to fail the tool body.
  installToolCallSafetyNet(ctx, {
    fiberChain: () => fiberChainOf(ctx),
    isDegraded: () => !presets.registered,
  })
  let gateReady = false
  let mountInFlight: Promise<'applied' | 'waiting' | 'failed'> | undefined

  /** Sessions currently on the Auto preset (best-effort). */
  const rememberAuto = (): Session[] => {
    const remembered: Session[] = []
    try {
      const sessions = (ctx as unknown as { get(name: string, strict: boolean): unknown }).get('sessions', false) as { list?(): Iterable<Session> } | undefined
      for (const session of sessions?.list?.() ?? []) {
        if (presets.current(session) === AUTO_PRESET) remembered.push(session)
      }
    } catch { /* best-effort */ }
    return remembered
  }
  const restoreAuto = (remembered: readonly Session[]): void => {
    for (const session of remembered) {
      try {
        presets.set(session, AUTO_PRESET)
      } catch { /* best-effort */ }
    }
  }
  /**
   * Run one displacement step without losing the sessions' Auto selection.
   *
   * Disposing a gate moves live `auto` sessions to `danger-full-access` by
   * design (the official teardown runs on both the displaced row and this
   * row's own re-mounts); the remembered selection is restored afterwards.
   */
  const preserveAuto = async (action: () => Promise<void>): Promise<void> => {
    const remembered = rememberAuto()
    await action()
    restoreAuto(remembered)
  }

  /** Where the pre-release Auto snapshot lives (host-wide, not per profile). */
  const autoStatePath = (): string =>
    join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'model-switch', 'auto-sessions.json')

  /**
   * Snapshot the Auto selection to disk *before* the registration is released.
   *
   * A release can dispose the gate during a hot recompose — exactly when this
   * row is torn down and can no longer restore anything in memory. The next
   * mount replays the file (see `flushAutoSnapshot`), so the user does not have
   * to re-select 「自动审查」 after every reload.
   */
  const persistAutoSnapshot = (): void => {
    const ids: string[] = []
    for (const session of rememberAuto()) {
      const id = (session as unknown as { id?: unknown }).id
      if (typeof id === 'string' && id !== '') ids.push(id)
    }
    try {
      const file = autoStatePath()
      if (ids.length === 0) {
        rmSync(file, { force: true })
        return
      }
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, encodeAutoSessionState(ids, Date.now()), 'utf8')
    } catch {
      /* best-effort: a read-only DSH_HOME must never block the release */
    }
  }

  /** Replay (and consume) the snapshot written by a previous release. */
  const flushAutoSnapshot = (): void => {
    try {
      const file = autoStatePath()
      let raw: string
      try {
        raw = readFileSync(file, 'utf8')
      } catch {
        return
      }
      const ids = decodeAutoSessionState(raw, Date.now())
      if (ids.length === 0) {
        rmSync(file, { force: true })
        return
      }
      const sessions = (ctx as unknown as { get(name: string, strict: boolean): unknown }).get('sessions', false) as { list?(): Iterable<Session> } | undefined
      // An early claim can run before the session service exists: keep the file
      // so a later claim (or the next start) can still replay it.
      if (sessions?.list === undefined) return
      rmSync(file, { force: true })
      const wanted = new Set(ids)
      for (const session of sessions.list()) {
        const id = (session as unknown as { id?: unknown }).id
        if (typeof id !== 'string' || !wanted.has(id)) continue
        try {
          if (presets.current(session) !== AUTO_PRESET) presets.set(session, AUTO_PRESET)
        } catch {
          /* best-effort */
        }
      }
    } catch {
      /* no snapshot, or a session raced away */
    }
  }

  /** Mount this row's shielded gate exactly once; failures dispose and report. */
  const mountGate = (): Promise<'applied' | 'waiting' | 'failed'> => {
    mountInFlight ??= (async () => {
      let outcome: 'applied' | 'waiting' | 'failed' = 'failed'
      await preserveAuto(async () => {
        const previous = lastGateFiber
        lastGateFiber = undefined
        gateReady = false
        if (previous !== undefined) {
          try {
            await previous.dispose()
          } catch (cause) {
            ctx.logger.info('model-switch: the previous auto-review gate had already unloaded; continuing with the new one')
            ctx.logger.info(String(cause))
          }
        }
        let failure: unknown
        let applied = false
        const fiber = scope.plugin(autoReviewGate(official, {
          onApplied: () => {
            applied = true
            // Bound from inside the gate's own apply, which has just registered
            // the review probe: the prepend order keeps this correlation ahead
            // of it even when the gate activates late.
            bindAutoReviewSessionCorrelation(scope, activeSession)
          },
          onFailure: error => { failure = error },
        }))
        try {
          await fiber
        } catch (cause) {
          failure ??= cause
        }
        if (failure !== undefined) {
          try {
            await (fiber as unknown as GateFiber).dispose()
          } catch { /* the failed fiber is already gone */ }
          ctx.logger.warn(`model-switch: the Auto reviewer gate did not mount (${String(failure)}); the displaced registration may still be releasing`)
          outcome = 'failed'
          return
        }
        if (!applied) {
          // The fiber waits for the official dependency list; the correlation
          // binds whenever the gate's apply actually runs.
          ctx.logger.info('model-switch: the official auto-review gate is waiting for its host services; the reviewer route override is not bound yet')
          outcome = 'waiting'
          return
        }
        const gate = fiber as unknown as GateFiber
        // Disposing the gate must release the Auto registration in its first
        // synchronous step: the loader does not await fiber disposal, and the
        // official row's re-activation during the same recompose must find the
        // slot free — otherwise its `registerAuto` fails with
        // `preset "auto" is already registered` and the plugin manager reports
        // the whole operation as 「停用失败」.
        const disposeGate = gate.dispose.bind(gate)
        ;(gate as unknown as { dispose: () => Promise<void> }).dispose = () => {
          presets.releaseForTakeover()
          return disposeGate()
        }
        lastGateFiber = gate
        gateReady = true
        outcome = 'applied'
      })
      return outcome
    })().finally(() => { mountInFlight = undefined })
    return mountInFlight
  }

  /** Make this row's Auto registration live; true once it is held. */
  const claim = async (): Promise<boolean> => {
    let held: boolean
    if (presets.registered) held = true
    else if (gateReady) held = presets.reclaimRegistration()
    else held = await mountGate() !== 'failed'
    autoReviewStatus.held = held
    // Replay the selection a previous release had to give up (hot recompose,
    // row unload). Runs only once the registration is held again, so the
    // preset is actually resolvable when the sessions are moved back.
    if (held) flushAutoSnapshot()
    return held
  }

  const seam: AutoReviewSeam = {
    yieldRegistration: () => {
      // Snapshot before releasing: the release itself is what moves the
      // sessions off Auto, and the reclaim that follows is asynchronous.
      persistAutoSnapshot()
      presets.releaseForTakeover()
    },
    claim,
    preserveAuto,
  }

  // Listeners first (a mid-flight official row is caught), then the startup
  // takeover: an instantiated official row is displaced and this row claims the
  // registration; without one the seam is claimed directly.
  const reclaim = installAutoReviewTakeover(ctx, seam)
  const entry = officialAutoReviewEntry(loaderOf(ctx))
  if (entry !== undefined && (entry as { readonly disabled?: boolean }).disabled !== true) {
    await reclaim(entry)
  } else {
    await claim()
  }
  if (!presets.registered) {
    autoReviewStatus.held = false
    ctx.logger.error('model-switch: the Auto registration is not held by this row, so Auto review runs without the configurable reviewer route; the reviewer path is shielded instead of failing tool calls. Restart DSH to converge the reviewer row — a hot install cannot always displace the official row in time')
  }
  // Belt-and-braces for the release. Registered last, so the reverse-order
  // teardown runs it first; the registration can also outlive the gate fiber
  // (a direct `reclaimRegistration()` claim), and its release must still land
  // in the synchronous prefix of this row's disposal — the official row's
  // re-activation in the same recompose must find the slot free, or its
  // `registerAuto` fails and the plugin manager reports 「停用失败」.
  ctx.effect(function* () {
    yield () => {
      // This row is being torn down (hot recompose, disable). Snapshot the Auto
      // selection first: the release below moves those sessions to the fallback
      // preset, and nothing of ours is left mounted to restore them in memory.
      persistAutoSnapshot()
      presets.releaseForTakeover()
    }
  }, 'model-switch: release the Auto registration before anything else')
}
