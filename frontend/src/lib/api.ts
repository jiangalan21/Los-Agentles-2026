const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

type CreateSessionResponse = {
  sessionId: string
  requestId?: string | null
}

export type SessionOutput = {
  id: string
  agentName: string
  output: {
    value?: string
    detail?: string
    previewData?: string
    [key: string]: unknown
  } | null
  createdAt: string
}

export type SessionPayload = {
  session: {
    id: string
    requestId?: string | null
    prompt: string
    dayContext: unknown
    createdAt: string
  }
  outputs: SessionOutput[]
}

export type ProfilePayload = {
  name: string
  location: string
  morningFocus: string
  routineNotes: string
  dietaryPreferences: string
  musicPreferences: string
  stylePreferences: string
}

export type RequestPayload = {
  requestId: string
  status: string
  createdAt: string
}

export async function createSession(
  userKey: string,
  prompt: string,
  requestId?: string | null,
): Promise<CreateSessionResponse> {
  return request<CreateSessionResponse>('/session', {
    method: 'POST',
    userKey,
    body: { userKey, prompt, requestId },
  })
}

export async function getSession(userKey: string, sessionId: string): Promise<SessionPayload> {
  return request<SessionPayload>(`/session/${sessionId}`, {
    userKey,
  })
}

export async function getRecentSessions(userKey: string): Promise<{ sessions: Array<{ id: string; prompt: string; createdAt: string }> }> {
  return request('/session', {
    userKey,
  })
}

export async function createRequest(userKey: string, prompt?: string): Promise<RequestPayload> {
  return request<RequestPayload>('/request', {
    method: 'POST',
    userKey,
    body: { userKey, prompt },
  })
}

export async function getRequest(
  userKey: string,
  requestId: string,
): Promise<{
  request: { id: string; status: string; createdAt: string; startedAt?: string; completedAt?: string }
  agents: Array<{ agentName: string; status: string; attempts: number; lastError?: string | null; completedAt?: string | null }>
}> {
  return request(`/request/${requestId}`, {
    userKey,
  })
}

export async function savePreferences(
  userKey: string,
  payload: {
    cuisine: string[]
    music: string[]
    style: string[]
    agentsEnabled: Record<string, boolean>
  },
): Promise<unknown> {
  return request('/preferences', {
    method: 'POST',
    userKey,
    body: { userKey, ...payload },
  })
}

export async function getProfile(userKey: string): Promise<{ profile: ProfilePayload }> {
  return request('/profile', {
    userKey,
  })
}

export async function saveProfile(userKey: string, profile: ProfilePayload): Promise<{ profile: ProfilePayload }> {
  return request('/profile', {
    method: 'PUT',
    userKey,
    body: profile,
  })
}

export async function regenerateMusicForSession(
  userKey: string,
  sessionId: string,
): Promise<{ ok: boolean; output: AgentOutput['output'] }> {
  return request<{ ok: boolean; output: AgentOutput['output'] }>(`/session/${sessionId}/regenerate/music`, {
    method: 'POST',
    userKey,
  })
}

export async function sendFeedback(payload: {
  userKey: string
  sessionId?: string
  agentName: string
  signal: 'liked' | 'disliked' | 'accepted' | 'rejected' | 'regenerated' | 'dismissed'
  moduleVariant?: string
  reasonCode?: string
  sessionPhase?: string
  score?: number
  payload?: Record<string, unknown>
}): Promise<unknown> {
  return request('/feedback', {
    method: 'POST',
    userKey: payload.userKey,
    body: payload,
  })
}

export function getWeatherMapPreviewUrl(location: string): string {
  return `${API_URL}/maps/preview-image?location=${encodeURIComponent(location)}`
}

export type HourlyForecastEntry = {
  timestamp: number
  timeLabel: string
  tempF: number
  feelsLikeF: number
  humidity: number
  windMph: number
  precipitationChance: number
  condition: string
  description: string
  iconCode?: string | null
}

export async function getHourlyForecast(
  userKey: string,
  location: string,
): Promise<{ location: string; resolvedLocation: string; entries: HourlyForecastEntry[] }> {
  return request(`/weather/hourly?location=${encodeURIComponent(location)}`, {
    userKey,
  })
}

async function request<T = unknown>(path: string, init?: { method?: string; body?: unknown; userKey?: string }): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.userKey ? { 'x-user-key': init.userKey } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  })

  const json = (await response.json()) as unknown
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}): ${JSON.stringify(json)}`)
  }

  return json as T
}
