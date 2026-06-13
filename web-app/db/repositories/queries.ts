// server-only: this module will throw a build error if imported by a Client Component
// Prevents database credentials and server logic from being bundled into the browser
import 'server-only'

import { eq, desc } from 'drizzle-orm'
import db from '../connection'
import { queries, Query, NewQuery } from '../schema'
import { toQueryId, toUserId, toDocumentId } from '@/types'
import type { Query as DomainQuery } from '@/types'

// Maps a raw Drizzle row to the branded domain type.
function toDomainQuery(q: Query): DomainQuery {
  return {
    id: toQueryId(q.id),
    userId: toUserId(q.userId),
    documentId: q.documentId ? toDocumentId(q.documentId) : null,
    queryText: q.queryText,
    answerText: q.answerText ?? null,
    latencyMs: q.latencyMs ?? null,
    retrievalMetadata: q.retrievalMetadata as Record<string, unknown> | null,
    createdAt: q.createdAt ?? new Date(),
  }
}

// ============================================================
// CREATE
// Called when user submits a question — before AI generation
// answerText and latencyMs are null at this point
// ============================================================
export async function create(data: NewQuery): Promise<Query> {
  const [created] = await db
    .insert(queries)
    .values(data)
    .returning()

  if (!created) throw new Error('create: insert returned no row')
  return created
}

// ============================================================
// FIND BY USER
// Query history for a user — newest first, capped at limit
// Default limit 50 — prevents unbounded result sets
// ============================================================
export async function findByUser(
  userId: string,
  limit = 50
): Promise<DomainQuery[]> {
  const rows = await db
    .select()
    .from(queries)
    .where(eq(queries.userId, userId))
    .orderBy(desc(queries.createdAt))
    .limit(limit)
  return rows.map(toDomainQuery)
}

// ============================================================
// FIND BY DOCUMENT
// All queries against a specific document — for document detail view
// ============================================================
export async function findByDocument(documentId: string): Promise<DomainQuery[]> {
  const rows = await db
    .select()
    .from(queries)
    .where(eq(queries.documentId, documentId))
    .orderBy(desc(queries.createdAt))
  return rows.map(toDomainQuery)
}

// ============================================================
// UPDATE ANSWER
// Called after AI generation completes
// Populates answerText, latencyMs, retrievalMetadata
// ============================================================
export async function updateAnswer(
  id: string,
  answer: string,
  latencyMs: number,
  retrievalMetadata: Record<string, unknown>
): Promise<Query | null> {
  const [updated] = await db
    .update(queries)
    .set({
      answerText: answer,
      latencyMs,
      // jsonb column accepts any serializable object
      retrievalMetadata,
    })
    .where(eq(queries.id, id))
    .returning()

  return updated ?? null
}