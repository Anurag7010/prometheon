import { drizzle } from 'drizzle-orm/postgres-js'
import { sql } from 'drizzle-orm'
import postgres from 'postgres'
import * as schema from '../../db/schema'
import { users, documents, queries } from '../../db/schema'

if (!process.env.DATABASE_URL_TEST) {
  throw new Error('DATABASE_URL_TEST is not set — check .env.test')
}

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
  return query
}