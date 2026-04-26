import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AIService } from '../../services/ai-service'
import { BaseService, ServiceResponse } from '../../services/base-service'

// ============================================================
// AIService tests spy on BaseService.prototype.request — not fetch.
//
// Why? AIService's job is not to do HTTP correctly (BaseService owns that).
// Its job is to call request() with the right arguments for each endpoint.
// Spying one layer up keeps tests fast, isolated, and free from
// HTTP mechanics that are already covered in base-service.test.ts.
// ============================================================

// Builders for the two possible ServiceResponse shapes
function makeSuccessResponse<T>(data: T): ServiceResponse<T> {
  return { data, error: null, status: 200, latencyMs: 10 }
}

function makeErrorResponse(): ServiceResponse<null> {
  return {
    data: null,
    error: {
      name: 'ServiceError',
      code: 'NETWORK_ERROR',
      message: 'error',
      retryable: false,
      originalError: null,
    } as any,
    status: null,
    latencyMs: 5,
  }
}

// ============================================================
// ask — POST /ask
// ============================================================
describe('AIService — ask', () => {

  let service: AIService
  let requestSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    service = new AIService()
    requestSpy = vi.spyOn(BaseService.prototype as any, 'request')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls /ask with POST method', async () => {
    // Proves ask maps to the correct endpoint and HTTP verb
    requestSpy.mockResolvedValue(makeSuccessResponse({
      answer: '', sources: [], latencyBreakdown: {}, traceId: ''
    }))

    await service.ask({ query: 'test' })

    const [endpoint, options] = requestSpy.mock.calls[0]
    expect(endpoint).toBe('/ask')
    expect(options.method).toBe('POST')
  })

  it('sends query and history in request body', async () => {
    // Proves the body is built with the correct field names matching the backend contract
    // Body is passed as a plain object (not a JSON string) — BaseService handles serialization
    requestSpy.mockResolvedValue(makeSuccessResponse({
      answer: 'Paris', sources: [], latencyBreakdown: {}, traceId: 'abc'
    }))

    const history = [{ role: 'user', content: 'hello' }]
    await service.ask({ query: 'follow up', history })

    const [, options] = requestSpy.mock.calls[0]
    // Body is a plain object — BaseService will JSON.stringify it before sending
    expect(options.body.query).toBe('follow up')
    expect(options.body.history).toEqual(history)
  })

  it('defaults history to empty array when not provided', async () => {
    // Proves history is always present in the body — backend expects the field
    requestSpy.mockResolvedValue(makeSuccessResponse({
      answer: '', sources: [], latencyBreakdown: {}, traceId: ''
    }))

    await service.ask({ query: 'standalone question' })

    const [, options] = requestSpy.mock.calls[0]
    expect(options.body.history).toEqual([])
  })

  it('forwards AbortSignal to request', async () => {
    // Proves the signal is threaded through so the HTTP call can be cancelled
    // mid-flight (e.g. user navigates away while LLM is generating)
    requestSpy.mockResolvedValue(makeSuccessResponse({
      answer: '', sources: [], latencyBreakdown: {}, traceId: ''
    }))

    const controller = new AbortController()
    await service.ask({ query: 'test', signal: controller.signal })

    const [, options] = requestSpy.mock.calls[0]
    expect(options.signal).toBe(controller.signal)
  })

  it('disables deduplication — each ask is a unique user intent', async () => {
    // Unlike retrieve, two identical questions fired quickly must both reach the server
    // The second ask might be a deliberate retry or a different conversation turn
    requestSpy.mockResolvedValue(makeSuccessResponse({
      answer: '', sources: [], latencyBreakdown: {}, traceId: ''
    }))

    await service.ask({ query: 'test' })

    const [, options] = requestSpy.mock.calls[0]
    expect(options.deduplicate).toBe(false)
  })

  it('returns ServiceResponse with correct AskResponse shape on success', async () => {
    // Verifies the response is correctly typed and the envelope is passed through as-is
    const mockData = {
      answer: 'Paris is the capital',
      sources: [{ content: 'doc text', score: 0.95, metadata: { page: 1 } }],
      latencyBreakdown: { retrievalMs: 100, generationMs: 400, totalMs: 500 },
      traceId: 'trace-xyz',
    }
    requestSpy.mockResolvedValue(makeSuccessResponse(mockData))

    const response = await service.ask({ query: 'capital of France?' })

    expect(response.data?.answer).toBe('Paris is the capital')
    expect(response.data?.sources[0].score).toBe(0.95)
    expect(response.data?.traceId).toBe('trace-xyz')
    expect(response.error).toBeNull()
  })

  it('surfaces errors in the response envelope without throwing', async () => {
    // AIService inherits BaseService's never-throw contract
    // Callers check response.error — no try/catch needed
    requestSpy.mockResolvedValue(makeErrorResponse())

    const response = await service.ask({ query: 'test' })

    expect(response.data).toBeNull()
    expect(response.error?.code).toBe('NETWORK_ERROR')
  })

})

// ============================================================
// ingest — POST /ingest
// ============================================================
describe('AIService — ingest', () => {

  let service: AIService
  let requestSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    service = new AIService()
    requestSpy = vi.spyOn(BaseService.prototype as any, 'request')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls /ingest with POST method', async () => {
    requestSpy.mockResolvedValue(makeSuccessResponse({ status: 'ok', chunkCount: 5 }))

    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })
    await service.ingest({ file })

    const [endpoint, options] = requestSpy.mock.calls[0]
    expect(endpoint).toBe('/ingest')
    expect(options.method).toBe('POST')
  })

  it('sends body as FormData — not JSON', async () => {
    // File uploads must use multipart/form-data
    // BaseService detects FormData and skips JSON.stringify + lets browser set Content-Type boundary
    requestSpy.mockResolvedValue(makeSuccessResponse({ status: 'ok', chunkCount: 5 }))

    const file = new File(['pdf content'], 'doc.pdf', { type: 'application/pdf' })
    await service.ingest({ file })

    const [, options] = requestSpy.mock.calls[0]
    expect(options.body).toBeInstanceOf(FormData)
  })

  it('appends file and filename to FormData', async () => {
    // Both fields must be present — backend uses 'file' for the binary and 'filename' for metadata
    requestSpy.mockResolvedValue(makeSuccessResponse({ status: 'ok', chunkCount: 5 }))

    const file = new File(['content'], 'report.pdf', { type: 'application/pdf' })
    await service.ingest({ file })

    const [, options] = requestSpy.mock.calls[0]
    const formData: FormData = options.body

    expect(formData.get('file')).toBeTruthy()
    expect(formData.get('filename')).toBe('report.pdf')
  })

  it('returns ServiceResponse with correct IngestResponse shape', async () => {
    // Verifies the response fields match the IngestResponse type
    const mockData = { status: 'ingested', chunkCount: 12 }
    requestSpy.mockResolvedValue(makeSuccessResponse(mockData))

    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })
    const response = await service.ingest({ file })

    expect(response.data?.status).toBe('ingested')
    expect(response.data?.chunkCount).toBe(12)
    expect(response.error).toBeNull()
  })

  it('surfaces errors in the response envelope without throwing', async () => {
    requestSpy.mockResolvedValue(makeErrorResponse())

    const file = new File(['content'], 'bad.pdf', { type: 'application/pdf' })
    const response = await service.ingest({ file })

    expect(response.data).toBeNull()
    expect(response.error?.code).toBe('NETWORK_ERROR')
  })

})

// ============================================================
// retrieve — GET /retrieve?...
// ============================================================
describe('AIService — retrieve', () => {

  let service: AIService
  let requestSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    service = new AIService()
    requestSpy = vi.spyOn(BaseService.prototype as any, 'request')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses GET method', async () => {
    // retrieve is a read operation — must not mutate server state
    requestSpy.mockResolvedValue(makeSuccessResponse({ chunks: [] }))

    await service.retrieve({ query: 'test' })

    const [, options] = requestSpy.mock.calls[0]
    expect(options.method).toBe('GET')
  })

  it('encodes query, top_k and strategy as URL search params', async () => {
    // Params are appended to the endpoint string, not the body
    // URLSearchParams handles percent-encoding so special chars are safe
    requestSpy.mockResolvedValue(makeSuccessResponse({ chunks: [] }))

    await service.retrieve({ query: 'neural networks', top_k: 5, strategy: 'mmr' })

    const [endpoint] = requestSpy.mock.calls[0]
    expect(endpoint).toContain('query=neural+networks')
    expect(endpoint).toContain('top_k=5')
    expect(endpoint).toContain('strategy=mmr')
  })

  it('applies default top_k=5 and strategy=semantic when not provided', async () => {
    // Sensible defaults so callers can just pass query without boilerplate
    requestSpy.mockResolvedValue(makeSuccessResponse({ chunks: [] }))

    await service.retrieve({ query: 'test' })

    const [endpoint] = requestSpy.mock.calls[0]
    expect(endpoint).toContain('top_k=5')
    expect(endpoint).toContain('strategy=semantic')
  })

  it('enables deduplication — rapid identical queries share one in-flight request', async () => {
    // Unlike ask, retrieve is fired on every keystroke while searching
    // Dedup prevents N parallel identical requests for the same search term
    requestSpy.mockResolvedValue(makeSuccessResponse({ chunks: [] }))

    await service.retrieve({ query: 'test' })

    const [, options] = requestSpy.mock.calls[0]
    expect(options.deduplicate).toBe(true)
  })

  it('returns ServiceResponse with correct RetrieveResponse shape', async () => {
    // Verifies chunks array is present and correctly structured
    const mockData = {
      chunks: [
        { content: 'relevant text', score: 0.92, metadata: { source: 'doc1.pdf' } },
      ],
    }
    requestSpy.mockResolvedValue(makeSuccessResponse(mockData))

    const response = await service.retrieve({ query: 'neural networks' })

    expect(response.data?.chunks).toHaveLength(1)
    expect(response.data?.chunks[0].score).toBe(0.92)
    expect(response.data?.chunks[0].content).toBe('relevant text')
    expect(response.error).toBeNull()
  })

  it('surfaces errors in the response envelope without throwing', async () => {
    requestSpy.mockResolvedValue(makeErrorResponse())

    const response = await service.retrieve({ query: 'test' })

    expect(response.data).toBeNull()
    expect(response.error?.code).toBe('NETWORK_ERROR')
  })

})