// ============================================================
// DOMAIN — core entities, branded IDs, status types
// ============================================================
export type {
  UserId,
  DocumentId,
  QueryId,
  DocumentStatus,
  User,
  Document,
  Query,
  Message,
  Source,
  LatencyBreakdown,
  DocumentSummary,
  CreateDocumentInput,
  CreateQueryInput,
  UpdateDocumentInput,
  Memory,
} from './domain'

export {
  toUserId,
  toDocumentId,
  toQueryId,
  assertNever,
} from './domain'

// ============================================================
// API — request/response shapes, discriminated response wrapper
// ============================================================
export type {
  FieldError,
  ApiError,
  ApiResponse,
  ExtractApiData,
  PaginatedResponse,
  AskRequest,
  AskResponse,
  RetrievalQuality,
  IngestRequest,
  IngestResponse,
  DocumentListResponse,
  DocumentDetailResponse,
  UpdateDocumentRequest,
  UpdateDocumentResponse,
  QueryListRequest,
  QueryListResponse,
  RetrieveResponse,
  AIMetrics,
  AgentStep,
  AgentRunResponse,
} from './api'

export {
  isApiSuccess,
  isApiError,
} from './api'

// ============================================================
// STATE — UI async state, feature state types
// ============================================================
export type {
  AsyncState,
  ChatState,
  DocumentListState,
  DocumentDetailState,
  UploadState,
  UploadStateWithProgress,
} from './state'

export {
  isIdle,
  isLoading,
  isSuccess,
  isError,
  initialState,
  mapAsyncState,
} from './state'