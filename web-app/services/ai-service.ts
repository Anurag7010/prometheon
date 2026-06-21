import { BaseService, ServiceResponse, ServiceError } from './base-service'
import { getAccessToken } from '@/hooks/useAuth'
import type {
  AskResponse,
  IngestResponse,
  RetrieveResponse,
  DocumentSummary,
  DocumentId,
  Message,
} from '../types'
import { isAskResponse, isIngestResponse } from '../lib/type-guards'
import { parseSSEStream, type SSEEvent } from '../lib/sse-parser'

export interface AskOptions {
  query: string
  history?: readonly Message[]
  signal?: AbortSignal
  topK?: number
  strategy?: string
  documentId?: string
}

export class AIService extends BaseService {
  constructor() {
    // baseUrl is empty — calls same-origin Next.js API routes.
    // Browser never calls the Python backend directly.
    super('', {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    })
  }

  protected override getAuthHeaders(): Record<string, string> {
    const token = getAccessToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  private static parseError(message: string, originalError: unknown): ServiceError {
    const err = new ServiceError()
    err.code = 'PARSE_ERROR'
    err.message = message
    err.retryable = false
    err.originalError = originalError
    return err
  }

  // POST /api/ask
  // Returns AskResponse directly (route handler does not wrap in { data: ... })
  async ask({
    query,
    history = [],
    signal,
    topK = 5,
    strategy = 'semantic',
    documentId,
  }: AskOptions): Promise<ServiceResponse<AskResponse>> {
    const response = await this.request<unknown>('/api/ask', {
      method: 'POST',
      body: { query, history, topK, strategy, ...(documentId ? { documentId } : {}) },
      signal,
      deduplicate: false,
      timeoutMs: 60_000,
      maxAttempts: 2,
    })

    if (response.error) return response as ServiceResponse<AskResponse>

    if (!isAskResponse(response.data)) {
      return {
        data: null,
        error: AIService.parseError('Unexpected response shape from /api/ask', response.data),
        status: response.status,
        latencyMs: response.latencyMs,
      }
    }

    return { ...response, data: response.data }
  }

  // POST /api/ask/stream — returns typed SSE events as an async generator.
  // Uses plain fetch (not BaseService.request) because we need the raw response body.
  async *askStream(
    query: string,
    history: Message[] = [],
    signal?: AbortSignal,
    options?: { topK?: number; strategy?: string; documentId?: string }
  ): AsyncGenerator<SSEEvent> {
    let response: Response
    try {
      response = await fetch('/api/ask/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          ...this.getAuthHeaders(),
        },
        body: JSON.stringify({
          query,
          history,
          topK: options?.topK ?? 5,
          strategy: options?.strategy ?? 'semantic',
          ...(options?.documentId ? { documentId: options.documentId } : {}),
        }),
        signal,
      })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      yield {
        type: 'error',
        message: err instanceof Error ? err.message : 'Network error',
      }
      return
    }

    if (!response.ok || !response.body) {
      yield { type: 'error', message: `Request failed: ${response.status}` }
      return
    }

    try {
      for await (const event of parseSSEStream(response.body)) {
        if (signal?.aborted) return
        yield event
      }
    } catch (err) {
      if (signal?.aborted) return
      yield {
        type: 'error',
        message: err instanceof Error ? err.message : 'Stream error',
      }
    }
  }

  // POST /api/documents (multipart/form-data)
  // Returns { data: IngestResponse, requestId } — extract .data
  async ingest(
    file: File,
    signal?: AbortSignal
  ): Promise<ServiceResponse<IngestResponse>> {
    const formData = new FormData()
    formData.append('file', file)

    const response = await this.request<unknown>('/api/documents', {
      method: 'POST',
      body: formData,
      signal,
      deduplicate: false,
      timeoutMs: 120_000,
      maxAttempts: 1,
    })

    if (response.error) return response as ServiceResponse<IngestResponse>

    // Route returns { data: IngestResponse, requestId } — unwrap
    const inner = (response.data as { data?: unknown })?.data
    if (!isIngestResponse(inner)) {
      return {
        data: null,
        error: AIService.parseError('Unexpected response shape from /api/documents', response.data),
        status: response.status,
        latencyMs: response.latencyMs,
      }
    }

    return { ...response, data: inner }
  }

  // GET /api/retrieve?query=...&top_k=...&strategy=...
  // Returns { data: RetrieveResponse, requestId } — extract .data
  async retrieve(
    query: string,
    topK = 5,
    strategy = 'semantic'
  ): Promise<ServiceResponse<RetrieveResponse>> {
    const params = new URLSearchParams({
      query,
      top_k: String(topK),
      strategy,
    })

    const response = await this.request<unknown>(`/api/retrieve?${params}`, {
      method: 'GET',
      deduplicate: true,
      timeoutMs: 15_000,
      maxAttempts: 3,
    })

    if (response.error) return response as ServiceResponse<RetrieveResponse>

    const inner = (response.data as { data?: RetrieveResponse })?.data as RetrieveResponse
    return { ...response, data: inner }
  }

  // GET /api/documents
  // Returns { data: DocumentSummary[], requestId } — extract .data
  async getDocuments(): Promise<ServiceResponse<DocumentSummary[]>> {
    const response = await this.request<unknown>('/api/documents', {
      method: 'GET',
      deduplicate: true,
      timeoutMs: 10_000,
      maxAttempts: 3,
    })

    if (response.error) return response as ServiceResponse<DocumentSummary[]>

    const inner = (response.data as { data?: DocumentSummary[] })?.data as DocumentSummary[]
    return { ...response, data: inner }
  }

  // DELETE /api/documents/[id]
  async deleteDocument(id: DocumentId): Promise<ServiceResponse<void>> {
    return this.request<void>(`/api/documents/${id}`, {
      method: 'DELETE',
      deduplicate: false,
      timeoutMs: 10_000,
      maxAttempts: 2,
    })
  }
}

export const aiService = new AIService()
