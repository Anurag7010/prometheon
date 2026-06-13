// server-only: this module will throw a build error if imported by a Client Component
// Prevents database credentials and server logic from being bundled into the browser
import 'server-only'

import { eq, desc } from 'drizzle-orm'
import db from '../connection'
import {
  documents,
  Document,
  NewDocument,
  DocumentStatus,
} from '../schema'
import { toDocumentId, toUserId } from '@/types'
import type { Document as DomainDocument } from '@/types'

// Maps a raw Drizzle DB row to the branded domain type.
// Called at the DB boundary so branded IDs propagate through the app.
function toDomainDocument(doc: Document): DomainDocument {
  return {
    id: toDocumentId(doc.id),
    userId: toUserId(doc.userId),
    filename: doc.filename,
    status: doc.status,
    chunkCount: doc.chunkCount,
    createdAt: doc.createdAt ?? new Date(),
    updatedAt: doc.updatedAt ?? new Date(),
  }
}

// ============================================================
// CREATE
// Called after file upload — before ingestion starts
// Status defaults to 'pending' via schema default
// ============================================================
export async function create(data: NewDocument): Promise<Document> {
  const [created] = await db
    .insert(documents)
    .values(data)
    // returning() gives us the full inserted row — including DB-generated fields
    // Without this we would need a second SELECT to get the created_at and id
    .returning()

  if (!created) throw new Error('create: insert returned no row')
  return created
}

// ============================================================
// FIND BY ID
// Returns null if not found — never throws
// Route handler decides whether to 404
// ============================================================
export async function findById(id: string): Promise<DomainDocument | null> {
  const [document] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, id))
    .limit(1)

  // Drizzle returns an array — destructure first element, undefined if empty
  return document ? toDomainDocument(document) : null
}

// ============================================================
// FIND BY USER
// All documents for a user — newest first
// ============================================================
export async function findByUser(userId: string): Promise<DomainDocument[]> {
  const rows = await db
    .select()
    .from(documents)
    .where(eq(documents.userId, userId))
    .orderBy(desc(documents.createdAt))
  return rows.map(toDomainDocument)
}

// ============================================================
// UPDATE STATUS
// Called by ingestion pipeline after processing completes or fails
// Always updates updatedAt — Drizzle does not do this automatically
// ============================================================
export async function updateStatus(
  id: string,
  status: DocumentStatus,
  chunkCount?: number
): Promise<Document | null> {
  const [updated] = await db
    .update(documents)
    .set({
      status,
      // Only update chunkCount if provided — spread avoids overwriting with undefined
      ...(chunkCount !== undefined ? { chunkCount } : {}),
      // Manual updatedAt — PostgreSQL won't do this automatically without a trigger
      updatedAt: new Date(),
    })
    .where(eq(documents.id, id))
    .returning()

  return updated ?? null
}

// ============================================================
// DELETE
// Returns true if a row was deleted, false if not found
// Cascade in schema handles related queries automatically
// ============================================================
export async function deleteDocument(id: string): Promise<boolean> {
  const result = await db
    .delete(documents)
    .where(eq(documents.id, id))
    .returning({ id: documents.id })

  return result.length > 0
}