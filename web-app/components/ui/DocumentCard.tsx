'use client'

import React from 'react'
import { cn } from '@/lib/cn'
import type { DocumentSummary, DocumentId, DocumentStatus } from '@/types'

const statusConfig: Record<DocumentStatus, { label: string; className: string; dotClass: string }> = {
  pending:  {
    label: 'Pending',
    className: 'bg-warning-50 text-warning-700 ring-warning-200 dark:bg-warning-900/15 dark:text-warning-400 dark:ring-warning-800',
    dotClass: 'bg-warning-500 animate-pulse',
  },
  ingested: {
    label: 'Ready',
    className: 'bg-success-50 text-success-700 ring-success-200 dark:bg-success-900/15 dark:text-success-400 dark:ring-success-800',
    dotClass: 'bg-success-500',
  },
  failed: {
    label: 'Failed',
    className: 'bg-error-50 text-error-700 ring-error-200 dark:bg-error-900/15 dark:text-error-400 dark:ring-error-800',
    dotClass: 'bg-error-500',
  },
}

function formatRelativeTime(date: Date | string): string {
  const diffMs = Date.now() - new Date(date).getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

interface DocumentCardProps {
  document: DocumentSummary
  onDelete?: (id: DocumentId) => void
  onAsk?: (id: DocumentId) => void
  isPolling?: boolean
}

export function DocumentCard({ document: doc, onDelete, onAsk, isPolling }: DocumentCardProps) {
  const status = statusConfig[doc.status]
  const isFailed = doc.status === 'failed'

  return (
    <div
      className={cn(
        'group relative flex flex-col rounded-xl border bg-card p-4',
        'transition-shadow duration-200 hover:shadow-md',
        isFailed
          ? 'border-error-200 dark:border-error-900'
          : 'border-border',
        isPolling && 'overflow-hidden',
      )}
    >
      {/* Polling shimmer bar */}
      {isPolling && (
        <div
          className="absolute inset-x-0 top-0 h-0.5 shimmer rounded-t-xl"
          aria-hidden="true"
        />
      )}

      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-lg',
          isFailed ? 'bg-error-50 text-error-500 dark:bg-error-900/20' : 'bg-muted text-muted-foreground',
        )}>
          <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6l-4-4z" />
            <path d="M9 2v4h4" />
            <line x1="5" y1="9" x2="11" y2="9" />
            <line x1="5" y1="11.5" x2="8.5" y2="11.5" />
          </svg>
        </div>

        {/* Status badge */}
        <span className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset shrink-0',
          status.className,
        )}>
          <span className={cn('size-1.5 rounded-full', status.dotClass)} aria-hidden="true" />
          {status.label}
        </span>
      </div>

      {/* Filename */}
      <p className="text-sm font-medium text-foreground truncate leading-tight">{doc.filename}</p>

      {/* Metadata */}
      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        {doc.chunkCount > 0 && (
          <>
            <span>{doc.chunkCount} chunks</span>
            <span aria-hidden="true">·</span>
          </>
        )}
        <span>{formatRelativeTime(doc.createdAt)}</span>
      </div>

      {/* Divider */}
      <div className="mt-3 border-t border-border" aria-hidden="true" />

      {/* Actions */}
      <div className="mt-3 flex items-center gap-2">
        {onAsk && doc.status === 'ingested' && (
          <button
            onClick={() => onAsk(doc.id)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-colors"
          >
            Ask
            <svg className="size-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 6h8M6 2l4 4-4 4" />
            </svg>
          </button>
        )}

        <div className="ml-auto">
          {onDelete && (
            <button
              onClick={() => onDelete(doc.id)}
              aria-label={`Delete ${doc.filename}`}
              className="flex items-center justify-center size-6 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
            >
              <svg className="size-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1,3 13,3" />
                <path d="M12 3l-1 10H3L2 3" />
                <path d="M5 3V1h4v2" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
