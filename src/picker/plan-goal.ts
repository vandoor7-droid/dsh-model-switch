/**
 * Hand a reviewed plan to the Host's goal domain before its review is answered.
 *
 * Goal state is owned by `@deepseek-ai/dsh-goal`: this module only drives the
 * released client remote (`ctx.remote.goals`), keeps no goal state of its own,
 * and never schedules continuation — `dsh-goal-round-driver` owns that. The
 * shape below mirrors the published remote face structurally so the plugin
 * neither imports generated client modules nor hard-requires the goal package
 * in a deployment that does not mount it.
 *
 * Goal creation is deliberately outside DSH's own goal surface ("Goal creation
 * remains outside this package"), so the published `remote.goals.create` is the
 * one seam this feature relies on; if a future Host drops it, the capability
 * reports `unsupported` instead of guessing another path.
 */

/** Compare-and-set identity of the current goal; carried by every live view. */
export interface GoalRef {
  readonly id: string
  readonly revision: number
}

/** Detached live view a client reads back from the goal remote. */
export interface GoalView extends GoalRef {
  readonly phase: 'active' | 'paused' | 'blocked' | 'complete'
  readonly activation: 'armed' | 'disarmed'
}

/** Envelope every generated remote method resolves to on the wire. */
export type GoalRemoteResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

/** The released `ctx.remote.goals` surface this feature uses. */
export interface GoalRemote {
  /** Create and arm a goal for the session's live Agent. */
  create(sessionId: string, request: { readonly objective: string }): Promise<GoalRemoteResult<{ readonly ref: GoalRef }>>
  /** Current goal for the session, absent before the first create and after a clear. */
  get(sessionId: string): Promise<GoalRemoteResult<GoalView | null | undefined>>
  /** Remove the current goal; its history stays in the session log. */
  clear(sessionId: string, ref: GoalRef): Promise<GoalRemoteResult<unknown>>
}

/** Outcome of setting a plan as the session's goal. */
export type GoalHandoff =
  | { readonly kind: 'created' }
  | { readonly kind: 'replaced' }
  /** The deployment mounts no goal service; the caller must not proceed. */
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'failed'; readonly code?: string; readonly message: string }

/**
 * Strip the gateway's transport prefix from a Host message.
 *
 * The goal service throws `GoalError`, and the RPC gateway relays a thrown
 * error as `code: "gateway/internal"` with the original text still in
 * `message`. Showing `gateway/internal: goal "…" already exists…` to a human
 * buries the only sentence that matters, so the prefix is removed here.
 */
function normalizeHostMessage(message: string): string {
  return message.replace(/^\s*gateway\/[a-z0-9-]+\s*:\s*/i, '').trim()
}

/**
 * Whether a refused goal call means "this session already has a goal".
 *
 * Two shapes reach here. A Host that returns the domain code says
 * `GOAL_ALREADY_EXISTS`; the gateway instead relays the thrown `GoalError` as
 * `gateway/internal` and keeps only the text, so the message itself has to be
 * recognised. The domain code is checked first and the text only decides the
 * message shape the Host is known to produce — a refusal for any other reason
 * must never clear the user's current goal.
 */
function isAlreadyExistsError(error: { readonly code: string, readonly message: string }): boolean {
  if (error.code === 'GOAL_ALREADY_EXISTS') return true
  return /already exists with phase/i.test(error.message)
}

/** Codes that describe the transport, not the goal domain. */
function isTransportCode(code: string): boolean {
  return code === 'GOAL_TRANSPORT' || code.startsWith('gateway/')
}

function failure<T>(result: GoalRemoteResult<T>, fallback: string): { code?: string, message: string } {
  if (result.ok) return { message: fallback }
  const { code, message } = result.error
  const text = normalizeHostMessage(message)
  const wording = text === '' ? fallback : text
  // A transport code says nothing a human can act on; keep it out of the card.
  return isTransportCode(code) ? { message: wording } : { code, message: wording }
}

/**
 * Run one remote call, turning a rejected promise into a refused envelope.
 *
 * Generated remotes normally resolve `{ ok: false }`, but a transport failure
 * (or an older Host that rejects instead of answering) must not escape as an
 * unhandled rejection: the card would lose its error state and the plan would
 * stay pending with no explanation.
 */
async function guarded<T>(
  call: () => Promise<GoalRemoteResult<T>>,
  fallback: string,
): Promise<GoalRemoteResult<T>> {
  try {
    return await call()
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error)
    const text = normalizeHostMessage(raw)
    return { ok: false, error: { code: 'GOAL_TRANSPORT', message: text === '' ? fallback : text } }
  }
}

/** Identity of the plan document under review, for its durable address. */
export interface PlanDocumentRef {
  /** Logged tool invocation that owns the plan; absent while only the review is pending. */
  readonly callId?: string
  /** Browser-unique pending request identity (the review card's key). */
  readonly requestKey: string
}

/**
 * Address the plan document exactly as the official opener does.
 *
 * A logged plan (`callId` present) resolves from `dsh-resource://plan/...`
 * for as long as the session log holds the call; before that the pending
 * review's own `dsh-resource://plan-review/...` address is the one that
 * opens its preview.
 *
 * @param sessionId - the session that owns the review.
 * @param ref - logged call identity plus the pending request key.
 * @returns The plan resource address.
 */
export function planDocumentAddress(sessionId: string, ref: PlanDocumentRef): string {
  const encode = encodeURIComponent
  return ref.callId === undefined
    ? `dsh-resource://plan-review/${encode(sessionId)}/${encode(ref.requestKey)}`
    : `dsh-resource://plan/${encode(sessionId)}/${encode(ref.callId)}`
}

/**
 * Make this plan the session's armed goal, replacing any unfinished goal.
 *
 * The objective is a short instruction carrying the plan document's address,
 * not the plan's raw markdown: goal objectives are injected into every round,
 * and a full plan would be truncated by length limits mid-sentence. The round
 * driver reads the plan from the address instead.
 *
 * Ordering mirrors the card's own commit-then-answer rule: a refusal here keeps
 * the Plan pending instead of approving work that no goal tracks. The replace
 * path clears rather than edits so a new plan receives a fresh round budget —
 * `edit` would inherit the rounds the previous goal already spent.
 *
 * @param remote - the released goal remote, absent when no goal package is mounted.
 * @param sessionId - the session that owns both the review and the goal.
 * @param plan - the plan markdown under review (validated non-empty).
 * @param ref - the plan document identity used for its address.
 * @returns Whether the goal now tracks this plan, or why it does not.
 */
export async function setPlanAsGoal(
  remote: GoalRemote | undefined,
  sessionId: string,
  plan: string,
  ref: PlanDocumentRef,
): Promise<GoalHandoff> {
  if (remote === undefined) return { kind: 'unsupported' }
  if (plan.trim() === '') {
    return { kind: 'failed', code: 'GOAL_INVALID_OBJECTIVE', message: 'goal objective must be a non-empty string' }
  }
  const objective = `持续推进当前plan直到完成（plan 文档：${planDocumentAddress(sessionId, ref)}）`

  const created = await guarded(() => remote.create(sessionId, { objective }), 'the goal could not be created')
  if (created.ok) return { kind: 'created' }
  if (!isAlreadyExistsError(created.error)) return { kind: 'failed', ...failure(created, 'the goal could not be created') }

  // A goal already tracks this session: replace it with a fresh one. This runs
  // for every phase a create refuses (active, paused, blocked), which is the
  // behaviour the card's "set this plan as the goal" button promises.
  const current = await guarded(() => remote.get(sessionId), 'the current goal could not be read for replacement')
  if (!current.ok || current.value === undefined || current.value === null) {
    return { kind: 'failed', ...failure(current, 'the current goal could not be read for replacement') }
  }
  const cleared = await guarded(
    () => remote.clear(sessionId, { id: current.value!.id, revision: current.value!.revision }),
    'the current goal could not be cleared',
  )
  if (!cleared.ok) return { kind: 'failed', ...failure(cleared, 'the current goal could not be cleared') }

  const retry = await guarded(() => remote.create(sessionId, { objective }), 'the goal could not be created')
  if (retry.ok) return { kind: 'replaced' }
  return { kind: 'failed', ...failure(retry, 'the goal could not be created') }
}
