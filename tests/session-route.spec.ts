import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import {
  deploymentRoute,
  groupRoute,
  resolveCapabilityRoute,
  sessionProviderOf,
  sessionSubagentRouteOf,
  subagentRouteOf,
  type RouteBearingSettings,
} from '../src/session-route.js'

/** One provider's saved group: a naming pin, a subagent pin, and one blank field. */
const codexGroup = {
  titleProvider: 'grok',
  titleModel: 'grok-title',
  subagentProvider: 'grok',
  subagentModel: 'grok-fast',
  subagentReasoningEffort: 'low',
  autoReviewModel: '  ',
}

/** Deployment-wide flat routes plus the saved group table. */
function settings(extra: Partial<RouteBearingSettings> = {}): RouteBearingSettings {
  return {
    subagentMode: 'follow-main',
    titleProvider: 'deepseek',
    titleModel: 'deep-title',
    providerGroups: { codex: codexGroup },
    ...extra,
  }
}

/** What one fake session reports through the public read faces. */
interface SessionProbe {
  /** `modelSelection` projection state; undefined means the key is unregistered. */
  projection?: { lastUsed?: { provider: string } | null; pending?: { provider: string } | null } | undefined
  /** Make the projection read throw, as a disposed registry would. */
  failingRegistry?: boolean
  /** Provider of the latest logged request-context route. */
  context?: string
  /** Provider of the latest logged request-header route. */
  header?: string
}

function fakeContext(probe: SessionProbe = {}): Context {
  const registry = probe.failingRegistry === true
    ? { stateOf: () => { throw new Error('registry disposed') } }
    : { stateOf: () => probe.projection }
  return {
    get: (name: string) => name === 'sessionProjections' ? registry : undefined,
  } as unknown as Context
}

function fakeSession(probe: SessionProbe = {}): Session {
  return {
    requestContext: () => probe.context === undefined ? undefined : { provider: probe.context, model: 'a-model' },
    requestHeader: () => probe.header === undefined ? undefined : { config: { provider: probe.header, model: 'a-model' } },
  } as unknown as Session
}

describe('deploymentRoute', () => {
  it('reads the flat pair a capability falls back to when no group applies', () => {
    expect(deploymentRoute(settings(), 'title')).toEqual({ provider: 'deepseek', model: 'deep-title' })
  })

  it('requires both halves, so a half-written pair resolves to the official default', () => {
    expect(deploymentRoute(settings({ titleModel: '   ' }), 'title')).toBeUndefined()
    expect(deploymentRoute(settings({ titleProvider: '' }), 'title')).toBeUndefined()
    expect(deploymentRoute(undefined, 'title')).toBeUndefined()
  })

  it('reports no route for a capability that pins nothing', () => {
    expect(deploymentRoute(settings(), 'autoReview')).toBeUndefined()
    expect(deploymentRoute(settings(), 'compaction')).toBeUndefined()
  })
})

describe('groupRoute', () => {
  it('returns the saved pair for the provider the session reports', () => {
    expect(groupRoute(settings(), 'codex', 'title')).toEqual({ provider: 'grok', model: 'grok-title' })
    expect(groupRoute(settings(), 'codex', 'subagent')).toEqual({ provider: 'grok', model: 'grok-fast' })
  })

  it('keeps the capability at its default for a provider without a group', () => {
    expect(groupRoute(settings(), 'deepseek', 'title')).toBeUndefined()
    expect(groupRoute(settings(), undefined, 'title')).toBeUndefined()
    expect(groupRoute(settings(), '  ', 'title')).toBeUndefined()
  })

  it('ignores a blank or half-written group field instead of pinning an empty route', () => {
    expect(groupRoute(settings(), 'codex', 'autoReview')).toBeUndefined()
    expect(groupRoute(settings({ providerGroups: { codex: { titleProvider: 'grok' } } }), 'codex', 'title')).toBeUndefined()
  })

  it('never lets a stored provider name reach the prototype chain', () => {
    expect(groupRoute(settings(), '__proto__', 'title')).toBeUndefined()
    expect(groupRoute(settings(), 'constructor', 'title')).toBeUndefined()
  })
})

describe('resolveCapabilityRoute', () => {
  it('prefers the session provider group over the deployment-wide pair', () => {
    expect(resolveCapabilityRoute(settings(), 'codex', 'title')).toEqual({ provider: 'grok', model: 'grok-title' })
  })

  it('falls back to the deployment-wide pair for a provider without a group', () => {
    expect(resolveCapabilityRoute(settings(), 'deepseek', 'title')).toEqual({ provider: 'deepseek', model: 'deep-title' })
  })

  it('falls back to the deployment-wide pair when no session provider is observable', () => {
    expect(resolveCapabilityRoute(settings(), undefined, 'title')).toEqual({ provider: 'deepseek', model: 'deep-title' })
  })

  it('keys on the provider alone, so a model change inside one provider never re-pins', () => {
    // The resolver has no model input by construction: the same provider always
    // resolves the same saved group, whatever model that session runs.
    const pinned = resolveCapabilityRoute(settings(), 'codex', 'title')
    expect(resolveCapabilityRoute(settings({ titleModel: 'another-deep-model' }), 'codex', 'title')).toEqual(pinned)
    expect(resolveCapabilityRoute(settings(), 'codex', 'title')).toEqual(pinned)
  })

  it('resolves one capability per call, so a group pin on naming leaves auto review alone', () => {
    expect(resolveCapabilityRoute(settings(), 'codex', 'autoReview')).toBeUndefined()
  })
})

describe('subagentRouteOf', () => {
  it('applies a provider group pin even while the deployment default follows the main route', () => {
    expect(subagentRouteOf(settings(), 'codex')).toEqual({ provider: 'grok', model: 'grok-fast', reasoningEffort: 'low' })
  })

  it('omits the effort when the group pins none', () => {
    const flat = settings({ providerGroups: { codex: { subagentProvider: 'grok', subagentModel: 'grok-fast' } } })
    expect(subagentRouteOf(flat, 'codex')).toEqual({ provider: 'grok', model: 'grok-fast' })
  })

  it('uses the flat pair with its effort only in fixed mode', () => {
    const fixed = settings({ subagentMode: 'fixed', subagentProvider: 'deepseek', subagentModel: 'deep-chat', subagentReasoningEffort: 'max' })
    expect(subagentRouteOf(fixed, 'deepseek')).toEqual({ provider: 'deepseek', model: 'deep-chat', reasoningEffort: 'max' })
  })

  it('keeps official inherit in follow-main mode, and when the fixed pair is incomplete', () => {
    expect(subagentRouteOf(settings(), 'deepseek')).toBeUndefined()
    expect(subagentRouteOf(settings({ subagentMode: 'fixed' }), 'deepseek')).toBeUndefined()
    expect(subagentRouteOf(undefined, 'codex')).toBeUndefined()
  })

  it('treats a blank group effort as absent rather than pinning an empty one', () => {
    const blank = settings({ providerGroups: { codex: { ...codexGroup, subagentReasoningEffort: ' ' } } })
    const route = subagentRouteOf(blank, 'codex')
    expect(route).toEqual({ provider: 'grok', model: 'grok-fast' })
    expect(Object.prototype.hasOwnProperty.call(route, 'reasoningEffort')).toBe(false)
  })
})

describe('sessionProviderOf', () => {
  it('prefers a selection the user just made over the last one a request consumed', () => {
    const probe: SessionProbe = { projection: { lastUsed: { provider: 'deepseek' }, pending: { provider: 'codex' } } }
    expect(sessionProviderOf(fakeContext(probe), fakeSession(probe))).toBe('codex')
  })

  it('falls back to the last used provider, then to the logged request routes', () => {
    expect(sessionProviderOf(fakeContext({ projection: { lastUsed: { provider: 'deepseek' }, pending: null } }), fakeSession({ context: 'grok' }))).toBe('deepseek')
    expect(sessionProviderOf(fakeContext({ projection: undefined }), fakeSession({ context: 'grok' }))).toBe('grok')
    expect(sessionProviderOf(fakeContext({ projection: undefined }), fakeSession({ header: 'codex' }))).toBe('codex')
  })

  it('resolves nothing for a profile without the projection package or a session that logged no route', () => {
    expect(sessionProviderOf(fakeContext({ projection: undefined }), fakeSession())).toBeUndefined()
    expect(sessionProviderOf(fakeContext(), undefined)).toBeUndefined()
  })

  it('survives a registry that throws instead of failing the request', () => {
    expect(sessionProviderOf(fakeContext({ failingRegistry: true }), fakeSession({ context: 'grok' }))).toBe('grok')
  })

  it('treats blank identifiers as absent', () => {
    expect(sessionProviderOf(fakeContext({ projection: { lastUsed: { provider: '  ' }, pending: null } }), fakeSession({ context: 'grok' }))).toBe('grok')
    expect(sessionProviderOf(fakeContext({ projection: undefined }), fakeSession({ context: ' ' }))).toBeUndefined()
  })
})

describe('sessionSubagentRouteOf', () => {
  it('routes a spawn by the delegating session provider, not by the profile', () => {
    const probe: SessionProbe = { projection: { lastUsed: { provider: 'codex' }, pending: null } }
    expect(sessionSubagentRouteOf(fakeContext(probe), fakeSession(probe), settings())).toEqual({ provider: 'grok', model: 'grok-fast', reasoningEffort: 'low' })
  })

  it('gives two delegating sessions on different providers their own routes', () => {
    const ctx = fakeContext({ projection: undefined })
    const codexParent = fakeSession({ context: 'codex' })
    const deepseekParent = fakeSession({ context: 'deepseek' })
    const live = settings({ subagentMode: 'fixed', subagentProvider: 'deepseek', subagentModel: 'deep-chat' })
    expect(sessionSubagentRouteOf(ctx, codexParent, live)).toEqual({ provider: 'grok', model: 'grok-fast', reasoningEffort: 'low' })
    expect(sessionSubagentRouteOf(ctx, deepseekParent, live)).toEqual({ provider: 'deepseek', model: 'deep-chat' })
  })

  it('keeps official inherit when the delegating session reports no provider and the default follows the main route', () => {
    expect(sessionSubagentRouteOf(fakeContext(), fakeSession(), settings())).toBeUndefined()
  })
})
