/**
 * Apply a provider's saved capability group whenever the seat session's
 * provider changes — on any switch surface.
 *
 * The official model-selection directory projects the Session's durable
 * `model/selection` events into `store.current` (the sole emitter of those
 * events is the `session.selectModel` RPC), so a switch performed through the
 * TUI or any other client lands in the same store this plugin already reads.
 * One watcher therefore covers every surface for sessions open in this Web
 * UI, where the previous wiring only covered this plugin's own two call sites.
 *
 * Semantics stay exactly as before: a provider change applies the target
 * provider's group when one exists; a provider without a group, a same-model
 * change within one provider, and the subscription baseline itself write
 * nothing. A failed apply is reported and never disturbs the switch.
 */

import type { ModelSelection } from '@deepseek-ai/dsh-api-session-controller/types'

/** The directory store slice the watcher observes. */
export interface DirectoryWatchSource {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => { current: ModelSelection | null }
}

export interface ProviderGroupWatchOptions {
  source: DirectoryWatchSource
  /** Adopt the target provider's saved group; a group-less provider must write nothing. */
  apply: (provider: string) => Promise<void>
  /** Reported apply failure; defaults to a console warning. */
  onFailure?: (error: unknown) => void
}

export interface ProviderGroupWatch {
  /** Detach from the store; in-flight applies are left to finish. */
  dispose: () => void
}

/**
 * Watch one directory store and apply groups on provider changes.
 *
 * - The first observed provider (or the one already loaded) is the baseline
 *   and never triggers a write, so mounting and initial load stay silent.
 * - Applies are serialized: a change arriving mid-apply coalesces to the
 *   latest target and runs once the current apply finishes, so two writes
 *   never interleave pair writes.
 * - `current` being null (catalog still loading) is ignored, not a change.
 * @param options - the store to watch and the apply to run.
 * @returns the watch handle.
 */
export function createProviderGroupWatch(options: ProviderGroupWatchOptions): ProviderGroupWatch {
  const onFailure = options.onFailure ?? ((error: unknown): void => {
    console.warn('dsh-model-switch: provider group apply failed', error)
  })
  // No provider observed yet: the store is still loading, and the first
  // non-null observation only completes the baseline — mounting and initial
  // load never write.
  let baselined = false
  let lastSeen: string | undefined
  const initial = options.source.getSnapshot().current
  if (initial !== null) {
    baselined = true
    lastSeen = initial.provider
  }
  let running = false
  let pending: string | undefined
  const run = async (provider: string): Promise<void> => {
    running = true
    try {
      await options.apply(provider)
    } catch (error) {
      onFailure(error)
    } finally {
      running = false
      if (pending !== undefined) {
        const next = pending
        pending = undefined
        void run(next)
      }
    }
  }
  const check = (): void => {
    const current = options.source.getSnapshot().current
    if (current === null) return
    if (!baselined) {
      baselined = true
      lastSeen = current.provider
      return
    }
    if (current.provider === lastSeen) return
    lastSeen = current.provider
    if (running) {
      pending = current.provider
      return
    }
    void run(current.provider)
  }
  const unsubscribe = options.source.subscribe(check)
  return { dispose: unsubscribe }
}
