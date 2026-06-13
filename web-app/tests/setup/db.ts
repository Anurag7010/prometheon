import dotenv from 'dotenv'
import path from 'path'
import { drizzle } from 'drizzle-orm/postgres-js'
import { sql } from 'drizzle-orm'
import postgres from 'postgres'
import * as schema from '../../db/schema'
import { users, documents, queries } from '../../db/schema'

// Load env files so DATABASE_URL_TEST is available in process.env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

if (!process.env.DATABASE_URL_TEST) {
  throw new Error('DATABASE_URL_TEST is not set — check .env.local')
}

// Point DATABASE_URL at the test database so repository modules use the test DB
// This must happen before any import that triggers db/connection.ts
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST

// Separate connection for test database — never touches dev data
export const testPool = postgres(process.env.DATABASE_URL_TEST)
export const testDb = drizzle(testPool, { schema })

/**
 * Truncates all tables in FK-safe order.
 * queries → documents → users
 * If you truncate users first, FK constraint on queries.user_id fires.
 * CASCADE handles any we miss.
 */
export async function resetDatabase(): Promise<void> {
  await testDb.execute(
    sql`TRUNCATE TABLE queries, documents, users RESTART IDENTITY CASCADE`
  )
}

/**
 * Seeds a test user — most tests need one to exist before creating documents/queries
 */
export async function seedUser(overrides: Partial<schema.NewUser> = {}): Promise<schema.User> {
  const [user] = await testDb
    .insert(users)
    .values({
      email: `test-${Date.now()}@example.com`,
      passwordHash: '$2b$12$test-hash-placeholder-for-seeding',
      ...overrides,
    })
    .returning()
  if (!user) throw new Error('seedUser: insert returned no row')
  return user
}

/**
 * Seeds a test document for a given user
 */
export async function seedDocument(
  userId: string,
  overrides: Partial<schema.NewDocument> = {}
): Promise<schema.Document> {
  const [document] = await testDb
    .insert(documents)
    .values({
      userId,
      filename: 'test-document.pdf',
      ...overrides,
    })
    .returning()
  if (!document) throw new Error('seedDocument: insert returned no row')
  return document
}

/**
 * Seeds a test query — documentId is optional (null = global query)
 */
export async function seedQuery(
  userId: string,
  documentId?: string,
  overrides: Partial<schema.NewQuery> = {}
): Promise<schema.Query> {
  const [query] = await testDb
    .insert(queries)
    .values({
      userId,
      documentId: documentId ?? null,
      queryText: 'What is this document about?',
      ...overrides,
    })
    .returning()
  if (!query) throw new Error('seedQuery: insert returned no row')
  return query
}
