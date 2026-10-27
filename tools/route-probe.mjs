#!/usr/bin/env node
/**
 * Route probe: a local OpenAI-compatible endpoint that records who was called.
 *
 * Point a test provider's `baseURL` at this server and every request it makes
 * leaves one JSONL line with the model it asked for, so a routing test can
 * assert the provider/model that actually ran without spending real tokens.
 *
 * Usage:
 *   node tools/route-probe.mjs [--port 4719] [--log route-probe.jsonl] [--answer ok]
 *                              [--preset ok|classifier-allow|classifier-deny|title|memory|plan]
 *                              [--tool <name> --args <json>] [--clear]
 *
 * `--preset` picks a canned reply shape for paths that parse one; an explicit
 * `--answer` still wins. `--tool` replays one model-requested tool call instead
 * of text, so UI paths that only open on a tool call (the Plan review card)
 * can be exercised without a real model. Every request is recorded, and no
 * request ever leaves this process: the probe is the whole upstream.
 *
 * Endpoints:
 *   POST /v1/chat/completions   (stream and non-stream)
 *   GET  /v1/models
 *   GET  /healthz
 */
import { createServer } from 'node:http'
import { appendFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Read `--name value` / `--name=value` pairs. */
function flag(name, fallback) {
  const argv = process.argv.slice(2)
  const inline = argv.find((item) => item.startsWith(`--${name}=`))
  if (inline !== undefined) return inline.slice(name.length + 3)
  const index = argv.indexOf(`--${name}`)
  return index >= 0 && argv[index + 1] !== undefined ? argv[index + 1] : fallback
}

/** Canned replies for the callers that parse a shape rather than read prose. */
const PRESETS = {
  ok: 'ok',
  // automode's two-stage classifier reads one verdict token.
  'classifier-allow': 'ALLOW',
  'classifier-deny': 'DENY',
  title: '虚拟标题',
  // prime-memory distillation wants parseable JSON back.
  memory: '{"summary":"virtual distillation","items":[]}',
  // A plan-shaped body; `--tool` is what actually opens the review card.
  plan: '## 虚拟计划\n\n1. 检查输入\n2. 执行变更\n3. 复核结果',
}

const port = Number(flag('port', '4719'))
const logPath = flag('log', 'route-probe.jsonl')
const preset = flag('preset', 'ok')
if (!Object.hasOwn(PRESETS, preset)) {
  console.error(`route-probe: unknown --preset "${preset}"; known: ${Object.keys(PRESETS).join(', ')}`)
  process.exit(2)
}
/** An explicit `--answer` wins over the preset so one-off strings stay possible. */
const explicitAnswer = flag('answer', undefined)
const answer = explicitAnswer !== undefined ? explicitAnswer : PRESETS[preset]
/** Replay one tool call instead of text (empty name means "text reply"). */
const toolName = flag('tool', '')
const toolArgs = flag('args', '{}')
if (toolName !== '') {
  try {
    JSON.parse(toolArgs)
  } catch {
    console.error('route-probe: --args must be JSON when --tool is set')
    process.exit(2)
  }
}
if (process.argv.includes('--clear')) writeFileSync(logPath, '')

/** Append one observation; never let logging break the response. */
function record(entry) {
  try {
    appendFileSync(logPath, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`)
  } catch (error) {
    console.error('route-probe: could not append the log entry:', error)
  }
}

/** Read a request body as text. */
function readBody(request) {
  return new Promise((resolve) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => resolve(body))
  })
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`)
  if (request.method === 'GET' && url.pathname === '/healthz') {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ ok: true, port }))
    return
  }
  if (request.method === 'GET' && url.pathname === '/v1/models') {
    record({ path: url.pathname, model: '', authPresent: request.headers.authorization !== undefined, port })
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ object: 'list', data: [{ id: 'probe-model', object: 'model' }] }))
    return
  }
  if (request.method === 'POST' && url.pathname === '/v1/chat/completions') {
    const body = await readBody(request)
    let model = ''
    let stream = false
    try {
      const parsed = JSON.parse(body)
      model = typeof parsed.model === 'string' ? parsed.model : ''
      stream = parsed.stream === true
    } catch {
      // A non-JSON body still gets recorded, so a malformed call is visible.
    }
    record({ path: url.pathname, model, stream, tool: toolName, preset, authPresent: request.headers.authorization !== undefined, port })
    if (stream) {
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      if (toolName !== '') {
        const call = { index: 0, id: 'call_probe', type: 'function', function: { name: toolName, arguments: toolArgs } }
        response.write(`data: ${JSON.stringify({ id: 'probe', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [call] }, finish_reason: null }] })}\n\n`)
        response.write(`data: ${JSON.stringify({ id: 'probe', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] })}\n\n`)
        response.end('data: [DONE]\n\n')
        return
      }
      const chunk = { id: 'probe', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant', content: answer }, finish_reason: null }] }
      response.write(`data: ${JSON.stringify(chunk)}\n\n`)
      response.write(`data: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`)
      response.end('data: [DONE]\n\n')
      return
    }
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({
      id: 'probe',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: model === '' ? 'probe-model' : model,
      choices: [{ index: 0, message: toolName === ''
        ? { role: 'assistant', content: answer }
        : { role: 'assistant', content: null, tool_calls: [{ id: 'call_probe', type: 'function', function: { name: toolName, arguments: toolArgs } }] }, finish_reason: toolName === '' ? 'stop' : 'tool_calls' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }))
    return
  }
  response.writeHead(404, { 'content-type': 'application/json' })
  response.end(JSON.stringify({ error: { message: `route-probe: no ${request.method} ${url.pathname}` } }))
})

server.listen(port, '127.0.0.1', () => {
  console.log(`route-probe listening on http://127.0.0.1:${port} (log: ${logPath})`)
})
process.on('SIGINT', () => {
  const path = fileURLToPath(new URL(`file:///${logPath.replaceAll('\\', '/')}`))
  server.close(() => {
    console.log(`route-probe stopped (log: ${path})`)
    process.exit(0)
  })
})
