import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { requireAnonUser } from '../middleware/anonAuth'

const router = Router()

router.get('/', requireAnonUser, async (req, res) => {
  if (!req.user) {
    return res.status(400).json({ error: 'user context missing' })
  }

  return res.json({
    profile: {
      name: req.user.name ?? '',
      location: req.user.location ?? '',
      morningFocus: req.user.morning_focus ?? '',
      routineNotes: req.user.routine_notes ?? '',
      dietaryRestrictions: req.user.dietary_profile ?? '',
      foodPreferences: req.user.food_preferences ?? '',
      musicPreferences: req.user.music_profile ?? '',
      stylePreferences: req.user.style_profile ?? '',
    },
  })
})

router.put('/', requireAnonUser, async (req, res) => {
  if (!req.user) {
    return res.status(400).json({ error: 'user context missing' })
  }

  const body = req.body ?? {}
  const profile = {
    name: String(body.name ?? '').trim(),
    location: String(body.location ?? '').trim(),
    morningFocus: String(body.morningFocus ?? '').trim(),
    routineNotes: String(body.routineNotes ?? '').trim(),
    dietaryRestrictions: String(body.dietaryRestrictions ?? '').trim(),
    foodPreferences: String(body.foodPreferences ?? '').trim(),
    musicPreferences: String(body.musicPreferences ?? '').trim(),
    stylePreferences: String(body.stylePreferences ?? '').trim(),
  }

  try {
    const updatedUser = await prisma.users.update({
      where: { id: req.user.id },
      data: {
        name: profile.name,
        location: profile.location,
        morning_focus: profile.morningFocus,
        routine_notes: profile.routineNotes,
        dietary_profile: profile.dietaryRestrictions,
        food_preferences: profile.foodPreferences,
        music_profile: profile.musicPreferences,
        style_profile: profile.stylePreferences,
      },
    })

    return res.json({
      profile: {
        name: updatedUser.name ?? '',
        location: updatedUser.location ?? '',
        morningFocus: updatedUser.morning_focus ?? '',
        routineNotes: updatedUser.routine_notes ?? '',
        dietaryRestrictions: updatedUser.dietary_profile ?? '',
        foodPreferences: updatedUser.food_preferences ?? '',
        musicPreferences: updatedUser.music_profile ?? '',
        stylePreferences: updatedUser.style_profile ?? '',
      },
    })
  } catch (error) {
    return res.status(500).json({
      error: 'unable to save profile',
      detail: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

export default router
