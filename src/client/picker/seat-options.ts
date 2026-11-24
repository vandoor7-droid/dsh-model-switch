/**
 * Official seat options: the `conversation.input.model.options` child-slot
 * share, forwarded from the ModelSeat registration into the ComposerPicker
 * root pane.
 *
 * The official ModelSelect renders this child slot below its Model/Effort
 * rows (ui-model-selection's ModelSelect.tsx); contributions such as the
 * agent-team switch (`dsh-client-ui-agent-team`'s TeamModeToggle) register
 * there and nowhere else. Taking over the seat therefore has to forward the
 * same share, or those rows disappear — which is exactly the bug this module
 * fixes: the agent-team toggle has been invisible on every deployment where
 * this plugin's seat entry won the cell.
 *
 * The render type is structural on purpose: the pinned devDependency's
 * dsh-client-ui-model-selection predates the options key, so key-narrowed
 * PropsRenderSlots would not compile there; at runtime the share exists on
 * every DSH that declares the slot, and the registration's children
 * declaration authorizes this entry to render it.
 *
 * Contract drift — a new official child slot key, or owner fields beyond
 * locked/dismiss/reportFailure — is patrolled by scripts/watch-model-seat.mjs;
 * see docs/dsh-compat-watch.md, section "Model-seat slot-protocol watch".
 *
 * @module dsh-model-switch/client/picker/seat-options
 */

import type { ReactNode } from 'react'

/**
 * The owner share the official options contract declares
 * (dsh-client-ui-model-selection's slots.ts):
 * what the menu owner owes every contributed row.
 */
export interface SeatOptionsOwner {
  /** Whether the composer currently refuses selection changes. */
  readonly locked: boolean
  /** Close the menu and focus its trigger synchronously before opening another overlay. */
  readonly dismiss: () => void
  /** Report a failed action through the menu owner's persistent toast. */
  readonly reportFailure: (message: string) => void
}

/**
 * The child-slot render share for the options key, as the slot runtime hands
 * it to an entry that declared the key among its children.
 * Structural: (key, owner, opts?) => ReactNode, narrowed to this one key.
 */
export type SeatOptionsRender = (key: 'conversation.input.model.options', owner: SeatOptionsOwner) => ReactNode

/**
 * Render the official seat options below the ComposerPicker root rows.
 *
 * @param renderSlot - the child-slot render share from the seat props, or
 * undefined when the runtime supplied none (older DSH builds without the
 * options slot) — in that case nothing renders.
 * @param owner - the owner share the official contract declares.
 * @returns the contributed row(s), or null when nothing contributes.
 */
export function renderSeatOptions(renderSlot: SeatOptionsRender | undefined, owner: SeatOptionsOwner): ReactNode {
  return renderSlot?.('conversation.input.model.options', owner) ?? null
}
