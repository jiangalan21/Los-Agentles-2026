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

// POST /session/:id/regenerate/music — re-run music agent for an existing session
router.post('/:id/regenerate/music', requireAnonUser, async (req, res) => {
  const sessionId = req.params.id
  const user = req.user
  if (!sessionId || !user) return res.status(400).json({ error: 'session id is required' })

  try {
    const session = await prisma.sessions.findFirst({
      where: { id: sessionId, user_id: user.id },
      include: {
        agent_outputs: {
          where: { agent_name: 'weather' },
          orderBy: { created_at: 'asc' },
          take: 1,
        },
      },
    })
    if (!session) return res.status(404).json({ error: 'session not found' })

    const dayCtx = session.day_context as Record<string, unknown> | null
    const weatherOut = session.agent_outputs[0]?.output as Record<string, unknown> | null

    const musicFeedbackEvents = await prisma.feedback_events.findMany({
      where: { user_id: user.id, agent_name: 'music', signal: { in: ['liked', 'disliked'] } },
      orderBy: { created_at: 'desc' },
      take: 6,
      select: { signal: true, session_id: true },
    })
    const feedbackSessionIds = musicFeedbackEvents
      .map((e) => e.session_id)
      .filter((id): id is string => Boolean(id))
    const musicOutputsForFeedback =
      feedbackSessionIds.length > 0
        ? await prisma.agent_outputs.findMany({
            where: { session_id: { in: feedbackSessionIds }, agent_name: 'music' },
            orderBy: { created_at: 'desc' },
            select: { session_id: true, output: true },
          })
        : []
    const musicOutputByFeedbackSession = musicOutputsForFeedback.reduce<Record<string, { detail?: string }>>(
      (acc, o) => { if (!acc[o.session_id]) acc[o.session_id] = o.output as { detail?: string }; return acc },
      {},
    )
    const likedVibes: string[] = []
    const dislikedVibes: string[] = []
    for (const event of musicFeedbackEvents) {
      if (!event.session_id) continue
      const detail = musicOutputByFeedbackSession[event.session_id]?.detail
      if (!detail) continue
      if (event.signal === 'liked') likedVibes.push(detail)
      else dislikedVibes.push(detail)
    }

    let weatherCondition: string | null = null
    let temperatureF: number | null = null
    if (typeof weatherOut?.detail === 'string') {
      weatherCondition = weatherOut.detail.split(' · ')[0] ?? null
    }
    if (typeof weatherOut?.value === 'string') {
      const m = weatherOut.value.match(/(\d+)/)
      if (m) temperatureF = parseInt(m[1], 10)
    }

    const preferenceHints = (dayCtx?.userContext as Record<string, unknown> | undefined)?.preferenceHints as Record<string, unknown> | undefined
    const musicGenres = Array.isArray(preferenceHints?.music) ? preferenceHints.music as string[] : []
    const events = Array.isArray(dayCtx?.events) ? (dayCtx.events as string[]).join(', ') : null

    const musicPayload = {
      mood: typeof dayCtx?.mood === 'string' ? dayCtx.mood : null,
      stress_level: null,
      schedule_notes: events,
      music_vibe: null,
      music_genres: musicGenres,
      weather_condition: weatherCondition,
      temperature_f: temperatureF,
      liked_vibes: likedVibes,
      disliked_vibes: dislikedVibes,
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30_000)
    let musicData: unknown
    try {
      const agentRes = await fetch('http://localhost:8003/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(musicPayload),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      if (!agentRes.ok) throw new Error(`Music agent returned ${agentRes.status}`)
      musicData = await agentRes.json()
    } catch (err) {
      clearTimeout(timeoutId)
      throw err
    }

    await prisma.agent_outputs.create({
      data: {
        session_id: sessionId,
        request_id: session.request_id,
        agent_name: 'music',
        output: musicData as never,
      },
    })

    return res.json({ ok: true, output: musicData })
  } catch (error) {
    console.error('[regenerate/music] error:', error)
    return res.status(500).json({
      error: 'music regeneration failed',
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
