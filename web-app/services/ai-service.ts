import { BaseService, ServiceResponse } from './base-service'

// ============================================================
// RESPONSE TYPES
// ============================================================

export interface AskResponse {
  answer: string
  sources: Array<{
    content: string
    score: number
    metadata: Record<string, unknown>
  }>
  latencyBreakdown: {
    retrievalMs: number
    generationMs: number
    totalMs: number
  }
  traceId: string
}

export interface IngestResponse {
  status: string
  chunkCount: number
  error?: string
}

export interface RetrieveResponse {
  chunks: Array<{
    content: string
    score: number
    metadata: Record<string, unknown>
  }>
}

// ============================================================
// REQUEST TYPES
// ============================================================

export interface AskRequest {
  query: string
  history?: Array<{ role: string; content: string }>
  signal?: AbortSignal
}

export interface IngestRequest {
  file: File
  signal?: AbortSignal
}

export interface RetrieveRequest {
  query: string
  top_k?: number
  strategy?: string
}

// ============================================================
// AI SERVICE
// ============================================================

export class AIService extends BaseService {
  constructor() {
    const baseUrl =
      (globalThis as { process?: { env?: Record<string, string | undefined> } })
        .process?.env?.NEXT_PUBLIC_AI_BACKEND_URL ?? 'http://localhost:8000'

    super(baseUrl, {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    })
  }

  // ============================================================
  // ask — POST /ask
  // Each question is unique — deduplication disabled
  // Passes AbortSignal through for streaming cancellation later
  // ============================================================
  async ask({
    query,
    history = [],
    signal,
  }: AskRequest): Promise<ServiceResponse<AskResponse>> {
    return this.request<AskResponse>('/ask', {
      method: 'POST',
      body: { query, history },
      signal,
      deduplicate: false, // every ask is a distinct user intent
      timeoutMs: 30_000,  // LLM responses can be slow
      maxAttempts: 2,     // don't retry too aggressively on LLM calls
    })
  }

  // ============================================================
  // ingest — POST /ingest
  // Sends file as FormData — not JSON
  // BaseService detects FormData and skips JSON.stringify
  // Browser automatically sets multipart/form-data + boundary
  // ============================================================
  async ingest({
    file,
    signal,
  }: IngestRequest): Promise<ServiceResponse<IngestResponse>> {
    const formData = new FormData()
    formData.append('file', file)
    // Optionally attach filename as metadata
    formData.append('filename', file.name)

    return this.request<IngestResponse>('/ingest', {
      method: 'POST',
      body: formData,   // BaseService handles FormData specially
      signal,
      deduplicate: false,
      timeoutMs: 60_000,  // large files take time
      maxAttempts: 2,
    })
  }

  // ============================================================
  // retrieve — GET /retrieve?query=...&top_k=...&strategy=...
  // Deduplication enabled — typing fast should not fire N requests
  // ============================================================
  async retrieve({
    query,
    top_k = 5,
    strategy = 'semantic',
  }: RetrieveRequest): Promise<ServiceResponse<RetrieveResponse>> {
    // Build query string — URLSearchParams handles encoding
    const params = new URLSearchParams({
      query,
      top_k: String(top_k),
      strategy,
    })

    return this.request<RetrieveResponse>(`/retrieve?${params.toString()}`, {
      method: 'GET',
      deduplicate: true,  // same query fired twice = one request
      timeoutMs: 10_000,
      maxAttempts: 3,
    })
  }
}

// Singleton — one instance shared across the app
export const aiService = new AIService()