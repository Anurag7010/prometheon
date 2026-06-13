import 'server-only'

import { eq, and, asc, gt, sql } from 'drizzle-orm'
import db from '../connection'
import { messages, type Message, type NewMessage } from '../schema'

// Ownership note: these functions do not check userId directly.
// Callers must verify conversation ownership via findConversationById(id, userId) first.

/** Insert a single message and return the inserted row. */
export async function addMessage(data: NewMessage): Promise<Message> {
  const [row] = await db.insert(messages).values(data).returning()
  if (!row) throw new Error('addMessage: insert returned no row')
  return row
}

/** Return up to `limit` messages for a conversation, ordered by createdAt ascending. */
export async function getConversationMessages(conversationId: string, limit: number = 100): Promise<Message[]> {
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt))
    .limit(limit)
}

/**
 * Return messages for a conversation since a given timestamp (createdAt-based cursor).
 * If sinceTimestamp is provided, returns messages with createdAt > sinceTimestamp ordered ascending.
 * If sinceTimestamp is omitted, returns the same as getConversationMessages(conversationId, 100).
 */
export async function getRecentMessages(
  conversationId: string,
  sinceTimestamp?: Date
): Promise<Message[]> {
  if (sinceTimestamp) {
    return db
      .select()
      .from(messages)
      .where(and(
        eq(messages.conversationId, conversationId),
        gt(messages.createdAt, sinceTimestamp)
      ))
      .orderBy(asc(messages.createdAt))
  }
  return getConversationMessages(conversationId, 100)
}

/** Return the total token count for all messages in a conversation. Returns 0 if none. */
export async function getMessageTokenTotal(conversationId: string): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`COALESCE(SUM(${messages.tokenCount}), 0)` })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
  return rows[0]?.total ?? 0
}
