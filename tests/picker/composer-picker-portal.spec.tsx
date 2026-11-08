// @vitest-environment happy-dom

/**
 * Real-DOM level of the portaled Plan Review menu: independent document.body
 * portal root, and imperative viewport placement driven by a live trigger
 * rect. Migrated from the former react-test-renderer createNodeMock geometry
 * checks, keeping their original behavior assertions (mobile safe areas and
 * the 320px preferred-width shift).
 */

import { act, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComposerPickerProps } from '../../src/client/picker/ComposerPicker.tsx'
import type { PickerKey } from '../../src/client/picker/locales.ts'
import type { PickerDirectorySnapshot } from '../../src/client/picker/PickerDirectory.ts'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const Icon = () => null
  return {
    Button: ({ icon: _icon, children, ...props }: { icon?: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) =>
      <button {...props}>{children}</button>,
    Input: ({ icon: _icon, ...props }: { icon?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) =>
      <input {...props} />,
    Toast: () => null,
    IconCheckOutlineRegular: Icon,
    IconChevronDownOutlineRegular: Icon,
    IconChevronLeftOutlineRegular: Icon,
    IconChevronRightOutlineRegular: Icon,
    IconCloseOutlineRegular: Icon,
    IconSearchOutlineRegular: Icon,
    IconWarningOutlineRegular: Icon,
  }
})

vi.mock('dsh-llm-providers-ui/provider-ui', () => ({ ProviderMark: () => null }))

import { ComposerPicker } from '../../src/client/picker/ComposerPicker.tsx'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const selection = { provider: 'codex', model: 'old-model' }
const snapshot: PickerDirectorySnapshot = {
  current: selection,
  routable: true,
  groups: [{ id: 'codex', name: 'Codex', models: [{ id: 'old-model', name: 'Old Model' }] }],
  failures: [],
  status: 'ready' as const,
  error: null,
}

let mounted: { container: HTMLDivElement, root: Root } | undefined

async function mountPicker(): Promise<HTMLDivElement> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  mounted = { container, root }
  const props: ComposerPickerProps = {
    locked: false,
    available: true,
    directory: {
      snapshot,
      getDirectorySnapshot: () => snapshot,
      load: vi.fn(),
      select: vi.fn(async () => true),
    },
    draft: selection,
    onDraftChange: vi.fn(),
    t: (key: PickerKey) => key,
  }
  await act(async () => {
    root.render(<ComposerPicker {...props} />)
  })
  return container
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.focus()
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    element.click()
  })
}

function menu(): HTMLDivElement {
  const element = document.body.querySelector<HTMLDivElement>('[data-dsh-plan-review-menu]')
  if (element === null) throw new Error('picker menu is not open')
  return element
}

/** A realistic trigger rect; happy-dom lays out no boxes of its own. */
function stubTriggerGeometry(trigger: HTMLElement, rect: DOMRectInit): void {
  trigger.getBoundingClientRect = () => ({
    x: rect.x, y: rect.y, width: rect.width, height: rect.height,
    top: rect.y, right: rect.x + rect.width, bottom: rect.y + rect.height, left: rect.x,
    toJSON: () => rect,
  })
}

beforeEach(() => {
  // Both migrated scenarios are the mobile baseline (390x844) of the former
  // lock-spec geometry checks.
  window.innerWidth = 390
  window.innerHeight = 844
})

afterEach(async () => {
  if (mounted !== undefined) await act(async () => { mounted?.root.unmount() })
  mounted?.container.remove()
  mounted = undefined
  document.body.replaceChildren()
})

describe('ComposerPicker portaled menu placement', () => {
  it('portals an independent menu root and keeps it inside the mobile safe areas', async () => {
    const container = await mountPicker()
    const trigger = container.querySelector<HTMLElement>('[aria-haspopup="menu"]')!
    // Former lock-spec geometry: trigger near the right edge, low on screen.
    stubTriggerGeometry(trigger, { x: 72, y: 700, width: 298, height: 36 })
    await click(trigger)

    const popup = menu()
    // Independent portal root: a direct body child, never inside the picker card.
    expect(popup.parentElement).toBe(document.body)
    expect(container.contains(popup)).toBe(false)
    expect(trigger.getAttribute('aria-controls')).toBe(popup.id)

    expect(popup.style.position).toBe('fixed')
    expect(popup.style.visibility).toBe('visible')
    // Measured clamps land as custom properties; the stylesheet composes them
    // with the env(safe-area-inset-*) floors. The height clamp is the viewport
    // budget (684px of space above the trigger minus the gutter): panes grow
    // into it instead of freezing at the first rendered height.
    expect(popup.style.getPropertyValue('--dsh-menu-top')).toBe('472px')
    expect(popup.style.getPropertyValue('--dsh-menu-right')).toBe('20px')
    expect(popup.style.getPropertyValue('--dsh-menu-max-height')).toBe('676px')
  })

  it('shifts away from its trigger to preserve the 320px preferred mobile width', async () => {
    const container = await mountPicker()
    const trigger = container.querySelector<HTMLElement>('[aria-haspopup="menu"]')!
    // Former lock-spec geometry: right-aligning a 280px menu at right=250 would
    // push its left edge past the gutter.
    stubTriggerGeometry(trigger, { x: 20, y: 700, width: 230, height: 36 })
    await click(trigger)

    expect(menu().style.getPropertyValue('--dsh-menu-right')).toBe('62px')
  })
})
