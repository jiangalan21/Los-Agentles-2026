import { users } from '@prisma/client'
import { prisma } from '../lib/prisma'

export async function getOrCreateUserByAnonKey(userKey: string): Promise<users> {
  const normalizedKey = userKey.trim()

  if (!normalizedKey) {
    throw new Error('userKey is required')
  }

  const existingUser = await prisma.users.findUnique({
    where: { anon_key: normalizedKey },
  })

  if (existingUser) {
    return existingUser
  }

  return prisma.users.create({
    data: {
      anon_key: normalizedKey,
    },
  })
}
