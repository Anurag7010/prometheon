import 'server-only'

import type { AskResponse, RetrieveResponse, Source, AIMetrics, AgentRunResponse, AgentStep, Memory } from '@/types'
import { BackendError, mapBackendError } from './backend-error-mapper'

// ── Raw Python response shapes (snake_case) ───────────────────────────────────
// These only exist in this file — never leak into the rest of the codebase.

interface PythonSource {
  content: string
  score: number | null
  metadata: Record<string, unknown>
  citation_id?: number | null
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
  guardrail_rejected?: boolean
  no_results?: boolean
  retrieval_quality?: {
    quality: 'good' | 'fair' | 'poor' | 'no_results'
    max_score: number
    avg_score: number
    chunk_count: number
  }
}

interface PythonRetrieveResponse {
  chunks: PythonSource[]
  trace_id: string
}

interface PythonAgentStep {
  step_number: number
  action: string | null
  action_input: Record<string, unknown> | null
  observation: string | null
  is_final: boolean
  final_answer: string | null
}

interface PythonAgentRunResponse {
  answer: string
  steps: PythonAgentStep[]
  total_steps: number
  stopped_reason: 'final_answer' | 'max_iterations' | 'error'
  trace_id: string
  routed_to: 'agent'
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

interface PythonMemory {
  id: string
  content: string
  created_at: string
  last_accessed: string
  access_count: number
  similarity?: number
}

interface PythonMemoriesResponse {
  memories: PythonMemory[]
  count: number
}

interface PythonMetricsResponse {
  period_hours: number
  total_queries: number
  avg_latency_ms: number
  error_rate: number
  cache_hit_rate: number
  total_tokens: number
  estimated_cost_usd: number
  slow_queries: number
  failed_retrievals: number
  queries_per_hour: number
  token_breakdown: { input: number; output: number }
}

export interface BackendHealthResult {
  status: string
  components: Record<string, string>
}

// ── Conversion helpers ────────────────────────────────────────────────────────

function toSource(raw: PythonSource): Source {
  return {
    content: raw.content,
    score: raw.score ?? null,
    metadata: raw.metadata,
    ...(raw.citation_id !== null && raw.citation_id !== undefined ? { citationId: raw.citation_id } : {}),
  }
}

function toAskResponse(raw: PythonAskResponse): AskResponse {
  const rq = raw.retrieval_quality
  return {
    answer: raw.answer,
    sources: raw.sources.map(toSource),
    traceId: raw.trace_id,
    latencyBreakdown: {
      retrievalMs: raw.latency_breakdown.retrieval_ms,
      generationMs: raw.latency_breakdown.generation_ms,
      totalMs: raw.latency_breakdown.total_ms,
    },
    guardrailRejected: raw.guardrail_rejected ?? false,
    noResults: raw.no_results ?? false,
    retrievalQuality: {
      quality: rq?.quality ?? 'good',
      maxScore: rq?.max_score ?? 0,
      avgScore: rq?.avg_score ?? 0,
      chunkCount: rq?.chunk_count ?? 0,
    },
  }
}

function toRetrieveResponse(raw: PythonRetrieveResponse): RetrieveResponse {
  return {
    chunks: raw.chunks.map(toSource),
    traceId: raw.trace_id,
  }
}

function toAgentStep(raw: PythonAgentStep): AgentStep {
  return {
    stepNumber: raw.step_number,
    action: raw.action,
    actionInput: raw.action_input,
    observation: raw.observation,
    isFinal: raw.is_final,
    finalAnswer: raw.final_answer,
  }
}

function toAgentRunResponse(raw: PythonAgentRunResponse): AgentRunResponse {
  return {
    answer: raw.answer,
    steps: raw.steps.map(toAgentStep),
    totalSteps: raw.total_steps,
    stoppedReason: raw.stopped_reason,
    traceId: raw.trace_id,
    routedTo: raw.routed_to,
  }
}

function toMemory(raw: PythonMemory): Memory {
  return {
    id: raw.id,
    content: raw.content,
    createdAt: raw.created_at,
    lastAccessed: raw.last_accessed,
    accessCount: raw.access_count,
    ...(raw.similarity !== null && raw.similarity !== undefined ? { similarity: raw.similarity } : {}),
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

  async isHealthy(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        headers: { 'X-API-Key': this.apiKey },
        signal: AbortSignal.timeout(3000),
      })
      return res.ok
    } catch {
      return false
    }
  }

  async ask(
    query: string,
    options: {
      topK?: number
      strategy?: string
      history?: Array<{ role: string; content: string }>
      traceId?: string
      userId?: string
      userEmail?: string
    } = {}
  ): Promise<AskResponse> {
    try {
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
        userEmail: options.userEmail,
        // /ask auto-routes complex queries to the ReAct agent, so it inherits
        // the same multi-call latency profile as runAgent — same budget.
        timeoutMs: 55_000,
      })
      return toAskResponse(raw)
    } catch (error) {
      if (error instanceof BackendError && (error.status === 503 || error.status === 502)) {
        throw new BackendError(
          'The AI service is temporarily unavailable. Please try again in a moment.',
          503,
          'BACKEND_UNAVAILABLE',
          options.traceId
        )
      }
      throw error
    }
  }

  async askStream(
    query: string,
    options: {
      topK?: number
      strategy?: string
      history?: Array<{ role: string; content: string }>
      traceId?: string
      userId?: string
      userEmail?: string
    } = {}
  ): Promise<ReadableStream<Uint8Array>> {
    const url = `${this.baseUrl}/ask/stream`
    const headers: Record<string, string> = {
      'X-API-Key': this.apiKey,
      'Content-Type': 'application/json',
    }
    if (options.traceId) headers['X-Request-ID'] = options.traceId
    if (options.userId) headers['X-User-ID'] = options.userId
    if (options.userEmail) headers['X-User-Email'] = options.userEmail

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
    userId?: string,
    userEmail?: string
  ): Promise<BackendIngestResult> {
    const formData = new FormData()
    formData.append('file', file, filename)
    formData.append('metadata', JSON.stringify(metadata))

    const raw = await this.request<PythonIngestResponse>('/ingest', {
      method: 'POST',
      formData,
      traceId,
      userId,
      userEmail,
      timeoutMs: 300_000, // PDF ingestion can be slow on first run (model weight downloads)
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
      userEmail?: string
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
      userEmail: options.userEmail,
    })
    return toRetrieveResponse(raw)
  }

  async runAgent(
    query: string,
    options: {
      history?: Array<{ role: string; content: string }>
      userId?: string
      userEmail?: string
      traceId?: string
    } = {}
  ): Promise<AgentRunResponse> {
    const raw = await this.request<PythonAgentRunResponse>('/agent/run', {
      method: 'POST',
      body: JSON.stringify({
        query,
        history: options.history ?? [],
      }),
      traceId: options.traceId,
      userId: options.userId,
      userEmail: options.userEmail,
      // The ReAct agent makes up to ~9 sequential LLM calls per run. On the
      // free (Groq) tier under load these can total well past the default 30s,
      // which aborted the fetch and surfaced as a 500 even though the backend
      // was about to return a valid answer. Give it room; must stay under the
      // route's maxDuration so Vercel doesn't kill the function first.
      timeoutMs: 55_000,
    })
    return toAgentRunResponse(raw)
  }

  async health(): Promise<BackendHealthResult> {
    const raw = await this.request<PythonHealthResponse>('/health', { method: 'GET' })
    return { status: raw.status, components: raw.components }
  }

  async getMetrics(hours: number = 24): Promise<AIMetrics> {
    const raw = await this.request<PythonMetricsResponse>(`/metrics?hours=${hours}`, {
      method: 'GET',
    })
    return raw  // Python uses snake_case matching AIMetrics — no conversion needed
  }

  async listMemories(userId: string): Promise<{ memories: Memory[]; count: number }> {
    const raw = await this.request<PythonMemoriesResponse>('/memories', {
      method: 'GET',
      userId,
    })
    return {
      memories: raw.memories.map(toMemory),
      count: raw.count,
    }
  }

  async deleteMemory(memoryId: string, userId: string): Promise<void> {
    await this.request<{ deleted: boolean }>(`/memories/${encodeURIComponent(memoryId)}`, {
      method: 'DELETE',
      userId,
    })
  }

  async extractMemories(
    userId: string,
    messages: Array<{ role: string; content: string }>
  ): Promise<void> {
    await this.request<{ status: string }>('/memories/extract', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, messages }),
      userId,
    })
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
      userEmail?: string
    }
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const headers: Record<string, string> = {
      'X-API-Key': this.apiKey,
    }
    if (options.traceId) headers['X-Request-ID'] = options.traceId
    if (options.body) headers['Content-Type'] = 'application/json'
    if (options.userId) headers['X-User-ID'] = options.userId
    if (options.userEmail) headers['X-User-Email'] = options.userEmail

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
