import { describe, expect, it, vi } from 'vitest'
import { applyFiberConfig } from '../src/fiber-hot-update.ts'

/** Minimal fiber face the helper touches. */
function fiberOf(options: {
  state?: number
  update?: () => void
  await?: () => Promise<unknown>
} = {}) {
  return {
    state: options.state ?? 2,
    update: options.update ?? vi.fn(),
    await: options.await ?? (() => Promise.resolve()),
  }
}

const entryOf = (fiber?: unknown) => ({ options: {}, fiber }) as never

describe('applyFiberConfig', () => {
  it('reports no-fiber when there is no entry', async () => {
    expect(await applyFiberConfig(undefined, {})).toEqual({ outcome: 'no-fiber' })
  })

  it('reports no-fiber when the row has no fiber', async () => {
    expect(await applyFiberConfig(entryOf(undefined), {})).toEqual({ outcome: 'no-fiber' })
  })

  it('refuses to touch a row that is not active', async () => {
    const fiber = fiberOf({ state: 1 })
    expect(await applyFiberConfig(entryOf(fiber), { a: 1 })).toEqual({ outcome: 'not-active' })
    expect(fiber.update).not.toHaveBeenCalled()
  })

  it('reloads an active row with noSave and waits for the settle', async () => {
    const settled = vi.fn()
    const fiber = fiberOf({ await: () => Promise.resolve().then(settled) })
    expect(await applyFiberConfig(entryOf(fiber), { classifier: { provider: 'apigoto' } })).toEqual({ outcome: 'updated' })
    expect(fiber.update).toHaveBeenCalledWith({ classifier: { provider: 'apigoto' } }, true)
    expect(settled).toHaveBeenCalledOnce()
  })

  it('contains a validation throw and reports it', async () => {
    const fiber = fiberOf({ update: () => { throw new Error('bad config') } })
    expect(await applyFiberConfig(entryOf(fiber), {})).toEqual({ outcome: 'failed', error: 'bad config' })
  })

  it('contains a startup failure raised by the reload', async () => {
    const fiber = fiberOf({ await: () => Promise.reject(new Error('boom')) })
    expect(await applyFiberConfig(entryOf(fiber), {})).toEqual({ outcome: 'failed', error: 'boom' })
  })
})
