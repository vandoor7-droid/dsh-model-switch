import { describe, expect, it } from 'vitest'
import {
  DEFAULT_READ_ONLY_TOOLS,
  SOURCE_CATALOG,
  isAllowedByList,
  matchesAllowPattern,
  resolveToolSource,
  validateAllowEntry,
} from '../src/tool-allowlist.ts'
import { decodeReviewStatus, decodeToolCatalog } from '../src/client-contract.ts'

/** Tools that must never be covered by the shipped defaults. */
const MUTATING = [
  'write', 'edit', 'pwsh', 'ops_bash', 'todo_write', 'create_skill',
  'job_kill', 'terminal_send', 'terminal_close',
  'team_task_update', 'memory_write', 'memory_delete',
  'memory_delete_all', 'memory_prune',
  'mcp__wincu__windows_computer_use_click', 'mcp__wincu__windows_computer_use_type_text',
  'mcp__wincu__windows_computer_use_keypress', 'mcp__wincu__windows_computer_use_drag',
  'bcdp_navigate', 'bcdp_script', 'browser_window_open', 'generate_image',
  'qq_send__YiXuan', 'session_send__YiXuan',
]

/**
 * Delegation tools that must never be covered.
 *
 * A child session seeds its permission preset from
 * `permissionPresets.current(parent.session)` and only inherits `auto` /
 * `danger-full-access`. This plugin's bypass answers `'custom'` for an allowlisted
 * call in flight, so releasing a spawn tool would strip the child of the auto
 * preset entirely — an unreviewed subagent, which is exactly what the allowlist
 * must not create.
 */
const DELEGATION_SPAWNS = ['subagent', 'subagent_fork', 'spawn_teammate']

describe('DEFAULT_READ_ONLY_TOOLS', () => {
  it('ships the calibrated catalog', () => {
    expect(DEFAULT_READ_ONLY_TOOLS).toHaveLength(58)
    expect(new Set(DEFAULT_READ_ONLY_TOOLS).size).toBe(58)
  })

  it('never covers a mutating tool', () => {
    for (const tool of MUTATING) {
      expect(isAllowedByList(tool, DEFAULT_READ_ONLY_TOOLS), tool).toBe(false)
    }
  })

  it('never covers a delegation spawn', () => {
    for (const tool of DELEGATION_SPAWNS) {
      expect(isAllowedByList(tool, DEFAULT_READ_ONLY_TOOLS), tool).toBe(false)
    }
  })

  it('covers the tools released by explicit user decision', () => {
    for (const tool of [
      'load_workspace_dependencies', 'wait_agent', 'ask_user_question', 'present',
      'sidebar_open', 'exit_plan_mode', 'send_message', 'team_task_create',
      'terminal_open', 'create_goal', 'schedule_create',
    ]) {
      expect(isAllowedByList(tool, DEFAULT_READ_ONLY_TOOLS), tool).toBe(true)
    }
  })

  it('covers the read tools it claims', () => {
    for (const tool of ['read', 'grep', 'glob', 'ops_read_files', 'bcdp_snapshot', 'memory_read', 'web_fetch']) {
      expect(isAllowedByList(tool, DEFAULT_READ_ONLY_TOOLS), tool).toBe(true)
    }
  })

  it('resolves every entry to a catalogued source with a repository', () => {
    for (const entry of DEFAULT_READ_ONLY_TOOLS) {
      const source = resolveToolSource(entry)
      expect(source.kind, entry).not.toBe('unknown')
      expect(source.repo, entry).toBeTruthy()
    }
    for (const source of SOURCE_CATALOG) expect(source.repo).toMatch(/^https:\/\/github\.com\//)
  })
})

describe('allowlist patterns', () => {
  it('keeps the bot-suffixed extension tools covered after a rename', () => {
    expect(isAllowedByList('sessions_list__YiXuan', DEFAULT_READ_ONLY_TOOLS)).toBe(true)
    expect(isAllowedByList('sessions_list__AnyFutureBot', DEFAULT_READ_ONLY_TOOLS)).toBe(true)
    expect(isAllowedByList('bing_search__YiXuan', DEFAULT_READ_ONLY_TOOLS)).toBe(true)
    // The send tools share the suffix convention but not the base name.
    expect(isAllowedByList('session_send__YiXuan', DEFAULT_READ_ONLY_TOOLS)).toBe(false)
  })

  it('matches a wildcard only after its literal prefix', () => {
    expect(matchesAllowPattern('sessions_list__bot', 'sessions_list__*')).toBe(true)
    expect(matchesAllowPattern('sessions_list', 'sessions_list__*')).toBe(false)
    expect(matchesAllowPattern('xsessions_list__bot', 'sessions_list__*')).toBe(false)
    expect(matchesAllowPattern('read', 'read')).toBe(true)
    expect(matchesAllowPattern('read', 'rea')).toBe(false)
  })

  it('refuses entries that could allow everything', () => {
    expect(validateAllowEntry('')).toBe('empty')
    expect(validateAllowEntry('   ')).toBe('empty')
    expect(validateAllowEntry('*')).toBe('bare-wildcard')
    expect(validateAllowEntry('**')).toBe('bare-wildcard')
    expect(validateAllowEntry('*read')).toBe('leading-wildcard')
    expect(validateAllowEntry('read*')).toBe('ok')
    expect(validateAllowEntry('read')).toBe('ok')
    // A refused entry can never match, even if it reached the list directly.
    expect(matchesAllowPattern('write', '*')).toBe(false)
    expect(matchesAllowPattern('read', '*read')).toBe(false)
  })
})

describe('resolveToolSource', () => {
  it('maps an MCP bridge to its server and package repository', () => {
    const source = resolveToolSource('mcp__wincu__windows_computer_use_click')
    expect(source.kind).toBe('mcp')
    expect(source.owner).toBe('wincu')
    expect(source.repo).toBe('https://github.com/Yu-tao-Li/dsh-computer-use-win')
  })

  it('names an unknown MCP server without inventing a repository', () => {
    const source = resolveToolSource('mcp__future__do_thing')
    expect(source.kind).toBe('mcp')
    expect(source.owner).toBe('future')
    expect(source.repo).toBeUndefined()
  })

  it('treats the extension suffix as a configurable owner name', () => {
    const source = resolveToolSource('sessions_list__YiXuan')
    expect(source.kind).toBe('extension')
    expect(source.owner).toBe('YiXuan')
    expect(source.repo).toBe('https://github.com/zaofan-make/dsh-qqbot')
  })

  it('maps the plugin prefixes to their packages', () => {
    expect(resolveToolSource('bcdp_snapshot').repo).toBe('https://github.com/drscrewdriver/dsh-browser-cdp')
    expect(resolveToolSource('browser_window_status').repo).toBe('https://github.com/drscrewdriver/dsh-browser-cdp')
    expect(resolveToolSource('ops_bash').repo).toBe('https://github.com/T-Auto/dsh-ops')
    expect(resolveToolSource('memory_read').repo).toBe('https://github.com/AskTheWay/dsh-auto-memory')
    expect(resolveToolSource('generate_image').repo).toBe('https://github.com/vandoor7-droid/dsh-model-switch')
  })

  it('falls back to the Host catalog, then to unknown', () => {
    const core = resolveToolSource('read')
    expect(core.kind).toBe('core')
    expect(core.repo).toBe('https://github.com/deepseek-ai/deepseek-harness')
    expect(resolveToolSource('some_future_tool').kind).toBe('unknown')
  })
})

describe('decodeToolCatalog', () => {
  it('decodes the RPC payload and marks shipped defaults', () => {
    const rows = decodeToolCatalog({
      tools: [
        { name: 'read', description: 'Read a file', source: { kind: 'core', label: 'DSH 核心', repo: 'https://github.com/deepseek-ai/deepseek-harness' } },
        { name: 'write', description: 'Write a file', source: { kind: 'core', label: 'DSH 核心' } },
      ],
      recommended: [...DEFAULT_READ_ONLY_TOOLS],
    })
    expect(rows).toHaveLength(2)
    expect(rows?.[0]).toMatchObject({ name: 'read', recommended: true, sourceLabel: 'DSH 核心' })
    expect(rows?.[1]).toMatchObject({ name: 'write', recommended: false })
    expect(rows?.[1]?.repo).toBeUndefined()
  })

  it('rejects a payload that is not a catalog', () => {
    expect(decodeToolCatalog(undefined)).toBeUndefined()
    expect(decodeToolCatalog({ nope: true })).toBeUndefined()
    expect(decodeToolCatalog([])).toBeUndefined()
  })
})

describe('decodeReviewStatus', () => {
  it('reads the live counters from the tools payload', () => {
    expect(decodeReviewStatus({ status: { held: true, allowedCalls: 2, skippedReadOnly: 7 } })).toEqual({
      held: true, allowedCalls: 2, skippedReadOnly: 7,
    })
  })

  it('reports nothing when the Host does not publish counters', () => {
    expect(decodeReviewStatus({ tools: [] })).toBeUndefined()
    expect(decodeReviewStatus(undefined)).toBeUndefined()
    // A malformed counter degrades to zero instead of a NaN in the UI.
    expect(decodeReviewStatus({ status: { held: false, allowedCalls: -1, skippedReadOnly: 'x' } })).toEqual({
      held: false, allowedCalls: 0, skippedReadOnly: 0,
    })
  })
})
