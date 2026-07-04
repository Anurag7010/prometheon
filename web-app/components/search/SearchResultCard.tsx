'use client'

import { useState } from 'react'
import { cn } from '@/lib/cn'
import { relevanceTier } from '@/lib/relevance'
import { Button } from '@/components/ui'

interface SearchResult {
  content: string
  score: number | null
  metadata: Record<string, unknown>
  citationId?: number
}

interface SearchResultCardProps {
  result: SearchResult
  query: string
  index: number
  isSelected?: boolean
  onSelect?: () => void
  onAskAbout?: () => void
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="size-3">
      <path d="M14 8c0 3.314-2.686 6-6 6a6.19 6.19 0 01-2.86-.686L2 14l.936-2.186A5.981 5.981 0 012 8c0-3.314 2.686-6 6-6s6 2.686 6 6z" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="size-3">
      <rect x="5" y="5" width="9" height="9" rx="1" />
      <path d="M11 5V3a1 1 0 00-1-1H3a1 1 0 00-1 1v7a1 1 0 001 1h2" />
    </svg>
  )
}

function highlightMatches(text: string, query: string): string {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 3)
  if (!words.length) return text
  const escaped = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi')
  return text.replace(regex, '<mark class="bg-ember/20 text-parchment rounded px-0.5">$1</mark>')
}

export function SearchResultCard({
  result,
  query,
  index,
  isSelected,
  onSelect,
  onAskAbout,
}: SearchResultCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const score = result.score ?? 0
  const tier = relevanceTier(score)
  const quality =
    tier === 'high'   ? { label: 'High', colorClass: 'text-green-400', barClass: 'bg-green-500' } :
    tier === 'medium' ? { label: 'Medium', colorClass: 'text-yellow-400', barClass: 'bg-yellow-500' } :
    { label: 'Low', colorClass: 'text-ash-gray', barClass: 'bg-stone-mid/60' }

  const sourceName = result.metadata?.source as string || 'Unknown source'
  const preview = result.content.slice(0, 300)
  const hasMore = result.content.length > 300

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(result.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className={cn(
        'rounded-xl border transition-all duration-150 cursor-pointer',
        'bg-forge-dark border-stone-mid/30',
        'hover:border-stone-mid/60 hover:shadow-[0_0_0_1px_rgba(76,85,96,0.4)]',
        isSelected && 'border-ember/50 ring-1 ring-ember/20'
      )}
      onClick={onSelect}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-4 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 w-6 h-6 rounded-full bg-stone-mid/20 flex items-center justify-center text-xs font-mono text-ash-gray">
            {index + 1}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-parchment/80 truncate">{sourceName}</p>
            <p className={cn('text-xs', quality.colorClass)}>
              {quality.label} relevance · {Math.round(score * 100)}%
            </p>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          <div className="w-16 h-1.5 bg-stone-mid/30 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', quality.barClass)}
              style={{ width: `${score * 100}%` }}
            />
          </div>
          <span className="text-xs font-mono text-muted-foreground w-8 text-right">
            {score.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pb-3">
        <p
          className="text-sm text-parchment/75 leading-relaxed"
          dangerouslySetInnerHTML={{
            __html: highlightMatches(expanded ? result.content : preview, query)
          }}
        />
        {hasMore && (
          <button
            onClick={e => { e.stopPropagation(); setExpanded(!expanded) }}
            className="text-xs text-ember hover:underline mt-1"
          >
            {expanded ? 'Show less' : `+${result.content.length - 300} more chars`}
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 pb-3 flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-7 gap-1"
          onClick={e => { e.stopPropagation(); onAskAbout?.() }}
        >
          <ChatIcon />
          Ask about this
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-7 gap-1"
          onClick={handleCopy}
        >
          <CopyIcon />
          {copied ? 'Copied!' : 'Copy'}
        </Button>
      </div>
    </div>
  )
}
