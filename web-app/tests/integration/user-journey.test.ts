/**
 * Integration test: full user journey through all major API routes.
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

// Mock password utilities — avoids bcrypt cost in tests
vi.mock('../../lib/password', () => ({
  hashPassword: vi.fn(async () => '$2b$12$hashedpassword'),
  verifyPassword: vi.fn(async () => true),
  validatePasswordStrength: vi.fn(() => ({ valid: true, errors: [] })),
}))

// Mock auth library — avoids real cookie/session interactions
vi.mock('../../lib/auth', () => ({
  createSessionCookies: vi.fn(async () => ({ accessToken: 'mock-access-token' })),
  clearSessionCookies: vi.fn(async () => {}),
  getRefreshTokenFromCookie: vi.fn(async () => null),
  verifyRefreshToken: vi.fn(async () => null),
  getSession: vi.fn(async () => null),
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

// Mock users repository (used by auth routes)
vi.mock('../../db/repositories/users', () => ({
  findByEmail: vi.fn(),
  createUser: vi.fn(),
  emailExists: vi.fn(),
  findById: vi.fn(),
  incrementTokenVersion: vi.fn(),
}))

// Mock conversations repository (used by conversations + ask routes)
vi.mock('../../db/repositories/conversations', () => ({
  createConversation: vi.fn(),
  findConversationsByUser: vi.fn(),
  findConversationById: vi.fn(),
  updateConversationTitle: vi.fn(),
  deleteConversation: vi.fn(),
}))

// Mock messages repository (used by ask route for conversation history)
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

import * as usersRepo from '../../db/repositories/users'
import * as conversationsRepo from '../../db/repositories/conversations'
import * as db from '../../db'
import * as authLib from '../../lib/auth'
import * as passwordLib from '../../lib/password'
import { backendClient } from '../../lib/backend-client'

import { POST as registerPOST } from '../../app/api/auth/register/route'
import { POST as loginPOST } from '../../app/api/auth/login/route'
import { POST as logoutPOST } from '../../app/api/auth/logout/route'
import { GET as getDocuments, POST as postDocuments } from '../../app/api/documents/route'
import { POST as askPOST } from '../../app/api/ask/route'
import { POST as agentRunPOST } from '../../app/api/agent/run/route'
import { GET as getMemories } from '../../app/api/memories/route'
import { GET as getConversations, POST as postConversations } from '../../app/api/conversations/route'
import { GET as getDashboardStats } from '../../app/api/dashboard/stats/route'

import { toDocumentId, toUserId, toQueryId } from '@/types'
import type { Document as DomainDocument } from '@/types'

// ── Typed mock references ─────────────────────────────────────────────────────

const mockEmailExists = vi.mocked(usersRepo.emailExists)
const mockCreateUser = vi.mocked(usersRepo.createUser)
const mockFindByEmail = vi.mocked(usersRepo.findByEmail)
const mockValidatePassword = vi.mocked(passwordLib.validatePasswordStrength)
const mockVerifyPassword = vi.mocked(passwordLib.verifyPassword)
const mockCreateSessionCookies = vi.mocked(authLib.createSessionCookies)
const mockDocumentsRepo = db.documentsRepository
const mockQueriesRepo = db.queriesRepository
const mockFindConversationsByUser = vi.mocked(conversationsRepo.findConversationsByUser)
const mockCreateConversation = vi.mocked(conversationsRepo.createConversation)
const mockAsk = backendClient.ask as unknown as ReturnType<typeof vi.fn>
const mockRunAgent = backendClient.runAgent as unknown as ReturnType<typeof vi.fn>
const mockListMemories = backendClient.listMemories as unknown as ReturnType<typeof vi.fn>
const mockGetMetrics = backendClient.getMetrics as unknown as ReturnType<typeof vi.fn>
const mockIngest = backendClient.ingest as unknown as ReturnType<typeof vi.fn>

// ── Test fixtures ─────────────────────────────────────────────────────────────

const MOCK_USER_SAFE = {
  id: TEST_USER_ID,
  email: 'journey@example.com',
  onboardingCompleted: null as Date | null,
  createdAt: new Date(),
}

const MOCK_USER_FULL = {
  ...MOCK_USER_SAFE,
  passwordHash: '$2b$12$hashedpassword',
  tokenVersion: 0,
}

const MOCK_DOCUMENT: DomainDocument = {
  id: toDocumentId('doc-journey-001'),
  userId: toUserId(TEST_USER_ID),
  filename: 'journey.pdf',
  status: 'ingested',
  chunkCount: 10,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const MOCK_QUERY_RECORD = {
  id: toQueryId('q-journey-001'),
  userId: toUserId(TEST_USER_ID),
  documentId: null,
  queryText: 'What is machine learning?',
  answerText: null,
  latencyMs: null,
  retrievalMetadata: null,
  createdAt: new Date(),
}

const MOCK_ASK_RESPONSE = {
  answer: 'Machine learning is a branch of AI.',
  sources: [{ content: 'ML context', score: 0.95, metadata: {}, citationId: 1 }],
  traceId: 'trace-001',
  latencyBreakdown: { retrievalMs: 100, generationMs: 200, totalMs: 300 },
  guardrailRejected: false,
  noResults: false,
  retrievalQuality: { quality: 'good' as const, maxScore: 0.95, avgScore: 0.87, chunkCount: 3 },
}

const MOCK_AGENT_RESPONSE = {
  answer: 'Based on my search, the document contains 3 sections.',
  steps: [
    {
      stepNumber: 1,
      action: 'search_documents',
      actionInput: { query: 'sections' },
      observation: 'Found 3 sections',
      isFinal: false,
      finalAnswer: null,
    },
    {
      stepNumber: 2,
      action: null,
      actionInput: null,
      observation: null,
      isFinal: true,
      finalAnswer: 'Based on my search, the document contains 3 sections.',
    },
  ],
  totalSteps: 2,
  stoppedReason: 'final_answer' as const,
  traceId: 'trace-agent-001',
  routedTo: 'agent' as const,
}

const MOCK_MEMORIES_RESPONSE = {
  memories: [
    {
      id: 'mem-001',
      content: 'User prefers concise answers.',
      createdAt: new Date().toISOString(),
      lastAccessed: new Date().toISOString(),
      accessCount: 3,
    },
    {
      id: 'mem-002',
      content: 'User is interested in machine learning.',
      createdAt: new Date().toISOString(),
      lastAccessed: new Date().toISOString(),
      accessCount: 1,
    },
  ],
  count: 2,
}

const MOCK_CONVERSATION = {
  id: 'conv-journey-001',
  userId: TEST_USER_ID,
  title: 'New Conversation',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const MOCK_AI_METRICS = {
  period_hours: 24,
  total_queries: 5,
  avg_latency_ms: 800,
  error_rate: 0.0,
  cache_hit_rate: 0.6,
  total_tokens: 2000,
  estimated_cost_usd: 0.01,
  slow_queries: 0,
  failed_retrievals: 0,
  queries_per_hour: 0.21,
  token_breakdown: { input: 1200, output: 800 },
}

// ── Reset mocks between tests ─────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks()
  // Sensible defaults for auth-related mocks
  mockValidatePassword.mockReturnValue({ valid: true, errors: [] })
  mockVerifyPassword.mockResolvedValue(true)
  mockCreateSessionCookies.mockResolvedValue({ accessToken: 'mock-access-token' })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Registration
// ═══════════════════════════════════════════════════════════════════════════════

describe('User journey — 1. Registration', () => {
  it('201 with accessToken on valid registration', async () => {
    mockEmailExists.mockResolvedValue(false)
    mockCreateUser.mockResolvedValue(MOCK_USER_SAFE)

    const res = await makeRequest(registerPOST, {
      method: 'POST',
      body: { email: 'journey@example.com', password: 'SecurePass1' },
    })

    expect(res.status).toBe(201)
    const body = res.body as Record<string, unknown>
    expect(body.accessToken).toBe('mock-access-token')
    expect((body.user as Record<string, unknown>).email).toBe('journey@example.com')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Duplicate email
// ═══════════════════════════════════════════════════════════════════════════════

describe('User journey — 2. Duplicate email', () => {
  it('409 CONFLICT when email is already registered', async () => {
    mockEmailExists.mockResolvedValue(true)

    const res = await makeRequest(registerPOST, {
      method: 'POST',
      body: { email: 'journey@example.com', password: 'SecurePass1' },
    })

    expect(res.status).toBe(409)
    const body = res.body as Record<string, unknown>
    expect(body.error).toBe('CONFLICT')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Login
// ═══════════════════════════════════════════════════════════════════════════════

describe('User journey — 3. Login', () => {
  it('200 with accessToken on valid credentials', async () => {
    mockFindByEmail.mockResolvedValue(MOCK_USER_FULL)
    mockVerifyPassword.mockResolvedValue(true)

    const res = await makeRequest(loginPOST, {
      method: 'POST',
      body: { email: 'journey@example.com', password: 'SecurePass1' },
    })

    expect(res.status).toBe(200)
    const body = res.body as Record<string, unknown>
    expect(body.accessToken).toBe('mock-access-token')
    expect((body.user as Record<string, unknown>).email).toBe('journey@example.com')
  })

  it('401 on wrong password', async () => {
    mockFindByEmail.mockResolvedValue(MOCK_USER_FULL)
    mockVerifyPassword.mockResolvedValue(false)

    const res = await makeRequest(loginPOST, {
      method: 'POST',
      body: { email: 'journey@example.com', password: 'WrongPassword1' },
    })

    expect(res.status).toBe(401)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Document upload
// ═══════════════════════════════════════════════════════════════════════════════

describe('User journey — 4. Document upload', () => {
  it('201 with ingested document on valid file upload', async () => {
    vi.mocked(mockDocumentsRepo.create).mockResolvedValue(MOCK_DOCUMENT)
    vi.mocked(mockDocumentsRepo.updateStatus).mockResolvedValue({
      ...MOCK_DOCUMENT,
      status: 'ingested',
      chunkCount: 10,
    })
    mockIngest.mockResolvedValue({ status: 'ok', chunkCount: 10, error: null })

    const fd = new FormData()
    fd.append('file', new File(['%PDF-1.4 content'], 'journey.pdf', { type: 'application/pdf' }))

    const res = await makeFormDataRequest(postDocuments, fd)

    expect(res.status).toBe(201)
    const body = res.body as { data: Record<string, unknown> }
    expect(body.data.status).toBe('ingested')
    expect(body.data.chunkCount).toBe(10)
  })

  it('401 when not authenticated', async () => {
    const res = await makeRequest(postDocuments, { method: 'POST' })
    expect(res.status).toBe(401)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Documents list
// ═══════════════════════════════════════════════════════════════════════════════

describe('User journey — 5. Documents list', () => {
  it('200 with array of documents for authenticated user', async () => {
    vi.mocked(mockDocumentsRepo.findByUser).mockResolvedValue([MOCK_DOCUMENT])

    const res = await makeAuthRequest(getDocuments)

    expect(res.status).toBe(200)
    const body = res.body as { data: unknown[] }
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data).toHaveLength(1)
  })

  it('200 with empty array when user has no documents', async () => {
    vi.mocked(mockDocumentsRepo.findByUser).mockResolvedValue([])

    const res = await makeAuthRequest(getDocuments)

    expect(res.status).toBe(200)
    const body = res.body as { data: unknown[] }
    expect(body.data).toEqual([])
  })

  it('401 without auth token', async () => {
    const res = await makeRequest(getDocuments)
    expect(res.status).toBe(401)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Ask a question
// ═══════════════════════════════════════════════════════════════════════════════

describe('User journey — 6. Ask a question', () => {
  it('200 with answer shape on valid query', async () => {
    vi.mocked(mockQueriesRepo.create).mockResolvedValue(MOCK_QUERY_RECORD)
    vi.mocked(mockQueriesRepo.updateAnswer).mockResolvedValue(MOCK_QUERY_RECORD)
    mockAsk.mockResolvedValue(MOCK_ASK_RESPONSE)

    const res = await makeAuthRequest(askPOST, {
      method: 'POST',
      body: { query: 'What is machine learning?' },
    })

    expect(res.status).toBe(200)
    const body = res.body as Record<string, unknown>
    expect(typeof body.answer).toBe('string')
    expect(body.answer).toBe('Machine learning is a branch of AI.')
    expect(Array.isArray(body.sources)).toBe(true)
    expect(typeof body.traceId).toBe('string')
    expect(body).toHaveProperty('latencyBreakdown')
  })

  it('persists query record before AI call', async () => {
    vi.mocked(mockQueriesRepo.create).mockResolvedValue(MOCK_QUERY_RECORD)
    vi.mocked(mockQueriesRepo.updateAnswer).mockResolvedValue(MOCK_QUERY_RECORD)
    mockAsk.mockResolvedValue(MOCK_ASK_RESPONSE)

    await makeAuthRequest(askPOST, {
      method: 'POST',
      body: { query: 'What is machine learning?' },
    })

    expect(mockQueriesRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: TEST_USER_ID, queryText: 'What is machine learning?' })
    )
  })

  it('401 without auth token', async () => {
    const res = await makeRequest(askPOST, {
      method: 'POST',
      body: { query: 'What is machine learning?' },
    })
    expect(res.status).toBe(401)
  })

  it('422 when query is empty', async () => {
    const res = await makeAuthRequest(askPOST, {
      method: 'POST',
      body: { query: '' },
    })
    expect(res.status).toBe(422)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Agent run
// ═══════════════════════════════════════════════════════════════════════════════

describe('User journey — 7. Agent run', () => {
  it('200 with steps and answer on valid agent query', async () => {
    vi.mocked(mockQueriesRepo.create).mockResolvedValue(MOCK_QUERY_RECORD)
    vi.mocked(mockQueriesRepo.updateAnswer).mockResolvedValue(MOCK_QUERY_RECORD)
    mockRunAgent.mockResolvedValue(MOCK_AGENT_RESPONSE)

    const res = await makeAuthRequest(agentRunPOST, {
      method: 'POST',
      body: { query: 'How many sections does the document have?' },
    })

    expect(res.status).toBe(200)
    const body = res.body as Record<string, unknown>
    expect(typeof body.answer).toBe('string')
    expect(Array.isArray(body.steps)).toBe(true)
    expect((body.steps as unknown[]).length).toBeGreaterThan(0)
    expect(typeof body.totalSteps).toBe('number')
    expect(body.stoppedReason).toBe('final_answer')
  })

  it('records query in DB with agent result', async () => {
    vi.mocked(mockQueriesRepo.create).mockResolvedValue(MOCK_QUERY_RECORD)
    vi.mocked(mockQueriesRepo.updateAnswer).mockResolvedValue(MOCK_QUERY_RECORD)
    mockRunAgent.mockResolvedValue(MOCK_AGENT_RESPONSE)

    await makeAuthRequest(agentRunPOST, {
      method: 'POST',
      body: { query: 'How many sections?' },
    })

    expect(mockQueriesRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: TEST_USER_ID })
    )
    expect(mockQueriesRepo.updateAnswer).toHaveBeenCalled()
  })

  it('401 without auth token', async () => {
    const res = await makeRequest(agentRunPOST, {
      method: 'POST',
      body: { query: 'How many sections?' },
    })
    expect(res.status).toBe(401)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 8. Memory list
// ═══════════════════════════════════════════════════════════════════════════════

describe('User journey — 8. Memory list', () => {
  it('200 with memories array and count', async () => {
    mockListMemories.mockResolvedValue(MOCK_MEMORIES_RESPONSE)

    const res = await makeAuthRequest(getMemories)

    expect(res.status).toBe(200)
    const body = res.body as { memories: unknown[]; count: number }
    expect(Array.isArray(body.memories)).toBe(true)
    expect(body.memories).toHaveLength(2)
    expect(body.count).toBe(2)
  })

  it('proxies userId to backendClient.listMemories', async () => {
    mockListMemories.mockResolvedValue(MOCK_MEMORIES_RESPONSE)

    await makeAuthRequest(getMemories, {}, TEST_USER_ID)

    expect(mockListMemories).toHaveBeenCalledWith(TEST_USER_ID)
  })

  it('401 without auth token', async () => {
    const res = await makeRequest(getMemories)
    expect(res.status).toBe(401)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 9. Conversations
// ═══════════════════════════════════════════════════════════════════════════════

describe('User journey — 9. Conversations', () => {
  it('GET 200 with conversations array for authenticated user', async () => {
    mockFindConversationsByUser.mockResolvedValue([MOCK_CONVERSATION])

    const res = await makeAuthRequest(getConversations)

    expect(res.status).toBe(200)
    const body = res.body as { conversations: unknown[] }
    expect(Array.isArray(body.conversations)).toBe(true)
    expect(body.conversations).toHaveLength(1)
  })

  it('GET 200 with empty array when no conversations', async () => {
    mockFindConversationsByUser.mockResolvedValue([])

    const res = await makeAuthRequest(getConversations)

    expect(res.status).toBe(200)
    const body = res.body as { conversations: unknown[] }
    expect(body.conversations).toEqual([])
  })

  it('POST 201 with created conversation', async () => {
    mockCreateConversation.mockResolvedValue(MOCK_CONVERSATION)

    const res = await makeAuthRequest(postConversations, { method: 'POST' })

    expect(res.status).toBe(201)
    const body = res.body as Record<string, unknown>
    expect(body.id).toBe('conv-journey-001')
    expect(body.title).toBe('New Conversation')
  })

  it('GET 401 without auth token', async () => {
    const res = await makeRequest(getConversations)
    expect(res.status).toBe(401)
  })

  it('POST 401 without auth token', async () => {
    const res = await makeRequest(postConversations, { method: 'POST' })
    expect(res.status).toBe(401)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 10. Dashboard stats
// ═══════════════════════════════════════════════════════════════════════════════

describe('User journey — 10. Dashboard stats', () => {
  it('200 with correct response shape including documents, queries, ai fields', async () => {
    vi.mocked(mockDocumentsRepo.findByUser).mockResolvedValue([MOCK_DOCUMENT])
    vi.mocked(mockQueriesRepo.findByUser).mockResolvedValue([MOCK_QUERY_RECORD])
    mockGetMetrics.mockResolvedValue(MOCK_AI_METRICS)

    const res = await makeAuthRequest(getDashboardStats)

    expect(res.status).toBe(200)
    const body = res.body as {
      documents: { total: number; ingested: number; failed: number; pending: number }
      queries: { total: number; last24h: number }
      ai: unknown
    }
    expect(body).toHaveProperty('documents')
    expect(body).toHaveProperty('queries')
    expect(body).toHaveProperty('ai')
    expect(typeof body.documents.total).toBe('number')
    expect(typeof body.queries.total).toBe('number')
  })

  it('ai field is null when backend metrics unavailable (non-fatal)', async () => {
    vi.mocked(mockDocumentsRepo.findByUser).mockResolvedValue([])
    vi.mocked(mockQueriesRepo.findByUser).mockResolvedValue([])
    mockGetMetrics.mockRejectedValue(new Error('backend down'))

    const res = await makeAuthRequest(getDashboardStats)

    expect(res.status).toBe(200)
    const body = res.body as { ai: unknown }
    expect(body.ai).toBeNull()
  })

  it('401 without auth token', async () => {
    const res = await makeRequest(getDashboardStats)
    expect(res.status).toBe(401)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 11. All protected routes return 401 without auth
// ═══════════════════════════════════════════════════════════════════════════════

describe('User journey — 11. Protected route 401 enforcement', () => {
  it('GET /api/documents — 401 without token', async () => {
    const res = await makeRequest(getDocuments)
    expect(res.status).toBe(401)
  })

  it('POST /api/ask — 401 without token', async () => {
    const res = await makeRequest(askPOST, {
      method: 'POST',
      body: { query: 'test' },
    })
    expect(res.status).toBe(401)
  })

  it('POST /api/agent/run — 401 without token', async () => {
    const res = await makeRequest(agentRunPOST, {
      method: 'POST',
      body: { query: 'test' },
    })
    expect(res.status).toBe(401)
  })

  it('GET /api/memories — 401 without token', async () => {
    const res = await makeRequest(getMemories)
    expect(res.status).toBe(401)
  })

  it('GET /api/conversations — 401 without token', async () => {
    const res = await makeRequest(getConversations)
    expect(res.status).toBe(401)
  })

  it('POST /api/conversations — 401 without token', async () => {
    const res = await makeRequest(postConversations, { method: 'POST' })
    expect(res.status).toBe(401)
  })

  it('GET /api/dashboard/stats — 401 without token', async () => {
    const res = await makeRequest(getDashboardStats)
    expect(res.status).toBe(401)
  })

  it('POST /api/auth/logout — 204 (logout is intentionally unauthenticated)', async () => {
    // Logout clears cookies — it should succeed even without a valid token
    const res = await makeRequest(logoutPOST, { method: 'POST' })
    expect(res.status).toBe(204)
  })
})
