/**
 * Edge case tests covering boundary conditions, auth failures, and unusual inputs.
 *
 * Pattern: import route handlers directly, call via makeRequest / makeAuthRequest,
 * mock all external services (db, backendClient, jose). No live server needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeRequest, makeAuthRequest, makeFormDataRequest, TEST_USER_ID } from '../setup/server'

// ── Infrastructure mocks (must come before any route imports) ─────────────────

// server-only guard throws in jsdom — stub it out
vi.mock('server-only', () => ({}))

// next/cache revalidateTag is not available in jsdom
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  unstable_cache: vi.fn((fn: unknown) => fn),
}))

// jose cross-realm Uint8Array issue in vitest VM — replace with Node.js crypto
import { jwtMock } from '../setup/jwt-mock'
vi.mock('../../lib/jwt', () => jwtMock())

// Mock next/headers — cookies() and headers() are not available in vitest
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(() => null),
    set: vi.fn(),
    delete: vi.fn(),
  })),
  headers: vi.fn(() => ({
    get: vi.fn(() => null),
  })),
}))

// Mock DB repositories — prevents DATABASE_URL requirement
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

// Mock conversations repository (ask route uses it for history loading)
vi.mock('../../db/repositories/conversations', () => ({
  createConversation: vi.fn(),
  findConversationsByUser: vi.fn(),
  findConversationById: vi.fn(),
  updateConversationTitle: vi.fn(),
  deleteConversation: vi.fn(),
}))

// Mock messages repository (ask route uses it for conversation history)
vi.mock('../../db/repositories/messages', () => ({
  getConversationMessages: vi.fn(async () => []),
  addMessage: vi.fn(async () => ({})),
}))

// Mock backendClient — route tests don't call the Python backend
vi.mock('../../lib/backend-client', () => ({
  backendClient: {
    ask: vi.fn(),
    askStream: vi.fn(),
    ingest: vi.fn(),
    retrieve: vi.fn(),
    health: vi.fn(),
    runAgent: vi.fn(),
    listMemories: vi.fn(),
    getMetrics: vi.fn(),
    isHealthy: vi.fn(),
  },
}))

// ── Imports (must come after all vi.mock calls) ────────────────────────────────

import * as db from '../../db'
import { backendClient } from '../../lib/backend-client'

import { POST as askPOST } from '../../app/api/ask/route'
import { GET as getDocuments, POST as postDocuments } from '../../app/api/documents/route'
import { POST as agentRunPOST } from '../../app/api/agent/run/route'
import { GET as getMemories } from '../../app/api/memories/route'
import { GET as getDashboardStats } from '../../app/api/dashboard/stats/route'

import { toDocumentId, toUserId, toQueryId } from '@/types'
import type { Document as DomainDocument } from '@/types'

// ── Typed mock references ─────────────────────────────────────────────────────

const mockDocumentsRepo = db.documentsRepository
const mockQueriesRepo = db.queriesRepository
const mockAsk = backendClient.ask as unknown as ReturnType<typeof vi.fn>
const mockRunAgent = backendClient.runAgent as unknown as ReturnType<typeof vi.fn>
const mockIngest = backendClient.ingest as unknown as ReturnType<typeof vi.fn>

// ── Test fixtures ─────────────────────────────────────────────────────────────

const MOCK_DOCUMENT: DomainDocument = {
  id: toDocumentId('doc-edge-001'),
  userId: toUserId(TEST_USER_ID),
  filename: 'edge.pdf',
  status: 'ingested',
  chunkCount: 5,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const MOCK_QUERY_RECORD = {
  id: toQueryId('q-edge-001'),
  userId: toUserId(TEST_USER_ID),
  documentId: null,
  queryText: 'test query',
  answerText: null,
  latencyMs: null,
  retrievalMetadata: null,
  createdAt: new Date(),
}

const MOCK_ASK_RESPONSE = {
  answer: 'This is the AI answer.',
  sources: [{ content: 'context chunk', score: 0.9, metadata: {}, citationId: 1 }],
  traceId: 'trace-edge-001',
  latencyBreakdown: { retrievalMs: 80, generationMs: 150, totalMs: 230 },
  guardrailRejected: false,
  noResults: false,
  retrievalQuality: { quality: 'good' as const, maxScore: 0.9, avgScore: 0.85, chunkCount: 2 },
}

const MOCK_AGENT_RESPONSE = {
  answer: 'Agent found the answer.',
  steps: [
    {
      stepNumber: 1,
      action: 'search_documents',
      actionInput: { query: 'edge case' },
      observation: 'Found relevant content',
      isFinal: false,
      finalAnswer: null,
    },
    {
      stepNumber: 2,
      action: null,
      actionInput: null,
      observation: null,
      isFinal: true,
      finalAnswer: 'Agent found the answer.',
    },
  ],
  totalSteps: 2,
  stoppedReason: 'final_answer' as const,
  traceId: 'trace-agent-edge-001',
  routedTo: 'agent' as const,
}

// ── Reset mocks between tests ─────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks()
})

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Query edge cases — POST /api/ask
// ═══════════════════════════════════════════════════════════════════════════════

describe('Query edge cases — POST /api/ask', () => {

  it('accepts query at 1999 chars (valid length)', async () => {
    vi.mocked(mockQueriesRepo.create).mockResolvedValue(MOCK_QUERY_RECORD)
    vi.mocked(mockQueriesRepo.updateAnswer).mockResolvedValue(MOCK_QUERY_RECORD)
    mockAsk.mockResolvedValue(MOCK_ASK_RESPONSE)

    const longQuery = 'a'.repeat(1999)
    const res = await makeAuthRequest(askPOST, {
      method: 'POST',
      body: { query: longQuery },
    })

    // Valid length — should succeed (200) or be rate-limited (429)
    expect([200, 429]).toContain(res.status)
  })

  it('accepts query at exactly 2000 chars (boundary)', async () => {
    vi.mocked(mockQueriesRepo.create).mockResolvedValue(MOCK_QUERY_RECORD)
    vi.mocked(mockQueriesRepo.updateAnswer).mockResolvedValue(MOCK_QUERY_RECORD)
    mockAsk.mockResolvedValue(MOCK_ASK_RESPONSE)

    const boundaryQuery = 'b'.repeat(2000)
    const res = await makeAuthRequest(askPOST, {
      method: 'POST',
      body: { query: boundaryQuery },
    })

    expect(res.status).toBe(200)
  })

  it('rejects query over 2000 chars with 422', async () => {
    const tooLongQuery = 'c'.repeat(2001)
    const res = await makeAuthRequest(askPOST, {
      method: 'POST',
      body: { query: tooLongQuery },
    })

    expect(res.status).toBe(422)
  })

  it('accepts query with special characters and emoji', async () => {
    vi.mocked(mockQueriesRepo.create).mockResolvedValue(MOCK_QUERY_RECORD)
    vi.mocked(mockQueriesRepo.updateAnswer).mockResolvedValue(MOCK_QUERY_RECORD)
    mockAsk.mockResolvedValue(MOCK_ASK_RESPONSE)

    const res = await makeAuthRequest(askPOST, {
      method: 'POST',
      body: { query: '中文? 🤔' },
    })

    expect(res.status).toBe(200)
  })

  it('accepts SQL injection attempt — guardrails handle content, not routing', async () => {
    vi.mocked(mockQueriesRepo.create).mockResolvedValue(MOCK_QUERY_RECORD)
    vi.mocked(mockQueriesRepo.updateAnswer).mockResolvedValue(MOCK_QUERY_RECORD)
    mockAsk.mockResolvedValue(MOCK_ASK_RESPONSE)

    const res = await makeAuthRequest(askPOST, {
      method: 'POST',
      body: { query: "'; DROP TABLE documents; --" },
    })

    // Route layer passes it through — Python guardrails handle content filtering
    expect(res.status).toBe(200)
  })

  it('rejects empty query string with 422', async () => {
    const res = await makeAuthRequest(askPOST, {
      method: 'POST',
      body: { query: '' },
    })

    expect(res.status).toBe(422)
  })

})

// ═══════════════════════════════════════════════════════════════════════════════
// 2. File upload edge cases — POST /api/documents
// ═══════════════════════════════════════════════════════════════════════════════

describe('File upload edge cases — POST /api/documents', () => {

  it('returns 502 for non-PDF file — backend rejects it, route propagates the error', async () => {
    // The documents route does not validate MIME type client-side.
    // Python backend is responsible for rejecting non-PDF content.
    // Route must still create a DB record (for audit), then propagate the backend error as 502.
    vi.mocked(mockDocumentsRepo.create).mockResolvedValue(MOCK_DOCUMENT)
    vi.mocked(mockDocumentsRepo.updateStatus).mockResolvedValue({
      ...MOCK_DOCUMENT,
      status: 'failed',
    })
    mockIngest.mockResolvedValue({
      status: 'error',
      chunkCount: 0,
      error: 'Only PDF files are supported',
    })

    const fd = new FormData()
    fd.append('file', new File(['not a pdf'], 'report.txt', { type: 'text/plain' }))

    const res = await makeFormDataRequest(postDocuments, fd)

    expect(res.status).toBe(502)
  })

  it('rejects missing file in form data with 400 or 422', async () => {
    // Empty FormData — no file field at all
    const res = await makeFormDataRequest(postDocuments, new FormData())

    expect([400, 422]).toContain(res.status)
  })

  it('accepts valid PDF upload and returns 201', async () => {
    vi.mocked(mockDocumentsRepo.create).mockResolvedValue(MOCK_DOCUMENT)
    vi.mocked(mockDocumentsRepo.updateStatus).mockResolvedValue({
      ...MOCK_DOCUMENT,
      status: 'ingested',
      chunkCount: 5,
    })
    mockIngest.mockResolvedValue({ status: 'ok', chunkCount: 5, error: null })

    const fd = new FormData()
    fd.append('file', new File(['%PDF-1.4 binary content'], 'valid.pdf', { type: 'application/pdf' }))

    const res = await makeFormDataRequest(postDocuments, fd)

    expect(res.status).toBe(201)
  })

})

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Auth edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe('Auth edge cases — missing/malformed tokens', () => {

  it('GET /api/documents returns 401 when Authorization header is missing', async () => {
    const res = await makeRequest(getDocuments)
    expect(res.status).toBe(401)
  })

  it('POST /api/ask returns 401 when Authorization header is missing', async () => {
    const res = await makeRequest(askPOST, {
      method: 'POST',
      body: { query: 'test' },
    })
    expect(res.status).toBe(401)
  })

  it('POST /api/agent/run returns 401 when Authorization header is missing', async () => {
    const res = await makeRequest(agentRunPOST, {
      method: 'POST',
      body: { query: 'test' },
    })
    expect(res.status).toBe(401)
  })

  it('GET /api/memories returns 401 when Authorization header is missing', async () => {
    const res = await makeRequest(getMemories)
    expect(res.status).toBe(401)
  })

  it('GET /api/dashboard/stats returns 401 when Authorization header is missing', async () => {
    const res = await makeRequest(getDashboardStats)
    expect(res.status).toBe(401)
  })

  it('GET /api/documents returns 401 with tampered JWT (last 5 chars changed)', async () => {
    // Generate a valid token then mutate its signature
    const { generateTestToken } = await import('../setup/server')
    const validToken = await generateTestToken()
    const tampered = validToken.slice(0, -5) + 'XXXXX'

    const res = await makeRequest(getDocuments, {
      headers: { Authorization: `Bearer ${tampered}` },
    })

    expect(res.status).toBe(401)
  })

  it('GET /api/documents returns 401 with malformed JWT (plain string)', async () => {
    const res = await makeRequest(getDocuments, {
      headers: { Authorization: 'Bearer notajwt' },
    })

    expect(res.status).toBe(401)
  })

})

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Agent edge cases — POST /api/agent/run
// ═══════════════════════════════════════════════════════════════════════════════

describe('Agent edge cases — POST /api/agent/run', () => {

  it('rejects empty query with 422', async () => {
    const res = await makeAuthRequest(agentRunPOST, {
      method: 'POST',
      body: { query: '' },
    })

    expect(res.status).toBe(422)
  })

  it('returns steps array and stoppedReason on valid query', async () => {
    vi.mocked(mockQueriesRepo.create).mockResolvedValue(MOCK_QUERY_RECORD)
    vi.mocked(mockQueriesRepo.updateAnswer).mockResolvedValue(MOCK_QUERY_RECORD)
    mockRunAgent.mockResolvedValue(MOCK_AGENT_RESPONSE)

    const res = await makeAuthRequest(agentRunPOST, {
      method: 'POST',
      body: { query: 'How many documents are in the system?' },
    })

    expect(res.status).toBe(200)
    const body = res.body as Record<string, unknown>
    expect(Array.isArray(body.steps)).toBe(true)
    expect((body.steps as unknown[]).length).toBeGreaterThan(0)
    expect(typeof body.stoppedReason).toBe('string')
    expect(body.stoppedReason).toBe('final_answer')
  })

})
