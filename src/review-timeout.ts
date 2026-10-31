/**
 * Configurable Auto-reviewer stream idle timeout.
 *
 * The reviewer call is a normal llm stream, so its idle watchdog is the one
 * `@deepseek-ai/dsh-llm-pi-ai` puts on the **provider profile**:
 * `providers.<id>.streamIdleTimeoutMs` (default 300 000 ms). There is no
 * per-request override — `GenerateOptions` carries no timeout fields and the
 * adapter reads the profile per call — so the only way to change the reviewer's
 * timeout is to write that provider-profile key.
 *
 * Consequences, all surfaced in the UI copy:
 *
 * - The key lives on the provider, so it applies to **every** call through that
 *   provider (reviewer, main chat, other routes), not only the reviewer.
 * - "Cancel the timeout" is legal only as the upstream ceiling
 *   (`MAX_TIMER_DELAY_MS` = 2147483647 ms ≈ 24.86 days); upstream rejects 0,
 *   negatives and Infinity, so the UI writes the ceiling and says so.
 * - The profile document is the durable copy. After writing it, the running
 *   pi-ai row is reloaded through the loader fiber so the value applies without
 *   a Host restart; that reload drops the provider's in-flight calls. When the
 *   reload cannot run (no live row, a vetoed update, a failed validation) the
 *   value still lands at the next Host start, and the status line says so.
 *
 * Restoring is symmetric: the value a provider carried before the first
 * overwrite is recorded in this plugin's own settings
 * (`autoReviewTimeoutPrevious`) and written back when the setting returns to
 * "follow the provider default", so clearing the setting never leaves an
 * adapter-written value behind.
 *
 * @module
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Entry, Loader } from '@deepseek-ai/cordis-plugin-loader'
import { applyFiberConfig } from './fiber-hot-update.js'
import type { ModelSwitchSettings } from './host-settings.js'
import { UPSTREAM_MAX_IDLE_TIMEOUT_MS } from './client-contract.js'

/** Cordis plugin identity; matches the `cordis.patch.yml` insert row id. */
export const name = 'model-switch-review-timeout'

/** This row needs the Host's settings service (for `documentPath` and our ns). */
export const inject = ['settings']

/** The pi-ai row whose provider profiles carry `streamIdleTimeoutMs`. */
export const PI_AI_ROW = 'llm-pi-ai'

/** The package the pi-ai row loads; matching by name survives a profile id rename. */
const PI_AI_PACKAGE = '@deepseek-ai/dsh-llm-pi-ai'

/** Live state surfaced next to the reviewer card through the capabilities RPC. */
export const reviewTimeoutStatus = {
  configuredMs: undefined as number | undefined,
  applied: [] as string[],
  skipped: [] as string[],
  /** Providers whose running row was reloaded with the new timeout. */
  hotApplied: [] as string[],
  /** Whether the running row took the value, or the next start has to. */
  hot: undefined as 'applied' | 'restart-required' | undefined,
  /** Why the running row did not take the value, when it did not. */
  hotReason: undefined as string | undefined,
}

/** One resolved write decision. */
export interface ReviewTimeoutPlan {
  /** Milliseconds to write per provider; undefined means "restore / follow default". */
  readonly timeoutMs: number | undefined
  /** Reviewer provider ids collected from the global route and every group. */
  readonly providers: readonly string[]
}

/**
 * Resolve the stored setting into concrete write values.
 *
 * Stored values are user intent: absent = follow the provider default, `0` =
 * cancelled (written as the upstream ceiling), anything else is clamped into
 * the upstream-legal range so a hand-edited profile cannot produce a rejected
 * value.
 *
 * @param settings - the plugin's current settings.
 * @returns the write value and the reviewer providers to apply it to.
 */
export function planReviewTimeout(settings: ModelSwitchSettings): ReviewTimeoutPlan {
  const raw = settings.autoReviewTimeoutMs
  const timeoutMs = raw === undefined
    ? undefined
    : raw <= 0
      ? UPSTREAM_MAX_IDLE_TIMEOUT_MS
      : Math.min(Math.floor(raw), UPSTREAM_MAX_IDLE_TIMEOUT_MS)
  const providers = new Set<string>()
  const add = (value: string | undefined): void => {
    const trimmed = (value ?? '').trim()
    if (trimmed !== '') providers.add(trimmed)
  }
  add(settings.autoReviewProvider)
  for (const group of Object.values(settings.providerGroups ?? {})) add(group.autoReviewProvider)
  return { timeoutMs, providers: [...providers] }
}

/** Why a provider was left untouched. */
export type ReviewTimeoutSkip = 'missing-row' | 'missing-provider' | 'unrecorded'

/** Result of one document patch attempt. */
export interface ReviewTimeoutPatch {
  readonly text: string
  readonly outcome: 'written' | 'unchanged' | ReviewTimeoutSkip
}

/** Escape a provider id for use inside a regular expression. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Set or remove one pi-ai provider's `streamIdleTimeoutMs` in the profile
 * document, touching only that provider's block.
 *
 * The pi-ai row's layout is fixed by its schema: the provider sits at six
 * spaces under `providers:`, its fields at eight. The patch inserts the key at
 * the top of the provider block, replaces it in place, or removes it, and never
 * touches another provider or row.
 *
 * @param text - the full profile document.
 * @param provider - the pi-ai provider id.
 * @param timeoutMs - the value to write, or undefined to remove the key.
 * @returns the patched text and what happened.
 */
export function patchProviderIdleTimeout(text: string, provider: string, timeoutMs: number | undefined): ReviewTimeoutPatch {
  const rows = text.split(/(?=^- id: )/m)
  const index = rows.findIndex(row => new RegExp(`^- id: ${escapeRegExp(PI_AI_ROW)}\\r?$`, 'm').test(row.split('\n', 1)[0] ?? ''))
  if (index < 0) return { text, outcome: 'missing-row' }
  const row = rows[index] as string
  const providerRe = new RegExp(`^( {6})(${escapeRegExp(provider)}):(\\r?)$`, 'm')
  const match = providerRe.exec(row)
  if (match === null) return { text, outcome: 'missing-provider' }
  const blockStart = match.index + match[0].length
  // The provider block runs until the next line indented six spaces or less.
  const bodyRe = /\r?\n {0,6}\S/g
  bodyRe.lastIndex = blockStart
  const bodyEnd = bodyRe.exec(row)?.index ?? row.length
  const block = row.slice(blockStart, bodyEnd)
  const idleRe = /^( {8})streamIdleTimeoutMs: *(\d+)(\r?)$/m
  const idleMatch = idleRe.exec(block)
  if (timeoutMs !== undefined) {
    if (idleMatch !== null) {
      if (Number(idleMatch[2]) === timeoutMs) return { text, outcome: 'unchanged' }
      // The match stops before the line's newline; keep the captured `\r` (or
      // its absence) so the replacement neither drops CRLF nor leaves a blank
      // line behind.
      const nextBlock = block.replace(idleRe, `${idleMatch[1]}streamIdleTimeoutMs: ${timeoutMs}${idleMatch[3]}`)
      rows[index] = row.slice(0, blockStart) + nextBlock + row.slice(bodyEnd)
      return { text: rows.join(''), outcome: 'written' }
    }
    const eol = match[3] === '\r' ? '\r\n' : '\n'
    // blockStart sits AT the provider line's `\n` (its `\r`, if any, went into
    // match[0]), and the provider's fields live at eight spaces — six is the
    // provider key's indent. Gluing the insert onto the provider line (no
    // newline, six spaces) is what made every second patch miss the provider.
    const nextBlock = `\n        streamIdleTimeoutMs: ${timeoutMs}${eol}${block.slice(1)}`
    rows[index] = row.slice(0, blockStart) + nextBlock + row.slice(bodyEnd)
    return { text: rows.join(''), outcome: 'written' }
  }
  if (idleMatch === null) return { text, outcome: 'unchanged' }
  // Take the line with its newline when possible, so repeated cycles do not
  // accumulate blank lines inside the provider block.
  const removeRe = /^ {8}streamIdleTimeoutMs: *\d+\r?\n/m
  const withoutLine = removeRe.test(block) ? block.replace(removeRe, '') : block.replace(idleRe, '')
  rows[index] = row.slice(0, blockStart) + withoutLine + row.slice(bodyEnd)
  return { text: rows.join(''), outcome: 'written' }
}

/**
 * Read a provider's current `streamIdleTimeoutMs` from the document.
 *
 * Used to record the pre-overwrite value so a later reset restores it.
 *
 * @param text - the full profile document.
 * @param provider - the pi-ai provider id.
 * @returns the value, or null when the key is absent.
 */
export function readProviderIdleTimeout(text: string, provider: string): number | null {
  const rows = text.split(/(?=^- id: )/m)
  const row = rows.find(candidate => candidate.startsWith(`- id: ${PI_AI_ROW}\n`) || candidate.startsWith(`- id: ${PI_AI_ROW}\r\n`))
  if (row === undefined) return null
  const match = new RegExp(`^ {6}${escapeRegExp(provider)}:\\r?\\n((?: {8}.*\\r?\\n)*)`, 'm').exec(row)
  if (match === null) return null
  const idle = /^ {8}streamIdleTimeoutMs: *(\d+)/m.exec(match[1] ?? '')
  return idle === null ? null : Number(idle[1])
}

/** Minimal settings-forms face this row uses; the Host provides the document path. */
interface SettingsFormsLike {
  readonly documentPath?: string | undefined
}

/**
 * Build the pi-ai row config with one provider's idle timeout set or removed.
 *
 * Pure: the caller decides whether to hand the result to the loader, and a shape
 * this function does not recognize returns `undefined` instead of a guess.
 *
 * @param config - the row's current config object.
 * @param provider - the pi-ai provider id inside `providers`.
 * @param timeoutMs - the value to set, or undefined to remove the key.
 * @returns the next config, or undefined when the current one is not an object.
 */
export function planProviderConfig(
  config: unknown,
  provider: string,
  timeoutMs: number | undefined,
): Record<string, unknown> | undefined {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) return undefined
  const base = config as Record<string, unknown>
  const providers = base.providers === null || typeof base.providers !== 'object' || Array.isArray(base.providers)
    ? {}
    : base.providers as Record<string, unknown>
  const current = providers[provider] === null || typeof providers[provider] !== 'object' || Array.isArray(providers[provider])
    ? {}
    : providers[provider] as Record<string, unknown>
  const nextProvider: Record<string, unknown> = { ...current }
  if (timeoutMs === undefined) delete nextProvider.streamIdleTimeoutMs
  else nextProvider.streamIdleTimeoutMs = timeoutMs
  return { ...base, providers: { ...providers, [provider]: nextProvider } }
}

/**
 * Find the loader row that owns the pi-ai provider profiles.
 *
 * @param loader - the Host loader service, when present.
 * @returns the row entry, or undefined when the profile does not load it.
 */
export function findPiAiEntry(loader: Loader | undefined): Entry | undefined {
  if (loader === undefined || typeof loader.entries !== 'function') return undefined
  for (const entry of loader.entries()) {
    if (entry.options?.name === PI_AI_PACKAGE || entry.id === PI_AI_ROW) return entry
  }
  return undefined
}

/**
 * Reload the pi-ai row so a changed timeout applies without a Host restart.
 *
 * The document write already happened; this is the runtime half. One reload
 * carries every provider that changed. A reload aborts the provider's in-flight
 * calls, which is why it only runs on an actual value change.
 *
 * @param loader - the Host loader service.
 * @param log - row logger for the one-line report.
 * @param providers - providers whose `streamIdleTimeoutMs` the document write changed.
 * @param timeoutMs - the value the document now carries, or undefined for a reset.
 */
async function pushHotTimeout(
  loader: Loader | undefined,
  log: { info(line: string): void; warn(line: string): void },
  providers: readonly string[],
  timeoutMs: number | undefined,
): Promise<void> {
  const entry = findPiAiEntry(loader)
  if (entry === undefined) {
    reviewTimeoutStatus.hot = 'restart-required'
    reviewTimeoutStatus.hotReason = 'the pi-ai row is not loaded'
    return
  }
  let config = entry.options?.config
  for (const provider of providers) {
    const next = planProviderConfig(config, provider, timeoutMs)
    if (next === undefined) {
      reviewTimeoutStatus.hot = 'restart-required'
      reviewTimeoutStatus.hotReason = 'the pi-ai row config is not an object'
      return
    }
    config = next
  }
  const result = await applyFiberConfig(entry, config)
  const label = timeoutMs === undefined ? 'reset (provider defaults restored)' : `${timeoutMs}ms`
  if (result.outcome === 'updated') {
    reviewTimeoutStatus.hot = 'applied'
    reviewTimeoutStatus.hotReason = undefined
    for (const provider of providers) if (!reviewTimeoutStatus.hotApplied.includes(provider)) reviewTimeoutStatus.hotApplied.push(provider)
    log.info(`model-switch: reloaded ${PI_AI_ROW} so the review timeout (${label}) applies now to [${providers.join(', ')}]; its in-flight calls were dropped`)
    return
  }
  reviewTimeoutStatus.hot = 'restart-required'
  reviewTimeoutStatus.hotReason = result.outcome === 'failed'
    ? result.error ?? 'reload failed'
    : result.outcome === 'no-fiber' ? 'the pi-ai row has no live instance' : 'the pi-ai row is mid-transition'
  if (result.outcome === 'failed') log.warn(`model-switch: the pi-ai reload for the review timeout failed (${reviewTimeoutStatus.hotReason}); the value applies after a Host restart`)
}

/**
 * Row entry point: apply the configured timeout to the reviewer providers'
 * pi-ai profiles in the profile document.
 *
 * Every failure is contained and logged; a broken document must never take the
 * Host down. The write is idempotent: replays find the value already in place
 * and do nothing.
 *
 * @param ctx - this row's context.
 */
export function apply(outer: Context): void {
  // Optional dependency: a hard `inject` turns one missing provider into a
  // permanently pending row that also blocks everything composed after it, while
  // a bare `ctx.get` never resolves outside a dependent scope. The scoped inject
  // waits without blocking composition and hands this code a context that can
  // read the service.
  outer.inject(['modelSwitch'], (ctx: Context) => {
    const runtime = ctx.modelSwitch
  const log = ctx.logger
  const execute = async (): Promise<void> => {
    reviewTimeoutStatus.configuredMs = undefined
    reviewTimeoutStatus.applied = []
    reviewTimeoutStatus.skipped = []
    reviewTimeoutStatus.hotApplied = []
    reviewTimeoutStatus.hot = undefined
    reviewTimeoutStatus.hotReason = undefined
    const settings = runtime.currentSettings()
    const plan = planReviewTimeout(settings)
    reviewTimeoutStatus.configuredMs = settings.autoReviewTimeoutMs
    if (plan.providers.length === 0) return
    const forms = ctx.get('settings', true) as SettingsFormsLike | undefined
    const documentPath = forms?.documentPath
    if (forms === undefined || typeof documentPath !== 'string' || documentPath === '') {
      reviewTimeoutStatus.skipped.push(...plan.providers)
      log.warn('model-switch: no profile document is reachable; the review timeout write is skipped')
      return
    }
    try {
      const { readFile, writeFile } = await import('node:fs/promises')
      let text = await readFile(documentPath, 'utf8')
      let changed = false
      const changedProviders: string[] = []
      for (const provider of plan.providers) {
        // `timeoutMs === undefined` means "follow the provider default", which is
        // exactly the absence of the key — this adapter owns that key on the
        // reviewer routes, so removing it is the reset. No history is consulted:
        // the settings service does not reliably round-trip our bookkeeping, and a
        // reset that depends on it can leave the key orphaned.
        const patched = patchProviderIdleTimeout(text, provider, plan.timeoutMs)
        if (patched.outcome === 'written') { text = patched.text; changed = true; changedProviders.push(provider) }
        if (patched.outcome === 'written' || patched.outcome === 'unchanged') reviewTimeoutStatus.applied.push(provider)
        else reviewTimeoutStatus.skipped.push(provider)
      }
      if (changed) await writeFile(documentPath, text, 'utf8')
      log.info(`model-switch: review timeout ${plan.timeoutMs === undefined ? 'reset (provider defaults restored)' : `${plan.timeoutMs}ms`} applied to [${reviewTimeoutStatus.applied.join(', ')}]; skipped [${reviewTimeoutStatus.skipped.join(', ')}]`)
      // Runtime half: reload the running pi-ai row so the change does not wait for
      // the next Host start. Fire-and-forget on purpose — this row must never hold
      // the loader settle open, and an idempotent replay has nothing to reload.
      if (changedProviders.length > 0) {
        void pushHotTimeout(ctx.get('loader', false) as Loader | undefined, log, changedProviders, plan.timeoutMs)
      }
    } catch (cause: unknown) {
      log.warn(`model-switch: the review timeout write failed (${String(cause)})`)
    }
  }
  // Serialize the runs: the immediate call, the late sweep and the service
  // event can overlap, and two overlapping runs would both read "no recorded
  // value" and record the value the other one just wrote.
  let pending: Promise<void> | undefined
  const run = (): Promise<void> => {
    if (pending !== undefined) return pending
    const next = execute().finally(() => {
      if (pending === next) pending = undefined
    })
    pending = next
    return next
  }
  // Never await here: a settings write during loader settle deadlocks the whole
  // boot (the headless profile then never finishes and the CLI exits with an
  // unsettled top-level await). Fire it, then retry once the settings service is
  // live — the same fire-and-forget shape the memory adapter uses.
  void run()
  const lateSweep = setTimeout(() => { void run() }, 1_500)
  const offService = ctx.on('internal/service', (name: unknown) => {
    if (name === 'settings') void run()
  })
  ctx.effect(function* () {
    yield () => {
      offService()
      clearTimeout(lateSweep)
    }
    yield ctx.on('model-switch/settings-update', () => { void run() })
  }, 'model-switch: keep the review timeout write aligned with the settings')
  })
}
