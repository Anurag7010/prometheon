import 'server-only'

import { eq, sql } from 'drizzle-orm'
import db from '../connection'
import { users, type User, type UserWithHash } from '../schema'

// Returns full row including passwordHash — only for auth paths
export async function findByEmail(email: string): Promise<UserWithHash | null> {
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1)
  return rows[0] ?? null
}

// Returns User without passwordHash — for session/profile use
export async function findById(id: string): Promise<User | null> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1)
  if (!rows[0]) return null
  const { passwordHash: _ph, tokenVersion: _tv, ...safe } = rows[0]
  return safe
}

export async function createUser(data: {
  email: string
  passwordHash: string
}): Promise<User> {
  const [row] = await db.insert(users).values(data).returning()
  if (!row) throw new Error('createUser: insert returned no row')
  const { passwordHash: _ph, tokenVersion: _tv, ...safe } = row
  return safe
}

export async function incrementTokenVersion(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
    .where(eq(users.id, userId))
}

export async function emailExists(email: string): Promise<boolean> {
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  return rows.length > 0
}

export async function markOnboardingComplete(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ onboardingCompleted: new Date() })
    .where(eq(users.id, userId))
}

export async function isOnboardingComplete(userId: string): Promise<boolean> {
  const rows = await db
    .select({ onboardingCompleted: users.onboardingCompleted })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  return !!rows[0]?.onboardingCompleted
}
