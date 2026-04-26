import type { DayContext } from '../types/dayContext'
import { prisma } from '../lib/prisma'

export async function orchestrateAgents(
  sessionId: string,
  dayContext: DayContext,
  requestId?: string
): Promise<void> {
  const agentPayloads = [
    {
      agentName: 'outfit',
      output: {
        value: 'Casual',
        detail: 'Relaxed fit',
        previewData: 'Vintage tee, straight jeans, and sneakers.',
      },
    },
    {
      agentName: 'energy',
      output: {
        value: `${Math.max(55, dayContext.energyLevel * 10)}%`,
        detail: 'Momentum forecast',
        previewData: 'Peak focus around late morning.',
      },
    },
  ]

  for (const payload of agentPayloads) {
    if (requestId) {
      const run = await prisma.plan_request_agents.findFirst({
        where: {
          request_id: requestId,
          agent_name: payload.agentName,
        },
      })

      if (run?.status === 'completed') {
        continue
      }

      await prisma.plan_request_agents.upsert({
        where: {
          request_id_agent_name: {
            request_id: requestId,
            agent_name: payload.agentName,
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
          agent_name: payload.agentName,
          status: 'running',
          attempt_count: 1,
        },
      })
    }

    try {
      await wait(250)
      await prisma.agent_outputs.create({
        data: {
          session_id: sessionId,
          request_id: requestId ?? null,
          agent_name: payload.agentName,
          output: payload.output,
        },
      })

      if (requestId) {
        await prisma.plan_request_agents.update({
          where: {
            request_id_agent_name: {
              request_id: requestId,
              agent_name: payload.agentName,
            },
          },
          data: {
            status: 'completed',
            completed_at: new Date(),
            last_error: null,
          },
        })
      }
    } catch (error) {
      if (requestId) {
        await prisma.plan_request_agents.update({
          where: {
            request_id_agent_name: {
              request_id: requestId,
              agent_name: payload.agentName,
            },
          },
          data: {
            status: 'failed',
            last_error: error instanceof Error ? error.message : 'Unknown error',
          },
        })
      }
      throw error
    }
  }

  if (requestId) {
    const pendingOrFailedRuns = await prisma.plan_request_agents.count({
      where: {
        request_id: requestId,
        status: {
          not: 'completed',
        },
      },
    })

    await prisma.plan_requests.update({
      where: { id: requestId },
      data: {
        status: pendingOrFailedRuns === 0 ? 'completed' : 'running',
        completed_at: pendingOrFailedRuns === 0 ? new Date() : null,
      },
    })
  }

  void callPythonOrchestrator(sessionId, dayContext, requestId)
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
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
    style_profile: profile?.styleProfile ?? '',
    music_liked_vibes: musicFeedback?.likedVibes ?? [],
    music_disliked_vibes: musicFeedback?.dislikedVibes ?? [],
  }

  const payload = {
    session_id: sessionId,
    request_id: requestId ?? null,
    prompt: dayContext.prompt,
    user_context,
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)

  try {
    await fetch('http://localhost:8000/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
  } catch (err) {
    console.error('[orchestrator] Python orchestrator call failed:', err)
  } finally {
    clearTimeout(timeout)
  }
}
