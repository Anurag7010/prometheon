'use client'

import { useState, useCallback, useRef } from 'react'
import { getAccessToken } from '@/hooks/useAuth'

interface SearchResult {
  content: string
  score: number | null
  metadata: Record<string, unknown>
  citationId?: number
}

interface SearchResponse {
  query: string
  results: SearchResult[]
  count: number
  strategy: string
}

interface SearchHistoryItem {
  id: string
  query: string
  resultCount: number
  createdAt: string
}

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: SearchResponse }
  | { status: 'error'; error: string }

export function useSearch() {
  const [state, setState] = useState<SearchState>({ status: 'idle' })
  const [history, setHistory] = useState<SearchHistoryItem[]>([])
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/search/history', {
        headers: { 'Authorization': `Bearer ${getAccessToken()}` },
      })
      if (res.ok) {
        const data = await res.json() as { history: SearchHistoryItem[] }
        setHistory(data.history ?? [])
      }
    } catch {/* non-fatal */}
  }, [])

  const search = useCallback(async (
    query: string,
    options: { topK?: number; strategy?: string; documentId?: string } = {}
  ) => {
    if (!query.trim()) return

    abortRef.current?.abort()
    abortRef.current = new AbortController()

    setState({ status: 'loading' })
    setSelectedResult(null)

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify({ query, ...options }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setState({ status: 'error', error: (err as { message?: string }).message ?? 'Search failed' })
        return
      }

      const data = await res.json() as SearchResponse
      setState({ status: 'success', data })
      loadHistory()
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setState({ status: 'error', error: 'Search failed' })
    }
  }, [loadHistory])

  const clearHistory = useCallback(async () => {
    await fetch('/api/search/history', {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${getAccessToken()}` },
    })
    setHistory([])
  }, [])

  const reset = useCallback(() => {
    setState({ status: 'idle' })
    setSelectedResult(null)
  }, [])

  return {
    state,
    history,
    selectedResult,
    setSelectedResult,
    search,
    loadHistory,
    clearHistory,
    reset,
  }
}
