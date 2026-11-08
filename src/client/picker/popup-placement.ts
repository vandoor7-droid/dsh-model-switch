/** Viewport placement result written imperatively onto the portaled menu. */
/**
 * Viewport-edge clamps are emitted as CSS custom properties; the stylesheet
 * composes them with the env(safe-area-inset-*) floors (see `.menu` in
 * ComposerPicker.module.css):
 *
 *   top:        max(var(--dsh-menu-top), calc(env(safe-area-inset-top) + gutter));
 *   right:      max(var(--dsh-menu-right), calc(env(safe-area-inset-right) + gutter));
 *   max-height: min(var(--dsh-menu-max-height), calc(100dvh - env(safe-area-inset-bottom) - env(safe-area-inset-top)));
 *
 * Numbers come from innerWidth/innerHeight, which exclude browser chrome but
 * not display cutouts, so the stylesheet side of the max()/min() keeps the
 * popup inside the safe area on notched phones.
 */
export interface PopupPlacementStyle {
  readonly '--dsh-menu-top': string
  readonly '--dsh-menu-right': string
  readonly '--dsh-menu-max-height': string
  readonly visibility: 'visible'
}

export function samePlacement(left: PopupPlacementStyle | undefined, right: PopupPlacementStyle): boolean {
  return left !== undefined
    && left['--dsh-menu-top'] === right['--dsh-menu-top']
    && left['--dsh-menu-right'] === right['--dsh-menu-right']
    && left['--dsh-menu-max-height'] === right['--dsh-menu-max-height']
    && left.visibility === right.visibility
}

export interface PopupPlacementInput {
  readonly trigger: { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number }
  readonly menu: { readonly width: number; readonly height: number }
  readonly viewport: { readonly width: number; readonly height: number }
  readonly gutter?: number
}

/**
 * Narrow-screen reservation: the right clamp keeps this much viewport width
 * clear to the menu's left even when right-aligning to the trigger would
 * push the left edge off-screen (the pre-portal behavior base).
 */
const PREFERRED_WIDTH = 320
const FALLBACK_WIDTH = 280
const FALLBACK_HEIGHT = 220

/**
 * Position the portaled picker menu in viewport coordinates, right-aligned to
 * its trigger and preferring the space above it, clamped to the viewport.
 */
/**
 * Position the portaled picker menu in viewport coordinates, right-aligned to
 * its trigger and preferring the space above it, clamped to the viewport.
 *
 * The height clamp is the viewport budget only (never a content measurement):
 * the stylesheet caps the box at that budget, so taller menu panes grow into
 * it naturally and a later ResizeObserver pass only re-reads the rendered box
 * to re-anchor the trigger edge. Capping from the measured box would instead
 * lock the menu at whatever height it first rendered with.
 */
export function placeComposerPopup({ trigger, menu, viewport, gutter = 8 }: PopupPlacementInput): PopupPlacementStyle {
  const maxWidth = Math.max(0, viewport.width - gutter * 2)
  const width = Math.min(menu.width || FALLBACK_WIDTH, maxWidth)
  // Reserve at least the narrow-screen preference, and never less than the
  // measured menu: the left edge must keep its gutter in both cases.
  const reserve = Math.max(Math.min(PREFERRED_WIDTH, maxWidth), width)
  const right = Math.min(
    Math.max(gutter, viewport.width - trigger.right),
    Math.max(gutter, viewport.width - gutter - reserve),
  )
  const spaceAbove = Math.max(0, trigger.top - gutter * 2)
  const spaceBelow = Math.max(0, viewport.height - trigger.bottom - gutter * 2)
  const placeAbove = spaceAbove >= Math.min(menu.height, 180) || spaceAbove >= spaceBelow
  const availableHeight = Math.max(0, (placeAbove ? spaceAbove : spaceBelow) - gutter)
  const top = placeAbove
    ? Math.max(gutter, trigger.top - gutter - Math.min(menu.height || FALLBACK_HEIGHT, availableHeight))
    : Math.min(
        Math.max(gutter, trigger.bottom + gutter),
        Math.max(gutter, viewport.height - gutter - Math.min(menu.height || FALLBACK_HEIGHT, availableHeight)),
      )

  return {
    '--dsh-menu-top': `${top}px`,
    '--dsh-menu-right': `${right}px`,
    '--dsh-menu-max-height': `${availableHeight}px`,
    visibility: 'visible',
  }
}
