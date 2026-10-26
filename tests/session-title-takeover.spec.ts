import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Entry } from '@deepseek-ai/cordis-plugin-loader'
import {
  apply,
  isOfficialTitleRow,
  officialTitleEntry,
  TAKEOVER_MAX_ATTEMPTS,
  TAKEOVER_RETRY_DELAY_MS,
} from '../src/session-title.js'

const FIRST_PROMPT = '@deepseek-ai/dsh-session-title-first-prompt-llm'
const ALL_PROMPTS = '@deepseek-ai/dsh-session-title-all-prompts-llm'

/** A loader entry stand-in: the fields the takeover reads, plus its update() calls. */
function entryOf(id: string, pkg: string, config: Record<string, unknown> = {}): Entry & { disabled: boolean; updates: unknown[] } {
  const entry = {
    id,
    options: { id, name: pkg, config },
    disabled: false,
    updates: [] as unknown[],
    async update(options: Record<string, unknown>) {
      entry.updates.push(options)
      if (options.disabled === true) entry.disabled = true
    },
  }
  return entry as unknown as Entry & { disabled: boolean; updates: unknown[] }
}

function loaderOf(entries: Entry[]) {
  return { entries: () => entries[Symbol.iterator]() }
}

/**
 * A stand-in for DSH's single-slot session-title service.
 *
 * It reproduces the two properties the takeover depends on: a second live
 * registration throws naming the incumbent, and a registration whose disposer
 * ran (closing) may be replaced.
 */
function serviceBench() {
  const provider = {
    registration: undefined as undefined | { provider: { id: string; automatic: string }; closing: boolean; dispose: () => Promise<void> },
  }
  const registered: Array<{ id: string; automatic: string }> = []
  const register = vi.fn((candidate: { id: string; automatic: string }) => {
    const live = provider.registration
    if (live !== undefined && !live.closing) throw new Error(`session-title provider "${live.provider.id}" is already registered`)
    registered.push({ id: candidate.id, automatic: candidate.automatic })
    const state = {
      provider: candidate,
      closing: false,
      dispose: async () => { state.closing = true },
    }
    provider.registration = state
    return state.dispose
  })
  const current = () => provider.registration
  return { register, registered, current }
}

/** One context carrying the slot service plus the loader service. */
function ctxOf(entries: Entry[], service = serviceBench()) {
  const ctx = new Context()
  ctx.provide('sessionTitle', { register: service.register } as never)
  ctx.provide('loader', loaderOf(entries) as never)
  return { ctx, service }
}

const flush = async (rounds = 3): Promise<void> => {
  for (let index = 0; index < rounds; index += 1) await new Promise(resolve => setTimeout(resolve, TAKEOVER_RETRY_DELAY_MS))
}

describe('officialTitleEntry', () => {
  it('prefers the all-prompts row the experimental bundle inserts', () => {
    const first = entryOf('session-title-llm', FIRST_PROMPT)
    const all = entryOf('optional-session-title-all-prompts', ALL_PROMPTS)
    expect(officialTitleEntry(loaderOf([first, all]) as never)).toBe(all)
    expect(officialTitleEntry(loaderOf([first]) as never)).toBe(first)
    expect(officialTitleEntry(loaderOf([]) as never)).toBeUndefined()
  })
})

describe('isOfficialTitleRow', () => {
  it('recognizes both published rows and their packages', () => {
    expect(isOfficialTitleRow(entryOf('session-title-llm', FIRST_PROMPT))).toBe(true)
    expect(isOfficialTitleRow(entryOf('optional-session-title-all-prompts', ALL_PROMPTS))).toBe(true)
    expect(isOfficialTitleRow(entryOf('anything', ALL_PROMPTS))).toBe(true)
    expect(isOfficialTitleRow(entryOf('web', '@deepseek-ai/dsh-web'))).toBe(false)
    expect(isOfficialTitleRow(undefined)).toBe(false)
  })

  it('refuses an id-only match, because matching a row leads to disposing it', () => {
    // A recycled id on another plugin's row (or a group) must never be treated
    // as the official naming provider: the takeover disables the matched entry.
    expect(isOfficialTitleRow(entryOf('session-title-llm', '@deepseek-ai/dsh-web'))).toBe(false)
    expect(isOfficialTitleRow(entryOf('optional-session-title-all-prompts', 'custom-title-provider'))).toBe(false)
  })
})

describe('session-title takeover', () => {
  it('yields the slot before the official row registers, then reclaims it with the all-prompts cadence', async () => {
    // Startup: only the default first-prompt row is in the tree, disabled by our patch.
    const first = entryOf('session-title-llm', FIRST_PROMPT)
    const { ctx, service } = ctxOf([first])
    await apply(ctx)
    // An enabled official row is displaced asynchronously, so the claim settles
    // after `apply` returns instead of racing that row's own registration.
    // Bounded wait instead of a fixed flush: the takeover settles on its own
    // schedule, and a fixed window is timing-sensitive under a parallel run.
    await vi.waitFor(() => {
      expect(service.registered).toHaveLength(1)
    }, { timeout: 5000 })
    expect(service.registered[0]).toMatchObject({ id: 'session-title-first-prompt-llm', automatic: 'first-prompt' })

    // The user enables the experimental bundle: the loader runs this entry's
    // `loader/patch-context` waterfall first and only then its plugin `apply`
    // registers. Both steps happen in one synchronous turn here, which is the
    // timing the takeover is built for.
    const all = entryOf('optional-session-title-all-prompts', ALL_PROMPTS, {
      targetWords: 5, targetCjkCharacters: 10, maxInputBytes: 4096, maxOutputTokens: 64, timeoutMs: 60000,
    })
    ctx.waterfall('loader/patch-context', all, () => ({ kind: 'patch' }))
    const officialDispose = service.register({ id: 'session-title-all-prompts-llm', automatic: 'all-prompts' })
    expect(service.registered.at(-1)).toMatchObject({ id: 'session-title-all-prompts-llm', automatic: 'all-prompts' })

    // The takeover then disables that row and takes the slot back; the official
    // row's own disposal (its fiber dispose) is what frees the slot for good.
    await flush(TAKEOVER_MAX_ATTEMPTS)
    await officialDispose()
    expect(all.updates).toContainEqual({ disabled: true })
    await flush(TAKEOVER_MAX_ATTEMPTS)
    expect(service.current()?.provider.id).toBe('session-title-all-prompts-llm')
  })

  it('leaves the slot free for an official row that activates in the same composition', async () => {
    // A composition rewrite (saving a model provider re-writes the bundle layer)
    // re-creates the inserted row enabled. Holding the slot here would make that
    // row's own register() throw "already registered"; a failed activation aborts
    // the whole composition, which is how the provider save used to fail.
    const all = entryOf('optional-session-title-all-prompts', ALL_PROMPTS, {
      targetWords: 5, targetCjkCharacters: 10, maxInputBytes: 4096, maxOutputTokens: 64, timeoutMs: 60000,
    })
    const { ctx, service } = ctxOf([all])

    await apply(ctx)
    // Nothing is claimed before that row has had its chance to register.
    expect(service.registered).toHaveLength(0)
    const officialDispose = service.register({ id: 'session-title-all-prompts-llm', automatic: 'all-prompts' })

    // The takeover still converges once the official registration releases.
    await flush(TAKEOVER_MAX_ATTEMPTS)
    await officialDispose()
    await flush(TAKEOVER_MAX_ATTEMPTS)
    expect(all.updates).toContainEqual({ disabled: true })
    expect(service.current()?.provider.id).toBe('session-title-all-prompts-llm')
  })

  it('handles one entry once even when patch-context fires repeatedly', async () => {
    const { ctx, service } = ctxOf([entryOf('session-title-llm', FIRST_PROMPT)])
    await apply(ctx)
    const all = entryOf('optional-session-title-all-prompts', ALL_PROMPTS, { maxInputBytes: 4096, maxOutputTokens: 64, timeoutMs: 1000 })
    await ctx.waterfall('loader/patch-context', all, () => undefined)
    await ctx.waterfall('loader/patch-context', all, () => undefined)
    const before = service.registered.length
    await flush(TAKEOVER_MAX_ATTEMPTS)
    expect(service.registered.length - before).toBeLessThanOrEqual(1)
  })

  it('keeps the first-prompt registration when no official row ever activates', async () => {
    const { ctx, service } = ctxOf([entryOf('session-title-llm', FIRST_PROMPT)])
    await apply(ctx)
    await flush()
    expect(service.registered).toHaveLength(1)
  })

  it('sweeps an official row that activated before this row started', async () => {
    // The experimental row was composed/activated first, so it owns the slot
    // when this row's own apply runs: the initial claim fails.
    const all = entryOf('optional-session-title-all-prompts', ALL_PROMPTS, { maxInputBytes: 4096, maxOutputTokens: 64, timeoutMs: 1000 })
    const { ctx, service } = ctxOf([all])
    const officialDispose = service.register({ id: 'session-title-all-prompts-llm', automatic: 'all-prompts' })
    expect(service.registered).toHaveLength(1)

    await apply(ctx)
    // In the Host, the takeover's `entry.update({ disabled: true })` disposes the
    // row's fiber, which is what closes that row's registration.
    await officialDispose()
    await flush(TAKEOVER_MAX_ATTEMPTS)

    expect(all.updates).toContainEqual({ disabled: true })
    expect(service.current()?.provider.id).toBe('session-title-all-prompts-llm')
    // The takeover owns the slot now, so the official provider cannot take it back.
    expect(() => service.register({ id: 'session-title-all-prompts-llm', automatic: 'all-prompts' })).toThrow(/already registered/)
  })

  it('never disables a lookalike row that only reuses the official id', async () => {
    // The takeover disposes a matched entry, so an id-only lookalike (another
    // package reusing `session-title-llm`) must be left alone entirely.
    const lookalike = entryOf('session-title-llm', '@deepseek-ai/dsh-web')
    const { ctx } = ctxOf([lookalike])
    await apply(ctx)
    await ctx.waterfall('loader/patch-context', lookalike, () => undefined)
    await flush(TAKEOVER_MAX_ATTEMPTS)
    expect(lookalike.updates).not.toContainEqual({ disabled: true })
  })

  it('reports the lost route and keeps the official provider when the slot never frees', async () => {
    // The official row holds the slot and never disposes, so every reclaim
    // attempt fails: the row must log the degradation and leave naming to the
    // official provider instead of guessing a route or crashing.
    const all = entryOf('optional-session-title-all-prompts', ALL_PROMPTS, { maxInputBytes: 4096, maxOutputTokens: 64, timeoutMs: 1000 })
    const { ctx, service } = ctxOf([all])
    service.register({ id: 'session-title-all-prompts-llm', automatic: 'all-prompts' })
    const info = vi.spyOn(ctx.logger, 'info')

    await apply(ctx)
    await flush(TAKEOVER_MAX_ATTEMPTS + 3)

    expect(info.mock.calls.some(call => String(call[0]).includes('owns the seam'))).toBe(true)
    expect(service.current()?.provider.id).toBe('session-title-all-prompts-llm')
    expect(service.registered).toHaveLength(1)
  })
})
