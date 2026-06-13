import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { makeRequest, makeAuthRequest, generateTestToken, TEST_USER_ID } from '../setup/server'

// server-only guard would throw in jsdom — stub it out
vi.mock('server-only', () => ({}))

// lib/jwt uses jose which has a cross-realm Uint8Array issue in vitest VM isolation.
// Replace with a Node.js crypto implementation so withAuth can verify test tokens.
import { jwtMock } from '../setup/jwt-mock'
vi.mock('../../lib/jwt', () => jwtMock())

// Mock backend client — streaming route tests don't call Python
vi.mock('../../lib/backend-client', () => ({
  backendClient: {
    ask: vi.fn(),
    askStream: vi.fn(),
    ingest: vi.fn(),
    retrieve: vi.fn(),
    health: vi.fn(),
  },
}))

// Mock db module — prevents DATABASE_URL requirement
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
import { backendClient } from '../../lib/backend-client'
import { POST } from '../../app/api/ask/stream/route'
import { toUserId, toQueryId } from '@/types'
import type { Query } from '@/types'

const queriesRepo = db.queriesRepository as typeof db.queriesRepository
// askStream is mocked — use a typed reference to avoid repeated casts
const mockAskStream = backendClient.askStream as unknown as ReturnType<typeof vi.fn>

// ── Helpers ───────────────────────────────────────────────────────────────────

function encodeSSE(events: object[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const text = events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('')
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text))
      controller.close()
    },
  })
}

async function readStreamText(response: Response): Promise<string> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let result = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    result += decoder.decode(value, { stream: true })
  }
  return result
}

async function parseSSEText(text: string): Promise<object[]> {
  const events: object[] = []
  for (const line of text.split('\n')) {
    if (line.startsWith('data: ')) {
      try {
        events.push(JSON.parse(line.slice(6)))
      } catch {
        // ignore malformed lines
      }
    }
  }
  return events
}

// makeRequest discards the stream body after parsing JSON.
// For streaming tests we call the handler directly and return the raw Response.
async function makeRawAuthRequest(
  handler: (req: NextRequest, ctx?: Record<string, unknown>) => Promise<Response>,
  body: object,
  userId = TEST_USER_ID
): Promise<Response> {
  const token = await generateTestToken(userId)
  const req = new NextRequest('http://localhost/api/ask/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  return handler(req, { params: {} })
}

const MOCK_QUERY_RECORD: Query = {
  id: toQueryId('00000000-0000-0000-0000-000000000099'),
  userId: toUserId(TEST_USER_ID),
  documentId: null,
  queryText: 'What is this about?',
  answerText: null,
  latencyMs: null,
  retrievalMetadata: null,
  createdAt: new Date(),
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(queriesRepo.create).mockResolvedValue(MOCK_QUERY_RECORD)
  vi.mocked(queriesRepo.updateAnswer).mockResolvedValue({
    ...MOCK_QUERY_RECORD,
    answerText: 'Hello world',
    latencyMs: 300,
  })
})

// ── POST /api/ask/stream ──────────────────────────────────────────────────────

describe('POST /api/ask/stream', () => {

  it('returns 200 with text/event-stream content type', async () => {
    // Proves the route sets the correct content type for SSE — browsers require this
    mockAskStream.mockResolvedValue(
      encodeSSE([
        { type: 'token', content: 'Hello' },
        { type: 'done', trace_id: 't1', latency_ms: 100 },
      ])
    )

    const res = await makeAuthRequest(POST, {
      method: 'POST',
      body: { query: 'What is this about?' },
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
  })

  it('includes Cache-Control: no-cache header', async () => {
    // Streaming proxies must not buffer — no-cache forces pass-through
    mockAskStream.mockResolvedValue(
      encodeSSE([{ type: 'done', trace_id: 't1', latency_ms: 50 }])
    )

    const res = await makeAuthRequest(POST, {
      method: 'POST',
      body: { query: 'Test?' },
    })

    expect(res.headers.get('cache-control')).toContain('no-cache')
  })

  it('returns 401 when Authorization header is missing', async () => {
    // Auth check must fire before backendClient is called
    const res = await makeRequest(POST, { method: 'POST', body: { query: 'Test?' } })

    expect(res.status).toBe(401)
    expect(backendClient.askStream).not.toHaveBeenCalled()
  })

  it('returns 422 when query is empty string', async () => {
    // Validation must reject before the stream starts
    const res = await makeAuthRequest(POST, {
      method: 'POST',
      body: { query: '' },
    })

    expect(res.status).toBe(422)
    expect(backendClient.askStream).not.toHaveBeenCalled()
  })

  it('returns 422 when query field is missing', async () => {
    const res = await makeAuthRequest(POST, {
      method: 'POST',
      body: {},
    })

    expect(res.status).toBe(422)
  })

  it('creates a query record before streaming starts', async () => {
    // DB record must exist before any streaming — so we have a record even if stream fails
    mockAskStream.mockResolvedValue(
      encodeSSE([{ type: 'done', trace_id: 't1', latency_ms: 100 }])
    )

    await makeAuthRequest(POST, {
      method: 'POST',
      body: { query: 'What is this about?' },
    })

    expect(queriesRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: TEST_USER_ID,
        queryText: 'What is this about?',
      })
    )
  })

  it('passes query and options to backendClient.askStream', async () => {
    // Verifies the route correctly forwards topK and strategy
    mockAskStream.mockResolvedValue(
      encodeSSE([{ type: 'done', trace_id: 't1', latency_ms: 100 }])
    )

    await makeAuthRequest(POST, {
      method: 'POST',
      body: { query: 'What is this about?', topK: 3, strategy: 'hybrid' },
    })

    expect(backendClient.askStream).toHaveBeenCalledWith(
      'What is this about?',
      expect.objectContaining({ topK: 3, strategy: 'hybrid' })
    )
  })

  it('proxies token events from backend stream to browser', async () => {
    const tokenEvents = [
      { type: 'token', content: 'Hello' },
      { type: 'token', content: ' world' },
      { type: 'done', trace_id: 't1', latency_ms: 100 },
    ]
    mockAskStream.mockResolvedValue(encodeSSE(tokenEvents))

    // Use raw handler call so we get the ReadableStream body intact
    const res = await makeRawAuthRequest(POST, { query: 'What is this about?' })

    const rawText = await readStreamText(res)
    const events = await parseSSEText(rawText)

    type TokenEvent = { type: string; content?: string }
    const tokens = (events as TokenEvent[]).filter((e) => e.type === 'token')
    expect(tokens).toHaveLength(2)
    expect(tokens[0]?.content).toBe('Hello')
    expect(tokens[1]?.content).toBe(' world')
  })

  it('updates query record with accumulated answer when done event received', async () => {
    const stream = encodeSSE([
      { type: 'token', content: 'Hello' },
      { type: 'token', content: ' world' },
      { type: 'done', trace_id: 't1', latency_ms: 200 },
    ])
    mockAskStream.mockResolvedValue(stream)

    // Use raw handler call so we can consume the ReadableStream
    const res = await makeRawAuthRequest(POST, { query: 'What is this about?' })

    // Consuming the stream triggers the TransformStream done handler
    await readStreamText(res)

    // Give the background updateAnswer call time to fire
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(queriesRepo.updateAnswer).toHaveBeenCalledWith(
      MOCK_QUERY_RECORD.id,
      'Hello world',  // accumulated from token events
      200,
      expect.objectContaining({ traceId: 't1' })
    )
  })

  it('returns 502 when backendClient.askStream throws before stream starts', async () => {
    // If the Python server is down, the error surfaces as a 502 before any SSE
    const { BackendError } = await import('../../lib/backend-error-mapper')
    mockAskStream.mockRejectedValue(
      new BackendError('Python server down', 503, 'service_unavailable')
    )

    const res = await makeAuthRequest(POST, {
      method: 'POST',
      body: { query: 'What is this about?' },
    })

    expect(res.status).toBe(502)
  })

})
