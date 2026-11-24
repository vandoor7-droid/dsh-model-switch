#!/usr/bin/env node
/**
 * Model-seat slot-protocol watch: diff the official ui-model-selection seat
 * contract against this plugin's takeover declaration.
 *
 * What it protects (the 0.4.81 fix): installComposerPicker() registers the
 * composer model seat at priority -10 and must declare the official
 * `conversation.input.model` children so the slot runtime authorizes this
 * entry to render the rows the official seat contributed (agent-team switch
 * et al. under `conversation.input.model.options`). Two upstream drifts would
 * silently hide rows again:
 *
 *   A. the official registration declares a NEW child slot key we do not
 *      declare (and therefore never render);
 *   B. the official options owner contract gains/removes fields our
 *      SeatOptionsOwner does not carry (official rows would miss callbacks).
 *
 * Check C cross-reads the official ModelSelect root pane's renderSlot calls —
 * the keys the official seat actually consumes — so a contributor moved to a
 * brand-new slot is also caught.
 *
 * Usage:
 *   node scripts/watch-model-seat.mjs [--host <official install root>]
 *   node scripts/watch-model-seat.mjs --self-test
 *
 * Exit code: 0 = in sync (known exemptions only); 1 = drift needs handling.
 * Run this on every compat-watch round where `latest` moves (see
 * docs/dsh-compat-watch.md, "模型座位插槽巡检").
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Child keys the official seat declares but this plugin deliberately does not render. */
const KNOWN_EXEMPTIONS = new Set([
  // The inline model-label slot: ComposerPicker paints its own trigger label,
  // so the official label contribution has no place in the takeover pane.
  'conversation.input.model.label',
])

const DEFAULT_HOST = 'D:/Program Files (x86)/DeepSeek Harness/resources/app/dsh'
const OUR_SEAT_REGISTRATION = 'src/client/picker/install.tsx'
const OUR_SEAT_OPTIONS = 'src/client/picker/seat-options.ts'
const OFFICIAL_PKG = join('node_modules', '@deepseek-ai', 'dsh-client-ui-model-selection', 'src', 'client')
const OFFICIAL_REGISTRATION = join(OFFICIAL_PKG, 'index.ts')
const OFFICIAL_SLOTS = join(OFFICIAL_PKG, 'slots.ts')
const OFFICIAL_MODEL_SELECT = join(OFFICIAL_PKG, 'ModelSelect.tsx')

/** Extract quoted slot keys inside a balanced block following a header line. */
function blockAfter(source, headerPattern) {
  const header = source.match(headerPattern)
  if (header === null) return undefined
  const open = source.indexOf('{', header.index + header[0].length)
  if (open < 0) return undefined
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(open, i + 1)
    }
  }
  return undefined
}

/** Slot keys declared in a children: { ... } block. */
function declaredChildKeys(block) {
  if (block === undefined) return []
  return [...block.matchAll(/'([\w.]+)'\s*:/g)].map(m => m[1])
}

/** Field names of an inline TypeScript owner interface body (line-anchored so
 * function parameters like (message: string) never masquerade as fields). */
function ownerFieldsOf(block) {
  if (block === undefined) return []
  const fields = []
  for (const line of block.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:readonly\s+)?([A-Za-z][\w]*)\s*[?:]/)
    if (m !== null) fields.push(m[1])
  }
  return fields
}

/** Keys the official ModelSelect renders through renderSlot('key', ...). */
function renderSlotKeys(source) {
  return [...source.matchAll(/renderSlot\(\s*'([\w.]+)'/g)].map(m => m[1])
}

function read(path) {
  return readFileSync(path, 'utf8')
}

function report(title, lines) {
  if (lines.length === 0) return false
  console.error('DRIFT: ' + title)
  for (const line of lines) console.error('  - ' + line)
  return true
}

function checkOurSeat(ourRoot) {
  const registration = read(join(ourRoot, OUR_SEAT_REGISTRATION))
  const childrenBlock = blockAfter(registration, /\.\.\.\(\{ children:/)
  if (childrenBlock === undefined) {
    // Fallback: the literal children object without the type-level exemption spread.
    const literal = registration.match(/children:\s*\{[\s\S]*?\}\s*(?:as|,|\n)/)
    return literal === undefined ? [] : declaredChildKeys(literal[0])
  }
  return declaredChildKeys(childrenBlock)
}

function checkOurOwner(ourRoot) {
  const seatOptions = read(join(ourRoot, OUR_SEAT_OPTIONS))
  const block = blockAfter(seatOptions, /export interface SeatOptionsOwner\s*/)
  return ownerFieldsOf(block)
}

function runAgainst(hostRoot, ourRoot) {
  let drift = false
  const officialRegistration = read(join(hostRoot, OFFICIAL_REGISTRATION))
  const officialSlots = read(join(hostRoot, OFFICIAL_SLOTS))
  const officialModelSelect = read(join(hostRoot, OFFICIAL_MODEL_SELECT))

  // Check A: declared children keys.
  const officialChildren = declaredChildKeys(blockAfter(officialRegistration, /children:\s*/))
  const ourChildren = checkOurSeat(ourRoot)
  const unknown = officialChildren.filter(key => !ourChildren.includes(key) && !KNOWN_EXEMPTIONS.has(key))
  const retired = ourChildren.filter(key => !officialChildren.includes(key))
  drift = report('official seat declares child slots we neither declare nor exempt (scenario A — add the children key + a render site)', unknown) || drift
  drift = report('we declare child slots the official registration no longer declares (cleanup candidate)', retired) || drift
  console.log('official children : [' + officialChildren.join(', ') + ']')
  console.log('our children      : [' + ourChildren.join(', ') + ']')
  console.log('known exemptions  : [' + [...KNOWN_EXEMPTIONS].join(', ') + ']')

  // Check B: the options owner contract.
  const optionsBlock = blockAfter(officialSlots, /'conversation\.input\.model\.options'\s*:/)
  const officialOwner = ownerFieldsOf(blockAfter(optionsBlock ?? '', /owner:\s*/))
  const ourOwner = checkOurOwner(ourRoot)
  const missing = officialOwner.filter(field => !ourOwner.includes(field))
  const extra = ourOwner.filter(field => !officialOwner.includes(field))
  drift = report('official options owner gained fields SeatOptionsOwner lacks (scenario B — sync the assembly in seat-options.ts/ComposerPicker)', missing) || drift
  drift = report('SeatOptionsOwner carries fields the official contract dropped (cleanup candidate)', extra) || drift
  console.log('official owner    : [' + officialOwner.join(', ') + ']')
  console.log('our owner         : [' + ourOwner.join(', ') + ']')

  // Check C: what the official root pane renders.
  const officialRendered = renderSlotKeys(officialModelSelect)
  const renderedUnknown = officialRendered.filter(key => key !== 'conversation.input.model.options' && !KNOWN_EXEMPTIONS.has(key))
  drift = report('official ModelSelect renders slot keys outside our declaration (scenario A variant — extend declaration + render site)', renderedUnknown) || drift
  console.log('official rendered : [' + officialRendered.join(', ') + ']')

  return drift
}

function selfTest() {
  let failures = 0
  const expect = (name, condition) => {
    console.log((condition ? 'ok   ' : 'FAIL ') + name)
    if (!condition) failures++
  }

  const officialRegistration = `
    scope.slots.inject('conversation.input.model', () => scope.slots.register({
      name: 'conversation.input.model',
      locale: NS,
      children: {
        'conversation.input.model.label': { kind: 'single', scope: 'session', inline: true },
        'conversation.input.model.options': { kind: 'list', scope: 'session' },
      },
      inject: directoryFace,
    }, ModelSelect))
  `
  const officialSlots = `
    declare module '@deepseek-ai/dsh-client-ui-slots' {
      interface SlotMap {
        'conversation.input.model.options': {
          kind: 'list'
          scope: 'session'
          owner: {
            locked: boolean
            dismiss: () => void
            reportFailure: (message: string) => void
          }
        }
      }
    }
  `
  const officialModelSelect = `
    {renderSlot('conversation.input.model.options', { locked, reportFailure, dismiss })}
  `

  const base = {
    officialChildren: declaredChildKeys(blockAfter(officialRegistration, /children:\s*/)),
    officialOwner: ownerFieldsOf(blockAfter(blockAfter(officialSlots, /'conversation\.input\.model\.options'\s*:/) ?? '', /owner:\s*/)),
    officialRendered: renderSlotKeys(officialModelSelect),
  }

  expect('parses both declared child keys', base.officialChildren.length === 2 && base.officialChildren.includes('conversation.input.model.options'))
  expect('parses the three owner fields', base.officialOwner.length === 3 && base.officialOwner.includes('reportFailure'))
  expect('parses the renderSlot call', base.officialRendered.includes('conversation.input.model.options'))

  // Scenario A drill: a new official child key must surface as unknown.
  const newKeyRegistration = officialRegistration.replace(
    "'conversation.input.model.options': { kind: 'list', scope: 'session' },",
    "'conversation.input.model.options': { kind: 'list', scope: 'session' },\n        'conversation.input.model.smartmode': { kind: 'list', scope: 'session' },",
  )
  const withNewKey = declaredChildKeys(blockAfter(newKeyRegistration, /children:\s*/))
  const unknownA = withNewKey.filter(key => !['conversation.input.model.options'].includes(key) && !KNOWN_EXEMPTIONS.has(key))
  expect('detects a newly declared official child key', unknownA.includes('conversation.input.model.smartmode'))

  // Scenario B drill: a gained owner field must surface as missing.
  const gainedOwnerSlots = officialSlots.replace('reportFailure: (message: string) => void', 'reportFailure: (message: string) => void\n            onBeforeSwitch: () => Promise<void>')
  const gainedOwner = ownerFieldsOf(blockAfter(blockAfter(gainedOwnerSlots, /'conversation\.input\.model\.options'\s*:/) ?? '', /owner:\s*/))
  const missingB = gainedOwner.filter(field => !['locked', 'dismiss', 'reportFailure'].includes(field))
  expect('detects a gained official owner field', missingB.includes('onBeforeSwitch'))

  // Check C drill: a renderSlot key outside our declaration must surface.
  const movedModelSelect = officialModelSelect.replace(
    "renderSlot('conversation.input.model.options'",
    "renderSlot('conversation.input.model.teamwork'",
  )
  const moved = renderSlotKeys(movedModelSelect).filter(key => key !== 'conversation.input.model.options' && !KNOWN_EXEMPTIONS.has(key))
  expect('detects a renderSlot key outside our declaration', moved.includes('conversation.input.model.teamwork'))

  return failures === 0 ? 0 : 1
}

function main() {
  const argv = process.argv.slice(2)
  if (argv.includes('--self-test')) {
    console.log('watch-model-seat self-test')
    process.exit(selfTest())
  }
  const hostIndex = argv.indexOf('--host')
  const hostRoot = hostIndex >= 0 ? argv[hostIndex + 1] : DEFAULT_HOST
  const ourRoot = fileURLToPath(new URL('..', import.meta.url))
  console.log('watch-model-seat: host=' + hostRoot)
  const drift = runAgainst(hostRoot, ourRoot)
  console.log(drift ? 'RESULT: DRIFT — follow docs/dsh-compat-watch.md "模型座位插槽巡检"' : 'RESULT: IN SYNC')
  process.exit(drift ? 1 : 0)
}

main()
