import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { deriveRequestStatusFromRemaining, isAuthorizedInternalCallback } from './internalHelpers'

const router = Router()
const INTERNAL_RESULTS_KEY = process.env.INTERNAL_RESULTS_KEY ?? ''

router.post('/results', async (req, res) => {
  if (!INTERNAL_RESULTS_KEY) {
    return res.status(500).json({ error: 'internal results key is not configured' })
  }
  const authHeader = req.header('x-internal-key') ?? ''
  if (!isAuthorizedInternalCallback(INTERNAL_RESULTS_KEY, authHeader)) {
    return res.status(401).json({ error: 'unauthorized internal callback' })
  }

  const { sessionId, requestId, agents } = req.body as {
    sessionId?: string
    requestId?: string | null
    agents?: Array<{ agentName: string; output: unknown }>
  }

  if (!sessionId || !Array.isArray(agents) || agents.length === 0) {
    return res.status(400).json({ error: 'sessionId and agents are required' })
  }

  try {
    const session = requestId
      ? await prisma.sessions.findUnique({
          where: { id: sessionId },
          select: { user_id: true },
        })
      : null
    if (requestId && !session) {
      return res.status(404).json({ error: 'session not found for request callback' })
    }

    for (const { agentName, output } of agents) {
      if (requestId) {
        const existing = await prisma.plan_request_agents.findFirst({
          where: { request_id: requestId, agent_name: agentName },
        })
        if (existing?.status === 'completed') {
          continue
        }
      }

      await prisma.agent_outputs.create({
        data: {
          session_id: sessionId,
          request_id: requestId ?? null,
          agent_name: agentName,
          output: output as never,
        },
      })

      if (requestId) {
        await prisma.plan_request_agents.upsert({
          where: {
            request_id_agent_name: { request_id: requestId, agent_name: agentName },
          },
          create: {
            request_id: requestId,
            user_id: session!.user_id,
            agent_name: agentName,
            status: 'completed',
            completed_at: new Date(),
            attempt_count: 1,
          },
          update: {
            status: 'completed',
            completed_at: new Date(),
            last_error: null,
          },
        })
      }
    }

    if (requestId) {
      const pendingOrFailed = await prisma.plan_request_agents.count({
        where: { request_id: requestId, status: { not: 'completed' } },
      })

      await prisma.plan_requests.update({
        where: { id: requestId },
        data: {
          status: deriveRequestStatusFromRemaining(pendingOrFailed),
          completed_at: pendingOrFailed === 0 ? new Date() : null,
        },
      })
    }

    return res.json({ ok: true })
  } catch (error) {
    console.error('[internal/results] error:', error)
    return res.status(500).json({
      error: 'failed to write agent results',
      detail: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

export default router
