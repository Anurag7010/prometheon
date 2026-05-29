import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeRequest, makeAuthRequest, makeFormDataRequest, TEST_USER_ID } from '../setup/server'
import { toDocumentId, toUserId } from '@/types'
import type { Document as DomainDocument } from '@/types'

// server-only guard would throw in jsdom — stub it out for tests
vi.mock('server-only', () => ({}))

// lib/jwt uses jose which has a cross-realm Uint8Array issue in vitest VM isolation.
import { jwtMock } from '../setup/jwt-mock'
vi.mock('../../lib/jwt', () => jwtMock())

// Mock backend client — route tests don't call Python
vi.mock('../../lib/backend-client', () => ({
  backendClient: {
    ingest: vi.fn(),
    ask: vi.fn(),
    retrieve: vi.fn(),
    health: vi.fn(),
  },
}))

// Mock the entire db module — prevents db/connection.ts from requiring DATABASE_URL
vi.mock('../../db', () => ({
  documentsRepository: {
    create: vi.fn(),
    findById: vi.fn(),
    findByUser: vi.fn(),
    updateStatus: vi.fn(),
    deleteDocument: vi.fn(),
  },
  queriesRepository: {
    create: vi.fn(),
    findByUser: vi.fn(),
    findByDocument: vi.fn(),
    updateAnswer: vi.fn(),
  },
}))

import * as db from '../../db'
const documentsRepo = db.documentsRepository as typeof db.documentsRepository
import { backendClient } from '../../lib/backend-client'
import { GET, POST } from '../../app/api/documents/route'
import {
  GET as getById,
  PATCH,
  DELETE,
} from '../../app/api/documents/[id]/route'

const mockDocument: DomainDocument = {
  id: toDocumentId('doc-001'),
  userId: toUserId(TEST_USER_ID),
  filename: 'test.pdf',
  status: 'pending',
  chunkCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ============================================================
// GET /api/documents
// ============================================================

describe('GET /api/documents', () => {

  it('returns 200 with array of documents for authenticated user', async () => {
    vi.mocked(documentsRepo.findByUser).mockResolvedValue([mockDocument])

    const res = await makeAuthRequest(GET)

    expect(res.status).toBe(200)
    expect((res.body as any).data).toHaveLength(1)
  })

  it('calls findByUser with correct userId from auth context', async () => {
    vi.mocked(documentsRepo.findByUser).mockResolvedValue([])

    await makeAuthRequest(GET, {}, TEST_USER_ID)

    expect(documentsRepo.findByUser).toHaveBeenCalledWith(TEST_USER_ID)
  })

  it('returns 200 with empty array when user has no documents', async () => {
    vi.mocked(documentsRepo.findByUser).mockResolvedValue([])

    const res = await makeAuthRequest(GET)

    expect(res.status).toBe(200)
    expect((res.body as any).data).toEqual([])
  })

  it('returns 401 when Authorization header is missing', async () => {
    const res = await makeRequest(GET)
    expect(res.status).toBe(401)
  })

  it('returns 401 when token is invalid', async () => {
    const res = await makeRequest(GET, {
      headers: { Authorization: 'Bearer invalid.token.here' },
    })
    expect(res.status).toBe(401)
  })

  it('response includes X-Request-ID header', async () => {
    vi.mocked(documentsRepo.findByUser).mockResolvedValue([])

    const res = await makeAuthRequest(GET)

    expect(res.headers.get('x-request-id')).toBeTruthy()
  })

})

// ============================================================
// POST /api/documents (multipart file upload → ingest)
// ============================================================

describe('POST /api/documents', () => {

  function makeTestFormData(filename = 'report.pdf'): FormData {
    const fd = new FormData()
    fd.append('file', new File(['pdf content'], filename, { type: 'application/pdf' }))
    return fd
  }

  it('returns 201 with IngestResponse on valid file upload', async () => {
    vi.mocked(documentsRepo.create).mockResolvedValue(mockDocument)
    vi.mocked(documentsRepo.updateStatus).mockResolvedValue({ ...mockDocument, status: 'ingested', chunkCount: 5 })
    vi.mocked(backendClient.ingest as any).mockResolvedValue({ status: 'ok', chunkCount: 5, error: null })

    const res = await makeFormDataRequest(POST, makeTestFormData())

    expect(res.status).toBe(201)
    const body = res.body as any
    expect(body.data.status).toBe('ingested')
    expect(body.data.chunkCount).toBe(5)
  })

  it('returns Location header pointing to created document', async () => {
    vi.mocked(documentsRepo.create).mockResolvedValue(mockDocument)
    vi.mocked(documentsRepo.updateStatus).mockResolvedValue({ ...mockDocument, status: 'ingested' })
    vi.mocked(backendClient.ingest as any).mockResolvedValue({ status: 'ok', chunkCount: 3, error: null })

    const res = await makeFormDataRequest(POST, makeTestFormData())

    expect(res.headers.get('location')).toBe('/api/documents/doc-001')
  })

  it('calls create() with userId from auth context', async () => {
    vi.mocked(documentsRepo.create).mockResolvedValue(mockDocument)
    vi.mocked(documentsRepo.updateStatus).mockResolvedValue({ ...mockDocument, status: 'ingested' })
    vi.mocked(backendClient.ingest as any).mockResolvedValue({ status: 'ok', chunkCount: 1, error: null })

    await makeFormDataRequest(POST, makeTestFormData())

    expect(documentsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: TEST_USER_ID })
    )
  })

  it('returns 400 when no file in form data', async () => {
    // Empty FormData — no file field
    const res = await makeFormDataRequest(POST, new FormData())

    expect(res.status).toBe(422)
  })

  it('returns 401 when not authenticated', async () => {
    const res = await makeRequest(POST, { method: 'POST' })
    expect(res.status).toBe(401)
  })

  it('marks document as failed and returns 502 when backend ingest fails', async () => {
    vi.mocked(documentsRepo.create).mockResolvedValue(mockDocument)
    vi.mocked(documentsRepo.updateStatus).mockResolvedValue({ ...mockDocument, status: 'failed' })
    vi.mocked(backendClient.ingest as any).mockResolvedValue({
      status: 'error', chunkCount: 0, error: 'Pipeline failed'
    })

    const res = await makeFormDataRequest(POST, makeTestFormData())

    expect(res.status).toBe(502)
    expect(documentsRepo.updateStatus).toHaveBeenCalledWith(
      expect.any(String), 'failed', undefined
    )
  })

})

// ============================================================
// GET /api/documents/[id]
// ============================================================

describe('GET /api/documents/[id]', () => {

  it('returns 200 with document when found and owned by requester', async () => {
    vi.mocked(documentsRepo.findById).mockResolvedValue(mockDocument)

    const res = await makeAuthRequest(getById, { params: { id: 'doc-001' } })

    expect(res.status).toBe(200)
    expect((res.body as any).data.id).toBe('doc-001')
  })

  it('returns 404 when document does not exist', async () => {
    vi.mocked(documentsRepo.findById).mockResolvedValue(null)

    const res = await makeAuthRequest(getById, { params: { id: 'missing-id' } })

    expect(res.status).toBe(404)
  })

  it('returns 403 when document belongs to different user', async () => {
    vi.mocked(documentsRepo.findById).mockResolvedValue({
      ...mockDocument,
      userId: toUserId('different-user-id'),
    })

    const res = await makeAuthRequest(getById, { params: { id: 'doc-001' } })

    expect(res.status).toBe(403)
  })

  it('returns 401 when not authenticated', async () => {
    const res = await makeRequest(getById, { params: { id: 'doc-001' } })
    expect(res.status).toBe(401)
  })

})

// ============================================================
// PATCH /api/documents/[id]
// ============================================================

describe('PATCH /api/documents/[id]', () => {

  it('returns 200 with updated document on valid request', async () => {
    vi.mocked(documentsRepo.findById).mockResolvedValue(mockDocument)
    vi.mocked(documentsRepo.updateStatus).mockResolvedValue({
      ...mockDocument,
      status: 'ingested',
      chunkCount: 10,
    })

    const res = await makeAuthRequest(PATCH, {
      method: 'PATCH',
      body: { status: 'ingested', chunkCount: 10 },
      params: { id: 'doc-001' },
    })

    expect(res.status).toBe(200)
    expect((res.body as any).data.status).toBe('ingested')
  })

  it('returns 422 on invalid status value', async () => {
    vi.mocked(documentsRepo.findById).mockResolvedValue(mockDocument)

    const res = await makeAuthRequest(PATCH, {
      method: 'PATCH',
      body: { status: 'invalid-status' },
      params: { id: 'doc-001' },
    })

    expect(res.status).toBe(422)
  })

  it('returns 403 on ownership violation', async () => {
    vi.mocked(documentsRepo.findById).mockResolvedValue({
      ...mockDocument,
      userId: toUserId('someone-else'),
    })

    const res = await makeAuthRequest(PATCH, {
      method: 'PATCH',
      body: { status: 'ingested' },
      params: { id: 'doc-001' },
    })

    expect(res.status).toBe(403)
  })

  it('returns 401 when not authenticated', async () => {
    const res = await makeRequest(PATCH, {
      method: 'PATCH',
      body: { status: 'ingested' },
      params: { id: 'doc-001' },
    })
    expect(res.status).toBe(401)
  })

})

// ============================================================
// DELETE /api/documents/[id]
// ============================================================

describe('DELETE /api/documents/[id]', () => {

  it('returns 204 with no body on success', async () => {
    vi.mocked(documentsRepo.findById).mockResolvedValue(mockDocument)
    vi.mocked(documentsRepo.deleteDocument).mockResolvedValue(true)

    const res = await makeAuthRequest(DELETE, {
      method: 'DELETE',
      params: { id: 'doc-001' },
    })

    expect(res.status).toBe(204)
    expect(res.body).toBeNull()
  })

  it('returns 404 when document does not exist', async () => {
    vi.mocked(documentsRepo.findById).mockResolvedValue(null)

    const res = await makeAuthRequest(DELETE, {
      method: 'DELETE',
      params: { id: 'missing' },
    })

    expect(res.status).toBe(404)
  })

  it('returns 403 on ownership violation', async () => {
    vi.mocked(documentsRepo.findById).mockResolvedValue({
      ...mockDocument,
      userId: toUserId('someone-else'),
    })

    const res = await makeAuthRequest(DELETE, {
      method: 'DELETE',
      params: { id: 'doc-001' },
    })

    expect(res.status).toBe(403)
  })

  it('returns 401 when not authenticated', async () => {
    const res = await makeRequest(DELETE, {
      method: 'DELETE',
      params: { id: 'doc-001' },
    })
    expect(res.status).toBe(401)
  })

})
