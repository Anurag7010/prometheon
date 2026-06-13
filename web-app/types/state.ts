import type { AskResponse, IngestResponse } from './api'
import type { Document, DocumentSummary, Message } from './domain'

// ============================================================
// GENERIC ASYNC STATE
// No boolean flags — ever.
// { loading: boolean; error: string | null; data: T | null }
// is dangerous: all three flags can be true simultaneously,
// which is an impossible state. Discriminated union makes
// impossible states unrepresentable.
// ============================================================

export type AsyncState<T> =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: T }
  | { readonly status: 'error'; readonly error: string }

// Type guards — narrow AsyncState without repeating status checks
export function isIdle<T>(state: AsyncState<T>): state is { status: 'idle' } {
  return state.status === 'idle'
}

export function isLoading<T>(state: AsyncState<T>): state is { status: 'loading' } {
  return state.status === 'loading'
}

export function isSuccess<T>(
  state: AsyncState<T>
): state is { status: 'success'; data: T } {
  return state.status === 'success'
}

export function isError<T>(
  state: AsyncState<T>
): state is { status: 'error'; error: string } {
  return state.status === 'error'
}

// Factory — always start in idle state
// Type parameter ensures the idle state is typed for T
// even though idle carries no data
export function initialState<T>(): AsyncState<T> {
  return { status: 'idle' }
}

/**
 * Transforms the data inside a success state without unwrapping.
 * Use in components that need to reshape fetched data before rendering.
 *
 * Example:
 *   const summaries = mapAsyncState(documentState, docs => docs.map(d => d.filename))
 *   // summaries is AsyncState<string[]> — no need to check .status manually
 */

export function mapAsyncState<T, U>(
  state: AsyncState<T>,
  fn: (data: T) => U
): AsyncState<U> {
  if (state.status === 'success') {
    return { status: 'success', data: fn(state.data) }
  }
  // All other states pass through unchanged — just re-typed for U
  return state as unknown as AsyncState<U>
}

// ============================================================
// FEATURE-SPECIFIC STATE TYPES
// ============================================================

// Chat — messages are append-only, queryState tracks the in-flight ask()
export type ChatState = {
  readonly messages: readonly Message[]
  readonly queryState: AsyncState<AskResponse>
}

// Document list — the full list is the data unit
export type DocumentListState = AsyncState<readonly DocumentSummary[]>

// Document detail — single document
export type DocumentDetailState = AsyncState<Document>

// Upload — basic version uses standard AsyncState
export type UploadState = AsyncState<IngestResponse>

// Upload with progress — adds uploading and processing states
// Cannot use AsyncState<T> here — the extra variants break the generic shape
// This is intentional: progress tracking is specific to file upload, not generic
export type UploadStateWithProgress =
  | { readonly status: 'idle' }
  | {
      readonly status: 'uploading'
      // 0–100 — percent of file transferred to server
      readonly progress: number
    }
  | {
      // File received by server, ingestion pipeline running
      // No progress available at this stage — just a spinner
      readonly status: 'processing'
    }
  | { readonly status: 'success'; readonly data: IngestResponse }
  | { readonly status: 'error'; readonly error: string }