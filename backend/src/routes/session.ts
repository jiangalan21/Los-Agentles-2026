import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { requireAnonUser } from '../middleware/anonAuth'
import { orchestrateAgents } from '../services/agentOrchestrator'
import { parsePrompt } from '../services/promptParser'
import { buildUserContext } from '../services/userContext'

const router = Router()

// POST /session — create session and trigger prompt parsing
router.post('/', requireAnonUser, async (req, res) => {
  const prompt = String(req.body?.prompt ?? '').trim()
  const requestId = String(req.body?.requestId ?? '').trim()
  const user = req.user

  if (!prompt || !user) {
    return res.status(400).json({ error: 'prompt is required' })
  }

  try {
    let request = null
    if (requestId) {
      request = await prisma.plan_requests.findFirst({
        where: {
          id: requestId,
          user_id: user.id,
        },
      })

      if (!request) {
        return res.status(404).json({ error: 'request not found' })
      }
    }

    const userContext = await buildUserContext(user.id)

    const session = await prisma.sessions.create({
      data: {
        user_id: user.id,
        request_id: request?.id ?? null,
        prompt,
      },
    })

    const dayContext = await parsePrompt(prompt, user.id, session.id, userContext, request?.id)

    await prisma.sessions.update({
      where: { id: session.id },
      data: {
        mood: dayContext.mood,
        energy_level: dayContext.energyLevel,
        day_context: dayContext as unknown as Prisma.InputJsonValue,
      },
    })

    if (request) {
      await prisma.plan_requests.update({
        where: { id: request.id },
        data: {
          status: 'running',
          started_at: request.started_at ?? new Date(),
        },
      })
    }

    void orchestrateAgents(session.id, dayContext, request?.id).catch(async (error) => {
      await prisma.agent_outputs.create({
        data: {
          session_id: session.id,
          request_id: request?.id ?? null,
          agent_name: 'orchestrator_error',
          output: { message: error instanceof Error ? error.message : 'Unknown error' },
        },
      })

      if (request) {
        await prisma.plan_requests.update({
          where: { id: request.id },
          data: {
            status: 'failed',
          },
        })
      }
    })

    return res.status(201).json({ sessionId: session.id, requestId: request?.id ?? null, userKey: req.userKey })
  } catch (error) {
    return res.status(500).json({
      error: 'unable to create session',
      detail: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// GET /session/:id — return session with all agent outputs
router.get('/:id', requireAnonUser, async (req, res) => {
  const sessionId = req.params.id
  const user = req.user

  if (!sessionId || !user) {
    return res.status(400).json({ error: 'session id is required' })
  }

  try {
    const session = await prisma.sessions.findFirst({
      where: { id: sessionId, user_id: user.id },
      include: {
        agent_outputs: {
          orderBy: { created_at: 'asc' },
        },
      },
    })

    if (!session) {
      return res.status(404).json({ error: 'session not found' })
    }

    return res.json({
      session: {
        id: session.id,
        requestId: session.request_id,
        prompt: session.prompt,
        dayContext: session.day_context,
        createdAt: session.created_at,
      },
      outputs: session.agent_outputs.map((output) => ({
        id: output.id,
        agentName: output.agent_name,
        output: output.output,
        createdAt: output.created_at,
      })),
    })
  } catch (error) {
    return res.status(500).json({
      error: 'unable to fetch session',
      detail: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// GET /session — return recent sessions for the anonymous user
router.get('/', requireAnonUser, async (req, res) => {
  const user = req.user
  if (!user) {
    return res.status(400).json({ error: 'user context missing' })
  }

  try {
    const sessions = await prisma.sessions.findMany({
      where: { user_id: user.id },
      orderBy: { created_at: 'desc' },
      take: 10,
      select: {
        id: true,
        prompt: true,
        created_at: true,
      },
    })

    return res.json({
      sessions: sessions.map((session) => ({
        id: session.id,
        prompt: session.prompt,
        createdAt: session.created_at,
      })),
    })
  } catch (error) {
    return res.status(500).json({
      error: 'unable to fetch recent sessions',
      detail: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

export default router
