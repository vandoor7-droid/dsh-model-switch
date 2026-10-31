import type { Context } from '@deepseek-ai/cordis'
import { clientRequestSchema, type ConnectionRpcHandler, type ConnectionRpcHandlerResult } from '@deepseek-ai/dsh-client-connection'
import type { ModelSwitchAdapterRegistry } from './adapter-registry.js'
import type { RuntimeCapabilities } from './runtime-capabilities.js'
import { readToolCatalog, type ToolCatalogSnapshot } from './tool-catalog.js'
import { DEFAULT_READ_ONLY_TOOLS } from './tool-allowlist.js'
import { autoReviewStatus } from './auto-review.js'
import { automodeCompatView } from './automode-compat.js'
import { reviewTimeoutStatus } from './review-timeout.js'
import { primeMemoryCompatStatus } from './prime-memory-compat.js'

/** Live reviewer counters surfaced next to the allowlist editor. */
export interface ReviewStatus {
  readonly held: boolean
  readonly allowedCalls: number
  readonly skippedReadOnly: number
  /** Third-party `@log.li/dsh-automode` row, when this Host mounts one. */
  readonly automode?: {
    readonly installed: boolean
    readonly route?: string | undefined
    readonly routeSkipped?: string | undefined
    readonly added: number
    readonly skipped: number
    readonly hot?: 'applied' | 'restart-required' | undefined
    readonly hotReason?: string | undefined
  } | undefined
  /** Memory-plugin adapter state: whether our distillation route reached the plugin. */
  readonly primeMemory?: {
    readonly installed: boolean
    readonly route?: string | undefined
    readonly routeSkipped?: string | undefined
    readonly replays?: number | undefined
  } | undefined
  /** Review-timeout adapter state: the write and the runtime reload behind it. */
  readonly reviewTimeout?: {
    readonly configuredMs?: number | undefined
    readonly applied: readonly string[]
    readonly hotApplied: readonly string[]
    readonly hot?: 'applied' | 'restart-required' | undefined
    readonly hotReason?: string | undefined
  } | undefined
}

export const CAPABILITIES_RPC_METHOD = 'plugin-rpc/model-switch'
export interface CapabilitiesSnapshot { readonly revision: number; readonly capabilities: RuntimeCapabilities }


function statusResponse(status: 400 | 415 | 500): Response {
  return new Response(status === 415 ? 'Unsupported Media Type' : status === 500 ? 'Internal Server Error' : 'Bad Request', { status })
}

function binaryResponse(rpcId: string, result: ConnectionRpcHandlerResult): Response {
  const response = { type: 'server-response', rpcId, result }
  if (!result.ok) return Response.json(response)
  const { attachments, ...value } = result
  const envelope = { ...response, result: value }
  if (attachments === undefined || attachments.length === 0) return Response.json(envelope)
  const parts = new FormData()
  const attachmentMetadata = attachments.map((attachment, index) => {
    const part = `bytes-${index}`
    parts.set(part, new Blob([new Uint8Array(attachment.bytes)]))
    return { path: [...attachment.path], codec: 'bytes', part }
  })
  parts.set('metadata', JSON.stringify({ ...envelope, attachments: attachmentMetadata }))
  return new Response(parts)
}

async function handleFetchRpc(
  request: Request,
  handler: ConnectionRpcHandler,
  operator: Parameters<ConnectionRpcHandler>[3],
): Promise<Response> {
  if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') return statusResponse(415)
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return statusResponse(400)
  }
  const parsed = clientRequestSchema.safeParse(body)
  if (!parsed.success || parsed.data.method !== CAPABILITIES_RPC_METHOD) return statusResponse(400)
  const wrapped = parsed.data.payload
  if (typeof wrapped !== 'object' || wrapped === null || Array.isArray(wrapped)) return statusResponse(400)
  if (Object.keys(wrapped).some(key => key !== 'endpoint' && key !== 'payload')) return statusResponse(400)
  const { endpoint, payload } = wrapped as { endpoint?: unknown; payload?: unknown }
  if (typeof endpoint !== 'string') return statusResponse(400)
  try {
    const result = await handler(endpoint, payload, request.signal, operator)
    return binaryResponse(parsed.data.rpcId, result)
  } catch {
    return statusResponse(500)
  }
}

/** Bounded long-poll on the existing registry; each caller owns and disposes its subscription. */
export function capabilitiesRpc(
  registry: ModelSwitchAdapterRegistry,
  snapshot: () => RuntimeCapabilities,
  lifetime: AbortSignal,
  catalog: () => ToolCatalogSnapshot = () => ({ tools: [], recommended: [...DEFAULT_READ_ONLY_TOOLS] }),
  /** Live Auto-reviewer counters (see `autoReviewStatus`), shown next to the allowlist. */
  status: () => ReviewStatus = () => ({ held: false, allowedCalls: 0, skippedReadOnly: 0 }),
): ConnectionRpcHandler {
  let revision = 0
  let previous: string | undefined
  const read = (): CapabilitiesSnapshot => {
    const capabilities = snapshot()
    const signature = JSON.stringify(capabilities)
    if (previous !== undefined && signature !== previous) revision++
    previous = signature
    return { revision, capabilities }
  }
  return async (endpoint, payload, signal) => {
    if (endpoint === 'tools') {
      if (payload === null || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).length !== 0) {
        return { ok: false, error: { details: {}, code: 'invalid-request', message: 'Expected an empty payload' } }
      }
      return { ok: true, value: { ...catalog(), status: status() } }
    }
    if (endpoint !== 'capabilities') return { ok: false, error: { details: {}, code: 'unknown-endpoint', message: 'Unknown Model Switch endpoint' } }
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).some(key => key !== 'revision')) return { ok: false, error: { details: {}, code: 'invalid-request', message: 'Expected optional revision' } }
    const requested = (payload as { revision?: unknown }).revision
    if (requested !== undefined && (typeof requested !== 'number' || !Number.isSafeInteger(requested) || requested < 0)) return { ok: false, error: { details: {}, code: 'invalid-request', message: 'Invalid capabilities revision' } }
    if (requested === read().revision && !lifetime.aborted && !signal.aborted) await new Promise<void>(resolve => {
      const finish = (): void => { clearTimeout(timer); unsubscribe(); signal.removeEventListener('abort', finish); lifetime.removeEventListener('abort', finish); resolve() }
      const unsubscribe = registry.subscribe(finish)
      // Connection calls are unary, so bounded long-poll carries capability updates.
      const timer = setTimeout(finish, 20_000)
      signal.addEventListener('abort', finish, { once: true })
      lifetime.addEventListener('abort', finish, { once: true })
    })
    if (lifetime.aborted || signal.aborted) return { ok: false, error: { details: {}, code: 'cancelled', message: 'Capabilities subscription closed' } }
    return { ok: true, value: read() }
  }
}

export function installCapabilitiesRpc(ctx: Context, registry: ModelSwitchAdapterRegistry, snapshot: () => RuntimeCapabilities): void {
  ctx.inject(['connection'], scope => scope.effect(() => {
    const lifetime = new AbortController()
    const handler = capabilitiesRpc(
      registry,
      snapshot,
      lifetime.signal,
      () => ({ tools: readToolCatalog(ctx), recommended: [...DEFAULT_READ_ONLY_TOOLS] }),
      () => ({
        held: autoReviewStatus.held,
        allowedCalls: autoReviewStatus.allowedCalls,
        skippedReadOnly: autoReviewStatus.skippedReadOnly,
        automode: automodeCompatView(),
        primeMemory: {
          installed: primeMemoryCompatStatus.installed,
          route: primeMemoryCompatStatus.route,
          routeSkipped: primeMemoryCompatStatus.routeSkipped,
          replays: primeMemoryCompatStatus.replays,
        },
        reviewTimeout: {
          configuredMs: reviewTimeoutStatus.configuredMs,
          applied: reviewTimeoutStatus.applied,
          hotApplied: reviewTimeoutStatus.hotApplied,
          hot: reviewTimeoutStatus.hot,
          hotReason: reviewTimeoutStatus.hotReason,
        },
      }),
    )
    const dispose = scope.connection.fetch.register({
      path: '/api/plugin-rpc/model-switch',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: request => handleFetchRpc(request, handler, scope.connection.operator),
    })
    return async () => { lifetime.abort(); await dispose() }
  }, 'Model Switch: lifecycle-owned search capability metadata'))
}
