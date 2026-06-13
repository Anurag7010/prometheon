import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeRequest, makeAuthRequest, TEST_USER_ID } from '../setup/server'
import type { Document as DomainDocument, Query } from '@/types'
import { toDocumentId, toUserId, toQueryId } from '@/types'

// server-only guard would throw in jsdom — stub it out
vi.mock('server-only', () => ({}))

// jose cross-realm issue in vitest — use Node.js crypto mock
import { jwtMock } from '../setup/jwt-mock'
vi.mock('../../lib/jwt', () => jwtMock())

// Mock DB module — prevents DATABASE_URL requirement
vi.mock('../../db', () => ({
  documentsRepository: {
    findByUser: vi.fn(),
  },
  queriesRepository: {
    findByUser: vi.fn(),
  },
}))

// Mock backend client
vi.mock('../../lib/backend-client', () => ({
  backendClient: {
    getMetrics: vi.fn(),
  },
}))

import * as db from '../../db'
import { backendClient } from '../../lib/backend-client'
import { GET } from '../../app/api/dashboard/stats/route'

const mockDocumentsRepo = db.documentsRepository as typeof db.documentsRepository
const mockQueriesRepo = db.queriesRepository as typeof db.queriesRepository
const mockGetMetrics = backendClient.getMetrics as unknown as ReturnType<typeof vi.fn>

// ── helpers ───────────────────────────────────────────────────────────────────

function makeDoc(status: 'pending' | 'ingested' | 'failed'): DomainDocument {
  return {
    id: toDocumentId(`doc-${status}`),
    userId: toUserId(TEST_USER_ID),
    filename: `${status}.pdf`,
    status,
    chunkCount: status === 'ingested' ? 5 : 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

function makeQuery(createdAt: Date): Query {
  return {
    id: toQueryId('q-001'),
    userId: toUserId(TEST_USER_ID),
    documentId: toDocumentId('doc-001'),
    queryText: 'What is this?',
    answerText: null,
    latencyMs: null,
    retrievalMetadata: null,
    createdAt,
  }
}

const MOCK_AI_METRICS = {
  period_hours: 24,
  total_queries: 10,
  avg_latency_ms: 1200,
  error_rate: 0.05,
  cache_hit_rate: 0.75,
  total_tokens: 5000,
  estimated_cost_usd: 0.025,
  slow_queries: 1,
  failed_retrievals: 0,
  queries_per_hour: 0.42,
  token_breakdown: { input: 3000, output: 2000 },
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ── GET /api/dashboard/stats ──────────────────────────────────────────────────

describe('GET /api/dashboard/stats', () => {

  it('returns 200 with correct response shape on valid auth', async () => {
    vi.mocked(mockDocumentsRepo.findByUser).mockResolvedValue([])
    vi.mocked(mockQueriesRepo.findByUser).mockResolvedValue([])
    mockGetMetrics.mockResolvedValue(MOCK_AI_METRICS)

    const res = await makeAuthRequest(GET)

    expect(res.status).toBe(200)
    const body = res.body as { documents: { total: number; ingested: number; failed: number; pending: number }; queries: { total: number; last24h: number } }
    expect(body).toHaveProperty('documents')
    expect(body).toHaveProperty('queries')
    expect(body).toHaveProperty('ai')
  })

  it('computes document counts correctly', async () => {
    const docs = [
      makeDoc('ingested'),
      makeDoc('ingested'),
      makeDoc('failed'),
      makeDoc('pending'),
    ]
    vi.mocked(mockDocumentsRepo.findByUser).mockResolvedValue(docs)
    vi.mocked(mockQueriesRepo.findByUser).mockResolvedValue([])
    mockGetMetrics.mockResolvedValue(MOCK_AI_METRICS)

    const res = await makeAuthRequest(GET)

    expect(res.status).toBe(200)
    const body = res.body as { documents: { total: number; ingested: number; failed: number; pending: number }; queries: { total: number; last24h: number } }
    expect(body.documents.total).toBe(4)
    expect(body.documents.ingested).toBe(2)
    expect(body.documents.failed).toBe(1)
    expect(body.documents.pending).toBe(1)
  })

  it('computes query counts correctly', async () => {
    const recentQuery = makeQuery(new Date(Date.now() - 60 * 60 * 1000))      // 1h ago
    const oldQuery = makeQuery(new Date(Date.now() - 30 * 60 * 60 * 1000))    // 30h ago
    vi.mocked(mockDocumentsRepo.findByUser).mockResolvedValue([])
    vi.mocked(mockQueriesRepo.findByUser).mockResolvedValue([recentQuery, oldQuery])
    mockGetMetrics.mockResolvedValue(MOCK_AI_METRICS)

    const res = await makeAuthRequest(GET)

    expect(res.status).toBe(200)
    const body = res.body as { documents: { total: number; ingested: number; failed: number; pending: number }; queries: { total: number; last24h: number } }
    expect(body.queries.total).toBe(2)
    expect(body.queries.last24h).toBe(1)
  })

  it('ai field is null when backendClient.getMetrics throws', async () => {
    vi.mocked(mockDocumentsRepo.findByUser).mockResolvedValue([])
    vi.mocked(mockQueriesRepo.findByUser).mockResolvedValue([])
    mockGetMetrics.mockRejectedValue(new Error('backend down'))

    const res = await makeAuthRequest(GET)

    // Non-fatal — rest of dashboard still returns 200
    expect(res.status).toBe(200)
    const body = res.body as { documents: { total: number; ingested: number; failed: number; pending: number }; queries: { total: number; last24h: number }; ai: unknown }
    expect(body.ai).toBeNull()
  })

  it('returns 401 when no auth token provided', async () => {
    const res = await makeRequest(GET)
    expect(res.status).toBe(401)
  })

  it('response has Cache-Control: private, max-age=30 header', async () => {
    vi.mocked(mockDocumentsRepo.findByUser).mockResolvedValue([])
    vi.mocked(mockQueriesRepo.findByUser).mockResolvedValue([])
    mockGetMetrics.mockResolvedValue(MOCK_AI_METRICS)

    const res = await makeAuthRequest(GET)

    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, max-age=30')
  })

})
