import { useEffect, useCallback } from 'react'
import { useAsyncState } from './useAsyncState'
import { logError } from '@/lib/error-logger'
import type { DocumentSummary, DocumentId } from '../types'
import type { AsyncState } from '../types'

export function useDocuments(): {
  state: AsyncState<readonly DocumentSummary[]>
  refresh: () => Promise<void>
  deleteDocument: (id: DocumentId) => Promise<void>
} {
  const { state, execute } = useAsyncState<readonly DocumentSummary[]>()

  const refresh = useCallback(async () => {
    await execute(async () => {
      const res = await fetch('/api/documents', {
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) throw new Error(`Failed to load documents: ${res.status}`)
      const json = await res.json()
      return json.data as readonly DocumentSummary[]
    })
  }, [execute])

  // Fetch on mount — user sees document list immediately on page load
  useEffect(() => {
    refresh()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const deleteDocument = useCallback(async (id: DocumentId) => {
    // Guard — if we don't have a successful list yet, nothing to optimistically update
    if (state.status !== 'success') return

    // Capture current list before the async delete call
    const currentDocs = state.data

    try {
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`)

      // Optimistic update — remove document from local state immediately
      // instead of calling refresh(). This avoids a full round-trip fetch
      // and makes the UI feel instant. The document list stays in sync because
      // we know exactly what changed: one document was removed.
      // If the delete had failed we would not reach this line.
      await execute(async () =>
        currentDocs.filter(d => d.id !== id)
      )
    } catch (err) {
      // Delete errors are not surfaced in the document list state.
      // The list state represents "what documents exist" — a failed delete
      // means the document still exists, so the list is still correct.
      // Surfacing the error in list state would replace the document list
      // with an error screen, which is wrong — the list is fine.
      logError(err instanceof Error ? err : new Error(String(err)))
    }
  }, [state, execute])

  return { state, refresh, deleteDocument }
}