import { randomUUID } from 'node:crypto'

const MAX_PROMPT_LENGTH = 1500
const MAX_RESPONSE_LENGTH = 12000
const REQUEST_TIMEOUT_MS = 30_000
const COOLDOWN_MS = 8_000
const ASI_FORMAT_TIMEOUT_MS = 12_000
const RAW_PAYLOAD_PREVIEW_MAX = 4000
const AGENT_ADDRESS_REGEX = /^agent1[0-9a-z]{20,}$/i
const AGENTVERSE_HOST_ALLOWLIST = (process.env.CUSTOM_AGENT_ALLOWED_HOSTS ?? 'agentverse.ai,api.agentverse.ai')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)

const INTERNAL_RESULTS_URL = process.env.BACKEND_INTERNAL_RESULTS_URL ?? 'http://localhost:3001/internal/results'
const INTERNAL_RESULTS_KEY = process.env.INTERNAL_RESULTS_KEY ?? ''
const ASI_FORMAT_URL = process.env.ASI_API_URL ?? 'https://api.asi1.ai/v1/chat/completions'
const ASI_FORMAT_MODEL = process.env.CUSTOM_AGENT_FORMAT_MODEL ?? 'asi1-mini'
const ASI_FORMAT_KEY = process.env.ASI_ONE_API_KEY ?? process.env.ASI1_API_KEY ?? process.env.ASI_API_KEY ?? ''

const lastRunByUser = new Map<string, number>()
let uagentClientPromise: Promise<{
  query: (agentAddress: string, query: string, requestId?: string) => Promise<{ success: boolean; response?: string; error?: string }>
}> | null = null
type ResponseFormatter = 'asi' | 'deterministic' | 'raw'

export function validateCustomAgentInput(agentAddress: string, prompt: string): { ok: true } | { ok: false; error: string } {
  const trimmedAddress = agentAddress.trim()
  const trimmedPrompt = prompt.trim()
  if (!trimmedAddress || !trimmedPrompt) {
    return { ok: false, error: 'agentAddress and prompt are required' }
  }
  if (trimmedAddress.startsWith('@')) {
    return { ok: false, error: 'please enter agent1... without @' }
  }
  if (trimmedPrompt.length > MAX_PROMPT_LENGTH) {
    return { ok: false, error: `prompt is too long (max ${MAX_PROMPT_LENGTH} chars)` }
  }

  const parsedTarget = parseCustomAgentTarget(trimmedAddress)
  if (!parsedTarget.ok) {
    return { ok: false, error: parsedTarget.error }
  }

  return { ok: true }
}

export function checkCustomAgentCooldown(userId: string): { ok: true } | { ok: false; retryAfterMs: number } {
  const now = Date.now()
  const last = lastRunByUser.get(userId) ?? 0
  if (now - last < COOLDOWN_MS) {
    return { ok: false, retryAfterMs: COOLDOWN_MS - (now - last) }
  }
  lastRunByUser.set(userId, now)
  return { ok: true }
}

export async function runCustomAgentAsync(params: {
  sessionId: string
  requestId?: string | null
  userId: string
  agentAddress: string
  prompt: string
}): Promise<void> {
  const startedAt = Date.now()
  const correlationId = randomUUID()
  let output: Record<string, unknown>
  const target = parseCustomAgentTarget(params.agentAddress)

  try {
    if (!target.ok) {
      throw new Error(target.error)
    }

    const responseBody = await (async () => {
      if (target.mode === 'address') {
        const client = await getUAgentClient()
        const result = await client.query(target.displayAddress, params.prompt, correlationId)
        if (!result.success) {
          throw new Error(result.error || "The agent didn't return a response.")
        }
        return { response: result.response ?? '' }
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      let response: Response
      try {
        response = await fetch(target.requestUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: params.prompt, session_id: params.sessionId, correlation_id: correlationId }),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeoutId)
      }

      if (!response.ok) {
        throw new Error(mapCustomAgentHttpError(response.status, target.mode))
      }
      return readHttpResponseBody(response)
    })()

    const formatted = await buildReadableResponseText(responseBody, params.prompt)
    if (!formatted.text) {
      throw new Error('The endpoint responded, but no readable text content was returned.')
    }

    output = {
      value: 'Custom Agent Response',
      detail: 'Completed',
      previewData: formatted.text.slice(0, 140),
      responseText: formatted.text,
      agentAddress: target.displayAddress,
      submittedPrompt: params.prompt,
      formattedBy: formatted.formattedBy,
      formatError: formatted.formatError,
      rawPayload: buildRawPayloadPreview(responseBody),
      latencyMs: Date.now() - startedAt,
    }
  } catch (error) {
    const targetHost = target.ok ? new URL(target.requestUrl).hostname : 'Agentverse'
    const friendlyMessage = mapCustomAgentRuntimeError(error, targetHost)
    output = {
      value: 'Custom Agent Error',
      detail: 'Failed',
      previewData: friendlyMessage,
      responseText: '',
      agentAddress: target.ok ? target.displayAddress : normalizeAgentInput(params.agentAddress),
      submittedPrompt: params.prompt,
      latencyMs: Date.now() - startedAt,
      formattedBy: 'raw',
      formatError: null,
      rawPayload: null,
      error: friendlyMessage,
    }
  }

  await postInternalResult({
    sessionId: params.sessionId,
    requestId: params.requestId ?? null,
    agents: [{ agentName: 'custom_agent', output }],
  })
}

function extractResponseText(value: unknown): string {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return ''
  const obj = value as Record<string, unknown>
  const candidates = [obj.response, obj.output, obj.text, obj.message, obj.result]
  for (const candidate of candidates) {
    if (typeof candidate === 'string') return candidate
  }
  return JSON.stringify(value)
}

function sanitizeText(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim()
}

async function readHttpResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  const rawText = await response.text()
  if (!rawText.trim()) return null

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(rawText)
    } catch {
      return rawText
    }
  }

  try {
    return JSON.parse(rawText)
  } catch {
    return rawText
  }
}

async function buildReadableResponseText(
  responseBody: unknown,
  submittedPrompt: string,
): Promise<{ text: string; formattedBy: ResponseFormatter; formatError: string | null }> {
  const asiPreferred = await formatWithASI(responseBody, submittedPrompt)
  if (asiPreferred.text) {
    return {
      text: asiPreferred.text.slice(0, MAX_RESPONSE_LENGTH),
      formattedBy: 'asi',
      formatError: null,
    }
  }

  const extracted = sanitizeText(extractResponseText(responseBody))
  const parsedFromExtracted = extracted ? tryParseJson(extracted) : null
  const deterministicFromExtracted = parsedFromExtracted ? formatStructuredPayload(parsedFromExtracted) : null
  if (deterministicFromExtracted) {
    return {
      text: deterministicFromExtracted.slice(0, MAX_RESPONSE_LENGTH),
      formattedBy: 'deterministic',
      formatError: asiPreferred.error,
    }
  }

  const deterministicFromBody = formatStructuredPayload(responseBody)
  if (deterministicFromBody) {
    return {
      text: deterministicFromBody.slice(0, MAX_RESPONSE_LENGTH),
      formattedBy: 'deterministic',
      formatError: asiPreferred.error,
    }
  }

  if (extracted && !looksLikeRawJsonBlob(extracted)) {
    return {
      text: extracted.slice(0, MAX_RESPONSE_LENGTH),
      formattedBy: 'raw',
      formatError: asiPreferred.error,
    }
  }

  if (extracted) {
    return {
      text: extracted.slice(0, MAX_RESPONSE_LENGTH),
      formattedBy: 'raw',
      formatError: asiPreferred.error,
    }
  }

  if (responseBody && typeof responseBody === 'object') {
    return {
      text: sanitizeText(safeStringify(responseBody)).slice(0, MAX_RESPONSE_LENGTH),
      formattedBy: 'raw',
      formatError: asiPreferred.error,
    }
  }

  return {
    text: '',
    formattedBy: 'raw',
    formatError: asiPreferred.error,
  }
}

function looksLikeRawJsonBlob(value: string): boolean {
  const trimmed = value.trim()
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function tryParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function formatStructuredPayload(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const obj = value as Record<string, unknown>
  const valueText = asCleanString(obj.value)
  const detailText = asCleanString(obj.detail)
  const previewText = asCleanString(obj.previewData) || asCleanString(obj.summary) || asCleanString(obj.message)
  const responseText = asCleanString(obj.responseText)
  const tracks = Array.isArray(obj.tracks) ? obj.tracks : []
  const bullets: string[] = []
  for (const track of tracks.slice(0, 4)) {
    if (!track || typeof track !== 'object') continue
    const t = track as Record<string, unknown>
    const title = asCleanString(t.title)
    const artist = asCleanString(t.artist)
    if (title && artist) bullets.push(`${title} - ${artist}`)
    else if (title) bullets.push(title)
  }

  const sections: string[] = []
  if (valueText) sections.push(valueText)
  if (detailText) sections.push(detailText)
  if (previewText) sections.push(previewText)
  if (responseText) sections.push(responseText)
  if (bullets.length) sections.push(`Top picks: ${bullets.join('; ')}`)
  if (!sections.length) return null
  return sections.join('\n')
}

function asCleanString(value: unknown): string {
  if (typeof value !== 'string') return ''
  return sanitizeText(value)
}

async function formatWithASI(responseBody: unknown, submittedPrompt: string): Promise<{ text: string | null; error: string | null }> {
  if (!ASI_FORMAT_KEY) return { text: null, error: null }
  if (responseBody == null) return { text: null, error: null }

  const payloadText = typeof responseBody === 'string' ? responseBody : safeStringify(responseBody)
  if (!payloadText.trim()) return { text: null, error: null }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), ASI_FORMAT_TIMEOUT_MS)
  try {
    const response = await fetch(ASI_FORMAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ASI_FORMAT_KEY}`,
      },
      body: JSON.stringify({
        model: ASI_FORMAT_MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You format raw API payloads into concise, user-facing summaries. Preserve concrete values and avoid adding facts.',
          },
          {
            role: 'user',
            content: [
              `User prompt: ${submittedPrompt}`,
              'Format the following payload into a readable response for a dashboard card.',
              payloadText.slice(0, 9000),
            ].join('\n\n'),
          },
        ],
        temperature: 0.2,
      }),
      signal: controller.signal,
    })
    if (!response.ok) return { text: null, error: `ASI formatter returned HTTP ${response.status}` }

    const body = (await response.json().catch(() => null)) as
      | { choices?: Array<{ message?: { content?: string } }> }
      | null
    const text = body?.choices?.[0]?.message?.content
    if (typeof text !== 'string') return { text: null, error: 'ASI formatter returned an empty response' }
    const cleaned = sanitizeText(text)
    if (!cleaned) return { text: null, error: 'ASI formatter returned blank content' }
    return { text: cleaned, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown formatter error'
    return { text: null, error: `ASI formatter failed: ${message}` }
  } finally {
    clearTimeout(timeoutId)
  }
}

function buildRawPayloadPreview(value: unknown): string | null {
  if (value == null) return null
  const raw = typeof value === 'string' ? value : safeStringify(value)
  const cleaned = sanitizeText(raw)
  if (!cleaned) return null
  return cleaned.slice(0, RAW_PAYLOAD_PREVIEW_MAX)
}

function normalizeAgentInput(value: string): string {
  return value.trim()
}

function parseCustomAgentTarget(
  input: string,
): { ok: true; mode: 'url' | 'address'; requestUrl: string; displayAddress: string } | { ok: false; error: string } {
  const normalized = normalizeAgentInput(input)
  if (!normalized) {
    return { ok: false, error: 'agentAddress is required' }
  }
  if (normalized.startsWith('@')) {
    return { ok: false, error: 'please enter agent1... without @' }
  }

  try {
    const parsed = new URL(normalized)
    const isLoopback = isLoopbackHost(parsed.hostname)
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopback)) {
      return { ok: false, error: 'agent URL must use https (or http for localhost)' }
    }
    if (!isLoopback && !AGENTVERSE_HOST_ALLOWLIST.includes(parsed.hostname)) {
      return { ok: false, error: 'agent URL must target an approved Agentverse host' }
    }
    return { ok: true, mode: 'url', requestUrl: parsed.toString(), displayAddress: normalized }
  } catch {
    if (!AGENT_ADDRESS_REGEX.test(normalized)) {
      return {
        ok: false,
        error: 'agent address must be an https Agentverse URL or agent1...',
      }
    }
  }

  const preferredHost = AGENTVERSE_HOST_ALLOWLIST.includes('agentverse.ai')
    ? 'agentverse.ai'
    : AGENTVERSE_HOST_ALLOWLIST[0]
  if (!preferredHost) {
    return { ok: false, error: 'no approved Agentverse hosts are configured' }
  }
  return {
    ok: true,
    mode: 'address',
    requestUrl: `https://${preferredHost}/agents/${normalized}`,
    displayAddress: normalized,
  }
}

function mapCustomAgentHttpError(statusCode: number, mode: 'url' | 'address'): string {
  if (statusCode === 404) {
    if (mode === 'address') {
      return "We couldn't find that agent on Agentverse. Check the address and make sure the agent is public and active."
    }
    return "The custom agent endpoint wasn't found (404). Check the URL path."
  }
  if (statusCode === 401 || statusCode === 403) {
    return 'The custom agent denied access. Verify permissions or use a public endpoint.'
  }
  if (statusCode === 429) {
    return 'The custom agent is rate-limited right now. Please try again shortly.'
  }
  if (statusCode >= 500) {
    return 'The custom agent service is currently unavailable. Please try again in a moment.'
  }
  return `custom agent returned ${statusCode}`
}

function mapCustomAgentRuntimeError(error: unknown, targetHost: string): string {
  if (!(error instanceof Error)) {
    return 'Custom agent request failed unexpectedly.'
  }
  const normalizedMessage = (error.message || '').toLowerCase().trim()
  const maybeCause = error.cause as { code?: string; hostname?: string } | undefined
  const code = maybeCause?.code
  if (error.name === 'AbortError') {
    return 'Custom agent timed out before responding. Please try again.'
  }
  if (normalizedMessage === 'not found' || normalizedMessage.includes('target agent') || normalizedMessage.includes('agent not found')) {
    return 'Agent address was found but is not queryable through the Agent Chat Protocol on this network. Try a direct HTTPS endpoint URL for that agent, or confirm the agent supports ACP/uAgent messaging on the same network.'
  }
  if (code === 'ENOTFOUND') {
    const host = maybeCause?.hostname || targetHost
    return `Could not reach ${host}. Check DNS/network access or update CUSTOM_AGENT_ALLOWED_HOSTS.`
  }
  if (code === 'ECONNREFUSED') {
    return `Connection was refused by ${targetHost}.`
  }
  if (error.message === 'fetch failed') {
    return `Could not reach ${targetHost}.`
  }
  return error.message || 'Custom agent request failed.'
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1'
}

async function getUAgentClient(): Promise<{
  query: (agentAddress: string, query: string, requestId?: string) => Promise<{ success: boolean; response?: string; error?: string }>
}> {
  if (!uagentClientPromise) {
    uagentClientPromise = (async () => {
      const module = await import('uagent-client')
      const UAgentClient = module.default
      return new UAgentClient({
        timeout: REQUEST_TIMEOUT_MS,
        autoStartBridge: true,
      }) as {
        query: (agentAddress: string, query: string, requestId?: string) => Promise<{ success: boolean; response?: string; error?: string }>
      }
    })()
  }
  return uagentClientPromise
}

async function postInternalResult(payload: {
  sessionId: string
  requestId: string | null
  agents: Array<{ agentName: string; output: Record<string, unknown> }>
}): Promise<void> {
  if (!INTERNAL_RESULTS_KEY) {
    throw new Error('INTERNAL_RESULTS_KEY is required for custom agent callbacks')
  }
  const response = await fetch(INTERNAL_RESULTS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': INTERNAL_RESULTS_KEY,
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error(`internal callback failed with ${response.status}`)
  }
}
