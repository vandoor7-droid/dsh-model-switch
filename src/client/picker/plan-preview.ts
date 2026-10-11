/**
 * Restore the official full-plan sidebar preview under the takeover card.
 *
 * The takeover replaces the official QuestionComposer in the
 * `conversation.composer` chain, and that composer is the only entry allowed
 * to render `conversation.plan-review.actions` (the SlotRegistry enforces one
 * declarer per child key, and `renderSlot` dispatch checks the *rendering*
 * entry's own children table). This module therefore drives ui-plan's own
 * registered opener — its inject face owns the `dsh-resource://plan-review`
 * address, the logged-plan branch, and the sidebar-mounted gate — instead of
 * re-deriving any of them here. If ui-plan is absent, every operation
 * degrades to "unavailable" and the card keeps working.
 */

import type { HostObservable, StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { PlanReview } from '@deepseek-ai/dsh-client-ui-user-questions/client'

/** Registration id ui-plan uses for its `conversation.plan-review.actions` entry. */
const PLAN_REVIEW_OPEN_ID = '@deepseek-ai/dsh-client-ui-plan'

/** Minimal registry face the binding reads (the public slot ledger snapshot). */
export interface PlanPreviewSlots {
  entries(key: string): readonly StoredEntry[]
}

/** The inject face ui-plan resolves for its opener entry (mirrors its declared shape). */
interface PlanReviewOpenFace {
  openReview: (review: PlanReview, requestKey: string) => void
  readonly hooks: { readonly sidebarMounted: HostObservable<SessionId | undefined> }
}

/** Sideways navigation controls for the full plan document in the right sidebar. */
export interface PlanPreviewBinding {
  /** Whether ui-plan's opener entry is registered right now. */
  available(): boolean
  /** Open the full plan immediately; returns false when unavailable. */
  open(sessionId: SessionId, review: PlanReview, requestKey: string): boolean
  /** Open once as soon as a Session is on screen; idempotent per review identity. */
  autoOpen(sessionId: SessionId, review: PlanReview, requestKey: string): () => void
}

/** Identities whose preview was already opened this process (official parity: ui-plan's store keeps them too). */
const opened = new Set<string>()

/**
 * Stable identity of one review's sidebar preview.
 * @param sessionId - session that owns the review.
 * @param review - narrowed plan review.
 * @param requestKey - pending-question request key.
 * @returns `session:call:<callId>` for a logged plan, else `session:review:<requestKey>`.
 */
export function planPreviewIdentity(sessionId: SessionId, review: PlanReview, requestKey: string): string {
  const identity = review.callId === undefined ? `review:${requestKey}` : `call:${review.callId}`
  return `${String(sessionId)}:${identity}`
}

/**
 * Whether this process already opened the preview for one review identity.
 * @param identity - value from {@link planPreviewIdentity}.
 * @returns True once opened.
 */
export function wasPlanPreviewOpened(identity: string): boolean {
  return opened.has(identity)
}

function faceOf(slots: PlanPreviewSlots, sessionId: SessionId): PlanReviewOpenFace | undefined {
  const entry = slots.entries('conversation.plan-review.actions')
    .find(candidate => candidate.options.id === PLAN_REVIEW_OPEN_ID && typeof candidate.inject === 'function')
  if (entry === undefined || entry.inject === undefined) return undefined
  try {
    const face = (entry.inject as unknown as (id: SessionId) => PlanReviewOpenFace)(sessionId)
    if (face === undefined || typeof face.openReview !== 'function') return undefined
    if (face.hooks === undefined || typeof face.hooks.sidebarMounted?.getSnapshot !== 'function') return undefined
    return face
  } catch {
    // An unknown session or an absent ui-plan must not break the card.
    return undefined
  }
}

/**
 * Bind the preview navigation to one slot registry.
 * @param slots - the live registry ledger.
 * @returns an idempotent binding usable from the card's render and effects.
 */
export function createPlanPreviewBinding(slots: PlanPreviewSlots): PlanPreviewBinding {
  const open = (sessionId: SessionId, review: PlanReview, requestKey: string): boolean => {
    const face = faceOf(slots, sessionId)
    if (face === undefined) return false
    opened.add(planPreviewIdentity(sessionId, review, requestKey))
    face.openReview(review, requestKey)
    return true
  }
  return {
    available: () => slots.entries('conversation.plan-review.actions')
      .some(candidate => candidate.options.id === PLAN_REVIEW_OPEN_ID),
    open,
    autoOpen: (sessionId, review, requestKey) => {
      const identity = planPreviewIdentity(sessionId, review, requestKey)
      if (opened.has(identity)) return () => undefined
      const face = faceOf(slots, sessionId)
      if (face === undefined) return () => undefined
      const mounted = face.hooks.sidebarMounted
      if (mounted.getSnapshot() !== undefined) {
        opened.add(identity)
        face.openReview(review, requestKey)
        return () => undefined
      }
      // The official opener waits for a Session on screen; mirror that gate.
      let disposed = false
      let openedHere = false
      const unsubscribe = mounted.subscribe(() => {
        if (disposed || openedHere || opened.has(identity)) return
        if (mounted.getSnapshot() === undefined) return
        openedHere = true
        opened.add(identity)
        unsubscribe()
        face.openReview(review, requestKey)
      })
      return () => { disposed = true; unsubscribe() }
    },
  }
}
