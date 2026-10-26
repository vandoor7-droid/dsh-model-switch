#!/usr/bin/env node
/**
 * Route report: summarise (and optionally assert) what the route probe recorded.
 *
 * Usage:
 *   node tools/route-report.mjs [--log route-probe.jsonl] [--clear]
 *   node tools/route-report.mjs --assert apigoto/mimo-v2.6-flash [--assert ...] [--since 2026-10-26T00:00:00Z]
 *
 * The report groups observations by `provider/model` tag and probe port. A route
 * assertion fails (exit code 1) unless at least one observation matches, which is
 * what a scripted routing test uses to prove the route actually ran.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

/** Read `--name value` / `--name=value` pairs. */
function flag(name, fallback) {
  const argv = process.argv.slice(2)
  const inline = argv.find((item) => item.startsWith(`--${name}=`))
  if (inline !== undefined) return inline.slice(name.length + 3)
  const index = argv.indexOf(`--${name}`)
  return index >= 0 && argv[index + 1] !== undefined ? argv[index + 1] : fallback
}

/** Every `--assert` value, in order. */
function assertions() {
  const argv = process.argv.slice(2)
  const values = []
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]
    if (item === '--assert') values.push(argv[index + 1] ?? '')
    else if (item.startsWith('--assert=')) values.push(item.slice('--assert='.length))
  }
  return values.filter((value) => value !== '')
}

const logPath = flag('log', 'route-probe.jsonl')
const since = flag('since', '')
const onlyPort = flag('port', '')
if (process.argv.includes('--clear')) {
  writeFileSync(logPath, '')
  console.log(`route-report: cleared ${logPath}`)
  process.exit(0)
}

/** One recorded observation. */
const entries = existsSync(logPath)
  ? readFileSync(logPath, 'utf8').split('\n').filter((line) => line.trim() !== '').map((line) => {
    try {
      return JSON.parse(line)
    } catch {
      return undefined
    }
  }).filter((entry) => entry !== undefined)
  : []

const visible = entries
  .filter((entry) => since === '' || String(entry.ts ?? '') >= since)
  .filter((entry) => onlyPort === '' || String(entry.port ?? '') === onlyPort)
/** A route tag: the model a provider was asked for (`''` when unknown). */
const tagOf = (entry) => (typeof entry.model === 'string' && entry.model !== '' ? entry.model : '(no model)')

/** Group by tag + port. */
const groups = new Map()
for (const entry of visible) {
  const key = `${tagOf(entry)}\u0000${entry.port ?? ''}`
  const group = groups.get(key) ?? { tag: tagOf(entry), port: entry.port ?? '', count: 0, first: entry.ts, last: entry.ts }
  group.count += 1
  group.last = entry.ts
  groups.set(key, group)
}

if (groups.size === 0) {
  console.log(`route-report: no observations in ${logPath}${since === '' ? '' : ` since ${since}`}`)
} else {
  const rows = [...groups.values()].sort((left, right) => right.count - left.count)
  const width = Math.max(...rows.map((row) => row.tag.length), 6)
  console.log(`${'model'.padEnd(width)}  port   count  first                    last`)
  for (const row of rows) {
    console.log(`${row.tag.padEnd(width)}  ${String(row.port).padEnd(5)}  ${String(row.count).padStart(5)}  ${row.first}  ${row.last}`)
  }
}

const wanted = assertions()
let failed = 0
for (const want of wanted) {
  // The probe identifies a provider by the port it was pointed at, so an exact
  // model tag plus the optional --port filter is what proves the attribution.
  const hit = visible.some((entry) => tagOf(entry) === want)
  console.log(`route-report: assert ${want} -> ${hit ? 'OK' : 'MISSING'}`)
  if (!hit) failed += 1
}
process.exit(failed === 0 ? 0 : 1)
