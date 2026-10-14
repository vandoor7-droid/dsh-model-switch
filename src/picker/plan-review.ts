import type { ModelSelection } from '@deepseek-ai/dsh-api-session-controller/types'
import type { ComposerChainProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PendingQuestion, PlanReview } from '@deepseek-ai/dsh-client-ui-user-questions/client'

export type { PlanReview } from '@deepseek-ai/dsh-client-ui-user-questions/client'
export type PlanReviewOption = PlanReview['approve']

type QuestionItem = PendingQuestion['questions'][number]

export function planReviewOf(questions: readonly QuestionItem[]): PlanReview | undefined {
  if (questions.length !== 1) return undefined
  const question = questions[0]
  if (question === undefined) return undefined
  const intent = question.intent
  if (intent?.kind !== 'plan-review' || question.detail === undefined || question.multiSelect === true) return undefined
  const options = question.options ?? []
  if (options.length > 2) return undefined
  const approve = options.find(option => option.label === intent.approve)
  if (approve === undefined) return undefined
  const decline = options.find(option => option.label !== intent.approve)
  return {
    id: question.id,
    question: question.question,
    plan: question.detail,
    // Mirrors the official narrow so the sidebar opener can resolve a logged
    // plan (callId) instead of the temporary review document.
    ...(intent.callId === undefined ? {} : { callId: intent.callId }),
    approve,
    ...(decline === undefined ? {} : { decline }),
  }
}

export function selectPlanReview(owner: ComposerChainProps): PendingQuestion | null {
  const interaction = owner.pendingInteraction
  if (interaction === undefined || (interaction.kind !== 'question' && interaction.kind !== 'plan-review')) return null
  return planReviewOf(interaction.questions) === undefined ? null : interaction
}

export class PlanApprovalResponseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'PlanApprovalResponseError'
  }
}

/**
 * Result of committing the draft execution model before answering a review.
 *
 * Only a failed commit may hold the answer back: once `committed` is true the
 * Session runs the requested selection, and the answer proceeds under it.
 */
export interface PlanCommitOutcome {
  /** The Session now runs the requested provider/model/effort. */
  committed: boolean
}

function codeOf(value: unknown): string | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const code = (value as { code?: unknown }).code
  return typeof code === 'string' && code !== '' ? code : undefined
}

/**
 * Diagnostic text for one failed action, keeping the wire code visible.
 * Official Remote failures carry a code that names the owning domain
 * (`session/writer-held`, `session/model-unavailable`, …); dropping it leaves
 * the human with copy they cannot act on.
 * @param cause - the thrown value.
 * @returns The message, prefixed with the nearest available code.
 */
export function planErrorText(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause)
  const code = codeOf(cause) ?? (cause instanceof Error ? codeOf(cause.cause) : undefined)
  return code === undefined ? message : `${code}: ${message}`
}

export async function approvePlanReview(args: {
  select: (selection: ModelSelection) => Promise<PlanCommitOutcome>
  selection: ModelSelection
  current?: ModelSelection | null
  answer: () => Promise<void>
}): Promise<boolean> {
  const current = args.current
  const same = current !== undefined && current !== null
    && current.provider === args.selection.provider
    && current.model === args.selection.model
    && current.reasoningEffort === args.selection.reasoningEffort
  const commit: PlanCommitOutcome = same
    ? { committed: true }
    : await args.select(args.selection)
  if (!commit.committed) return false
  await args.answer()
  return true
}

export interface PlanActionState {
  busy: boolean
  blocked: boolean
  error: string | null
}

export interface PlanActionView {
  approveDisabled: boolean
  error: string | null
}

export function planActionView(
  state: PlanActionState,
  available: boolean,
  hasExecution: boolean,
): PlanActionView {
  return {
    approveDisabled: state.busy || state.blocked || !available || !hasExecution,
    error: state.error,
  }
}

export async function settlePlanAction(
  send: () => Promise<void>,
  update: (state: PlanActionState) => void,
): Promise<boolean> {
  update({ busy: true, blocked: false, error: null })
  try {
    await send()
    return true
  } catch (cause: unknown) {
    update({
      busy: false,
      blocked: cause instanceof PlanApprovalResponseError,
      error: planErrorText(cause),
    })
    return false
  }
}
