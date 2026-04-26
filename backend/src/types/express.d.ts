import type { users } from '@prisma/client'

declare global {
  namespace Express {
    interface Request {
      userKey?: string
      user?: users
    }
  }
}

export {}
