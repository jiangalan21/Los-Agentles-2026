import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { requireAnonUser } from '../middleware/anonAuth'

const router = Router()
const ALLOWED_SIGNALS = new Set(['liked', 'disliked', 'accepted', 'rejected', 'regenerated', 'dismissed'])

router.post('/', requireAnonUser, async (req, res) => {
  const agentName = String(req.body?.agentName ?? '').trim()
  const signal = String(req.body?.signal ?? '').trim()
  const sessionId = req.body?.sessionId ? String(req.body.sessionId) : null
  const moduleVariant = req.body?.moduleVariant ? String(req.body.moduleVariant) : null
  const reasonCode = req.body?.reasonCode ? String(req.body.reasonCode) : null
  const sessionPhase = req.body?.sessionPhase ? String(req.body.sessionPhase) : null
  const score = typeof req.body?.score === 'number' ? req.body.score : null
  const payload =
    req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : null

  if (!req.user || !agentName || !signal) {
    return res.status(400).json({ error: 'agentName and signal are required' })
  }

  if (!ALLOWED_SIGNALS.has(signal)) {
    return res.status(400).json({ error: 'invalid signal' })
  }

  try {
    if (sessionId) {
      const ownedSession = await prisma.sessions.findFirst({
        where: {
          id: sessionId,
          user_id: req.user.id,
        },
        select: { id: true },
      })

      if (!ownedSession) {
        return res.status(403).json({ error: 'session does not belong to current user' })
      }
    }

    const feedback = await prisma.feedback_events.create({
      data: {
        user_id: req.user.id,
        session_id: sessionId,
        agent_name: agentName,
        signal,
        module_variant: moduleVariant,
        reason_code: reasonCode,
        session_phase: sessionPhase,
        score,
        payload: payload ? (payload as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    })

    return res.status(201).json({
      feedback: {
        id: feedback.id,
        createdAt: feedback.created_at,
      },
    })
  } catch (error) {
    return res.status(500).json({
      error: 'unable to store feedback',
      detail: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

export default router
