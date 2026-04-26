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
