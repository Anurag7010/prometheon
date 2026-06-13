import 'server-only'

import { eq, and, desc } from 'drizzle-orm'
import db from '../connection'
import { conversations, type Conversation } from '../schema'

/** Insert a new conversation for a user, returning the created row. */
export async function createConversation(data: { userId: string; title?: string }): Promise<Conversation> {
  const [row] = await db
    .insert(conversations)
    .values({ userId: data.userId, title: data.title ?? 'New Conversation' })
    .returning()
  if (!row) throw new Error('createConversation: insert returned no row')
  return row
}

/** Return up to `limit` conversations for a user, ordered by updatedAt descending. */
export async function findConversationsByUser(userId: string, limit: number = 20): Promise<Conversation[]> {
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt))
    .limit(limit)
}

/** Return a single conversation by id, only if it belongs to the given user. */
export async function findConversationById(id: string, userId: string): Promise<Conversation | null> {
  const rows = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    .limit(1)
  return rows[0] ?? null
}

/** Update the title and updatedAt of a conversation by id, scoped to the owning user. */
export async function updateConversationTitle(id: string, userId: string, title: string): Promise<void> {
  await db
    .update(conversations)
    .set({ title, updatedAt: new Date() })
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
}

/** Delete a conversation by id, scoped to the owning user. Returns true if a row was deleted. */
export async function deleteConversation(id: string, userId: string): Promise<boolean> {
  const result = await db
    .delete(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    .returning({ id: conversations.id })
  return result.length > 0
}
