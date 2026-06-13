'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useDocuments } from '@/hooks/useDocuments'
import { useUpload } from '@/hooks/useUpload'
import { useAbortController } from '@/hooks/useAbortController'
import { DocumentCard } from '@/components/ui/DocumentCard'
import { InlineError } from '@/components/ui/InlineError'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/cn'
import type { DocumentId } from '@/types'
import { useRouter } from 'next/navigation'

function EmptyDocuments({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <svg className="size-7" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 3H7a2 2 0 00-2 2v18a2 2 0 002 2h14a2 2 0 002-2V8l-6-5z" />
          <path d="M17 3v5h5" />
          <line x1="14" y1="13" x2="14" y2="19" />
          <line x1="11" y1="16" x2="17" y2="16" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-foreground">No documents yet</p>
      <p className="mt-1 text-sm text-muted-foreground max-w-xs">
        Upload a PDF to start asking questions and getting answers with citations.
      </p>
      <button
        onClick={onUpload}
        className="mt-4 flex items-center gap-1.5 rounded-full bg-ember px-4 py-2 text-sm font-medium text-parchment hover:shadow-[0_0_16px_rgba(212,87,42,0.3)] transition-all duration-200"
      >
        <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 2v8M4 6l4-4 4 4" />
          <path d="M2 13h12" />
        </svg>
        Upload your first PDF
      </button>
    </div>
  )
}

interface QueuedFile {
  id: string
  file: File
  status: 'pending' | 'uploading' | 'done' | 'error'
  error?: string
}

export function DocumentManager(): React.ReactElement {
  const router = useRouter()
  const { state: docState, refresh, deleteDocument } = useDocuments()
  const { upload } = useUpload()
  const { signal, reset: resetSignal } = useAbortController()
  const fileRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [queue, setQueue] = useState<QueuedFile[]>([])

  // Refresh after any successful upload in queue
  useEffect(() => {
    const hasDone = queue.some((f) => f.status === 'done')
    if (hasDone) refresh()
  }, [queue, refresh])

  // Poll for pending/processing docs
  useEffect(() => {
    if (docState.status !== 'success') return
    const hasPending = docState.data.some((d) => d.status === 'pending')
    if (!hasPending) return
    const t = setTimeout(() => refresh(), 3000)
    return () => clearTimeout(t)
  }, [docState, refresh])

  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.name.endsWith('.pdf'))
    if (!arr.length) return

    const newQueue: QueuedFile[] = arr.map((f) => ({
      id: `${f.name}-${f.size}-${Date.now()}`,
      file: f,
      status: 'pending',
    }))
    setQueue((q) => [...q, ...newQueue])

    for (const item of newQueue) {
      setQueue((q) => q.map((x) => x.id === item.id ? { ...x, status: 'uploading' } : x))
      resetSignal()
      await upload(item.file, signal)
      setQueue((q) => q.map((x) =>
        x.id === item.id ? { ...x, status: 'done' } : x
      ))
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  async function handleDelete(id: DocumentId) {
    await deleteDocument(id)
  }

  const pendingIds = docState.status === 'success'
    ? new Set(docState.data.filter((d) => d.status === 'pending').map((d) => d.id))
    : new Set<string>()

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Upload zone */}
      <div
        className={cn(
          'relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-8 px-6 text-center cursor-pointer',
          'transition-all duration-150',
          isDragging
            ? 'border-brand-400 bg-brand-50 dark:bg-brand-500/5'
            : 'border-border hover:border-brand-300 hover:bg-muted/30',
        )}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload PDF documents"
        onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        <div className={cn(
          'mb-3 flex size-10 items-center justify-center rounded-lg transition-colors',
          isDragging ? 'bg-brand-100 text-brand-500' : 'bg-muted text-muted-foreground',
        )}>
          <svg className="size-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 3v10M6 7l4-4 4 4" />
            <path d="M3 15h14" />
          </svg>
        </div>
        <p className="text-sm font-medium text-foreground">
          {isDragging ? 'Drop to upload' : 'Drop PDFs here or click to browse'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Multiple files supported, up to 50MB each</p>
      </div>

      {/* Upload queue */}
      {queue.length > 0 && (
        <div className="space-y-2">
          {queue.map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">
                <svg className="size-4 text-muted-foreground" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6l-4-4z" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M9 2v4h4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span className="flex-1 text-sm text-foreground truncate">{item.file.name}</span>
              {item.status === 'uploading' && <Spinner size="sm" className="text-brand-500" />}
              {item.status === 'done' && (
                <svg className="size-4 text-success-500 shrink-0" viewBox="0 0 16 16" fill="currentColor">
                  <path fillRule="evenodd" d="M8 16A8 8 0 108 0a8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L7 8.586 5.707 7.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              )}
              {item.status === 'error' && (
                <svg className="size-4 text-destructive shrink-0" viewBox="0 0 16 16" fill="currentColor">
                  <path fillRule="evenodd" d="M8 16A8 8 0 108 0a8 8 0 000 16zm-1-5h2V5H7v6zm0 2h2v-2H7v2z" clipRule="evenodd" />
                </svg>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Document list header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Documents</h2>
        <button
          onClick={refresh}
          aria-label="Refresh document list"
          className="flex items-center justify-center size-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 8A6 6 0 112.1 5.5" />
            <path d="M2 2v4h4" />
          </svg>
        </button>
      </div>

      {/* Document grid */}
      {docState.status === 'loading' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-36 rounded-xl border border-border shimmer" aria-hidden="true" />
          ))}
        </div>
      )}

      {docState.status === 'error' && (
        <InlineError
          title="Failed to load documents"
          message={docState.error}
          onRetry={refresh}
        />
      )}

      {docState.status === 'success' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {docState.data.length === 0 ? (
            <EmptyDocuments onUpload={() => fileRef.current?.click()} />
          ) : (
            docState.data.map((doc) => (
              <DocumentCard
                key={doc.id}
                document={doc}
                onDelete={handleDelete}
                onAsk={(id) => router.push(`/chat?documentId=${id}`)}
                isPolling={pendingIds.has(doc.id)}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}
