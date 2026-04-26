import { NextFunction, Request, Response } from 'express'
import { getOrCreateUserByAnonKey } from '../services/users'

function extractUserKey(req: Request): string {
  const headerKey = String(req.headers['x-user-key'] ?? '').trim()
  const queryKey = String(req.query.userKey ?? '').trim()
  const bodyKey = String(req.body?.userKey ?? '').trim()
  return headerKey || queryKey || bodyKey
}

export async function requireAnonUser(req: Request, res: Response, next: NextFunction) {
  const userKey = extractUserKey(req)
  if (!userKey) {
    return res.status(400).json({ error: 'userKey is required' })
  }

  try {
    const user = await getOrCreateUserByAnonKey(userKey)
    req.userKey = userKey
    req.user = user
    return next()
  } catch (error) {
    return res.status(500).json({
      error: 'unable to authenticate anonymous user',
      detail: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
