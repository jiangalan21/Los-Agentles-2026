import { Router } from 'express'
import { prisma } from '../lib/prisma'

const router = Router()

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY

function checkInternalKey(req: any, res: any, next: any) {
  if (INTERNAL_API_KEY && req.headers['x-internal-key'] !== INTERNAL_API_KEY) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  next()
}

// POST /internal/agent-output
// Called by the Python orchestrator to push raw card JSON for the frontend to poll.
// Body: { session_id: string, outputs: Record<string, unknown> }
router.post('/agent-output', checkInternalKey, async (req, res) => {
  const { session_id, outputs } = req.body as {
    session_id: string
    outputs: Record<string, unknown>
  }

  if (!session_id || !outputs || typeof outputs !== 'object') {
    return res.status(400).json({ error: 'session_id and outputs are required' })
  }

  const session = await prisma.sessions.findUnique({ where: { id: session_id } })
  if (!session) {
    return res.status(404).json({ error: 'session not found' })
  }

  try {
    await Promise.all(
      Object.entries(outputs).map(([agentName, cardData]) =>
        prisma.agent_outputs.create({
          data: {
            session_id,
            agent_name: agentName,
            output: cardData as any,
          },
        })
      )
    )
    return res.status(201).json({ ok: true })
  } catch (error) {
    return res.status(500).json({
      error: 'failed to store agent outputs',
      detail: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

export default router
