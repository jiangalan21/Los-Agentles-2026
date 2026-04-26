export type UserProfile = {
  name: string
  location: string
  morningFocus: string
  routineNotes: string
  dietaryPreferences: string
  musicPreferences: string
  stylePreferences: string
}

const PROFILE_STORAGE = 'dayger_user_profile'

const DEFAULT_PROFILE: UserProfile = {
  name: 'Alex',
  location: 'Los Angeles',
  morningFocus: 'Stay calm and focused for classes',
  routineNotes: 'I usually leave home at 8:30 AM and like quick recommendations.',
  dietaryPreferences: 'Ramen, comfort food',
  musicPreferences: 'Pop, lo-fi',
  stylePreferences: 'Casual, layered',
}

export function getUserProfile(): UserProfile {
  const stored = window.localStorage.getItem(PROFILE_STORAGE)
  if (!stored) {
    window.localStorage.setItem(PROFILE_STORAGE, JSON.stringify(DEFAULT_PROFILE))
    return DEFAULT_PROFILE
  }

  try {
    const parsed = JSON.parse(stored) as Partial<UserProfile>
    return {
      ...DEFAULT_PROFILE,
      ...parsed,
    }
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
  return [
    "I'm stressed, have a midterm at 2pm, and it's cold outside.",
    `Name: ${profile.name}.`,
    `Location: ${profile.location}.`,
    `Morning focus: ${profile.morningFocus}.`,
    `Routine notes: ${profile.routineNotes}.`,
    `Dietary preferences: ${profile.dietaryPreferences}.`,
    `Music preferences: ${profile.musicPreferences}.`,
    `Style preferences: ${profile.stylePreferences}.`,
  ].join(' ')
}
