/**
 * Compensate the Host's own deployment-default write after a Session-only
 * model switch.
 *
 * `session.selectModel` installs the Session selection and, on Hosts that
 * persist a selection as the deployment default, also writes that default.
 * The plugin switches a Session only, so the captured Main default is restored
 * afterwards.
 *
 * That Host write is fenced by a settings revision, and its timing is not part
 * of the released contract: the 0.1.x generation awaited the default write
 * before its RPC resolved, while the 0.2.x generation fires it without
 * awaiting. A fixed `captured + 1` fence therefore either refuses the restore
 * or silently leaves the default switched. Poll-by-revision is used instead:
 * wait for the observed revision to leave the captured one, then fence on the
 * revision actually observed.
 */

import type { SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { MainSettingsView } from '../../client-contract.ts'

/** Bound on how long the unawaited Host default write is awaited. */
const DEFAULT_WRITE_WAIT_MS = 750

/** The Main Settings namespace surface this module needs. */
export interface MainDefaultForm {
  getSnapshot(): ConfigFormSnapshot<MainSettingsView>
  subscribe(listener: () => void): () => void
  mutate(ops: readonly SettingsPathOpView[], expectedRevision?: number): Promise<boolean>
}

/** Outcome of one compensation attempt. */
export interface MainDefaultRestore {
  /** The captured Main default is the effective one again (or no write occurred). */
  restored: boolean
  /** A newer revision won instead; the concurrent edit is left untouched. */
  conflict: boolean
}

export interface MainDefaultRestoreOptions {
  /** Timeout primitive; tests inject a deterministic one. */
  wait?: (ms: number) => Promise<void>
  /** How long to await the unawaited Host default write. */
  timeoutMs?: number
  /** Total fences, including one retry after a concurrent revision change. */
  attempts?: number
}

function defaultWait(ms: number): Promise<void> {
  return new Promise(resolve => { setTimeout(resolve, ms) })
}

/** A fenced snapshot: ready, Host-synced, writable, with a concrete revision. */
function fenced(
  snapshot: ConfigFormSnapshot<MainSettingsView>,
): { revision: number; value: MainSettingsView } | undefined {
  if (snapshot.status !== 'ready' || snapshot.mode !== 'host' || !snapshot.writable) return undefined
  if (snapshot.value === undefined || snapshot.revision === undefined) return undefined
  return { revision: snapshot.revision, value: snapshot.value }
}

/** Field writes restoring one complete Main selection; the Host replaces the section. */
export function mainDefaultOps(selection: MainSettingsView): SettingsPathOpView[] {
  return [
    { op: 'set', path: ['provider'], value: selection.provider },
    { op: 'set', path: ['model'], value: selection.model },
    selection.reasoningEffort === undefined || selection.reasoningEffort === ''
      ? { op: 'unset', path: ['reasoningEffort'] }
      : { op: 'set', path: ['reasoningEffort'], value: selection.reasoningEffort },
  ]
}

/** An effort never leaks across a comparison: absent and cleared are the same selection. */
function sameMainSelection(left: MainSettingsView | undefined, right: MainSettingsView): boolean {
  if (left === undefined) return false
  const leftEffort = left.reasoningEffort === undefined || left.reasoningEffort === '' ? undefined : left.reasoningEffort
  const rightEffort = right.reasoningEffort === undefined || right.reasoningEffort === '' ? undefined : right.reasoningEffort
  return left.provider === right.provider && left.model === right.model && leftEffort === rightEffort
}

/** Resolve as soon as the revision leaves `revision`, or after the bounded wait. */
function waitForAdvance(
  form: MainDefaultForm,
  revision: number,
  wait: (ms: number) => Promise<void>,
  timeoutMs: number,
): Promise<ConfigFormSnapshot<MainSettingsView>> {
  const current = form.getSnapshot()
  if (current.revision !== revision) return Promise.resolve(current)
  return new Promise(resolve => {
    let settled = false
    const finish = (snapshot: ConfigFormSnapshot<MainSettingsView>): void => {
      if (settled) return
      settled = true
      unsubscribe()
      resolve(snapshot)
    }
    const unsubscribe = form.subscribe(() => {
      const next = form.getSnapshot()
      if (next.revision !== revision) finish(next)
    })
    void wait(timeoutMs).then(() => { finish(form.getSnapshot()) })
  })
}

/**
 * Restore the Main default captured before a Session-only model switch.
 *
 * Never throws and never blocks a Plan answer: a failed compensation is
 * reported, not enforced, because the Session selection the human asked for is
 * already installed by the time this runs.
 *
 * @param form - the official Main Settings namespace form.
 * @param before - the snapshot captured before the switch.
 * @param options - wait/timeout/attempt overrides for tests.
 * @returns Whether the captured default stands again, and whether a newer edit won.
 */
export async function restoreMainDefault(
  form: MainDefaultForm,
  before: ConfigFormSnapshot<MainSettingsView>,
  options: MainDefaultRestoreOptions = {},
): Promise<MainDefaultRestore> {
  const captured = fenced(before)
  // No captured fence means this client cannot write the namespace either, so
  // the switch cannot have moved the default through this path.
  if (captured === undefined) return { restored: true, conflict: false }

  const wait = options.wait ?? defaultWait
  const timeoutMs = options.timeoutMs ?? DEFAULT_WRITE_WAIT_MS
  const attempts = Math.max(1, options.attempts ?? 2)

  // Wait for the Host's own default write before fencing against it.
  await waitForAdvance(form, captured.revision, wait, timeoutMs)
  const observed = fenced(form.getSnapshot())
  // Still the captured revision: this Host persisted no default, nothing to undo.
  if (observed === undefined) return { restored: true, conflict: false }
  if (observed.revision === captured.revision) return { restored: true, conflict: false }
  if (sameMainSelection(observed.value, captured.value)) return { restored: true, conflict: false }

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const snapshot = fenced(form.getSnapshot())
    if (snapshot === undefined) return { restored: false, conflict: false }
    if (sameMainSelection(snapshot.value, captured.value)) return { restored: true, conflict: false }
    const accepted = await form.mutate(mainDefaultOps(captured.value), snapshot.revision)
    if (accepted) return { restored: true, conflict: false }
    // A refusal that also moved the revision is a concurrent edit: retry against
    // the newer fence once, then leave the winner alone.
    if (form.getSnapshot().revision === snapshot.revision) return { restored: false, conflict: false }
  }
  return { restored: false, conflict: true }
}
