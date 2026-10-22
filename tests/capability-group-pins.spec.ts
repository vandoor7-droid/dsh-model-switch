import { describe, expect, it } from 'vitest'
import { capabilityGroupPins } from '../src/session-route.js'

/** Two saved groups: one pinned on every capability, one pinned only where it overrides. */
const groups = {
  grok: {
    compactProvider: 'grok',
    compactModel: 'grok-compact',
    autoReviewProvider: 'grok',
    autoReviewModel: 'grok-review',
    titleProvider: 'grok',
    titleModel: 'grok-title',
    subagentProvider: 'grok',
    subagentModel: 'grok-fast',
    subagentReasoningEffort: 'low',
  },
  apigoto: {
    compactProvider: '',
    compactModel: '',
    autoReviewProvider: 'apigoto',
    autoReviewModel: 'gpt-6-luna',
    titleProvider: '',
    titleModel: '',
    subagentProvider: 'apigoto',
    subagentModel: 'gpt-6-luna',
    subagentReasoningEffort: '',
  },
}

describe('capabilityGroupPins', () => {
  it('lists every group that overrides the capability, ordered by provider', () => {
    expect(capabilityGroupPins(groups, 'autoReview')).toEqual([
      { provider: 'apigoto', route: { provider: 'apigoto', model: 'gpt-6-luna' } },
      { provider: 'grok', route: { provider: 'grok', model: 'grok-review' } },
    ])
  })

  it('carries a subagent spawn effort and skips a group whose pair is incomplete', () => {
    expect(capabilityGroupPins(groups, 'subagent')).toEqual([
      { provider: 'apigoto', route: { provider: 'apigoto', model: 'gpt-6-luna' } },
      { provider: 'grok', route: { provider: 'grok', model: 'grok-fast' }, reasoningEffort: 'low' },
    ])
    expect(capabilityGroupPins(groups, 'compaction').map(pin => pin.provider)).toEqual(['grok'])
  })

  it('treats a blank half as unpinned, so naming keeps following the session model', () => {
    expect(capabilityGroupPins(groups, 'title').map(pin => pin.provider)).toEqual(['grok'])
  })

  it('returns nothing when no group table is reachable', () => {
    expect(capabilityGroupPins(undefined, 'title')).toEqual([])
    expect(capabilityGroupPins({}, 'title')).toEqual([])
  })
})
