'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSearch } from '@/hooks/useSearch'
import { SearchResultCard } from '@/components/search/SearchResultCard'
import { Button, Spinner, EmptyState } from '@/components/ui'
import { cn } from '@/lib/cn'

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="M17 17l-4-4" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5v3l2 2" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="size-4">
      <path d="M12 4L4 12M4 4l8 8" />
    </svg>
  )
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
      <path d="M14 8c0 3.314-2.686 6-6 6a6.19 6.19 0 01-2.86-.686L2 14l.936-2.186A5.981 5.981 0 012 8c0-3.314 2.686-6 6-6s6 2.686 6 6z" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
      <rect x="5" y="5" width="9" height="9" rx="1" />
      <path d="M11 5V3a1 1 0 00-1-1H3a1 1 0 00-1 1v7a1 1 0 001 1h2" />
    </svg>
  )
}

export default function SearchPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialQuery = searchParams.get('q') ?? ''

  const [query, setQuery] = useState(initialQuery)
  const [strategy, setStrategy] = useState<'semantic' | 'hybrid' | 'multi_query'>('semantic')
  const [topK, setTopK] = useState(10)
  const inputRef = useRef<HTMLInputElement>(null)

  const {
    state,
    history,
    selectedResult,
    setSelectedResult,
    search,
    loadHistory,
    clearHistory,
    reset,
  } = useSearch()

  useEffect(() => {
    loadHistory()
    inputRef.current?.focus()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (initialQuery) search(initialQuery, { strategy, topK })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    const params = new URLSearchParams({ q: query })
    router.replace(`/search?${params}`, { scroll: false })
    search(query, { strategy, topK })
  }

  function handleAskAbout(result: { content: string; metadata: Record<string, unknown> }) {
    router.push(`/chat?context=${encodeURIComponent(result.content.slice(0, 200))}`)
  }

  const results = state.status === 'success' ? state.data.results : []

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <h1 className="text-lg font-semibold mb-3">Document Search</h1>
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none">
                <SearchIcon />
              </span>
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search across all your documents..."
                className={cn(
                  'w-full pl-9 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm',
                  'focus:outline-none focus:ring-2 focus:ring-ember focus:border-ember',
                  'transition-all duration-150'
                )}
              />
            </div>
            <select
              value={strategy}
              onChange={e => setStrategy(e.target.value as typeof strategy)}
              className={cn(
                'px-3 py-2 rounded-lg border border-input bg-background text-sm',
                'focus:outline-none focus:ring-2 focus:ring-ember text-muted-foreground'
              )}
            >
              <option value="semantic">Semantic</option>
              <option value="hybrid">Hybrid</option>
              <option value="multi_query">Multi-query</option>
            </select>
            <select
              value={topK}
              onChange={e => setTopK(Number(e.target.value))}
              className={cn(
                'px-3 py-2 rounded-lg border border-input bg-background text-sm',
                'focus:outline-none focus:ring-2 focus:ring-ember text-muted-foreground'
              )}
            >
              <option value={5}>Top 5</option>
              <option value={10}>Top 10</option>
              <option value={20}>Top 20</option>
            </select>
            <Button type="submit" disabled={!query.trim() || state.status === 'loading'}>
              {state.status === 'loading' ? <Spinner size="sm" /> : 'Search'}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground mt-2">
            {strategy === 'semantic' && 'Finds chunks by meaning similarity'}
            {strategy === 'hybrid' && 'Combines semantic + keyword matching'}
            {strategy === 'multi_query' && 'Generates query variants for better recall'}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Left: results list */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-6 py-4">
            {/* History (idle state) */}
            {state.status === 'idle' && history.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Recent searches</p>
                  <button
                    onClick={clearHistory}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Clear history
                  </button>
                </div>
                <div className="space-y-1">
                  {history.map(item => (
                    <button
                      key={item.id}
                      onClick={() => { setQuery(item.query); search(item.query, { strategy, topK }) }}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-accent transition-colors text-left"
                    >
                      <div className="flex items-center gap-2">
                        <ClockIcon />
                        <span className="text-sm text-foreground truncate">{item.query}</span>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{item.resultCount} results</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Loading skeletons */}
            {state.status === 'loading' && (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-32 rounded-xl bg-muted/50 animate-pulse" />
                ))}
              </div>
            )}

            {/* No results */}
            {state.status === 'success' && results.length === 0 && (
              <EmptyState
                title="No results found"
                description={`No document chunks matched "${state.data.query}". Try different keywords or a different search strategy.`}
                action={{ label: 'Clear search', onClick: () => { setQuery(''); reset() } }}
              />
            )}

            {/* Results */}
            {state.status === 'success' && results.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-medium">
                      {results.length} results for{' '}
                      <span className="text-ember">&quot;{state.data.query}&quot;</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Strategy: {state.data.strategy} · Sorted by relevance
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">By relevance ↓</p>
                </div>

                {/* Score distribution */}
                <div className="mb-4 p-3 rounded-lg bg-muted/50 border border-border">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Score distribution</p>
                  <div className="flex items-end gap-1 h-8">
                    {results.map((r, i) => (
                      <div
                        key={i}
                        className={cn(
                          'flex-1 rounded-sm transition-all cursor-pointer',
                          (r.score ?? 0) >= 0.85 ? 'bg-green-500' :
                          (r.score ?? 0) >= 0.7 ? 'bg-yellow-500' : 'bg-muted-foreground/40',
                          selectedResult === r && 'ring-1 ring-ember'
                        )}
                        style={{ height: `${(r.score ?? 0) * 100}%` }}
                        onClick={() => setSelectedResult(r)}
                        title={`Result ${i + 1}: ${r.score?.toFixed(3)}`}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-xs text-muted-foreground">Result 1</span>
                    <span className="text-xs text-muted-foreground">Result {results.length}</span>
                  </div>
                </div>

                {/* Result cards */}
                <div className="space-y-3">
                  {results.map((result, i) => (
                    <SearchResultCard
                      key={i}
                      result={result}
                      query={state.data.query}
                      index={i}
                      isSelected={selectedResult === result}
                      onSelect={() => setSelectedResult(selectedResult === result ? null : result)}
                      onAskAbout={() => handleAskAbout(result)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Error */}
            {state.status === 'error' && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600">
                {state.error}
              </div>
            )}
          </div>
        </div>

        {/* Right: detail panel */}
        {selectedResult && (
          <div className="w-80 shrink-0 border-l border-border overflow-y-auto hidden lg:block">
            <div className="p-4 sticky top-0 bg-background border-b border-border flex items-center justify-between">
              <p className="text-sm font-medium">Chunk Detail</p>
              <button
                onClick={() => setSelectedResult(null)}
                className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground"
              >
                <XIcon />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* Score */}
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5">Relevance Score</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        (selectedResult.score ?? 0) >= 0.85 ? 'bg-green-500' :
                        (selectedResult.score ?? 0) >= 0.7 ? 'bg-yellow-500' : 'bg-muted-foreground'
                      )}
                      style={{ width: `${(selectedResult.score ?? 0) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-mono font-semibold">
                    {(selectedResult.score ?? 0).toFixed(4)}
                  </span>
                </div>
              </div>

              {/* Source */}
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5">Source</p>
                <p className="text-sm font-mono text-foreground bg-muted px-2.5 py-1.5 rounded">
                  {selectedResult.metadata?.source as string || 'Unknown'}
                </p>
              </div>

              {/* Metadata */}
              {Object.keys(selectedResult.metadata).length > 0 && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5">Metadata</p>
                  <div className="space-y-1">
                    {Object.entries(selectedResult.metadata).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs">
                        <span className="text-muted-foreground font-mono">{k}</span>
                        <span className="text-foreground font-mono truncate max-w-[120px]">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Full content */}
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5">Full Content</p>
                <div className="text-xs text-foreground/80 leading-relaxed bg-muted/50 rounded-lg p-3 max-h-60 overflow-y-auto font-mono whitespace-pre-wrap">
                  {selectedResult.content}
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2">
                <Button
                  variant="default"
                  size="sm"
                  className="w-full gap-1.5"
                  onClick={() => handleAskAbout(selectedResult)}
                >
                  <ChatIcon />
                  Ask about this chunk
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5"
                  onClick={() => navigator.clipboard.writeText(selectedResult.content)}
                >
                  <CopyIcon />
                  Copy content
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
