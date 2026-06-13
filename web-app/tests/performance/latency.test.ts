// P95 latency test for the ask endpoint under simulated load.
// NOT run in regular CI — only run manually before deployment.
// Run with: npm test tests/performance/latency.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeAuthRequest } from '../setup/server'
import { jwtMock } from '../setup/jwt-mock'

vi.mock('server-only', () => ({}))
vi.mock('../../lib/jwt', () => jwtMock())
vi.mock('../../lib/backend-client', () => ({
  backendClient: {
    ask: vi.fn().mockResolvedValue({
      answer: 'Mocked answer for performance test.',
      sources: [],
      traceId: 'perf-trace',
      latencyBreakdown: { retrievalMs: 10, generationMs: 50, totalMs: 60 },
      guardrailRejected: false,
      noResults: false,
      retrievalQuality: { quality: 'good', maxScore: 0.9, avgScore: 0.85, chunkCount: 2 },
      routedTo: 'rag',
    }),
  },
}))
vi.mock('../../db', () => ({
  queriesRepository: {
    create: vi.fn().mockResolvedValue({ id: 'q-001', queryText: 'test', userId: 'u-001' }),
    updateAnswer: vi.fn().mockResolvedValue(undefined),
  },
  conversationsRepository: {
    findById: vi.fn().mockResolvedValue(null),
  },
  db: {},
}))
vi.mock('../../db/repositories/messages', () => ({
  getConversationMessages: vi.fn().mockResolvedValue([]),
  addMessage: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../db/repositories/conversations', () => ({
  findConversationById: vi.fn().mockResolvedValue(null),
  updateConversationTitle: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

import { POST as askPost } from '../../app/api/ask/route'

const CONCURRENT_USERS = 10
const REQUESTS_PER_USER = 3
// P95 threshold: 5 seconds per-request average across the batch
const P95_THRESHOLD_MS = 5000

describe('Performance: Ask endpoint latency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it(`handles ${CONCURRENT_USERS} concurrent users (${CONCURRENT_USERS * REQUESTS_PER_USER} total requests) within P95 latency`, async () => {
    const totalRequests = CONCURRENT_USERS * REQUESTS_PER_USER

    const start = Date.now()

    const results = await Promise.allSettled(
      Array.from({ length: totalRequests }, (_, i) =>
        makeAuthRequest(askPost, {
          method: 'POST',
          body: { query: `Performance test query ${i}` },
        })
      )
    )

    const totalMs = Date.now() - start
    const succeeded = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.filter((r) => r.status === 'rejected').length
    const avgPerRequest = totalMs / totalRequests

    // At least 90% must succeed
    expect(succeeded / totalRequests).toBeGreaterThanOrEqual(0.9)

    // Average time per request must be under threshold
    expect(avgPerRequest).toBeLessThan(P95_THRESHOLD_MS)

    // Log summary for manual inspection
    console.warn(`[perf] ${totalRequests} requests | succeeded=${succeeded} failed=${failed} total=${totalMs}ms avg=${Math.round(avgPerRequest)}ms`)
  })
})
