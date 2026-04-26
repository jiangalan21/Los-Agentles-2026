const USER_KEY_STORAGE = 'dayger_user_key'
const ACTIVE_SESSION_STORAGE = 'dayger_active_session_id'
const ACTIVE_REQUEST_STORAGE = 'dayger_active_request_id'

export function getUserKey(): string {
  const existingKey = window.localStorage.getItem(USER_KEY_STORAGE)
  if (existingKey) {
    return existingKey
  }

  const generatedKey = window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `anon-${Date.now()}-${Math.random().toString(16).slice(2)}`

  window.localStorage.setItem(USER_KEY_STORAGE, generatedKey)
  return generatedKey
}

export function getActiveSessionId(): string | null {
  return window.localStorage.getItem(ACTIVE_SESSION_STORAGE)
}

export function setActiveSessionId(sessionId: string) {
  window.localStorage.setItem(ACTIVE_SESSION_STORAGE, sessionId)
}

export function clearActiveSessionId() {
  window.localStorage.removeItem(ACTIVE_SESSION_STORAGE)
}

export function getActiveRequestId(): string | null {
  return window.localStorage.getItem(ACTIVE_REQUEST_STORAGE)
}

export function setActiveRequestId(requestId: string) {
  window.localStorage.setItem(ACTIVE_REQUEST_STORAGE, requestId)
}

export function clearActiveRequestId() {
  window.localStorage.removeItem(ACTIVE_REQUEST_STORAGE)
}
