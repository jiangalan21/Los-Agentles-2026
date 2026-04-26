export interface Location {
  lat: number
  lon: number
  city?: string
}

export interface WeatherContext {
  condition: string
  temperature: number
  feelsLike: number
  forecast: string
}

export interface UserPreferences {
  cuisine: string[]
  music: string[]
  style: string[]
  agentsEnabled: Record<string, boolean>
}

export interface DayContext {
  userId: string
  sessionId: string
  requestId?: string
  prompt: string
  mood: string
  energyLevel: number // 1–10
  events: string[]
  location: Location
  preferences: UserPreferences
  weather?: WeatherContext
  userContext?: UserContextSummary
}

export interface FeedbackSignal {
  agentName: string
  signal: string
  createdAt: string
}

export interface UserContextSummary {
  profileSummary: string
  recentPrompts: string[]
  recentSignals: FeedbackSignal[]
  preferenceHints: UserPreferences
  profileSnapshot?: {
    name: string
    location: string
    morningFocus: string
    routineNotes: string
    dietaryProfile: string
    musicProfile: string
    styleProfile: string
  }
  promptSteeringHints?: {
    agentScores: Record<string, number>
    topLikedAgents: string[]
    topDislikedAgents: string[]
  }
}
