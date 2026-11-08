import {
  useCallback, useEffect, useId, useLayoutEffect, useRef, useState,
  type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject,
} from 'react'
import { installPickerDismissal, type PickerInteractionOperations } from './popup-dismissal.ts'
import { placeComposerPopup, samePlacement, type PopupPlacementStyle } from './popup-placement.ts'

export interface ComposerPickerSurfaceOptions {
  locked: boolean
  embedded: boolean
  tone?: 'capsule'
  pane: string
  reload: () => void
  onOpen: () => void
  onClose: () => void
  resolveInteractionOperations?: () => PickerInteractionOperations | undefined
}

export interface ComposerPickerSurface {
  id: string
  open: boolean
  triggerRef: RefObject<HTMLButtonElement>
  menuRef: RefObject<HTMLDivElement>
  show: () => void
  close: (restoreFocus?: boolean) => void
  onTriggerPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onTriggerClick: (event?: ReactMouseEvent<HTMLButtonElement>) => void
}

/** The imperatively placed popup writes one style at a time through the DOM. */
interface StyleWriter {
  setProperty(name: string, value: string): void
}

/** camelCase React style keys to hyphenated CSS custom-value writes. */
function applyPopupStyle(target: StyleWriter | undefined, style: CSSProperties): void {
  if (target === undefined) return
  for (const [property, value] of Object.entries(style)) {
    if (value === undefined) continue
    const rendered = typeof value === 'number' && property !== 'zIndex' ? `${value}px` : String(value)
    target.setProperty(property.replace(/[A-Z]/gu, char => `-${char.toLowerCase()}`), rendered)
  }
}

/** Own popup activation, viewport placement, and dismissal behind one internal seam. */
export function useComposerPickerSurface(options: ComposerPickerSurfaceOptions): ComposerPickerSurface {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const placementRef = useRef<PopupPlacementStyle>()
  const pointerOpenIntent = useRef<{ open: boolean; until: number } | null>(null)
  const callbacks = useRef({ onOpen: options.onOpen, onClose: options.onClose })
  callbacks.current = { onOpen: options.onOpen, onClose: options.onClose }
  const lockedRef = useRef(options.locked)
  lockedRef.current = options.locked
  const id = useId()

  const close = useCallback((restoreFocus = false): void => {
    setOpen(false)
    placementRef.current = undefined
    callbacks.current.onClose()
    if (restoreFocus) queueMicrotask(() => { triggerRef.current?.focus() })
  }, [])

  const show = (): void => {
    if (lockedRef.current) return
    callbacks.current.onOpen()
    setOpen(true)
    if (options.tone !== 'capsule') options.reload()
  }

  useEffect(() => {
    if (options.locked) close()
  }, [close, options.locked])

  /**
   * Keep the portaled menu glued to its trigger in viewport coordinates:
   * measure once per commit, then follow resizes, scrolls, and menu size
   * changes through listeners instead of re-rendering.
   */
  useLayoutEffect(() => {
    if (!open || typeof window === 'undefined') return
    const place = (): void => {
      const trigger = triggerRef.current
      const menu = menuRef.current
      if (trigger === null || menu === null) return
      const rect = trigger.getBoundingClientRect()
      const measured = menu.getBoundingClientRect()
      const bounds = {
        width: measured.width || Math.min(280, window.innerWidth - 16),
        height: measured.height || menu.scrollHeight || 220,
      }
      const next = placeComposerPopup({
        trigger: rect,
        menu: { width: bounds.width, height: bounds.height },
        viewport: { width: window.innerWidth, height: window.innerHeight },
      })
      if (samePlacement(placementRef.current, next)) return
      placementRef.current = next
      applyPopupStyle(menu.style, next as CSSProperties)
    }

    place()
    const trigger = triggerRef.current
    const menu = menuRef.current
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(place)
    if (trigger !== null) observer?.observe(trigger)
    if (menu !== null) observer?.observe(menu)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, options.pane])

  useEffect(() => {
    if (!open || typeof document === 'undefined') return
    const interaction = options.resolveInteractionOperations?.()
    return installPickerDismissal({
      documentTarget: document,
      surfaceId: 'composer-model-picker-' + id,
      ...(interaction === undefined ? {} : { interaction }),
      trigger: () => triggerRef.current,
      popup: () => menuRef.current,
      dismiss: close,
    })
  }, [close, id, open, options.resolveInteractionOperations])

  return {
    id,
    open,
    triggerRef,
    menuRef,
    show,
    close,
    onTriggerPointerDown: (event) => {
      event.stopPropagation()
      pointerOpenIntent.current = { open: !open, until: Date.now() + 750 }
    },
    onTriggerClick: (event) => {
      event?.stopPropagation()
      const intent = pointerOpenIntent.current
      const desiredOpen = intent !== null && Date.now() <= intent.until ? intent.open : !open
      if (intent !== null && Date.now() > intent.until) pointerOpenIntent.current = null
      if (desiredOpen) show(); else close()
    },
  }
}
