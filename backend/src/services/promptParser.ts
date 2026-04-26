import type { DayContext } from '../types/dayContext'
import type { UserContextSummary } from '../types/dayContext'

export async function parsePrompt(
  prompt: string,
  userId: string,
  sessionId: string,
  userContext: UserContextSummary,
  requestId?: string
): Promise<DayContext> {
  return {
    userId,
    sessionId,
    requestId,
    prompt,
    mood: inferMood(prompt),
    energyLevel: inferEnergy(prompt),
    wakeTime: inferWakeTime(prompt),
    events: inferEvents(prompt),
    location: { lat: 34.0522, lon: -118.2437, city: 'Los Angeles' },
    preferences: userContext.preferenceHints,
    userContext,
    weather: {
      condition: 'Sunny',
      temperature: 72,
      feelsLike: 75,
      forecast: 'Clear with mild afternoon breeze.',
    },
  }
}

export function inferWakeTime(prompt: string): string | null {
  const normalizedPrompt = prompt.toLowerCase()
  const wakeTimePatterns = [
    /\bwoke up at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i,
    /\bwoke at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i,
    /\bup since\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i,
    /\bwake(?:d)?\s+(?:around|by)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i,
  ]

  for (const pattern of wakeTimePatterns) {
    const match = normalizedPrompt.match(pattern)
    if (!match) {
      continue
    }

    const rawHour = Number.parseInt(match[1] ?? '0', 10)
    const rawMinute = Number.parseInt(match[2] ?? '0', 10)
    const meridiem = match[3]

    if (!Number.isFinite(rawHour) || !Number.isFinite(rawMinute) || rawMinute < 0 || rawMinute > 59) {
      continue
    }

    let normalizedHour = rawHour
    if (meridiem === 'am') {
      normalizedHour = rawHour === 12 ? 0 : rawHour
    } else if (meridiem === 'pm') {
      normalizedHour = rawHour === 12 ? 12 : rawHour + 12
    }

    if (normalizedHour < 0 || normalizedHour > 23) {
      continue
    }

    return `${String(normalizedHour).padStart(2, '0')}:${String(rawMinute).padStart(2, '0')}`
  }

  return null
}

function inferMood(prompt: string): string {
  const normalizedPrompt = prompt.toLowerCase()
  if (normalizedPrompt.includes('stressed')) return 'stressed'
  if (normalizedPrompt.includes('tired')) return 'tired'
  if (normalizedPrompt.includes('excited')) return 'excited'
  return 'focused'
}

function inferEnergy(prompt: string): number {
  const normalizedPrompt = prompt.toLowerCase()
  if (normalizedPrompt.includes('tired')) return 4
  if (normalizedPrompt.includes('stressed')) return 6
  if (normalizedPrompt.includes('excited')) return 8
  return 7
}

function inferEvents(prompt: string): string[] {
  const events: string[] = []
  if (prompt.toLowerCase().includes('midterm')) {
    events.push('Midterm exam')
  }
  if (!events.length) {
    events.push('General morning routine')
  }
  return events
}
