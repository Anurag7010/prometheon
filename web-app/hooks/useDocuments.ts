import { useEffect, useCallback } from 'react'
import { useAsyncState } from './useAsyncState'
import { logError } from '@/lib/error-logger'
import { aiService } from '@/services/ai-service'
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
      const response = await aiService.getDocuments()
      if (response.error) throw new Error(`Failed to load documents: ${response.status}`)
      return response.data ?? []
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
      const response = await aiService.deleteDocument(id)
      if (response.error) throw new Error(`Delete failed: ${response.status}`)

      // Optimistic update — remove document from local state immediately
      await execute(async () =>
        currentDocs.filter(d => d.id !== id)
      )
    } catch (err) {
      logError(err instanceof Error ? err : new Error(String(err)))
    }
  }, [state, execute])

  return { state, refresh, deleteDocument }
}
