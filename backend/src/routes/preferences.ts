import { Router } from 'express'

const router = Router()

// POST /preferences — save or update user preferences
router.post('/', (_req, res) => {
  res.status(501).json({ error: 'not implemented' })
})

export default router
