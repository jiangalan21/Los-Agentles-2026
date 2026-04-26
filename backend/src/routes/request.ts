import { Prisma } from '@prisma/client'
import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { requireAnonUser } from '../middleware/anonAuth'

const router = Router()
const REQUEST_AGENTS = ['weather', 'outfit', 'music', 'energy', 'meal']

router.post('/', requireAnonUser, async (req, res) => {
  if (!req.user) {
    return res.status(400).json({ error: 'user context missing' })
  }

  const prompt = String(req.body?.prompt ?? '').trim()

  try {
    const request = await prisma.plan_requests.create({
      data: {
        user_id: req.user.id,
        status: 'pending',
        prompt: prompt || null,
        profile_json: {
          name: req.user.name,
          location: req.user.location,
          morningFocus: req.user.morning_focus,
          routineNotes: req.user.routine_notes,
        } as Prisma.InputJsonValue,
      },
    })

    await prisma.plan_request_agents.createMany({
      data: REQUEST_AGENTS.map((agentName) => ({
        request_id: request.id,
        user_id: req.user!.id,
        agent_name: agentName,
        status: 'pending',
      })),
      skipDuplicates: true,
    })

    return res.status(201).json({
      requestId: request.id,
      status: request.status,
      createdAt: request.created_at,
    })
  } catch (error) {
    return res.status(500).json({
      error: 'unable to create request',
      detail: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

router.get('/:id', requireAnonUser, async (req, res) => {
  if (!req.user) {
    return res.status(400).json({ error: 'user context missing' })
  }

  const requestId = req.params.id
  if (!requestId) {
    return res.status(400).json({ error: 'request id is required' })
  }

  try {
    const request = await prisma.plan_requests.findFirst({
      where: {
        id: requestId,
        user_id: req.user.id,
      },
      include: {
        agent_runs: {
          orderBy: { created_at: 'asc' },
        },
      },
    })

    if (!request) {
      return res.status(404).json({ error: 'request not found' })
    }

    return res.json({
      request: {
        id: request.id,
        status: request.status,
        createdAt: request.created_at,
        startedAt: request.started_at,
        completedAt: request.completed_at,
      },
      agents: request.agent_runs.map((run) => ({
        agentName: run.agent_name,
        status: run.status,
        attempts: run.attempt_count,
        lastError: run.last_error,
        completedAt: run.completed_at,
      })),
    })
  } catch (error) {
    return res.status(500).json({
      error: 'unable to fetch request',
      detail: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

export default router
