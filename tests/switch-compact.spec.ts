import { describe, expect, it, vi } from 'vitest'
import { installSwitchCompaction, overSwitchBudget, sameSwitchRoute, shouldProtectSwitch, switchInputBudget } from '../src/switch-compact.ts'

describe('send-time switch protection', () => {
  it('ignores picker-only sameness and the off switch, without a vendor whitelist', () => {
    const from = { provider: 'codex', model: 'gpt-5' }
    const to = { provider: 'grok', model: 'grok-4' }
    expect(shouldProtectSwitch(true, from, to)).toBe(true)
    expect(shouldProtectSwitch(false, from, to)).toBe(false)
    expect(shouldProtectSwitch(true, from, from)).toBe(false)
    expect(shouldProtectSwitch(true, undefined, to)).toBe(false)
    expect(shouldProtectSwitch(true, from, { provider: 'antigravity', model: 'gemini' })).toBe(true)
    expect(sameSwitchRoute(from, { provider: 'codex', model: 'gpt-5' })).toBe(true)
    expect(sameSwitchRoute(from, { provider: 'codex', model: 'gpt-5-1m' })).toBe(false)
  })

  it('reserves output and an estimate margin instead of treating the window as exact', () => {
    expect(switchInputBudget(200)).toBe(96)
    expect(switchInputBudget(200, 80)).toBe(56)
    expect(switchInputBudget(0)).toBeUndefined()
    expect(overSwitchBudget(100, 160)).toBe(false)
    expect(overSwitchBudget(161, 160)).toBe(true)
    expect(overSwitchBudget(1, 0)).toBe(true)
  })
})

/** A context stub that records listener registrations and can refuse one install. */
function benchContext() {
  let refusePreStep = false
  const listeners: { name: string; handler: (...args: never[]) => unknown }[] = []
  const ctx = {
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    on: (name: string, handler: (...args: never[]) => unknown) => {
      if (name === 'agent/pre-step' && refusePreStep) throw new Error('registration refused')
      const record = { name, handler }
      listeners.push(record)
      return () => {
        const index = listeners.indexOf(record)
        if (index >= 0) listeners.splice(index, 1)
      }
    },
  }
  return {
    ctx: ctx as never,
    gates: () => listeners.filter(listener => listener.name === 'agent/pre-step'),
    /** Run the assemble hook once for one agent, the way the Host does per step. */
    assemble: async (agent: object) => {
      const handler = listeners.find(listener => listener.name === 'system-prompt/assemble')
      await handler?.handler({}, { agent }, async () => ({ variables: {} }))
    },
    refuseNextInstall: () => { refusePreStep = true },
  }
}

describe('switch-time compaction guard lifecycle', () => {
  it('keeps exactly one live pre-step guard across repeated assemblies', async () => {
    const { ctx, gates, assemble } = benchContext()
    installSwitchCompaction(ctx, () => ({ compactOnSwitch: true }))
    expect(gates()).toHaveLength(0)
    const agent = {}
    await assemble(agent)
    expect(gates()).toHaveLength(1)
    await assemble(agent)
    expect(gates()).toHaveLength(1)
  })

  it('keeps the existing guard when a replacement cannot be installed', async () => {
    const { ctx, gates, assemble, refuseNextInstall } = benchContext()
    installSwitchCompaction(ctx, () => ({ compactOnSwitch: true }))
    const agent = {}
    await assemble(agent)
    const installed = gates()[0]
    refuseNextInstall()
    await assemble(agent)
    // A refused replacement must not retire the guard that is still working.
    expect(gates()).toHaveLength(1)
    expect(gates()[0]).toBe(installed)
  })
})
