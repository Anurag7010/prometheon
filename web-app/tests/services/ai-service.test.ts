import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AIService } from '../../services/ai-service'
import { BaseService, ServiceError, ServiceResponse } from '../../services/base-service'

// ============================================================
// AIService tests spy on BaseService.prototype.request — not fetch.
//
// Why? AIService's job is not to do HTTP correctly (BaseService owns that).
// Its job is to call request() with the right arguments for each endpoint.
// Spying one layer up keeps tests fast, isolated, and free from
// HTTP mechanics that are already covered in base-service.test.ts.
// ============================================================

function makeSuccessResponse<T>(data: T): ServiceResponse<T> {
  return { data, error: null, status: 200, latencyMs: 10 }
}

function makeErrorResponse(): ServiceResponse<null> {
  const err = new ServiceError()
  err.code = 'NETWORK_ERROR'
  err.retryable = false
  return { data: null, error: err, status: null, latencyMs: 5 }
}

// ============================================================
// ask — POST /api/ask
// ============================================================
describe('AIService — ask', () => {

  let service: AIService
  let requestSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    service = new AIService()
    requestSpy = vi.spyOn(BaseService.prototype as unknown as { request: (...args: unknown[]) => Promise<unknown> }, 'request')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls /api/ask with POST method', async () => {
    requestSpy.mockResolvedValue(makeSuccessResponse({
      answer: '', sources: [], latencyBreakdown: {}, traceId: ''
    }))

    await service.ask({ query: 'test' })

    const [endpoint, options] = requestSpy.mock.calls[0]
    expect(endpoint).toBe('/api/ask')
    expect(options.method).toBe('POST')
  })

  it('sends query and history in request body', async () => {
    requestSpy.mockResolvedValue(makeSuccessResponse({
      answer: 'Paris', sources: [], latencyBreakdown: {}, traceId: 'abc'
    }))

    const history = [{ role: 'user' as const, content: 'hello' }]
    await service.ask({ query: 'follow up', history })

    const [, options] = requestSpy.mock.calls[0]
    expect(options.body.query).toBe('follow up')
    expect(options.body.history).toEqual(history)
  })

  it('defaults history to empty array when not provided', async () => {
    requestSpy.mockResolvedValue(makeSuccessResponse({
      answer: '', sources: [], latencyBreakdown: {}, traceId: ''
    }))

    await service.ask({ query: 'standalone question' })

    const [, options] = requestSpy.mock.calls[0]
    expect(options.body.history).toEqual([])
  })

  it('forwards AbortSignal to request', async () => {
    requestSpy.mockResolvedValue(makeSuccessResponse({
      answer: '', sources: [], latencyBreakdown: {}, traceId: ''
    }))

    const controller = new AbortController()
    await service.ask({ query: 'test', signal: controller.signal })

    const [, options] = requestSpy.mock.calls[0]
    expect(options.signal).toBe(controller.signal)
  })

  it('disables deduplication — each ask is a unique user intent', async () => {
    requestSpy.mockResolvedValue(makeSuccessResponse({
      answer: '', sources: [], latencyBreakdown: {}, traceId: ''
    }))

    await service.ask({ query: 'test' })

    const [, options] = requestSpy.mock.calls[0]
    expect(options.deduplicate).toBe(false)
  })

  it('returns ServiceResponse with correct AskResponse shape on success', async () => {
    const mockData = {
      answer: 'Paris is the capital',
      sources: [{ content: 'doc text', score: 0.95, metadata: { page: 1 } }],
      latencyBreakdown: { retrievalMs: 100, generationMs: 400, totalMs: 500 },
      traceId: 'trace-xyz',
    }
    requestSpy.mockResolvedValue(makeSuccessResponse(mockData))

    const response = await service.ask({ query: 'capital of France?' })

    expect(response.data?.answer).toBe('Paris is the capital')
    expect(response.data?.sources[0]?.score).toBe(0.95)
    expect(response.data?.traceId).toBe('trace-xyz')
    expect(response.error).toBeNull()
  })

  it('surfaces errors in the response envelope without throwing', async () => {
    requestSpy.mockResolvedValue(makeErrorResponse())

    const response = await service.ask({ query: 'test' })

    expect(response.data).toBeNull()
    expect(response.error?.code).toBe('NETWORK_ERROR')
  })

})

// ============================================================
// ingest — POST /api/documents
// ============================================================
describe('AIService — ingest', () => {

  let service: AIService
  let requestSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    service = new AIService()
    requestSpy = vi.spyOn(BaseService.prototype as unknown as { request: (...args: unknown[]) => Promise<unknown> }, 'request')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls /api/documents with POST method', async () => {
    requestSpy.mockResolvedValue(makeSuccessResponse({ data: { documentId: 'd1', status: 'ingested', chunkCount: 5 } }))

    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })
    await service.ingest(file)

    const [endpoint, options] = requestSpy.mock.calls[0]
    expect(endpoint).toBe('/api/documents')
    expect(options.method).toBe('POST')
  })

  it('sends body as FormData — not JSON', async () => {
    requestSpy.mockResolvedValue(makeSuccessResponse({ data: { documentId: 'd1', status: 'ingested', chunkCount: 5 } }))

    const file = new File(['pdf content'], 'doc.pdf', { type: 'application/pdf' })
    await service.ingest(file)

    const [, options] = requestSpy.mock.calls[0]
    expect(options.body).toBeInstanceOf(FormData)
  })

  it('appends file to FormData', async () => {
    requestSpy.mockResolvedValue(makeSuccessResponse({ data: { documentId: 'd1', status: 'ingested', chunkCount: 5 } }))

    const file = new File(['content'], 'report.pdf', { type: 'application/pdf' })
    await service.ingest(file)

    const [, options] = requestSpy.mock.calls[0]
    const formData: FormData = options.body
    expect(formData.get('file')).toBeTruthy()
  })

  it('returns ServiceResponse with correct IngestResponse shape', async () => {
    // Route wraps response as { data: IngestResponse } — AIService unwraps it
    const mockData = { documentId: 'doc-123', status: 'ingested', chunkCount: 12 }
    requestSpy.mockResolvedValue(makeSuccessResponse({ data: mockData }))

    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })
    const response = await service.ingest(file)

    expect(response.data?.status).toBe('ingested')
    expect(response.data?.chunkCount).toBe(12)
    expect(response.error).toBeNull()
  })

  it('surfaces errors in the response envelope without throwing', async () => {
    requestSpy.mockResolvedValue(makeErrorResponse())

    const file = new File(['content'], 'bad.pdf', { type: 'application/pdf' })
    const response = await service.ingest(file)

    expect(response.data).toBeNull()
    expect(response.error?.code).toBe('NETWORK_ERROR')
  })

})

// ============================================================
// retrieve — GET /api/retrieve?...
// ============================================================
describe('AIService — retrieve', () => {

  let service: AIService
  let requestSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    service = new AIService()
    requestSpy = vi.spyOn(BaseService.prototype as unknown as { request: (...args: unknown[]) => Promise<unknown> }, 'request')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses GET method', async () => {
    requestSpy.mockResolvedValue(makeSuccessResponse({ data: { chunks: [], traceId: '' } }))

    await service.retrieve('test')

    const [, options] = requestSpy.mock.calls[0]
    expect(options.method).toBe('GET')
  })

  it('encodes query, top_k and strategy as URL search params', async () => {
    requestSpy.mockResolvedValue(makeSuccessResponse({ data: { chunks: [], traceId: '' } }))

    await service.retrieve('neural networks', 5, 'mmr')

    const [endpoint] = requestSpy.mock.calls[0]
    expect(endpoint).toContain('/api/retrieve')
    expect(endpoint).toContain('query=neural+networks')
    expect(endpoint).toContain('top_k=5')
    expect(endpoint).toContain('strategy=mmr')
  })

  it('applies default top_k=5 and strategy=semantic when not provided', async () => {
    requestSpy.mockResolvedValue(makeSuccessResponse({ data: { chunks: [], traceId: '' } }))

    await service.retrieve('test')

    const [endpoint] = requestSpy.mock.calls[0]
    expect(endpoint).toContain('top_k=5')
    expect(endpoint).toContain('strategy=semantic')
  })

  it('enables deduplication — rapid identical queries share one in-flight request', async () => {
    requestSpy.mockResolvedValue(makeSuccessResponse({ data: { chunks: [], traceId: '' } }))

    await service.retrieve('test')

    const [, options] = requestSpy.mock.calls[0]
    expect(options.deduplicate).toBe(true)
  })

  it('returns ServiceResponse with correct RetrieveResponse shape', async () => {
    // Route wraps response as { data: RetrieveResponse } — AIService unwraps it
    const mockChunks = [
      { content: 'relevant text', score: 0.92, metadata: { source: 'doc1.pdf' } },
    ]
    requestSpy.mockResolvedValue(makeSuccessResponse({ data: { chunks: mockChunks, traceId: 't1' } }))

    const response = await service.retrieve('neural networks')

    expect(response.data?.chunks).toHaveLength(1)
    expect(response.data?.chunks[0]?.score).toBe(0.92)
    expect(response.data?.chunks[0]?.content).toBe('relevant text')
    expect(response.error).toBeNull()
  })

  it('surfaces errors in the response envelope without throwing', async () => {
    requestSpy.mockResolvedValue(makeErrorResponse())

    const response = await service.retrieve('test')

    expect(response.data).toBeNull()
    expect(response.error?.code).toBe('NETWORK_ERROR')
  })

})
