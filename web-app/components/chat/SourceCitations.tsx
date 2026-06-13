'use client'

import { useState } from 'react'
import { cn } from '@/lib/cn'
import type { Source } from '@/types'

interface SourceCitationsProps {
  sources: readonly Source[]
  className?: string
}

export function SourceCitations({ sources, className }: SourceCitationsProps) {
  if (!sources || sources.length === 0) return null

  return (
    <div className={cn('mt-3 space-y-1', className)}>
      <p className="label-uppercase mb-2">Sources</p>
      <div className="space-y-1.5">
        {sources.map((source, i) => (
          <SourceCard key={i} source={source} index={i + 1} />
        ))}
      </div>
    </div>
  )
}

function SourceCard({ source, index }: { source: Source; index: number }) {
  const [expanded, setExpanded] = useState(false)

  const score = source.score ?? 0
  const quality = score >= 0.85 ? 'high' : score >= 0.7 ? 'medium' : 'low'

  const qualityColors = {
    high: 'bg-green-500/10 text-green-600 border-green-500/20',
    medium: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
    low: 'bg-muted text-muted-foreground border-border',
  }

  const qualityLabels = {
    high: 'High relevance',
    medium: 'Medium relevance',
    low: 'Low relevance',
  }

  const sourceName =
    source.metadata && typeof source.metadata === 'object' && 'source' in source.metadata
      ? String(source.metadata.source)
      : 'Document'

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-accent/50 transition-colors text-left gap-3"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-brand/10 text-brand text-xs font-mono font-semibold">
            {index}
          </span>
          <span className="text-xs text-muted-foreground truncate font-mono">{sourceName}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {source.score !== null && source.score !== undefined && (
            <span
              className={cn(
                'text-xs px-2 py-0.5 rounded-full border font-medium',
                qualityColors[quality],
              )}
            >
              {Math.round(score * 100)}%
            </span>
          )}
          <svg
            viewBox="0 0 16 16"
            className={cn(
              'size-3.5 text-muted-foreground transition-transform duration-200 fill-current',
              expanded && 'rotate-180',
            )}
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" fill="none" strokeWidth="1.5" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-border">
          <p className="text-xs text-muted-foreground leading-relaxed mt-2 line-clamp-6">
            {source.content}
          </p>
          {source.score !== null && source.score !== undefined && (
            <p className="text-xs text-muted-foreground/60 mt-1.5">
              {qualityLabels[quality]} · Score: {score.toFixed(3)}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
