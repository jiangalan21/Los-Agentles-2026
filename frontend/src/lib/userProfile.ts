export type UserProfile = {
  name: string
  location: string
  morningFocus: string
  routineNotes: string
  dietaryRestrictions: string
  foodPreferences: string
  musicPreferences: string
  stylePreferences: string
  wakeTime: string       // HH:MM — anchors the energy curve
  energyBaseline: string // '1'–'10' — shapes peak/dip windows
}

const PROFILE_STORAGE = 'dayger_user_profile'

const DEFAULT_PROFILE: UserProfile = {
  name: '',
  location: 'Los Angeles',
  morningFocus: '',
  routineNotes: '',
  dietaryRestrictions: '',
  foodPreferences: '',
  musicPreferences: 'pop, lo-fi',
  stylePreferences: 'casual, layered',
  wakeTime: '07:00',
  energyBaseline: '7',
}

export function getUserProfile(): UserProfile {
  const stored = window.localStorage.getItem(PROFILE_STORAGE)
  if (!stored) {
    window.localStorage.setItem(PROFILE_STORAGE, JSON.stringify(DEFAULT_PROFILE))
    return DEFAULT_PROFILE
  }

  try {
    const parsed = JSON.parse(stored) as Partial<UserProfile> & { dietaryPreferences?: string }
    const { dietaryPreferences: _dropped, ...rest } = parsed
    void _dropped
    return { ...DEFAULT_PROFILE, ...rest }
  } catch {
    return DEFAULT_PROFILE
  }
}

export function saveUserProfile(profile: UserProfile) {
  window.localStorage.setItem(PROFILE_STORAGE, JSON.stringify(profile))
}

export function splitPreferenceList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function buildPromptFromProfile(profile: UserProfile): string {
  const parts: string[] = []
  if (profile.morningFocus) parts.push(profile.morningFocus)
  if (profile.routineNotes) parts.push(profile.routineNotes)
  if (profile.location) parts.push(`Location: ${profile.location}`)
  if (profile.wakeTime) parts.push(`Wake time: ${profile.wakeTime}`)
  if (profile.energyBaseline) parts.push(`Energy baseline: ${profile.energyBaseline}/10`)
  if (profile.musicPreferences) parts.push(`Music preferences: ${profile.musicPreferences}`)
  if (profile.stylePreferences) parts.push(`Style preferences: ${profile.stylePreferences}`)
  if (profile.foodPreferences) parts.push(`Food preferences: ${profile.foodPreferences}`)
  if (profile.dietaryRestrictions) parts.push(`Dietary restrictions: ${profile.dietaryRestrictions}`)
  return parts.length > 0 ? parts.join('. ') : 'Standard morning routine.'
}
