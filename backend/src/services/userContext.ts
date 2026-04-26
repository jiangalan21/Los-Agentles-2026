import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import type { UserContextSummary } from '../types/dayContext'

const DEFAULT_PREFERENCES = {
  cuisine: [],
  music: [],
  style: [],
  agentsEnabled: {},
}

export async function buildUserContext(userId: string): Promise<UserContextSummary> {
  const [user, prefs, recentSessions, recentFeedback, musicFeedbackEvents] = await Promise.all([
    prisma.users.findUnique({ where: { id: userId } }),
    prisma.user_preferences.findUnique({ where: { user_id: userId } }),
    prisma.sessions.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: 10,
      select: { prompt: true, mood: true, energy_level: true, created_at: true },
    }),
    prisma.feedback_events.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: 20,
      select: { agent_name: true, signal: true, created_at: true },
    }),
    prisma.feedback_events.findMany({
      where: { user_id: userId, agent_name: 'music', signal: { in: ['liked', 'disliked'] } },
      orderBy: { created_at: 'desc' },
      take: 6,
      select: { signal: true, session_id: true },
    }),
  ])

  const musicFeedbackSessionIds = musicFeedbackEvents
    .map((e) => e.session_id)
    .filter((id): id is string => Boolean(id))

  const musicOutputsForFeedback =
    musicFeedbackSessionIds.length > 0
      ? await prisma.agent_outputs.findMany({
          where: { session_id: { in: musicFeedbackSessionIds }, agent_name: 'music' },
          orderBy: { created_at: 'desc' },
          select: { session_id: true, output: true },
        })
      : []

  const musicOutputBySession = musicOutputsForFeedback.reduce<Record<string, { detail?: string }>>(
    (acc, o) => {
      if (!acc[o.session_id]) {
        acc[o.session_id] = o.output as { detail?: string }
      }
      return acc
    },
    {},
  )

  const likedVibes: string[] = []
  const dislikedVibes: string[] = []
  for (const event of musicFeedbackEvents) {
    if (!event.session_id) continue
    const detail = musicOutputBySession[event.session_id]?.detail
    if (!detail) continue
    if (event.signal === 'liked') likedVibes.push(detail)
    else dislikedVibes.push(detail)
  }

  const preferenceHints = prefs
    ? {
        cuisine: prefs.cuisine_prefs,
        music: prefs.music_prefs,
        style: prefs.style_prefs,
        agentsEnabled: normalizeAgentPreferences(prefs.agents_enabled),
      }
    : DEFAULT_PREFERENCES

  const recentPrompts = recentSessions.map((session) => session.prompt)
  const positiveSignals = recentFeedback.filter((event) => event.signal === 'accepted').length
  const negativeSignals = recentFeedback.filter((event) => event.signal === 'rejected').length
  const dominantMood = pickDominantMood(recentSessions.map((session) => session.mood))
  const avgEnergy = averageEnergy(recentSessions.map((session) => session.energy_level))
  const agentScores = buildAgentScores(recentFeedback)
  const sortedAgents = Object.entries(agentScores).sort((a, b) => b[1] - a[1])
  const topLikedAgents = sortedAgents.filter(([, score]) => score > 0).slice(0, 3).map(([name]) => name)
  const topDislikedAgents = sortedAgents
    .filter(([, score]) => score < 0)
    .slice(0, 3)
    .map(([name]) => name)

  return {
    profileSummary: `Recent mood: ${dominantMood}; avg energy: ${avgEnergy}; accepted vs rejected feedback: ${positiveSignals}:${negativeSignals}.`,
    recentPrompts,
    recentSignals: recentFeedback.map((event) => ({
      agentName: event.agent_name,
      signal: event.signal,
      createdAt: event.created_at.toISOString(),
    })),
    preferenceHints,
    profileSnapshot: {
      name: user?.name ?? '',
      location: user?.location ?? '',
      morningFocus: user?.morning_focus ?? '',
      routineNotes: user?.routine_notes ?? '',
      dietaryProfile: user?.dietary_profile ?? '',
      foodPreferences: user?.food_preferences ?? '',
      musicProfile: user?.music_profile ?? '',
      styleProfile: user?.style_profile ?? '',
    },
    promptSteeringHints: {
      agentScores,
      topLikedAgents,
      topDislikedAgents,
    },
    musicFeedback: { likedVibes, dislikedVibes },
  }
}

function normalizeAgentPreferences(value: Prisma.JsonValue): Record<string, boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return Object.entries(value).reduce<Record<string, boolean>>((acc, [key, raw]) => {
    if (typeof raw === 'boolean') {
      acc[key] = raw
    }
    return acc
  }, {})
}

function pickDominantMood(moods: Array<string | null>): string {
  const counts = moods.filter(Boolean).reduce<Record<string, number>>((acc, mood) => {
    const key = String(mood)
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})

  const winner = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  return winner?.[0] ?? 'neutral'
}

function averageEnergy(values: Array<number | null>): string {
  const validValues = values.filter((value): value is number => typeof value === 'number')
  if (!validValues.length) {
    return 'n/a'
  }

  const average = validValues.reduce((sum, value) => sum + value, 0) / validValues.length
  return average.toFixed(1)
}

function buildAgentScores(
  feedback: Array<{ agent_name: string; signal: string; created_at: Date }>,
): Record<string, number> {
  const now = Date.now()
  return feedback.reduce<Record<string, number>>((acc, event) => {
    const ageHours = (now - event.created_at.getTime()) / (1000 * 60 * 60)
    const recencyWeight = Math.max(0.2, 1 - ageHours / 168)
    const signalWeight = getSignalWeight(event.signal)
    acc[event.agent_name] = (acc[event.agent_name] ?? 0) + signalWeight * recencyWeight
    return acc
  }, {})
}

function getSignalWeight(signal: string): number {
  if (signal === 'liked' || signal === 'accepted') {
    return 1
  }
  if (signal === 'disliked' || signal === 'rejected') {
    return -1
  }
  if (signal === 'regenerated') {
    return -0.4
  }
  return 0
}
