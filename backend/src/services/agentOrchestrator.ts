import type { DayContext } from '../types/dayContext'
import { prisma } from '../lib/prisma'
import { fetchUCLAMenu } from './uclaDining'

const PYTHON_ORCHESTRATOR_URL = process.env.PYTHON_ORCHESTRATOR_URL ?? 'http://localhost:8000/run'

export async function orchestrateAgents(
  sessionId: string,
  dayContext: DayContext,
  requestId?: string
): Promise<void> {
  // Pre-seed energy and meal with deterministic fallbacks so cards render immediately.
  // Status stays 'running' — Python will overwrite with LLM-generated output via /internal/results.
  const seedOutputs: Array<{ agent_name: string; output: Record<string, unknown> }> = [
    { agent_name: 'energy', output: buildEnergyFallback(dayContext) },
    { agent_name: 'meal', output: buildMealFallback() },
  ]
  for (const seed of seedOutputs) {
    try {
      await prisma.agent_outputs.create({
        data: {
          session_id: sessionId,
          request_id: requestId ?? null,
          agent_name: seed.agent_name,
          output: seed.output as never,
        },
      })
    } catch {
      // Non-fatal — Python will still deliver the real output
    }
  }

  // weather, music, energy, and meal are produced by Python and delivered via /internal/results callback.
  if (requestId) {
    const asyncAgents = ['weather', 'outfit', 'music', 'energy', 'meal']
    for (const agentName of asyncAgents) {
      await prisma.plan_request_agents.upsert({
        where: {
          request_id_agent_name: {
            request_id: requestId,
            agent_name: agentName,
          },
        },
        update: {
          status: 'running',
          attempt_count: { increment: 1 },
          last_error: null,
        },
        create: {
          request_id: requestId,
          user_id: dayContext.userId,
          agent_name: agentName,
          status: 'running',
          attempt_count: 1,
        },
      })
    }
  }

  void callPythonOrchestrator(sessionId, dayContext, requestId)
}

function buildEnergyFallback(dayContext: DayContext): Record<string, unknown> {
  const now = new Date()
  const [wakeHour, wakeMinute] = (dayContext.wakeTime ?? `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)
    .split(':')
    .map((value) => Number.parseInt(value, 10))
  const wakeBase = new Date()
  wakeBase.setHours(Number.isFinite(wakeHour) ? wakeHour : now.getHours(), Number.isFinite(wakeMinute) ? wakeMinute : now.getMinutes(), 0, 0)

  const peakStart = addMinutes(wakeBase, 210)
  const peakEnd = addMinutes(wakeBase, 330)
  const dipStart = addMinutes(wakeBase, 480)
  const dipEnd = addMinutes(wakeBase, 570)

  const baseline = Math.max(55, Math.min(95, dayContext.energyLevel * 10))

  return {
    headlineValue: `${baseline}% charged`,
    coachSummary: 'You are in motion. Protect your peak window and take a short reset before the dip.',
    wellnessTips: [
      'Hydrate now and again before your peak block.',
      'Use a 50-minute focus sprint during peak time.',
      'Take a 10-minute movement break before the dip.',
    ],
    energyWindows: {
      peakStart: formatClock(peakStart),
      peakEnd: formatClock(peakEnd),
      dipStart: formatClock(dipStart),
      dipEnd: formatClock(dipEnd),
    },
    energyCurve: [
      { timeLabel: formatClock(wakeBase), value: Math.max(40, baseline - 20) },
      { timeLabel: formatClock(addMinutes(wakeBase, 120)), value: Math.max(50, baseline - 8) },
      { timeLabel: formatClock(peakStart), value: Math.min(98, baseline + 10) },
      { timeLabel: formatClock(peakEnd), value: Math.min(95, baseline + 4) },
      { timeLabel: formatClock(dipStart), value: Math.max(42, baseline - 10) },
      { timeLabel: formatClock(dipEnd), value: Math.max(36, baseline - 18) },
    ],
    quote: {
      text: 'Momentum beats motivation. Show up for one strong block at a time.',
      authorOrSource: 'Morning Coach',
    },
    value: `${baseline}% charged`,
    detail: 'Energy + wellness fallback plan',
    previewData: `Peak around ${formatClock(peakStart)}. Dip around ${formatClock(dipStart)}.`,
    toneTag: 'supportive-frat-bro-therapist',
  }
}

function buildMealFallback(): Record<string, unknown> {
  return {
    value: "Today's UCLA Meal Plan",
    detail: 'Campus-wide · Breakfast + Lunch + Dinner',
    previewData: 'Curated dishes from multiple UCLA dining spots matched to your morning.',
    meals: {
      breakfast: {
        dishes: [
          { name: 'Scrambled Eggs', station: 'Grill', reason: 'High-protein morning fuel' },
          { name: 'Oatmeal', station: 'Comfort', reason: 'Slow-release energy before class' },
        ],
      },
      lunch: {
        dishes: [
          { name: 'Bruin Burger', station: 'Grill', reason: 'Satisfying midday protein' },
          { name: 'Garden Salad', station: 'Salad Bar', reason: 'Light and energizing' },
        ],
      },
      dinner: {
        dishes: [
          { name: 'Pasta Primavera', station: 'Pasta', reason: 'Carb recovery after a long day' },
          { name: 'Roasted Vegetables', station: 'Vegan', reason: 'Micronutrient boost' },
        ],
      },
    },
    rationale: 'These dishes provide balanced macros aligned with a productive study day.',
    dietFlags: ['balanced'],
    sourceMeta: {
      diningHall: 'UCLA Dining',
      diningHalls: ['De Neve', 'Bruin Plate', 'Epicuria'],
      serviceDate: new Date().toLocaleDateString(),
    },
  }
}

function addMinutes(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60_000)
}

function formatClock(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}


async function callPythonOrchestrator(
  sessionId: string,
  dayContext: DayContext,
  requestId?: string
): Promise<void> {
  const profile = dayContext.userContext?.profileSnapshot
  const musicGenres = dayContext.userContext?.preferenceHints?.music ?? []

  const musicFeedback = dayContext.userContext?.musicFeedback

  const user_context = {
    location: profile?.location ?? dayContext.location?.city ?? 'Los Angeles',
    morning_focus: profile?.morningFocus ?? '',
    routine_notes: profile?.routineNotes ?? '',
    music_genres: musicGenres,
    music_profile: profile?.musicProfile ?? '',
    dietary_profile: profile?.dietaryProfile ?? '',
    food_preferences: profile?.foodPreferences ?? '',
    style_profile: profile?.styleProfile ?? '',
    music_liked_vibes: musicFeedback?.likedVibes ?? [],
    music_disliked_vibes: musicFeedback?.dislikedVibes ?? [],
  }

  const uclaMenu = await fetchUCLAMenu().catch(() => null)

  const payload = {
    session_id: sessionId,
    request_id: requestId ?? null,
    prompt: dayContext.prompt,
    user_context,
    ucla_menu_snapshot: uclaMenu ?? null,
    day_context: {
      mood: dayContext.mood,
      energy_level: dayContext.energyLevel,
      events: dayContext.events,
      wake_time: (() => {
        if (dayContext.wakeTime) return dayContext.wakeTime
        const now = new Date()
        return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      })(),
    },
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)

  try {
    const response = await fetch(PYTHON_ORCHESTRATOR_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`Python orchestrator returned ${response.status}`)
    }
  } catch (err) {
    console.error('[orchestrator] Python orchestrator call failed:', err)
    if (requestId) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      const asyncAgents = ['weather', 'outfit', 'music', 'energy', 'meal']
      await prisma.plan_request_agents.updateMany({
        where: {
          request_id: requestId,
          agent_name: { in: asyncAgents },
          status: { in: ['pending', 'running'] },
        },
        data: {
          status: 'failed',
          last_error: errorMessage,
        },
      })
      await prisma.plan_requests.update({
        where: { id: requestId },
        data: { status: 'failed' },
      })
    }
  } finally {
    clearTimeout(timeout)
  }
}
