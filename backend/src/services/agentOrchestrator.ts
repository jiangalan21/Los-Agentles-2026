import type { DayContext } from '../types/dayContext'
import { prisma } from '../lib/prisma'

export async function orchestrateAgents(
  sessionId: string,
  dayContext: DayContext,
  requestId?: string
): Promise<void> {
  const agentPayloads = [
    {
      agentName: 'weather',
      output: {
        value: `${dayContext.weather?.temperature ?? 72}°F`,
        detail: `${dayContext.weather?.condition ?? 'Clear'} & mild`,
        previewData: dayContext.weather?.forecast ?? 'Light jacket optional.',
      },
    },
    {
      agentName: 'outfit',
      output: {
        value: 'Casual',
        detail: 'Relaxed fit',
        previewData: 'Vintage tee, straight jeans, and sneakers.',
      },
    },
    {
      agentName: 'music',
      output: {
        value: 'Levitate',
        detail: 'Dua Lipa',
        previewData: `Mood-adjusted from ${dayContext.mood} profile.`,
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
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
