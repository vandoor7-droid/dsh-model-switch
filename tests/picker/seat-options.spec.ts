import { describe, expect, it, vi } from 'vitest'

import { renderSeatOptions, type SeatOptionsOwner, type SeatOptionsRender } from '../../src/client/picker/seat-options.ts'

const OWNER: SeatOptionsOwner = {
  locked: false,
  dismiss: () => undefined,
  reportFailure: () => undefined,
}

describe('renderSeatOptions', () => {
  it('dispatches the one options key with the owner share', () => {
    const renderSlot = vi.fn(() => 'team-row') as unknown as SeatOptionsRender
    const node = renderSeatOptions(renderSlot, OWNER)
    expect(node).toBe('team-row')
    expect(renderSlot).toHaveBeenCalledExactlyOnceWith('conversation.input.model.options', OWNER)
  })

  it('returns null when the runtime supplied no share', () => {
    expect(renderSeatOptions(undefined, OWNER)).toBeNull()
  })

  it('returns null when nothing contributes', () => {
    const renderSlot = vi.fn(() => null) as unknown as SeatOptionsRender
    expect(renderSeatOptions(renderSlot, OWNER)).toBeNull()
  })
})
