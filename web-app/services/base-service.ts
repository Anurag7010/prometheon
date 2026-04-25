import {
  resilientCall,
  TimeoutError,
  CancellationError,
  RetryExhaustedError,
} from '../lib/async'

// ============================================================
// TYPES
// ============================================================

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
  timeoutMs?: number
  maxAttempts?: number
  deduplicate?: boolean
}

export interface ServiceResponse<T> {
  data: T | null
  error: ServiceError | null
  status: number | null
  latencyMs: number
}

interface RequestLog {
  method: string
  endpoint: string
  status: number | null
  latencyMs: number
  errorCode?: string
}

// ============================================================
// SERVICE ERROR
// ============================================================

export class ServiceError extends Error {
  code: 'NETWORK_ERROR' | 'TIMEOUT' | 'CANCELLED' | 'HTTP_ERROR' | 'PARSE_ERROR' | 'UNKNOWN'
  status?: number
  retryable: boolean
  originalError: unknown

  constructor() {
    super()
    this.name = 'ServiceError'
    this.code = 'UNKNOWN'
    this.retryable = false
    this.originalError = null
    Object.setPrototypeOf(this, ServiceError.prototype)
  }
}

// ============================================================
// BASE SERVICE
// ============================================================

export class BaseService {
  private baseUrl: string
  private defaultHeaders: Record<string, string>

  // Keyed by method:endpoint:body — stores in-flight Promises
  private inFlightRequests: Map<string, Promise<ServiceResponse<any>>>

  constructor(baseUrl: string, defaultHeaders: Record<string, string> = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '') // strip trailing slash
    this.defaultHeaders = defaultHeaders
    this.inFlightRequests = new Map()
  }

  // ============================================================
  // PRIVATE — buildRequestKey
  // Produces a stable string key for deduplication
  // Same method + endpoint + body = same key = same in-flight Promise
  // ============================================================
  private buildRequestKey(endpoint: string, options: RequestOptions): string {
    const method = options.method ?? 'GET'
    // JSON.stringify(undefined) = undefined, so we fall back to ''
    const bodyStr = options.body !== undefined ? JSON.stringify(options.body) : ''
    return `${method}:${endpoint}:${bodyStr}`
  }

  // ============================================================
  // PRIVATE — normalizeError
  // Maps every possible failure type to a consistent ServiceError
  // ============================================================
  private normalizeError(error: unknown, status?: number): ServiceError {
    const serviceError = new ServiceError()
    serviceError.originalError = error

    if (error instanceof CancellationError) {
      serviceError.code = 'CANCELLED'
      serviceError.message = error.message
      serviceError.retryable = false
      return serviceError
    }

    if (error instanceof TimeoutError) {
      serviceError.code = 'TIMEOUT'
      serviceError.message = error.message
      serviceError.retryable = true
      return serviceError
    }

    // RetryExhaustedError wraps the last underlying error
    // Unwrap it and normalize the cause instead
    if (error instanceof RetryExhaustedError) {
      return this.normalizeError(error.cause, status)
    }

    if (error instanceof TypeError) {
      serviceError.code = 'NETWORK_ERROR'
      serviceError.message = 'Network request failed — check connection or CORS'
      serviceError.retryable = true
      return serviceError
    }

    if (error instanceof SyntaxError) {
      serviceError.code = 'PARSE_ERROR'
      serviceError.message = 'Failed to parse server response as JSON'
      serviceError.retryable = false
      return serviceError
    }

    if (status !== undefined) {
      serviceError.code = 'HTTP_ERROR'
      serviceError.message = `HTTP error ${status}`
      serviceError.status = status
      // 429 = rate limited, 5xx = server error — both are transient
      serviceError.retryable = status === 429 || status >= 500
      return serviceError
    }

    serviceError.code = 'UNKNOWN'
    serviceError.message = error instanceof Error ? error.message : 'An unknown error occurred'
    serviceError.retryable = false
    return serviceError
  }

  // ============================================================
  // PRIVATE — log
  // Structured logging — never logs body or auth headers
  // ============================================================
  private log(entry: RequestLog): void {
    const level = entry.errorCode ? 'error' : 'info'
    console[level]('[BaseService]', JSON.stringify(entry))
  }

  // ============================================================
  // PROTECTED — request
  // The core method all subclasses use.
  // Never throws — always returns ServiceResponse<T>
  // ============================================================
  protected async request<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<ServiceResponse<T>> {
    const {
      method = 'GET',
      body,
      headers = {},
      signal,
      timeoutMs = 10_000,
      maxAttempts = 3,
      deduplicate = false,
    } = options

    // Deduplication check — if same request is already in flight, return it
    if (deduplicate) {
      const key = this.buildRequestKey(endpoint, options)

      if (this.inFlightRequests.has(key)) {
        // Return the existing Promise — no new network call
        return this.inFlightRequests.get(key)!
      }

      // Build the promise, store it, then return it
      const promise = this._executeRequest<T>(
        endpoint, method, body, headers, signal, timeoutMs, maxAttempts
      ).finally(() => {
        // Remove from map after settled — next call fires fresh request
        this.inFlightRequests.delete(key)
      })

      this.inFlightRequests.set(key, promise)
      return promise
    }

    // No deduplication — execute directly
    return this._executeRequest<T>(
      endpoint, method, body, headers, signal, timeoutMs, maxAttempts
    )
  }

  // ============================================================
  // PRIVATE — _executeRequest
  // Separated from request() so deduplication logic stays clean
  // ============================================================
  private async _executeRequest<T>(
    endpoint: string,
    method: string,
    body: unknown,
    headers: Record<string, string>,
    signal: AbortSignal | undefined,
    timeoutMs: number,
    maxAttempts: number,
  ): Promise<ServiceResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`
    const startTime = Date.now()
    let responseStatus: number | null = null

    try {
      const data = await resilientCall(
        async (abortSignal) => {
          // Merge default headers with per-request headers
          // Per-request headers win on conflict
          const mergedHeaders: Record<string, string> = {
            ...this.defaultHeaders,
            ...headers,
          }

          const fetchOptions: RequestInit = {
            method,
            headers: mergedHeaders,
            // Use the signal from resilientCall — it combines timeout + cancellation
            signal: abortSignal,
          }

          // Attach body only for non-GET requests
          // FormData is passed as-is — do not JSON.stringify or set Content-Type
          // (browser sets multipart boundary automatically for FormData)
          if (body !== undefined) {
            if (body instanceof FormData) {
              fetchOptions.body = body
              // Remove Content-Type so browser sets it with boundary
              delete mergedHeaders['Content-Type']
            } else {
              fetchOptions.body = JSON.stringify(body)
            }
          }

          const response = await fetch(url, fetchOptions)
          responseStatus = response.status

          // fetch does NOT throw on HTTP errors — check manually
          if (!response.ok) {
            // Throw a shaped object so normalizeError can extract the status
            const httpError = new Error(`HTTP ${response.status}`) as any
            httpError.status = response.status
            throw httpError
          }

          // Parse JSON — throws SyntaxError if body is malformed
          const parsed = await response.json() as T
          return parsed
        },
        {
          maxAttempts,
          baseDelayMs: 200,
          maxDelayMs: 5_000,
          timeoutMs,
          signal, // external signal from caller
          isRetryable: (err) => {
            // Never retry cancellation
            if (err instanceof CancellationError) return false
            // Retry timeouts
            if (err instanceof TimeoutError) return true
            // Retry network errors
            if (err instanceof TypeError) return true
            // Retry 429 and 5xx
            const status = (err as any)?.status
            if (typeof status === 'number') return status === 429 || status >= 500
            return false
          }
        }
      )

      const latencyMs = Date.now() - startTime

      this.log({ method, endpoint, status: responseStatus, latencyMs })

      return {
        data,
        error: null,
        status: responseStatus,
        latencyMs,
      }

    } catch (err) {
      const latencyMs = Date.now() - startTime
      const serviceError = this.normalizeError(err, (err as any)?.status ?? responseStatus ?? undefined)

      this.log({
        method,
        endpoint,
        status: responseStatus,
        latencyMs,
        errorCode: serviceError.code,
      })

      // Return error in envelope — never throw from service layer
      return {
        data: null,
        error: serviceError,
        status: responseStatus,
        latencyMs,
      }
    }
  }
}