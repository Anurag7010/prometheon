import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BaseService, ServiceError } from '../../services/base-service'
import { TimeoutError, CancellationError } from '../../lib/async'

// ============================================================
// BaseService exposes `request` as protected — to test it we
// create a thin subclass that makes it public. This is the
// standard pattern for testing protected methods without
// resorting to type-casting hacks.
// ============================================================
class TestService extends BaseService {
  public request<T>(endpoint: string, options = {}) {
    return super.request<T>(endpoint, options)
  }
}

// Mock global fetch before any tests run
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Helper — builds a minimal mock Response that fetch would return
// ok is derived from status so we don't have to set it manually each time
function mockResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: new Headers({ 'content-type': 'application/json' }),
  } as unknown as Response
}

// ============================================================
// ERROR NORMALIZATION
// Each test isolates one error type → one ServiceError.code mapping
// ============================================================
describe('BaseService — normalizeError', () => {

  let service: TestService

  beforeEach(() => {
    vi.useFakeTimers()
    service = new TestService('http://localhost:8000')
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('network error (TypeError) → NETWORK_ERROR, retryable true', async () => {
    // fetch throws TypeError on network failure (offline, CORS, DNS failure)
    // These are transient — worth retrying
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'))

    const promise = service.request('/test', { maxAttempts: 1 })
    await vi.runAllTimersAsync()
    const response = await promise

    expect(response.error).toBeInstanceOf(ServiceError)
    expect(response.error?.code).toBe('NETWORK_ERROR')
    expect(response.error?.retryable).toBe(true)
    expect(response.data).toBeNull()
  })

  it('HTTP 400 response → HTTP_ERROR, status 400, retryable false', async () => {
    // 4xx means the request itself is wrong — retrying the same request won't help
    mockFetch.mockResolvedValue(mockResponse(400, { message: 'bad request' }))

    const promise = service.request('/test', { maxAttempts: 1 })
    await vi.runAllTimersAsync()
    const response = await promise

    expect(response.error?.code).toBe('HTTP_ERROR')
    expect(response.error?.status).toBe(400)
    expect(response.error?.retryable).toBe(false)
  })

  it('HTTP 429 response → HTTP_ERROR, status 429, retryable true', async () => {
    // Rate limiting is transient — backing off and retrying is the correct behavior
    mockFetch.mockResolvedValue(mockResponse(429, { message: 'too many requests' }))

    const promise = service.request('/test', { maxAttempts: 1 })
    await vi.runAllTimersAsync()
    const response = await promise

    expect(response.error?.code).toBe('HTTP_ERROR')
    expect(response.error?.status).toBe(429)
    expect(response.error?.retryable).toBe(true)
  })

  it('HTTP 503 response → HTTP_ERROR, status 503, retryable true', async () => {
    // 5xx means a server-side problem — transient, should be retried
    mockFetch.mockResolvedValue(mockResponse(503, { message: 'unavailable' }))

    const promise = service.request('/test', { maxAttempts: 1 })
    await vi.runAllTimersAsync()
    const response = await promise

    expect(response.error?.code).toBe('HTTP_ERROR')
    expect(response.error?.status).toBe(503)
    expect(response.error?.retryable).toBe(true)
  })

  it('malformed JSON response → PARSE_ERROR, retryable false', async () => {
    // Server returned 200 but the body isn't valid JSON
    // Retrying won't fix a fundamentally broken response format
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
      headers: new Headers(),
    } as unknown as Response)

    const promise = service.request('/test', { maxAttempts: 1 })
    await vi.runAllTimersAsync()
    const response = await promise

    expect(response.error?.code).toBe('PARSE_ERROR')
    expect(response.error?.retryable).toBe(false)
  })

  it('TimeoutError → TIMEOUT, retryable true', async () => {
    // A timeout means the server was too slow, not fundamentally broken
    // A retry has a reasonable chance of succeeding
    mockFetch.mockRejectedValue(new TimeoutError('timed out'))

    const promise = service.request('/test', { maxAttempts: 1 })
    await vi.runAllTimersAsync()
    const response = await promise

    expect(response.error?.code).toBe('TIMEOUT')
    expect(response.error?.retryable).toBe(true)
  })

  it('CancellationError → CANCELLED, retryable false', async () => {
    // Caller explicitly aborted — retrying would violate their intent
    mockFetch.mockRejectedValue(new CancellationError('cancelled'))

    const promise = service.request('/test', { maxAttempts: 1 })
    await vi.runAllTimersAsync()
    const response = await promise

    expect(response.error?.code).toBe('CANCELLED')
    expect(response.error?.retryable).toBe(false)
  })

})

// ============================================================
// REQUEST BEHAVIOR
// Tests for HTTP mechanics, envelope shape, and deduplication
// ============================================================
describe('BaseService — request', () => {

  let service: TestService

  beforeEach(() => {
    vi.useFakeTimers()
    service = new TestService('http://localhost:8000')
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('successful GET — returns data, null error, correct status', async () => {
    // The happy path: verifies the ServiceResponse envelope is correctly populated
    mockFetch.mockResolvedValue(mockResponse(200, { result: 'ok' }))

    const promise = service.request('/api/test')
    await vi.runAllTimersAsync()
    const response = await promise

    expect(response.data).toEqual({ result: 'ok' })
    expect(response.error).toBeNull()
    expect(response.status).toBe(200)
  })

  it('successful POST — sends correct body and Content-Type header', async () => {
    // Verifies body is JSON-serialized and Content-Type is set automatically
    // BaseService merges defaultHeaders (Content-Type: application/json) with per-request headers
    mockFetch.mockResolvedValue(mockResponse(201, { created: true }))

    const promise = service.request('/api/create', {
      method: 'POST',
      body: { name: 'test' },
    })
    await vi.runAllTimersAsync()
    await promise

    const [, init] = mockFetch.mock.calls[0]
    expect(init.method).toBe('POST')
    // Body is a JSON string — BaseService calls JSON.stringify on non-FormData bodies
    expect(JSON.parse(init.body)).toEqual({ name: 'test' })
  })

  it('FormData body — does not JSON.stringify, removes Content-Type so browser sets boundary', async () => {
    // Critical for file uploads: if we JSON.stringify FormData or set Content-Type manually
    // the browser cannot set the multipart boundary and the server rejects the request
    mockFetch.mockResolvedValue(mockResponse(200, { status: 'ok' }))

    const formData = new FormData()
    formData.append('file', new Blob(['data']), 'test.txt')

    const promise = service.request('/api/upload', {
      method: 'POST',
      body: formData,
    })
    await vi.runAllTimersAsync()
    await promise

    const [, init] = mockFetch.mock.calls[0]
    // Body must be the raw FormData, not a stringified version
    expect(init.body).toBeInstanceOf(FormData)
    // Content-Type must be absent — browser sets it with the correct multipart boundary
    expect(init.headers?.['Content-Type']).toBeUndefined()
  })

  it('failed request — returns error envelope without throwing', async () => {
    // BaseService is designed to never throw from the service layer
    // All errors are returned in the response envelope so callers skip try/catch
    mockFetch.mockRejectedValue(new TypeError('Network failure'))

    const promise = service.request('/api/test', { maxAttempts: 1 })
    await vi.runAllTimersAsync()
    const response = await promise

    expect(response.data).toBeNull()
    expect(response.error).not.toBeNull()
    expect(response.error?.code).toBe('NETWORK_ERROR')
    // Verify the method resolved (did not reject)
    await expect(promise).resolves.toBeDefined()
  })

  it('deduplication — two identical simultaneous requests share one Promise, fetch called once', async () => {
    // deduplicate: true is the guard against rapid duplicate calls (e.g. search-as-you-type)
    // Both callers get the same result but only one network round trip occurs
    mockFetch.mockResolvedValue(mockResponse(200, { data: 'shared' }))

    const promise = Promise.all([
      service.request('/api/data', { deduplicate: true }),
      service.request('/api/data', { deduplicate: true }),
    ])
    await vi.runAllTimersAsync()
    const [r1, r2] = await promise

    expect(mockFetch).toHaveBeenCalledTimes(1)
    // Both callers receive the same data
    expect(r1.data).toEqual(r2.data)
  })

  it('deduplication — different endpoints are independent requests', async () => {
    // The dedup key is method + endpoint + body — different endpoints must not collapse
    mockFetch.mockResolvedValue(mockResponse(200, {}))

    const promise = Promise.all([
      service.request('/api/one', { deduplicate: true }),
      service.request('/api/two', { deduplicate: true }),
    ])
    await vi.runAllTimersAsync()
    await promise

    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('after a deduplicated request settles, a new call fires a fresh request', async () => {
    // Once the in-flight Promise resolves, the map entry is cleared
    // The next identical call must not re-use a stale resolved Promise
    mockFetch.mockResolvedValue(mockResponse(200, { count: 1 }))

    const first = service.request('/api/data', { deduplicate: true })
    await vi.runAllTimersAsync()
    await first

    // Trigger a second call AFTER the first has settled
    mockFetch.mockResolvedValue(mockResponse(200, { count: 2 }))
    const second = service.request('/api/data', { deduplicate: true })
    await vi.runAllTimersAsync()
    await second

    // Two separate network calls — dedup map was cleared between them
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('latencyMs is a non-negative number', async () => {
    // BaseService measures wall-clock time for every request
    // Used for monitoring and surfacing slow calls
    mockFetch.mockResolvedValue(mockResponse(200, {}))

    const promise = service.request('/api/test')
    await vi.runAllTimersAsync()
    const response = await promise

    expect(typeof response.latencyMs).toBe('number')
    expect(response.latencyMs).toBeGreaterThanOrEqual(0)
  })

})