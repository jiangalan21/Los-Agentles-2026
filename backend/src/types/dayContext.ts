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
  prompt: string
  mood: string
  energyLevel: number // 1–10
  events: string[]
  location: Location
  preferences: UserPreferences
  weather?: WeatherContext
}
