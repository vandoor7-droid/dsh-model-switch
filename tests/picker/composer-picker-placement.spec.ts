import { describe, expect, it } from 'vitest'
import { placeComposerPopup } from '../../src/client/picker/popup-placement.ts'

/**
 * Pure-function level of the viewport placement: the measured clamps emitted
 * as custom properties. The stylesheet composes them with the
 * env(safe-area-inset-*) floors (asserted in composer-picker-style.spec.ts),
 * and the end-to-end DOM behavior is covered in composer-picker-portal.spec.tsx.
 */
describe('Plan Review composer popup placement', () => {
  it('aligns the right edge with the trigger and places the menu above', () => {
    // Geometry of the reported defect: Plan Review capsule at a 1300x626 window.
    const style = placeComposerPopup({
      trigger: { left: 963, right: 1230, top: 320, bottom: 372 },
      menu: { width: 300, height: 220 },
      viewport: { width: 1300, height: 626 },
    })
    expect(style['--dsh-menu-top']).toBe('92px')
    expect(style['--dsh-menu-right']).toBe('70px')
    expect(style.visibility).toBe('visible')
  })

  it('switches below the trigger when the lower side has room and above does not', () => {
    const style = placeComposerPopup({
      trigger: { left: 8, right: 280, top: 28, bottom: 64 },
      menu: { width: 280, height: 320 },
      viewport: { width: 390, height: 844 },
    })
    expect(style['--dsh-menu-top']).toBe('72px')
    // The height clamp is the viewport budget, not the content: menu panes
    // grow into it without the ResizeObserver pass locking the box.
    expect(style['--dsh-menu-max-height']).toBe('756px')
  })

  it('clamps tall menus to the available viewport height', () => {
    const style = placeComposerPopup({
      trigger: { left: 840, right: 1240, top: 300, bottom: 352 },
      menu: { width: 420, height: 680 },
      viewport: { width: 1300, height: 626 },
    })
    expect(style['--dsh-menu-top']).toBe('16px')
    expect(style['--dsh-menu-max-height']).toBe('276px')
  })

  it('keeps the menu fully on screen when right-aligning would push it off', () => {
    const style = placeComposerPopup({
      trigger: { left: 20, right: 250, top: 700, bottom: 736 },
      menu: { width: 280, height: 220 },
      viewport: { width: 390, height: 844 },
    })
    // 390 - 250 = 140 would leave -30px on the left for a 280px menu; the
    // 320px reservation clamps the right offset to 62 so the left edge keeps
    // its gutter (the pre-portal mobile baseline).
    expect(style['--dsh-menu-right']).toBe('62px')
  })

  it('reserves the measured width when it exceeds the 320px preference', () => {
    // A 420px menu near a 300px-wide trigger: reserving only the 320px
    // preference would leave the left edge at -92px off-screen.
    const style = placeComposerPopup({
      trigger: { left: 20, right: 300, top: 300, bottom: 352 },
      menu: { width: 420, height: 220 },
      viewport: { width: 800, height: 626 },
    })
    expect(style['--dsh-menu-right']).toBe('372px')
  })
})
