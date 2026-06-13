import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import {
  testDb,
  testPool,
  resetDatabase,
  seedUser,
  seedDocument,
  seedQuery,
} from '../setup/db'
import * as queriesRepo from '../../db/repositories/queries'

beforeAll(async () => {
  await migrate(testDb, { migrationsFolder: './db/migrations' })
})

beforeEach(async () => {
  await resetDatabase()
})

afterAll(async () => {
  await testPool.end()
})

// ============================================================
// create()
// ============================================================

describe('queriesRepository.create()', () => {

  it('creates query with required fields — answerText and latencyMs are null initially', async () => {
    // Proves initial state is correct — answer populated later by updateAnswer()
    const user = await seedUser()

    const query = await queriesRepo.create({
      userId: user.id,
      queryText: 'What is machine learning?',
      documentId: null,
    })

    expect(query.id).toBeDefined()
    expect(query.queryText).toBe('What is machine learning?')
    expect(query.answerText).toBeNull()
    expect(query.latencyMs).toBeNull()
  })

  it('creates query with optional documentId — FK stored correctly', async () => {
    // Proves documentId FK is stored when provided
    const user = await seedUser()
    const doc = await seedDocument(user.id)

    const query = await queriesRepo.create({
      userId: user.id,
      queryText: 'Summarize this document',
      documentId: doc.id,
    })

    expect(query.documentId).toBe(doc.id)
  })

  it('creates query without documentId — null is valid, not an error', async () => {
    // Proves nullable FK works — global queries not tied to a document
    const user = await seedUser()

    const query = await queriesRepo.create({
      userId: user.id,
      queryText: 'General question',
      documentId: null,
    })

    expect(query.documentId).toBeNull()
  })

})

// ============================================================
// findByUser()
// ============================================================

describe('queriesRepository.findByUser()', () => {

  it('returns queries ordered by createdAt descending', async () => {
    const user = await seedUser()

    const q1 = await seedQuery(user.id)
    await new Promise(r => setTimeout(r, 10))
    const q2 = await seedQuery(user.id)

    const results = await queriesRepo.findByUser(user.id)

    expect(results[0]?.id).toBe(q2.id)
    expect(results[1]?.id).toBe(q1.id)
  })

  it('respects custom limit parameter', async () => {
    // Proves limit works — important for large query histories
    const user = await seedUser()

    await seedQuery(user.id)
    await seedQuery(user.id)
    await seedQuery(user.id)

    const results = await queriesRepo.findByUser(user.id, 2)
    expect(results).toHaveLength(2)
  })

  it('returns empty array for user with no queries', async () => {
    const user = await seedUser()
    const results = await queriesRepo.findByUser(user.id)

    expect(results).toEqual([])
  })

  it('does not return queries belonging to other users', async () => {
    // Proves user isolation at the query level
    const user1 = await seedUser()
    const user2 = await seedUser({ email: 'user2@example.com' })

    await seedQuery(user1.id)
    await seedQuery(user1.id)

    const results = await queriesRepo.findByUser(user2.id)
    expect(results).toHaveLength(0)
  })

})

// ============================================================
// findByDocument()
// ============================================================

describe('queriesRepository.findByDocument()', () => {

  it('returns all queries linked to a specific document', async () => {
    const user = await seedUser()
    const doc = await seedDocument(user.id)

    await seedQuery(user.id, doc.id)
    await seedQuery(user.id, doc.id)

    const results = await queriesRepo.findByDocument(doc.id)
    expect(results).toHaveLength(2)
  })

  it('returns empty array when document has no queries', async () => {
    const user = await seedUser()
    const doc = await seedDocument(user.id)

    const results = await queriesRepo.findByDocument(doc.id)
    expect(results).toEqual([])
  })

  it('does not return queries from other documents', async () => {
    // Proves document-level isolation — doc2 queries don't appear in doc1 results
    const user = await seedUser()
    const doc1 = await seedDocument(user.id)
    const doc2 = await seedDocument(user.id)

    await seedQuery(user.id, doc2.id)

    const results = await queriesRepo.findByDocument(doc1.id)
    expect(results).toHaveLength(0)
  })

})

// ============================================================
// updateAnswer()
// ============================================================

describe('queriesRepository.updateAnswer()', () => {

  it('updates answerText, latencyMs, and retrievalMetadata correctly', async () => {
    const user = await seedUser()
    const query = await seedQuery(user.id)

    const metadata = { sources: ['doc1.pdf'], scores: [0.92] }

    const updated = await queriesRepo.updateAnswer(
      query.id,
      'Machine learning is a subset of AI.',
      342,
      metadata
    )

    expect(updated!.answerText).toBe('Machine learning is a subset of AI.')
    expect(updated!.latencyMs).toBe(342)
  })

  it('stores and retrieves retrievalMetadata as correct JSON object', async () => {
    // Proves jsonb round-trip works — object in, same object out
    const user = await seedUser()
    const query = await seedQuery(user.id)

    const metadata = { sources: ['a.pdf', 'b.pdf'], model: 'gpt-4', tokens: 512 }

    const updated = await queriesRepo.updateAnswer(query.id, 'Answer', 100, metadata)

    expect(updated!.retrievalMetadata).toEqual(metadata)
  })

  it('returns null when query ID does not exist', async () => {
    const result = await queriesRepo.updateAnswer(
      '00000000-0000-0000-0000-000000000999',
      'answer',
      100,
      {}
    )
    expect(result).toBeNull()
  })

})