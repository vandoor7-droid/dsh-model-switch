import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { ModelSelection } from '@deepseek-ai/dsh-api-session-controller/types'
import type { PendingQuestion, PlanReview } from '@deepseek-ai/dsh-client-ui-user-questions/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, IconEditOutlineRegular, extractMarkdownPlainText } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  PlanApprovalResponseError, approvePlanReview, planActionView, planReviewOf, settlePlanAction,
} from '../../picker/plan-review.ts'
import { PlanDismissalUnsupportedError, dismissPendingQuestion } from '../../picker/pending-dismissal.ts'
import { setPlanAsGoal, type GoalRemote } from '../../picker/plan-goal.ts'
import { ComposerPicker } from './ComposerPicker.tsx'
import type { PlanPreviewBinding } from './plan-preview.ts'
import { pickerDirectoryViewOrdered, type PickerDirectoryFace, type PickerDirectoryView } from './PickerDirectory.ts'
import type { PickerInteractionOperations } from './popup-dismissal.ts'
import { RetryBoundary } from './RetryBoundary.tsx'
import { agentProviderLocked, effectiveProviderLock, runtimeChoiceAllowed, type RuntimeProviderLock } from '../runtime-lock.ts'
import { isAgentRole } from '../antigravity-catalog.ts'
import css from './PlanReviewCard.module.css'

interface PickerGuardProps {
  children: ReactNode
  errorLabel: (message: string) => string
  retryLabel: string
}

function PickerGuard({ children, errorLabel, retryLabel }: PickerGuardProps) {
  return (
    <RetryBoundary
      logLabel="dsh-model-switch: Plan Review picker crashed"
      renderFallback={(message, retry) => (
        <div data-dsh-ms-plan-picker-error role="alert" className={css.pickerError}>
          <span>{errorLabel(message)}</span>
          <Button type="button" variant="outline" onClick={retry}>{retryLabel}</Button>
        </div>
      )}
    >
      {children}
    </RetryBoundary>
  )
}

export interface PlanReviewFace extends PickerDirectoryFace {
  available: boolean
  resolveInteractionOperations?: () => PickerInteractionOperations | undefined
  /** Resolve a provider key to its ProviderDirectory role for runtime icons. */
  roleOf?: (providerKey: string) => string | undefined
  /** Shared native-binding lock state for the seat session. */
  providerLockStore: { subscribe: (listener: () => void) => () => void; getSnapshot: () => { provider: RuntimeProviderLock; failed: boolean } }
  /** Re-read the native binding now (mount, turn transitions, pre-selection). */
  refreshProviderLock: () => void
  /** Released goal remote; absent when this deployment mounts no goal service. */
  goalRemote: () => GoalRemote | undefined
  /** Full-plan sidebar navigation (ui-plan's registered opener). */
  planPreview: PlanPreviewBinding
  /** Live catalog-group-id → card-key map from ProviderDirectory. */
  catalogRoutes?: () => Readonly<Record<string, string>>
}

export type PlanReviewCardProps = PropsRuntime<'conversation.composer'>
  & PropsLocale<'composer-picker'>
  & InjectFace<PlanReviewFace>
  & { matched: PendingQuestion }

/**
 * Answer one review question.
 *
 * A typed feedback answer follows the official single-select convention: the
 * custom text replaces the option list, because plan mode reads `custom` as
 * "keep planning, and here is why" and falls back to the bare option when it
 * is absent.
 */
async function respondAnswer(
  wait: PendingQuestion,
  id: string,
  label: string,
  rejectedMessage: string,
  terminalRejection = false,
  feedback?: string,
): Promise<void> {
  const custom = feedback === undefined || feedback === '' ? undefined : feedback
  const answer = custom === undefined
    ? { answers: [{ id, selected: [label] }] }
    : { answers: [{ id, selected: [], custom }] }
  try {
    await wait.answer(answer)
  } catch (cause) {
    throw terminalRejection
      ? new PlanApprovalResponseError(rejectedMessage, { cause })
      : new Error(rejectedMessage, { cause })
  }
}

/**
 * Withdraw the takeover so the human can speak instead, on either Host
 * generation; a Host exposing no withdrawal verb is named instead of guessed.
 */
async function respondDismiss(
  wait: PendingQuestion,
  rejectedMessage: string,
  unsupportedMessage: string,
): Promise<void> {
  try {
    await dismissPendingQuestion(wait)
  } catch (cause) {
    throw cause instanceof PlanDismissalUnsupportedError
      ? new Error(unsupportedMessage, { cause })
      : new Error(rejectedMessage, { cause })
  }
}

interface PlanReviewStateProps {
  matched: PendingQuestion
  review: PlanReview
  available: boolean
  providerLock: RuntimeProviderLock
  agentLocked: boolean
  lockFailed: boolean
  directory: PickerDirectoryView
  t: PlanReviewCardProps['t']
  goalRemote: () => GoalRemote | undefined
  planPreview: PlanPreviewBinding
  resolveInteractionOperations?: () => PickerInteractionOperations | undefined
  /** Resolve a provider key to its ProviderDirectory role for runtime icons. */
  roleOf?: (providerKey: string) => string | undefined
}

/** Inline failed lock-read status; history and log reading stay unaffected. */
export function ProviderLockHint(props: { t: PlanReviewCardProps['t'] }) {
  return (
    <div role="alert" className={css.strip} data-provider-lock-failed>
      <span className={css.dot} />
      <span className={css.stripTitle}>{props.t('lock.readFailed')}</span>
    </div>
  )
}

export function PlanReviewCard(props: PlanReviewCardProps) {
  const snapshot = props.useDirectory(value => value)
  const order = props.useProviderOrder(value => value)
  const lock = useSyncExternalStore(props.providerLockStore.subscribe, props.providerLockStore.getSnapshot)
  const phase = props.useInput(input => input.phase)
  const blank = props.useSession(session => session.blank)
  const active = props.useSession(session => session.running || session.awaitingFirstTurn) || phase === 'submitting'
  useEffect(() => { props.refreshProviderLock() }, [props.refreshProviderLock, phase, active, snapshot, order])
  const providerLock = effectiveProviderLock(lock, snapshot.current?.provider, active, isAgentRole(props.roleOf?.(snapshot.current?.provider ?? '')))
  const agentLocked = agentProviderLocked(blank, providerLock, active)
  const review = planReviewOf(props.matched.questions)
  if (review === undefined) {
    return (
      <div className={css.frame} data-plan-review-key={props.matched.key}>
        <section className={css.card} aria-label={props.t('plan.header')}>
          <div className={css.strip}><span className={css.dot} />{props.t('plan.header')}</div>
          {lock.failed && <ProviderLockHint t={props.t} />}
        </section>
      </div>
    )
  }
  return <PlanReviewState
    key={props.matched.key}
    matched={props.matched}
    review={review}
    available={props.available && (!lock.failed || snapshot.current !== null)}
    providerLock={providerLock}
    agentLocked={agentLocked}
    lockFailed={lock.failed}
    directory={pickerDirectoryViewOrdered(snapshot, props, order, props.catalogRoutes?.() ?? {})}
    t={props.t}
    goalRemote={props.goalRemote}
    planPreview={props.planPreview}
    {...props.resolveInteractionOperations === undefined ? {} : { resolveInteractionOperations: props.resolveInteractionOperations }}
    {...props.roleOf === undefined ? {} : { roleOf: props.roleOf }}
  />
}

function PlanReviewState({
  matched, review, available, providerLock, agentLocked, lockFailed, directory, t, goalRemote, planPreview, resolveInteractionOperations, roleOf,
}: PlanReviewStateProps) {
  const { snapshot, getDirectorySnapshot, load, select } = directory
  const [execution, setExecution] = useState<ModelSelection | undefined>(snapshot.current ?? undefined)
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const operationLocked = useRef(false)

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (execution === undefined && snapshot.current !== null) setExecution(snapshot.current)
  }, [execution, snapshot.current])

  /**
   * The takeover hides the official panel, so this card drives ui-plan's
   * registered opener: the full plan opens in the right sidebar as soon as a
   * Session is on screen (identity-deduped inside the binding).
   */
  useEffect(
    () => planPreview.autoOpen(matched.sessionId, review, matched.key),
    [planPreview, matched.sessionId, matched.key, review],
  )
  /** Official two-part summary: first line as title, first paragraph as body. */
  const summary = useMemo(() => {
    const title = extractMarkdownPlainText(review.plan, { mode: 'first-line' })
    const description = extractMarkdownPlainText(review.plan, { mode: 'first-paragraph' })
    return { title, description: description === title ? '' : description }
  }, [review.plan])

  /**
   * Run one takeover action. `force` reaches past a terminal answer state: the
   * withdrawal action must stay reachable, or a rejected answer would leave the
   * card with no way back to the composer.
   */
  const settle = (send: () => Promise<void>, force = false): void => {
    if (busy) return
    if (!force && (operationLocked.current || blocked)) return
    operationLocked.current = true
    let terminal = false
    void settlePlanAction(send, (state) => {
      terminal = state.blocked
      setBusy(state.busy)
      setBlocked(state.blocked)
      setError(state.error)
    }).then((completed) => {
      if (!completed && !terminal) operationLocked.current = false
    })
  }

  /** Re-read the Host and re-enable every action after a failed settlement. */
  const recover = (): void => {
    operationLocked.current = false
    setBusy(false)
    setBlocked(false)
    setError(null)
    setNotice(null)
    load()
  }

  const executionAllowed = execution !== undefined
    && runtimeChoiceAllowed(
      providerLock,
      agentLocked,
      execution.provider,
      snapshot.current?.provider,
      isAgentRole(roleOf?.(execution.provider)),
    )
  const action = planActionView({ busy, blocked, error }, available, executionAllowed)

  /** Approve this review after committing its execution model; a refused commit keeps the Plan pending. */
  const approveWith = async (model: ModelSelection): Promise<void> => {
    const committed = await approvePlanReview({
      select,
      selection: model,
      current: snapshot.current,
      answer: () => respondAnswer(matched, review.id, review.approve.label, t('plan.responseRejected'), true),
    })
    if (!committed) {
      const message = getDirectorySnapshot().error
      throw new Error(message === null ? t('plan.modelFailed') : t('error.action', { message }))
    }
  }

  const onApprove = (): void => {
    if (execution === undefined || !executionAllowed || !available || busy || blocked) return
    settle(async () => {
      await approveWith(execution)
    })
  }

  // Resolved per render so a deployment without the goal service reports an
  // honest disabled reason instead of failing at click time.
  const goal = goalRemote()
  const goalReason = goal === undefined ? t('plan.goalUnsupported') : undefined

  /**
   * Arm this plan as the session's goal first, then approve. The goal must be
   * set before the answer because a refusal must leave the Plan pending, and
   * because only an armed goal lets the round driver carry the plan after plan
   * mode exits.
   */
  const onRunAsGoal = (): void => {
    if (execution === undefined || !executionAllowed || !available || busy || blocked || goal === undefined) return
    settle(async () => {
      const handoff = await setPlanAsGoal(goal, matched.sessionId, review.plan, {
        ...(review.callId === undefined ? {} : { callId: review.callId }),
        requestKey: matched.key,
      })
      if (handoff.kind === 'unsupported') throw new Error(t('plan.goalUnsupported'))
      if (handoff.kind === 'failed') {
        const message = handoff.code === undefined ? handoff.message : `${handoff.code}: ${handoff.message}`
        throw new Error(t('plan.goalFailed', { message }))
      }
      if (handoff.kind === 'replaced') setNotice(t('plan.goalReplaced'))
      await approveWith(execution)
    })
  }

  const decline = review.decline

  return (
    <div className={css.frame} data-plan-review-key={matched.key}>
      <section className={css.card} aria-label={review.question}>
        {lockFailed && <ProviderLockHint t={t} />}
        <div className={css.strip}>
          <span className={css.dot} />
          <span className={css.stripTitle}>{t('plan.header')}</span>
          {planPreview.available() && (
            <button
              type="button"
              className={css.previewLink}
              data-plan-preview-open
              onClick={() => { planPreview.open(matched.sessionId, review, matched.key) }}
            >
              {t('plan.openFull')}
            </button>
          )}
          <div
            className={css.headerPicker}
            aria-label={t('plan.execution')}
            onPointerDown={event => { event.stopPropagation() }}
          >
            <PickerGuard
              errorLabel={message => t('plan.pickerCrash', { message })}
              retryLabel={t('retry')}
            >
            <ComposerPicker
              locked={busy || blocked}
              providerLock={providerLock}
              agentLocked={agentLocked}
              {...(roleOf === undefined ? {} : { roleOf })}
              available={available}
              directory={directory}
              t={t}
              {...resolveInteractionOperations === undefined ? {} : { resolveInteractionOperations }}
              {...execution === undefined ? {} : { draft: execution }}
              onDraftChange={setExecution}
              embedded
              tone="capsule"
            />
            </PickerGuard>
          </div>
        </div>
        <div className={css.body} data-plan-review-scroll>
          <div className={css.summary}>
            <h3 className={css.summaryTitle} data-plan-review-summary>{summary.title}</h3>
            {summary.description !== '' && <p className={css.summaryText}>{summary.description}</p>}
          </div>
        </div>
        <div className={css.footer}>
          <div className={css.feedback} role="status">{action.error ?? notice}</div>
          {decline !== undefined && (
            <div className={css.feedbackRow}>
              <input
                className={css.feedbackInput}
                type="text"
                value={feedback}
                disabled={busy || blocked}
                placeholder={t('plan.feedbackPlaceholder')}
                aria-label={t('plan.feedback')}
                onChange={event => { setFeedback(event.target.value) }}
                onPointerDown={event => { event.stopPropagation() }}
              />
            </div>
          )}
          <div className={css.bar}>
            <div className={css.actions}>
              {error !== null && (
                <Button variant="ghost" className={css.recover} onClick={recover}>
                  {t('action.reload')}
                </Button>
              )}
              <Button
                variant="ghost"
                className={css.discuss}
                icon={<IconEditOutlineRegular size={14} />}
                disabled={busy}
                onClick={() => {
                  settle(
                    () => respondDismiss(matched, t('plan.cancelRejected'), t('plan.dismissUnsupported')),
                    true,
                  )
                }}
              >
                {t('plan.discuss')}
              </Button>
              {decline !== undefined && (
                <Button
                  variant="outline"
                  className={css.keep}
                  disabled={busy || blocked}
                  title={decline.description ?? t('plan.keep')}
                  onClick={() => {
                    settle(() => respondAnswer(matched, review.id, decline.label, t('plan.responseRejected'), false, feedback.trim()))
                  }}
                >
                  {t('plan.keep')}
                </Button>
              )}
              <Button
                variant="outline"
                className={css.goalRun}
                disabled={action.approveDisabled || goalReason !== undefined}
                {...(goalReason === undefined ? {} : { title: goalReason })}
                onClick={onRunAsGoal}
              >
                {t('plan.goalRun')}
              </Button>
              <Button variant="primary" className={css.approve} disabled={action.approveDisabled} onClick={onApprove}>
                {t('plan.approve')}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
