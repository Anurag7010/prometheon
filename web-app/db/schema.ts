import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// ============================================================
// ENUMS
// ============================================================

// pgEnum maps to a real PostgreSQL enum type in the database
// Values must match exactly what the Python backend sends
export const documentStatusEnum = pgEnum('document_status', [
  'pending',
  'ingested',
  'failed',
])

export type DocumentStatus = typeof documentStatusEnum.enumValues[number]

// ============================================================
// USERS
// ============================================================

export const users = pgTable('users', {
  id: uuid('id')
    .primaryKey()
    // gen_random_uuid() runs in the database — no UUID generated in JS
    .defaultRandom(),

  email: text('email')
    .notNull()
    .unique(),

  passwordHash: text('password_hash').notNull(),

  tokenVersion: integer('token_version').default(0).notNull(),

  createdAt: timestamp('created_at', {
    // timestamptz — always store with timezone, always query in UTC
    withTimezone: true,
    mode: 'date',
  })
    // $defaultFn runs in JS at insert time — equivalent to DEFAULT now()
    .$defaultFn(() => new Date()),
})

// ============================================================
// DOCUMENTS
// ============================================================

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // ON DELETE CASCADE — when user is deleted, their documents are deleted too
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    filename: text('filename').notNull(),

    status: documentStatusEnum('status')
      .notNull()
      .default('pending'),

    chunkCount: integer('chunk_count')
      .notNull()
      .default(0),

    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .$defaultFn(() => new Date()),

    // updatedAt must be managed at application level in Drizzle
    // PostgreSQL has no built-in auto-update trigger unless you create one
    // We update this manually in updateStatus()
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    // Index on userId — most queries filter by user
    userIdIdx: index('documents_user_id_idx').on(table.userId),
    // Index on status — dashboard filters by pending/ingested/failed
    statusIdx: index('documents_status_idx').on(table.status),
  })
)

// ============================================================
// QUERIES
// ============================================================

export const queries = pgTable(
  'queries',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Nullable — a query may be against all documents, not a specific one
    // ON DELETE SET NULL — if document is deleted, query record is preserved
    // with documentId = null (query history is retained)
    documentId: uuid('document_id')
      .references(() => documents.id, { onDelete: 'set null' }),

    queryText: text('query_text').notNull(),

    // Nullable at insert time — answer populated after AI generation completes
    answerText: text('answer_text'),

    // Nullable at insert — populated after generation
    latencyMs: integer('latency_ms'),

    // jsonb — stores retrieval chunk metadata, scores, sources
    // Typed as unknown at DB level — application layer validates shape
    retrievalMetadata: jsonb('retrieval_metadata'),

    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    userIdIdx: index('queries_user_id_idx').on(table.userId),
    documentIdIdx: index('queries_document_id_idx').on(table.documentId),
  })
)

// ============================================================
// RELATIONS — for Drizzle relational query API
// ============================================================

export const usersRelations = relations(users, ({ many }) => ({
  documents: many(documents),
  queries: many(queries),
}))

export const documentsRelations = relations(documents, ({ one, many }) => ({
  user: one(users, { fields: [documents.userId], references: [users.id] }),
  queries: many(queries),
}))

export const queriesRelations = relations(queries, ({ one }) => ({
  user: one(users, { fields: [queries.userId], references: [users.id] }),
  document: one(documents, { fields: [queries.documentId], references: [documents.id] }),
}))

// ============================================================
// INFERRED TYPES — use these everywhere, never write types manually
// ============================================================

// User excludes passwordHash — never send hash to client
export type User = Omit<typeof users.$inferSelect, 'passwordHash' | 'tokenVersion'>
export type NewUser = typeof users.$inferInsert

// Internal type used only in auth paths that need to verify credentials
export type UserWithHash = typeof users.$inferSelect

export type Document = typeof documents.$inferSelect
export type NewDocument = typeof documents.$inferInsert

export type Query = typeof queries.$inferSelect
export type NewQuery = typeof queries.$inferInsert