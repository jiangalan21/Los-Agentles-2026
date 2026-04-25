import { Router } from 'express'

const router = Router()

// POST /session — create session and trigger prompt parsing
router.post('/', (_req, res) => {
  res.status(501).json({ error: 'not implemented' })
})

// GET /session/:id — return session with all agent outputs
router.get('/:id', (_req, res) => {
  res.status(501).json({ error: 'not implemented' })
})

export default router
