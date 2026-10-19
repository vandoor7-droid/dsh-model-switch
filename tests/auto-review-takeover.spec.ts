import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Entry } from '@deepseek-ai/cordis-plugin-loader'
import {
  installAutoReviewTakeover,
  isOfficialAutoReviewRow,
  officialAutoReviewEntry,
  reclaimOfficialAutoReviewRow,
  OFFICIAL_AUTO_REVIEW_PACKAGE,
  OFFICIAL_AUTO_REVIEW_ROW,
  TAKEOVER_MAX_ATTEMPTS,
  type AutoReviewSeam,
} from '../src/auto-review-takeover.js'

/** A loader entry stand-in: the fields the takeover reads, plus its update() calls. */
function entryOf(id: string, pkg: string): Entry & { disabled: boolean; updates: unknown[] } {
  const entry = {
    id,
    options: { id, name: pkg, config: {} },
    disabled: false,
    updates: [] as unknown[],
    async update(options: Record<string, unknown>) {
      entry.updates.push(options)
      if (options.disabled === true) entry.disabled = true
    },
  }
  return entry as unknown as Entry & { disabled: boolean; updates: unknown[] }
}

/** A seam stand-in recording the yield/claim/preserve choreography. */
function seamBench(overrides: Partial<AutoReviewSeam> = {}) {
  const state = { yielded: 0, claimed: 0, preserved: 0, registered: true }
  const seam: AutoReviewSeam = {
    yieldRegistration: () => {
      state.yielded += 1
      state.registered = false
    },
    claim: async () => {
      state.claimed += 1
      state.registered = true
      return true
    },
    preserveAuto: async action => {
      state.preserved += 1
      await action()
    },
    ...overrides,
  }
  return { seam, state }
}

describe('isOfficialAutoReviewRow', () => {
  it('keys on the official package only', () => {
    expect(isOfficialAutoReviewRow(entryOf('auto-review', OFFICIAL_AUTO_REVIEW_PACKAGE))).toBe(true)
    expect(isOfficialAutoReviewRow(entryOf('anything', OFFICIAL_AUTO_REVIEW_PACKAGE))).toBe(true)
    // A recycled id on another package (or a group) must never be treated as
    // the official row: the takeover disables the matched entry.
    expect(isOfficialAutoReviewRow(entryOf('auto-review', '@deepseek-ai/dsh-web'))).toBe(false)
    expect(isOfficialAutoReviewRow(entryOf('model-switch-auto-review', 'dsh-model-switch/auto-review'))).toBe(false)
    expect(isOfficialAutoReviewRow(undefined)).toBe(false)
  })
})

describe('officialAutoReviewEntry', () => {
  it('finds the composed official row and nothing else', () => {
    const official = entryOf(OFFICIAL_AUTO_REVIEW_ROW, OFFICIAL_AUTO_REVIEW_PACKAGE)
    const other = entryOf('model-switch-auto-review', 'dsh-model-switch/auto-review')
    expect(officialAutoReviewEntry({ entries: () => [other, official][Symbol.iterator]() } as never)).toBe(official)
    expect(officialAutoReviewEntry({ entries: () => [other][Symbol.iterator]() } as never)).toBeUndefined()
    expect(officialAutoReviewEntry(undefined)).toBeUndefined()
  })
})

describe('reclaimOfficialAutoReviewRow', () => {
  it('disables the official row and claims the registration around the displacement', async () => {
    const entry = entryOf(OFFICIAL_AUTO_REVIEW_ROW, OFFICIAL_AUTO_REVIEW_PACKAGE)
    const { seam, state } = seamBench()
    await reclaimOfficialAutoReviewRow(new Context(), entry, seam)
    expect(entry.updates).toContainEqual({ disabled: true })
    expect(state.claimed).toBeGreaterThan(0)
    // The official gate's disposal moves auto sessions off Auto; the takeover
    // runs its whole displacement inside the preservation window.
    expect(state.preserved).toBe(1)
    expect(state.registered).toBe(true)
  })

  it('retries until the displaced registration actually releases', async () => {
    const entry = entryOf(OFFICIAL_AUTO_REVIEW_ROW, OFFICIAL_AUTO_REVIEW_PACKAGE)
    let attempts = 0
    const seam = seamBench({
      claim: async () => {
        attempts += 1
        return attempts >= 3
      },
    }).seam
    await reclaimOfficialAutoReviewRow(new Context(), entry, seam)
    expect(attempts).toBe(3)
    expect(attempts).toBeLessThanOrEqual(TAKEOVER_MAX_ATTEMPTS)
  })

  it('reports the lost seam instead of guessing when the registration never returns', async () => {
    const entry = entryOf(OFFICIAL_AUTO_REVIEW_ROW, OFFICIAL_AUTO_REVIEW_PACKAGE)
    const ctx = new Context()
    const error = vi.spyOn(ctx.logger, 'error')
    const seam = seamBench({ claim: async () => false }).seam
    await reclaimOfficialAutoReviewRow(ctx, entry, seam)
    expect(error.mock.calls.some(call => String(call[0]).includes('kept the Auto registration'))).toBe(true)
  })
})

describe('installAutoReviewTakeover', () => {
  it('yields the registration synchronously before the loader continues', async () => {
    const order: string[] = []
    const seam = seamBench({
      yieldRegistration: () => { order.push('yield') },
      claim: async () => { order.push('claim'); return true },
    }).seam
    const ctx = new Context()
    const reclaim = installAutoReviewTakeover(ctx, seam)
    expect(typeof reclaim).toBe('function')

    const entry = entryOf(OFFICIAL_AUTO_REVIEW_ROW, OFFICIAL_AUTO_REVIEW_PACKAGE)
    await ctx.waterfall('loader/patch-context', entry, () => { order.push('next') })
    await new Promise(resolve => setTimeout(resolve, 30))

    // The loader runs the entry's plugin `apply` right after `next()`, so the
    // yield must already have landed when the waterfall continues.
    expect(order.slice(0, 2)).toEqual(['yield', 'next'])
    expect(order).toContain('claim')
    expect(entry.updates).toContainEqual({ disabled: true })
  })

  it('leaves unrelated entries alone and joins one reclaim per entry', async () => {
    const { seam, state } = seamBench()
    const ctx = new Context()
    const reclaim = installAutoReviewTakeover(ctx, seam)
    const other = entryOf('web', '@deepseek-ai/dsh-web')
    await ctx.waterfall('loader/patch-context', other, () => undefined)
    expect(state.yielded).toBe(0)
    expect(other.updates).toEqual([])

    const entry = entryOf(OFFICIAL_AUTO_REVIEW_ROW, OFFICIAL_AUTO_REVIEW_PACKAGE)
    await Promise.all([reclaim(entry), reclaim(entry)])
    expect(state.preserved).toBe(1)
  })

  it('claims again when the displaced row goes away', async () => {
    const { seam, state } = seamBench()
    state.registered = false
    const ctx = new Context()
    installAutoReviewTakeover(ctx, seam)
    const entry = entryOf(OFFICIAL_AUTO_REVIEW_ROW, OFFICIAL_AUTO_REVIEW_PACKAGE)
    await ctx.waterfall('loader/partial-dispose', entry, () => undefined)
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(state.claimed).toBe(1)
  })

  it('sweeps an official row that composed before this row started', async () => {
    const entry = entryOf(OFFICIAL_AUTO_REVIEW_ROW, OFFICIAL_AUTO_REVIEW_PACKAGE)
    const { seam, state } = seamBench()
    const ctx = new Context()
    ctx.provide('loader', { entries: () => [entry][Symbol.iterator]() } as never)
    installAutoReviewTakeover(ctx, seam)
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(state.claimed).toBeGreaterThan(0)
    expect(entry.updates).toContainEqual({ disabled: true })
  })

  it('never touches a lookalike row during the sweep', async () => {
    const lookalike = entryOf('auto-review', '@deepseek-ai/dsh-web')
    const { seam, state } = seamBench()
    const ctx = new Context()
    ctx.provide('loader', { entries: () => [lookalike][Symbol.iterator]() } as never)
    installAutoReviewTakeover(ctx, seam)
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(state.claimed).toBe(0)
    expect(lookalike.updates).toEqual([])
  })
})
