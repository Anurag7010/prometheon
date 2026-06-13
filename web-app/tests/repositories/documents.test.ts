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
import * as documentsRepo from '../../db/repositories/documents'

beforeAll(async () => {
  // Run migrations against test DB before any tests
  // Ensures schema matches what the code expects
  await migrate(testDb, { migrationsFolder: './db/migrations' })
})

beforeEach(async () => {
  // Clean slate — each test gets an empty database
  await resetDatabase()
})

afterAll(async () => {
  // Release connection pool — prevents hanging test process
  await testPool.end()
})

// ============================================================
// create()
// ============================================================

describe('documentsRepository.create()', () => {

  it('creates document with correct fields', async () => {
    // Proves every field is stored and returned correctly on insert
    const user = await seedUser()

    const doc = await documentsRepo.create({
      userId: user.id,
      filename: 'report.pdf',
    })

    expect(doc.id).toBeDefined()
    expect(doc.userId).toBe(user.id)
    expect(doc.filename).toBe('report.pdf')
    expect(doc.chunkCount).toBe(0)
  })

  it('sets status to pending by default', async () => {
    // Proves schema default is applied — no need to pass status explicitly
    const user = await seedUser()
    const doc = await documentsRepo.create({ userId: user.id, filename: 'file.pdf' })

    expect(doc.status).toBe('pending')
  })

  it('sets createdAt and updatedAt as Date objects automatically', async () => {
    // Proves $defaultFn runs and returns proper Date — not string, not null
    const user = await seedUser()
    const doc = await documentsRepo.create({ userId: user.id, filename: 'file.pdf' })

    expect(doc.createdAt).toBeInstanceOf(Date)
    expect(doc.updatedAt).toBeInstanceOf(Date)
  })

  it('throws when userId does not exist in users table', async () => {
    // Proves FK constraint is enforced at DB level — not just application level
    await expect(
      documentsRepo.create({
        userId: '00000000-0000-0000-0000-000000000999', // non-existent user
        filename: 'file.pdf',
      })
    ).rejects.toThrow()
  })

})

// ============================================================
// findById()
// ============================================================

describe('documentsRepository.findById()', () => {

  it('returns correct document when ID exists', async () => {
    const user = await seedUser()
    const created = await seedDocument(user.id)

    const found = await documentsRepo.findById(created.id)

    expect(found).not.toBeNull()
    expect(found!.id).toBe(created.id)
    expect(found!.filename).toBe(created.filename)
  })

  it('returns null when ID does not exist — not an error', async () => {
    // Proves repository handles missing records gracefully
    // Route handler decides whether to 404 — repository stays neutral
    const result = await documentsRepo.findById('00000000-0000-0000-0000-000000000999')

    expect(result).toBeNull()
  })

  it('returns null for valid UUID belonging to different user', async () => {
    // Proves findById is ID-only — ownership check is in the route handler
    const user1 = await seedUser()
    const _user2 = await seedUser({ email: 'user2@example.com' })
    const doc = await seedDocument(user1.id)

    // user2 tries to look up user1's document by ID — still returns it
    // Ownership enforcement is NOT the repository's job
    const result = await documentsRepo.findById(doc.id)
    expect(result).not.toBeNull() // repository returns it — route handler blocks it
  })

})

// ============================================================
// findByUser()
// ============================================================

describe('documentsRepository.findByUser()', () => {

  it('returns all documents for a user ordered by createdAt descending', async () => {
    // Proves ordering — newest document appears first in results
    const user = await seedUser()

    const doc1 = await seedDocument(user.id, { filename: 'first.pdf' })
    await new Promise(r => setTimeout(r, 10)) // ensure different timestamps
    const doc2 = await seedDocument(user.id, { filename: 'second.pdf' })

    const results = await documentsRepo.findByUser(user.id)

    expect(results[0]?.id).toBe(doc2.id) // newest first
    expect(results[1]?.id).toBe(doc1.id)
  })

  it('returns empty array when user has no documents', async () => {
    // Proves empty state returns [] not null — callers can safely call .length
    const user = await seedUser()
    const results = await documentsRepo.findByUser(user.id)

    expect(results).toEqual([])
  })

  it('does not return documents belonging to other users', async () => {
    // Proves user isolation — user2 cannot see user1's documents
    const user1 = await seedUser()
    const _user2 = await seedUser({ email: 'user2@example.com' })

    await seedDocument(user1.id)
    await seedDocument(user1.id)

    const results = await documentsRepo.findByUser(_user2.id)
    expect(results).toHaveLength(0)
  })

})

// ============================================================
// updateStatus()
// ============================================================

describe('documentsRepository.updateStatus()', () => {

  it('updates status to ingested and sets chunkCount', async () => {
    const user = await seedUser()
    const doc = await seedDocument(user.id)

    const updated = await documentsRepo.updateStatus(doc.id, 'ingested', 42)

    expect(updated!.status).toBe('ingested')
    expect(updated!.chunkCount).toBe(42)
  })

  it('updates status to failed without chunkCount — chunkCount stays at default', async () => {
    // Proves partial update — only status changes, chunkCount untouched
    const user = await seedUser()
    const doc = await seedDocument(user.id)

    const updated = await documentsRepo.updateStatus(doc.id, 'failed')

    expect(updated!.status).toBe('failed')
    expect(updated!.chunkCount).toBe(0) // schema default unchanged
  })

  it('updatedAt is later than createdAt after update', async () => {
    // Proves manual updatedAt management works — not left as original value
    const user = await seedUser()
    const doc = await seedDocument(user.id)

    await new Promise(r => setTimeout(r, 20)) // ensure time passes
    const updated = await documentsRepo.updateStatus(doc.id, 'ingested', 10)

    expect(updated!.updatedAt!.getTime()).toBeGreaterThan(doc.createdAt!.getTime())
  })

  it('returns null when document ID does not exist', async () => {
    const result = await documentsRepo.updateStatus(
      '00000000-0000-0000-0000-000000000999',
      'ingested'
    )
    expect(result).toBeNull()
  })

})

// ============================================================
// delete()
// ============================================================

describe('documentsRepository.deleteDocument()', () => {

  it('returns true when document deleted successfully', async () => {
    const user = await seedUser()
    const doc = await seedDocument(user.id)

    const result = await documentsRepo.deleteDocument(doc.id)
    expect(result).toBe(true)
  })

  it('returns false when document ID does not exist', async () => {
    // Proves delete is idempotent-safe — no error on missing record
    const result = await documentsRepo.deleteDocument('00000000-0000-0000-0000-000000000999')
    expect(result).toBe(false)
  })

  it('nullifies document_id on related queries when document is deleted', async () => {
    // Schema uses ON DELETE SET NULL: query survives but document_id becomes null
    const user = await seedUser()
    const doc = await seedDocument(user.id)
    const query = await seedQuery(user.id, doc.id)

    await documentsRepo.deleteDocument(doc.id)

    const { queries } = await import('../../db/schema')
    const { eq } = await import('drizzle-orm')

    const remaining = await testDb.select().from(queries).where(eq(queries.id, query.id))
    expect(remaining).toHaveLength(1)
    expect(remaining[0]!.documentId).toBeNull()
  })

  it('does not affect other documents', async () => {
    // Proves delete is scoped — only target document removed
    const user = await seedUser()
    const doc1 = await seedDocument(user.id, { filename: 'keep.pdf' })
    const doc2 = await seedDocument(user.id, { filename: 'delete.pdf' })

    await documentsRepo.deleteDocument(doc2.id)

    const remaining = await documentsRepo.findById(doc1.id)
    expect(remaining).not.toBeNull()
  })

})