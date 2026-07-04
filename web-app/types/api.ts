import type {
  DocumentId,
  DocumentStatus,
  DocumentSummary,
  Document,
  Query,
  Message,
  Source,
  LatencyBreakdown,
  UpdateDocumentInput,
} from './domain'

// ============================================================
// NORMALIZED ERROR SHAPE
// Every error from every endpoint looks the same.
// Frontend error handling code written once, works everywhere.
// ============================================================

export type FieldError = {
  readonly field: string
  readonly message: string
}

export type ApiError = {
  readonly code: string
  readonly message: string
  // Optional — only present on validation errors (422)
  readonly fields?: readonly FieldError[]
  readonly requestId: string
  readonly timestamp: string
}

// ============================================================
// DISCRIMINATED UNION RESPONSE WRAPPER
// NOT { data?: T; error?: ApiError } — that shape is dangerous.
// With optional fields, TypeScript cannot guarantee that on the
// success branch data exists, or on the error branch error exists.
// The discriminated union makes each branch airtight.
// ============================================================

export type ApiResponse<T> =
  | { readonly status: 'success'; readonly data: T }
  | { readonly status: 'error'; readonly error: ApiError }

// Type guards — use these instead of checking status === 'success' manually
// Keeps narrowing logic in one place
export function isApiSuccess<T>(
  response: ApiResponse<T>
): response is { readonly status: 'success'; readonly data: T } {
  return response.status === 'success'
}

export function isApiError<T>(
  response: ApiResponse<T>
): response is { readonly status: 'error'; readonly error: ApiError } {
  return response.status === 'error'
}

// Conditional type — extracts T from ApiResponse<T> on the success branch
// Usage: ExtractApiData<ApiResponse<AskResponse>> → AskResponse
// Useful when you need the inner type without unwrapping manually
export type ExtractApiData<R> = R extends { status: 'success'; data: infer T }
  ? T
  : never

// Generic paginated wrapper — for list endpoints that grow large
export type PaginatedResponse<T> = {
  readonly items: readonly T[]
  readonly total: number
  readonly page: number
  readonly pageSize: number
}

// ============================================================
// ENDPOINT REQUEST + RESPONSE TYPES
// ============================================================

// --- POST /api/ask ---

export type AskRequest = {
  readonly query: string
  readonly topK?: number
  // readonly array — history is passed in, not mutated
  readonly history?: readonly Message[]
  readonly signal?: AbortSignal 
}

export type RetrievalQuality = {
  readonly quality: 'good' | 'fair' | 'poor' | 'no_results'
  readonly maxScore: number
  readonly avgScore: number
  readonly chunkCount: number
}

export type AskResponse = {
  readonly answer: string
  readonly sources: readonly Source[]
  readonly traceId: string
  readonly latencyBreakdown: LatencyBreakdown
  readonly guardrailRejected: boolean
  readonly noResults: boolean
  readonly retrievalQuality: RetrievalQuality
  readonly routedTo?: 'rag' | 'agent'
}

// --- POST /api/documents (ingest) ---

// In practice this is sent as FormData — File cannot be JSON serialized.
// This type represents the logical shape of the request.
// The actual HTTP request uses FormData with a 'file' field.
// BaseService handles FormData detection and skips JSON.stringify.
export type IngestRequest = {
  readonly file: File
}

export type IngestResponse = {
  // Branded — so caller cannot accidentally pass a plain string as a DocumentId
  readonly documentId: DocumentId
  readonly status: DocumentStatus
  readonly chunkCount: number
}

// --- GET /api/documents ---

// No request type — GET with no body, userId from auth context

export type DocumentListResponse = readonly DocumentSummary[]

// --- GET /api/documents/[id] ---

export type DocumentDetailResponse = Document

// --- PATCH /api/documents/[id] ---

export type UpdateDocumentRequest = UpdateDocumentInput

export type UpdateDocumentResponse = Document

// --- DELETE /api/documents/[id] ---
// No request body, no response body — 204 No Content

// --- GET /api/retrieve ---

export type RetrieveResponse = {
  readonly chunks: readonly Source[]
  readonly traceId: string
}

// --- GET /api/queries ---

export type QueryListRequest = {
  // Optional filter — if present, returns queries for that document only
  readonly documentId?: DocumentId
}

export type QueryListResponse = readonly Query[]

// --- GET /api/dashboard/stats (AI metrics from Python backend) ---

export interface AIMetrics {
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
  token_breakdown: {
    input: number
    output: number
  }
}

// ============================================================
// AGENT TYPES
// ============================================================

export type AgentStep = {
  readonly stepNumber: number
  readonly action: string | null
  readonly actionInput: Record<string, unknown> | null
  readonly observation: string | null
  readonly isFinal: boolean
  readonly finalAnswer: string | null
}

export type AgentRunResponse = {
  readonly answer: string
  readonly steps: readonly AgentStep[]
  readonly totalSteps: number
  readonly stoppedReason: 'final_answer' | 'max_iterations' | 'error'
  readonly traceId: string
  readonly routedTo: 'agent'
}