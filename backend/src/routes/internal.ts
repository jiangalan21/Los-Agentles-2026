import { Router } from 'express'
import { prisma } from '../lib/prisma'

const router = Router()

router.post('/results', async (req, res) => {
  const { sessionId, requestId, agents } = req.body as {
    sessionId?: string
    requestId?: string | null
    agents?: Array<{ agentName: string; output: unknown }>
  }

  if (!sessionId || !Array.isArray(agents) || agents.length === 0) {
    return res.status(400).json({ error: 'sessionId and agents are required' })
  }

  try {
    for (const { agentName, output } of agents) {
      if (requestId) {
        const existing = await prisma.plan_request_agents.findFirst({
          where: { request_id: requestId, agent_name: agentName },
        })
        // #region agent log
        fetch('http://127.0.0.1:7274/ingest/cc5e17f3-e147-4b32-a248-58f83f5c2e99',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'244467'},body:JSON.stringify({sessionId:'244467',location:'backend/src/routes/internal.ts:loop:existingStatus',message:'internal/results existing request-agent status',data:{runId:`run-${sessionId}`,hypothesisId:'H4',sessionId,requestId,agentName,existingStatus:existing?.status??null},timestamp:Date.now(),runId:`run-${sessionId}`,hypothesisId:'H4'})}).catch(()=>{})
        // #endregion
        if (existing?.status === 'completed') {
          // #region agent log
          fetch('http://127.0.0.1:7274/ingest/cc5e17f3-e147-4b32-a248-58f83f5c2e99',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'244467'},body:JSON.stringify({sessionId:'244467',location:'backend/src/routes/internal.ts:loop:skipCompleted',message:'internal/results skipped already completed agent',data:{runId:`run-${sessionId}`,hypothesisId:'H4',sessionId,requestId,agentName},timestamp:Date.now(),runId:`run-${sessionId}`,hypothesisId:'H4'})}).catch(()=>{})
          // #endregion
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
        await prisma.plan_request_agents.update({
          where: {
            request_id_agent_name: { request_id: requestId, agent_name: agentName },
          },
          data: {
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
          status: pendingOrFailed === 0 ? 'completed' : 'running',
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
