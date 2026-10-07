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
 * A commit and the compensation of the Host's own deployment-default write are
 * separate facts: only a failed commit may hold the answer back, because the
 * Host persists a Session selection as the deployment default on several
 * releases and this plugin restores the captured Main default afterwards. A
 * failed restore is announced, never fatal — the Session selection the human
 * asked for is already installed.
 */
export interface PlanCommitOutcome {
  /** The Session now runs the requested provider/model/effort. */
  committed: boolean
  /** The captured Main default is the effective one again. */
  mainDefaultRestored: boolean
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
  /** Announced after a successful answer when the Main default could not be restored. */
  onNotRestored?: (notice: string) => void
}): Promise<boolean> {
  const current = args.current
  const same = current !== undefined && current !== null
    && current.provider === args.selection.provider
    && current.model === args.selection.model
    && current.reasoningEffort === args.selection.reasoningEffort
  const commit: PlanCommitOutcome = same
    ? { committed: true, mainDefaultRestored: true }
    : await args.select(args.selection)
  if (!commit.committed) return false
  await args.answer()
  if (!commit.mainDefaultRestored) args.onNotRestored?.(args.selection.model)
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
