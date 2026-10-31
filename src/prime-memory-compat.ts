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
export const inject = ['loader', 'settings']

/** The loader row id prime-memory is composed under (fixed by its bundle patch). */
const MEMORY_ENTRY_ID = 'dsh-memory'

/** Why the adapter stayed out of the way. */
export type PrimeMemoryRouteSkip = 'user-set' | 'no-route' | 'no-row' | 'no-service' | 'no-seam' | 'live-rejected'

/** Live adapter state, surfaced next to the settings card. */
export interface PrimeMemoryCompatStatus {
  /** Whether at least one write reached the memory plugin's settings. */
  installed: boolean
  /** The `provider/model` written on the last pass. */
  route?: string | undefined
  /** Why the route was not written, when it was not. */
  routeSkipped?: PrimeMemoryRouteSkip | undefined
  /** How many settings-update replays this adapter has run (diagnostics). */
  replays: number
}

/** The state the settings page reads. */
export const primeMemoryCompatStatus: PrimeMemoryCompatStatus = { installed: false, replays: 0 }

/** The settings-forms seam the memory plugin itself writes through. */
interface SettingsForms {
  describe?(options?: { redactSecrets?: boolean }): readonly SettingsDescriptor[]
  get?(name: string): unknown
  update?(name: string, patch: unknown, expectedRevision?: number): Promise<void>
  /** The profile patch file the native configuration editor shows. */
  readonly documentPath?: string
}

/**
 * Write the memory row's static route into the profile patch itself.
 *
 * `settings.update` only accepts the entry's *live* schema fields, so the static
 * `llm` pin never survives that call. The pin is what `resolveModelRoute` returns
 * first, and it is the only key every distillation layer honours — so it has to be
 * written where the next start reads it: the row config in the profile document.
 * @param documentPath - the profile patch file.
 * @param provider - route provider to pin.
 * @param model - route model to pin.
 * @returns whether the document changed.
 */
/**
 * Remove this plugin's own static pin from the memory row.
 *
 * `effectiveCfg` (dsh-prime-memory `pipeline/runner.js`) treats a non-empty
 * `cfg.llm.provider + cfg.llm.model` pair as "pinned" and then ignores *both* the runtime
 * chain and the legacy `distillProvider`/`distillModel` pair. A pin written earlier — for a
 * host whose live RPC was not ready yet — is therefore not harmless: it keeps winning over
 * every later live push, which is exactly the "the card changed, the calls did not" report.
 * Once a live push is confirmed, the pin has to go.
 *
 * @param documentPath - the profile patch document that holds the memory row.
 * @returns what happened, so the caller can log it without guessing.
 */
export async function clearStaticPin(documentPath: string): Promise<'cleared' | 'absent' | 'missing'> {
  const { readFile, writeFile } = await import('node:fs/promises')
  let text: string
  try {
    text = await readFile(documentPath, 'utf8')
  } catch {
    return 'missing'
  }
  const rows = text.split(/(?=^- id: )/m)
  const index = rows.findIndex(row => /^- id: dsh-memory\r?\n/.test(row))
  if (index < 0) return 'missing'
  const row = rows[index] as string
  const trimmed = row.replace(/^ {4}llm:\r?\n(?: {6}.*\r?\n)*/m, '')
  if (trimmed === row) return 'absent'
  rows[index] = trimmed
  try {
    await writeFile(documentPath, rows.join(''), 'utf8')
  } catch {
    return 'missing'
  }
  return 'cleared'
}

export async function writeStaticPin(
  documentPath: string,
  provider: string,
  model: string,
): Promise<'written' | 'unchanged' | 'missing'> {
  const { readFile, writeFile } = await import('node:fs/promises')
  let text: string
  try {
    text = await readFile(documentPath, 'utf8')
  } catch {
    return 'missing'
  }
  const rows = text.split(/(?=^- id: )/m)
  const index = rows.findIndex(row => /^- id: dsh-memory\r?\n/.test(row))
  if (index < 0) return 'missing'
  const row = rows[index] as string
  const desired = `    llm:\n      provider: ${provider}\n      model: ${model}\n`
  let next: string
  if (/^ {4}llm:\r?\n(?: {6}.*\r?\n)*/m.test(row)) {
    next = row.replace(/^ {4}llm:\r?\n(?: {6}.*\r?\n)*/m, desired)
  } else if (/^ {2}config:\r?\n/m.test(row)) {
    next = row.replace(/^ {2}config:\r?\n/m, `  config:\n${desired}`)
  } else {
    next = row.replace(/^- id: dsh-memory\r?\n/m, `- id: dsh-memory\n  config:\n${desired}`)
  }
  if (next === row) return 'unchanged'
  rows[index] = next
  try {
    await writeFile(documentPath, rows.join(''), 'utf8')
  } catch {
    return 'missing'
  }
  return 'written'
}

/** One settings form descriptor, as the host reports it. */
interface SettingsDescriptor {
  ns: string
  value?: unknown
  revision?: number
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

/** What this adapter needs from the host web server, to reach the plugin's own RPC. */
interface WebServerLike {
  port?: number
  address?: { port?: number }
}

/** The endpoint the memory plugin registers for its own runtime settings writes. */
const MEMORY_RPC_PATH = '/dsh-memory/rpc/settings-set'

/**
 * Whether the memory row's live section already carries exactly our route.
 *
 * The RPC write path persists the live section to the profile document on every
 * call, and a document change reloads the composition — so pushing an unchanged
 * route re-triggers this adapter forever (a ~6 s recompose loop, observed with
 * `dsh-prime-memory@0.26.10`). Comparing first is what makes the push idempotent
 * across reloads.
 *
 * @param value - the memory row's live settings object, as the forms describe it.
 * @param provider - route provider to compare against.
 * @param model - route model to compare against.
 * @returns true when a push would change nothing.
 */
export function memoryLiveMatchesRoute(value: unknown, provider: string, model: string): boolean {
  const outer = value === null || typeof value !== 'object' ? undefined : (value as Record<string, unknown>)
  if (outer === undefined) return false
  // The forms descriptor hands back either the live section itself or the whole
  // row config (`{ llm, live }`); accept both, or the idempotence guard never
  // matches and every activation re-pushes (a rewrite/reload loop).
  const inner = outer.live
  const live = (inner !== null && typeof inner === 'object' ? inner : outer) as Record<string, unknown>
  if (live.distillProvider !== provider || live.distillModel !== model) return false
  const chain = live.distillChain
  if (Array.isArray(chain) && chain.length !== 0) return false
  const layers = live.distillLayerChains
  if (layers === null || typeof layers !== 'object') return false
  for (const key of ['l1', 'l2', 'l3']) {
    const layer = (layers as Record<string, unknown>)[key]
    if (!Array.isArray(layer) || layer.length !== 1) return false
    const first = layer[0] as Record<string, unknown> | undefined
    if (first === undefined || first.provider !== provider || first.model !== model) return false
  }
  return true
}

/**
 * Hand the route to the memory plugin through the RPC it registers for its own
 * settings page.
 *
 * Writing the config document (what `settings.update` does) only changes what the
 * next start reads; the plugin resolves its route from the runtime settings object
 * it built at `apply`. This endpoint is the documented runtime write path — the
 * same one its own "distillation parameters" panel posts to — so it takes effect
 * without a restart, which is exactly what a provider switch needs.
 */
export async function pushMemoryRoute(
  ctx: Context,
  route: { provider: string; model: string },
): Promise<'pushed' | 'absent' | 'rejected'> {
  const server = ctx.get('webServer', false) as WebServerLike | undefined
  const port = server?.port ?? server?.address?.port
  if (typeof port !== 'number' || port <= 0) return 'absent'
  try {
    const response = await fetch(`http://127.0.0.1:${port}${MEMORY_RPC_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        // `effectiveCfg` (runner.js:47) decides in this order: a static
        // `cfg.llm.provider+model` pair ("pinned") disables every chain form,
        // a non-empty `distillChain` takes over, and only while neither is set
        // does `distillProvider`/`distillModel` supply the route. Sending both a
        // chain and a pin therefore cancelled itself: the pin disabled the chain
        // and this payload used to clear the pair that would have survived.
        // So: no chain here, and the legacy pair carries the route.
        distillChain: [],
        // Layer chains survive a pinned-free profile too (`lc && !pinned`), and
        // they are what the layered pipelines read first, so they stay.
        distillLayerChains: {
          l1: [{ provider: route.provider, model: route.model }],
          l2: [{ provider: route.provider, model: route.model }],
          l3: [{ provider: route.provider, model: route.model }],
        },
        distillProvider: route.provider,
        distillModel: route.model,
        reasoningEffort: '',
      }),
    })
    if (response.status === 404 || response.status === 405 || response.status === 403) return 'absent'
    return response.ok ? 'pushed' : 'rejected'
  } catch {
    return 'absent'
  }
}

/** The endpoint the memory plugin registers for its own runtime settings reads. */
const MEMORY_RPC_GET_PATH = '/dsh-memory/rpc/settings-get'

/**
 * Read the memory plugin's live settings through the RPC its panel posts to.
 *
 * The `settings` forms descriptors are an internal detail of the plugin: on
 * `dsh-prime-memory@0.26.16` this row could not observe them, which skipped every
 * push and left the plugin on its own deployment default. Its RPC is the surface
 * its own panel uses, so reading there keeps the adapter working across plugin
 * releases — and it is what makes the push idempotent across document reloads.
 * @param ctx - this row's context; the host web server supplies the port.
 * @returns The live settings object, or undefined when the seam is unreachable.
 */
export async function readMemoryLive(ctx: Context): Promise<unknown> {
  const server = ctx.get('webServer', false) as WebServerLike | undefined
  const port = server?.port ?? server?.address?.port
  if (typeof port !== 'number' || port <= 0) return undefined
  try {
    const response = await fetch(`http://127.0.0.1:${port}${MEMORY_RPC_GET_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method: 'settings-get' }),
    })
    if (!response.ok) return undefined
    const body = await response.json() as { value?: { settings?: unknown } } | undefined
    return body?.value?.settings
  } catch {
    return undefined
  }
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

/** The `settings` service the memory plugin itself writes through. */
function formsOf(ctx: Context): SettingsForms | undefined {
  try {
    return ctx.get('settings', false) as SettingsForms | undefined
  } catch {
    return undefined
  }
}

/** Live attempts to spend before falling back to the static pin. */
const PIN_AFTER_ATTEMPTS = 4

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
  let pending: Promise<void> | undefined
  let attempt = 0
  const timers: ReturnType<typeof setTimeout>[] = []

  const primeMemoryEntry = (): Entry | undefined => {
    for (const entry of loader?.entries?.() ?? []) if (isPrimeMemoryRow(entry)) return entry
    return undefined
  }
  const memoryRowPresent = (): boolean => primeMemoryEntry() !== undefined

  /** The live section the memory plugin registered, read back through the host. */
  const sectionOf = (forms: SettingsForms): SettingsDescriptor | undefined => {
    try {
      return (forms.describe?.({ redactSecrets: true }) ?? []).find((item) => item.ns === MEMORY_ENTRY_ID)
    } catch {
      return undefined
    }
  }

  const scheduleRetry = (): void => {
    if (attempt >= 8) return
    const delay = Math.min(4_000, 200 * 2 ** attempt)
    attempt += 1
    const timer = setTimeout(() => { void run() }, delay)
    timer.unref?.()
    timers.push(timer)
  }

  /**
   * Last resort for a host whose live seams never accept the route.
   *
   * Writing the static pin disables every live form (`pinned` in `effectiveCfg`), so it must
   * not happen while the live attempts still have a chance: a pin written on a slow start is
   * what kept overriding later pushes. It therefore waits for the retry budget to run out.
   *
   * @param forms - the settings service describing the memory row.
   * @param provider - route provider to pin.
   * @param model - route model to pin.
   * @param wanted - `provider/model`, for the log line.
   */
  const pinAsFallback = async (
    forms: SettingsForms,
    provider: string,
    model: string,
    wanted: string,
  ): Promise<void> => {
    if (attempt < PIN_AFTER_ATTEMPTS) {
      scheduleRetry()
      return
    }
    const documentPath = forms.documentPath
    if (typeof documentPath !== 'string' || documentPath === '') return
    try {
      if ((await writeStaticPin(documentPath, provider, model)) === 'written')
        ctx.logger.info(`model-switch: pinned the dsh-prime-memory distillation route to ${wanted} after ${attempt} live attempts (applies from the next start)`)
    } catch (cause: unknown) {
      ctx.logger.warn(`model-switch: could not pin the dsh-prime-memory route (${String(cause)})`)
    }
  }

  /**
   * Drop a pin left over from an earlier release.
   *
   * A static `llm.provider/model` pin sets `pinned`, which makes the plugin's
   * `effectiveCfg` ignore the chain *and* the live pair, so the live route decides
   * nothing on that host until the pin is gone.
   * @param forms - the settings seam, when this host exposes it.
   */
  const clearStalePin = async (forms: SettingsForms | undefined): Promise<void> => {
    const pinnedDocument = forms?.documentPath
    if (typeof pinnedDocument !== 'string' || pinnedDocument === '') return
    try {
      if ((await clearStaticPin(pinnedDocument)) === 'cleared')
        ctx.logger.info('model-switch: removed the stale dsh-prime-memory static pin; the live route decides now')
    } catch (cause: unknown) {
      ctx.logger.warn(`model-switch: could not clear the dsh-prime-memory static pin (${String(cause)})`)
    }
  }

  /**
   *
   * The plugin builds that section inside its own `apply` (`settings.register`), so
   * a write issued before that point lands in a section nobody reads — the reason
   * an unverified "write once at mount" pass left it on the deployment default.
   * Writing only once the section is visible, and verifying by reading the chain
   * back, is what makes this measurable instead of hopeful.
   */
  const run = async (): Promise<void> => {
    if (pending !== undefined) return pending
    if (!memoryRowPresent()) {
      primeMemoryCompatStatus.routeSkipped = 'no-row'
      return
    }
    const route = routeOf()
    const provider = text(route?.provider)
    const model = text(route?.model)
    if (provider === '' || model === '') {
      primeMemoryCompatStatus.routeSkipped = 'no-route'
      return
    }
    const wanted = `${provider}/${model}`
    const forms = formsOf(ctx)
    // Read the live section first, through the plugin's own RPC. The previous order
    // gated every push behind the `settings` forms descriptors, so a plugin release
    // that no longer exposes them (0.26.16) silently skipped the push entirely —
    // the plugin then kept its deployment default while our card showed a route.
    // Reading there also keeps the push idempotent: an unchanged route must not
    // rewrite the document, because every document change reloads the composition
    // and re-enters this adapter (an observed ~6 s recompose loop).
    const live = await readMemoryLive(ctx)
    if (live === undefined) {
      primeMemoryCompatStatus.routeSkipped = 'no-route'
      scheduleRetry()
      return
    }
    if (memoryLiveMatchesRoute(live, provider, model)) {
      adoptedRoute = wanted
      primeMemoryCompatStatus.installed = true
      primeMemoryCompatStatus.route = wanted
      delete primeMemoryCompatStatus.routeSkipped
      await clearStalePin(forms)
      return
    }
    // A chain the user set themselves stays; a chain this adapter wrote on an
    // earlier pass does not. After a reload the two look identical, so the only
    // safe comparison is against the route adopted in this session: matching the
    // declared pair is what lets a settings change push the new pair instead of
    // being read as hand-written intent.
    const declared = chainOf(live)
    const declaredRoute = declared.length > 0 ? `${text(declared[0]?.provider)}/${text(declared[0]?.model)}` : ''
    if (declaredRoute !== '' && declaredRoute !== wanted && declaredRoute !== adoptedRoute) {
      primeMemoryCompatStatus.routeSkipped = 'user-set'
      primeMemoryCompatStatus.route = undefined
      return
    }
    // The plugin resolves its route from the runtime settings object it built at
    // `apply`, so a document write alone stays invisible until the next start.
    // Its own settings RPC is the runtime write path — the one its panel posts to —
    // and it is the only seam that makes a provider switch take effect immediately.
    const pushed = await pushMemoryRoute(ctx, { provider, model })
    if (pushed === 'pushed') {
      // A 200 is not proof of a write: a route guarded by the host session answers
      // 200 while silently dropping the payload, so the read-back is the only
      // acceptance signal this adapter is allowed to trust.
      const after = await readMemoryLive(ctx)
      if (after !== undefined && memoryLiveMatchesRoute(after, provider, model)) {
        adoptedRoute = wanted
        attempt = 0
        primeMemoryCompatStatus.installed = true
        primeMemoryCompatStatus.route = wanted
        delete primeMemoryCompatStatus.routeSkipped
        await clearStalePin(forms)
        return
      }
      primeMemoryCompatStatus.routeSkipped = 'live-rejected'
    }
    // Below here the RPC was absent, refused, or answered without writing: fall
    // back to the settings forms write, and from there to the static pin that
    // survives a restart.
    if (forms === undefined || forms.update === undefined || forms.describe === undefined) {
      primeMemoryCompatStatus.routeSkipped = 'no-route'
      scheduleRetry()
      return
    }
    const section = sectionOf(forms)
    if (section === undefined || asRecord(section.value) === undefined) {
      await pinAsFallback(forms, provider, model, wanted)
      return
    }
    // The user-set guard above already ran against the live section, so this pass
    // only has to merge our pair into whatever the document carries.
    const chain = planDistillChain({ provider, model }, chainOf(section.value))
    pending = forms.update(MEMORY_ENTRY_ID, distillChainPatch(chain), section.revision)
      .then(async () => {
        const applied = chainOf(sectionOf(forms)?.value)
        const appliedRoute = applied.length > 0 ? `${text(applied[0]?.provider)}/${text(applied[0]?.model)}` : ''
        if (appliedRoute !== wanted) {
          await pinAsFallback(forms, provider, model, wanted)
          return
        }
        adoptedRoute = wanted
        attempt = 0
        primeMemoryCompatStatus.installed = true
        primeMemoryCompatStatus.route = wanted
        delete primeMemoryCompatStatus.routeSkipped
      })
      .catch(async (cause: unknown) => {
        primeMemoryCompatStatus.routeSkipped = 'no-route'
        ctx.logger.warn(`model-switch: could not write the dsh-prime-memory distillation route (${String(cause)})`)
        await pinAsFallback(forms, provider, model, wanted)
      })
      .finally(() => { pending = undefined })
    return pending
  }

  const replay = (): boolean => {
    primeMemoryCompatStatus.replays += 1
    void run()
    return true
  }

  void run()

  const offPatch = ctx.on('loader/patch-context', function (this: unknown, first: unknown, second?: unknown) {
    const nextFn = (typeof first === 'function' ? first : second) as (() => unknown) | undefined
    const candidate = typeof first === 'function' ? this : first
    if (isPrimeMemoryRow(candidate as Entry | undefined)) void run()
    return nextFn === undefined ? undefined : nextFn()
  })
  const offInit = ctx.on('loader/entry-init', function (this: unknown, first?: unknown) {
    const candidate = (this ?? first) as Entry | undefined
    if (candidate !== undefined && isPrimeMemoryRow(candidate)) void run()
  })
  const offService = ctx.on('internal/service', (name: unknown) => {
    if (name === 'settings') void run()
  })
  const lateSweep = setTimeout(() => { void run() }, 1_500)
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
 * Row entry point: adapt the memory plugin on activation and on remount.
 * @param ctx - this row's context.
 */
export function apply(ctx: Context): void {
  // Optional dependencies on purpose: a hard inject on this row leaves it pending
  // whenever a provider row is absent, and a pending row blocks every row composed
  // after it. A scoped ctx.inject waits without blocking the row — and unlike a
  // bare ctx.get it resolves: a service is visible only inside a scope that
  // depends on it. Both services are needed: the provider supplies the route, and
  // the web server is how the plugin's own runtime write path is reached (with a
  // plain ctx.get the push silently fell back to a document write that the running
  // plugin only reads on the next start).
  ctx.inject(['modelSwitch'], (withProvider: Context) => {
    withProvider.inject(['webServer'], (scope: Context) => scope.effect(() => {
      const runtime = scope.modelSwitch
      const loader = scope.get('loader', false) as Loader | undefined
      const routeOf = (): CapabilityRoute | undefined => memoryRouteOf(runtime.currentSettings(), defaultProviderOf(loader))
      const adapter = installPrimeMemoryCompat(scope, loader, routeOf)
      const off = scope.on('model-switch/settings-update', () => {
        if (adapter.replay()) scope.logger.info('model-switch: re-applied the dsh-prime-memory distillation route after a settings change')
      })
      return () => { off(); adapter.dispose() }
    }, 'model-switch: keep the dsh-prime-memory route aligned with the settings'))
  })
}
