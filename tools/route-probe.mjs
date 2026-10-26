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

const port = Number(flag('port', '4719'))
const logPath = flag('log', 'route-probe.jsonl')
const answer = flag('answer', 'ok')
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
    record({ path: url.pathname, model, stream, authPresent: request.headers.authorization !== undefined, port })
    if (stream) {
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
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
      choices: [{ index: 0, message: { role: 'assistant', content: answer }, finish_reason: 'stop' }],
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
