import { users } from '@prisma/client'
import { prisma } from '../lib/prisma'

export async function getOrCreateUserByAnonKey(userKey: string): Promise<users> {
  const normalizedKey = userKey.trim()

  if (!normalizedKey) {
    throw new Error('userKey is required')
  }

  return prisma.users.upsert({
    where: { anon_key: normalizedKey },
    update: {},
    create: { anon_key: normalizedKey },
  })
}
