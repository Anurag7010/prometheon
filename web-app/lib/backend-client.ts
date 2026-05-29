import 'server-only'

import type { AskResponse, RetrieveResponse, Source } from '@/types'
import { BackendError, mapBackendError } from './backend-error-mapper'

// ── Raw Python response shapes (snake_case) ───────────────────────────────────
// These only exist in this file — never leak into the rest of the codebase.

interface PythonSource {
  content: string
  score: number | null
  metadata: Record<string, unknown>
}

interface PythonAskResponse {
  answer: string
  sources: PythonSource[]
  trace_id: string
  latency_breakdown: {
    retrieval_ms: number
    generation_ms: number
    total_ms: number
  }
}

interface PythonRetrieveResponse {
  chunks: PythonSource[]
  trace_id: string
}

// Returned by the Python ingest endpoint.
// documentId is NOT here — it comes from the DB record created in the route handler.
export interface BackendIngestResult {
  status: 'ok' | 'error'
  chunkCount: number
  error: string | null
}

interface PythonIngestResponse {
  status: string
  chunk_count: number
  document_id: string | null
  error: string | null
}

interface PythonHealthResponse {
  status: string
  components: Record<string, string>
}

export interface BackendHealthResult {
  status: string
  components: Record<string, string>
}

// ── Conversion helpers ────────────────────────────────────────────────────────

function toSource(raw: PythonSource): Source {
  return {
    content: raw.content,
    score: raw.score ?? 0,
    metadata: raw.metadata,
  }
}

function toAskResponse(raw: PythonAskResponse): AskResponse {
  return {
    answer: raw.answer,
    sources: raw.sources.map(toSource),
    traceId: raw.trace_id,
    latencyBreakdown: {
      retrievalMs: raw.latency_breakdown.retrieval_ms,
      generationMs: raw.latency_breakdown.generation_ms,
      totalMs: raw.latency_breakdown.total_ms,
    },
  }
}

function toRetrieveResponse(raw: PythonRetrieveResponse): RetrieveResponse {
  return {
    chunks: raw.chunks.map(toSource),
    traceId: raw.trace_id,
  }
}

function toIngestResult(raw: PythonIngestResponse): BackendIngestResult {
  return {
    status: raw.status === 'ok' ? 'ok' : 'error',
    chunkCount: raw.chunk_count,
    error: raw.error,
  }
}

// ── BackendClient ─────────────────────────────────────────────────────────────

class BackendClient {
  private baseUrl: string
  private apiKey: string

  constructor() {
    const url = process.env.AI_BACKEND_URL
    const key = process.env.AI_BACKEND_API_KEY
    if (!url) throw new Error('AI_BACKEND_URL environment variable is not set')
    if (!key) throw new Error('AI_BACKEND_API_KEY environment variable is not set')
    this.baseUrl = url.replace(/\/$/, '')
    this.apiKey = key
  }

  async ask(
    query: string,
    options: {
      topK?: number
      strategy?: string
      history?: Array<{ role: string; content: string }>
      traceId?: string
      userId?: string
    } = {}
  ): Promise<AskResponse> {
    const raw = await this.request<PythonAskResponse>('/ask', {
      method: 'POST',
      body: JSON.stringify({
        query,
        top_k: options.topK ?? 5,
        strategy: options.strategy ?? 'semantic',
        history: options.history ?? [],
      }),
      traceId: options.traceId,
      userId: options.userId,
    })
    return toAskResponse(raw)
  }

  async askStream(
    query: string,
    options: {
      topK?: number
      strategy?: string
      history?: Array<{ role: string; content: string }>
      traceId?: string
      userId?: string
    } = {}
  ): Promise<ReadableStream<Uint8Array>> {
    const url = `${this.baseUrl}/ask/stream`
    const headers: Record<string, string> = {
      'X-API-Key': this.apiKey,
      'Content-Type': 'application/json',
    }
    if (options.traceId) headers['X-Request-ID'] = options.traceId
    if (options.userId) headers['X-User-ID'] = options.userId

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query,
          top_k: options.topK ?? 5,
          strategy: options.strategy ?? 'semantic',
          history: options.history ?? [],
        }),
      })
    } catch (err) {
      throw mapBackendError(err)
    }

    if (!response.ok) {
      let errorBody: { error?: string; message?: string; trace_id?: string } = {}
      try {
        errorBody = await response.json()
      } catch {
        // Non-JSON error body — use status text
      }
      throw new BackendError(
        errorBody.message ?? `Backend error ${response.status}`,
        response.status,
        errorBody.error ?? 'backend_error',
        errorBody.trace_id
      )
    }

    if (!response.body) {
      throw new BackendError('No response body for streaming request', 500, 'no_body')
    }

    return response.body
  }

  async ingest(
    file: Blob,
    filename: string,
    metadata: Record<string, unknown> = {},
    traceId?: string,
    userId?: string
  ): Promise<BackendIngestResult> {
    const formData = new FormData()
    formData.append('file', file, filename)
    formData.append('metadata', JSON.stringify(metadata))

    const raw = await this.request<PythonIngestResponse>('/ingest', {
      method: 'POST',
      formData,
      traceId,
      userId,
    })
    return toIngestResult(raw)
  }

  async retrieve(
    query: string,
    options: {
      topK?: number
      strategy?: string
      traceId?: string
      userId?: string
    } = {}
  ): Promise<RetrieveResponse> {
    const params = new URLSearchParams({
      query,
      top_k: String(options.topK ?? 5),
      strategy: options.strategy ?? 'semantic',
    })
    const raw = await this.request<PythonRetrieveResponse>(`/retrieve?${params}`, {
      method: 'GET',
      traceId: options.traceId,
      userId: options.userId,
    })
    return toRetrieveResponse(raw)
  }

  async health(): Promise<BackendHealthResult> {
    const raw = await this.request<PythonHealthResponse>('/health', { method: 'GET' })
    return { status: raw.status, components: raw.components }
  }

  // ── Private request method ────────────────────────────────────────────────
  // Always attaches X-API-Key and X-Request-ID.
  // Throws BackendError on non-2xx — never returns a partial error response.

  private async request<T>(
    endpoint: string,
    options: {
      method: string
      body?: string
      formData?: FormData
      traceId?: string
      timeoutMs?: number
      userId?: string
    }
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const headers: Record<string, string> = {
      'X-API-Key': this.apiKey,
    }
    if (options.traceId) headers['X-Request-ID'] = options.traceId
    if (options.body) headers['Content-Type'] = 'application/json'
    if (options.userId) headers['X-User-ID'] = options.userId

    const controller = new AbortController()
    const timeoutId = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? 30_000
    )

    let response: Response
    try {
      response = await fetch(url, {
        method: options.method,
        headers,
        body: options.formData ?? options.body,
        signal: controller.signal,
      })
    } catch (err) {
      clearTimeout(timeoutId)
      throw mapBackendError(err)
    }
    clearTimeout(timeoutId)

    if (!response.ok) {
      let errorBody: { error?: string; message?: string; trace_id?: string } = {}
      try {
        errorBody = await response.json()
      } catch {
        // Non-JSON error body — use status text
      }
      throw new BackendError(
        errorBody.message ?? `Backend error ${response.status}`,
        response.status,
        errorBody.error ?? 'backend_error',
        errorBody.trace_id
      )
    }

    return response.json() as Promise<T>
  }
}

export const backendClient = new BackendClient()
