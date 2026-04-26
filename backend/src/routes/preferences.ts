import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { requireAnonUser } from '../middleware/anonAuth'

const router = Router()

// POST /preferences — save or update user preferences
router.post('/', requireAnonUser, async (req, res) => {
  const cuisine = Array.isArray(req.body?.cuisine) ? req.body.cuisine : []
  const music = Array.isArray(req.body?.music) ? req.body.music : []
  const style = Array.isArray(req.body?.style) ? req.body.style : []
  const agentsEnabled =
    req.body?.agentsEnabled && typeof req.body.agentsEnabled === 'object'
      ? req.body.agentsEnabled
      : {}

  if (!req.user) {
    return res.status(400).json({ error: 'user context missing' })
  }

  try {
    const record = await prisma.user_preferences.upsert({
      where: { user_id: req.user.id },
      update: {
        cuisine_prefs: cuisine.map(String),
        music_prefs: music.map(String),
        style_prefs: style.map(String),
        agents_enabled: agentsEnabled as Prisma.InputJsonValue,
      },
      create: {
        user_id: req.user.id,
        cuisine_prefs: cuisine.map(String),
        music_prefs: music.map(String),
        style_prefs: style.map(String),
        agents_enabled: agentsEnabled as Prisma.InputJsonValue,
      },
    })

    return res.json({
      preferences: {
        cuisine: record.cuisine_prefs,
        music: record.music_prefs,
        style: record.style_prefs,
        agentsEnabled: record.agents_enabled,
      },
    })
  } catch (error) {
    return res.status(500).json({
      error: 'unable to save preferences',
      detail: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

export default router
