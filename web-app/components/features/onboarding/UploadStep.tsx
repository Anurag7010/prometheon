'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/cn'
import { INGESTION_POLL_INTERVAL_MS } from '@/lib/constants'

type UploadStatus = 'idle' | 'uploading' | 'processing' | 'ready' | 'error'

interface UploadStepProps {
  onComplete: (documentId: string, documentName: string) => void
  onSkip: () => void
  onBack: () => void
}

export function UploadStep({ onComplete, onSkip, onBack }: UploadStepProps) {
  const [status, setStatus] = useState<UploadStatus>('idle')
  const [filename, setFilename] = useState('')
  const [error, setError] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (!file.name.endsWith('.pdf')) {
      setError('Only PDF files are supported.')
      return
    }
    setFilename(file.name)
    setStatus('uploading')
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/documents', { method: 'POST', body: formData })
      if (!res.ok) throw new Error('Upload failed')

      const { id } = await res.json()
      setStatus('processing')

      // Poll until ingested
      let attempts = 0
      const poll = async (): Promise<void> => {
        attempts++
        if (attempts > 30) {
          setStatus('error')
          setError('Processing timed out. Try again.')
          return
        }
        const r = await fetch(`/api/documents/${id}`)
        if (r.ok) {
          const doc = await r.json()
          if (doc.status === 'ingested') {
            setStatus('ready')
            setTimeout(() => onComplete(id, file.name), 800)
            return
          }
          if (doc.status === 'failed') {
            setStatus('error')
            setError('Processing failed. Please try another file.')
            return
          }
        }
        await new Promise((r) => setTimeout(r, INGESTION_POLL_INTERVAL_MS))
        await poll()
      }
      await poll()
    } catch {
      setStatus('error')
      setError('Upload failed. Please try again.')
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const statusConfig: Record<Exclude<UploadStatus, 'idle'>, { label: string; color: string }> = {
    uploading:  { label: 'Uploading...', color: 'text-muted-foreground' },
    processing: { label: 'Processing chunks...', color: 'text-brand-500' },
    ready:      { label: 'Ready', color: 'text-green-600 dark:text-green-400' },
    error:      { label: error, color: 'text-destructive' },
  }

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-12">
      {/* Progress dots */}
      <div className="mb-10 flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className={cn('h-1.5 rounded-full transition-all duration-300', i === 1 ? 'w-6 bg-brand-500' : 'w-1.5 bg-border')} />
        ))}
      </div>

      <div className="w-full max-w-lg">
        <div className="text-center mb-8 animate-in">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Step 2 of 3</p>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Upload a document</h2>
          <p className="mt-2 text-sm text-muted-foreground">Drop a PDF to get started. We&apos;ll chunk and index it for you.</p>
        </div>

        {status === 'idle' ? (
          <>
            {/* Upload zone */}
            <div
              className={cn(
                'relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed',
                'py-16 px-8 text-center cursor-pointer',
                'transition-all duration-150',
                isDragging
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/5'
                  : 'border-border hover:border-brand-300 hover:bg-muted/40',
              )}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              role="button"
              tabIndex={0}
              aria-label="Upload PDF"
              onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
            >
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              <div className={cn(
                'mb-4 flex size-12 items-center justify-center rounded-xl transition-colors duration-150',
                isDragging ? 'bg-brand-100 text-brand-500' : 'bg-muted text-muted-foreground',
              )}>
                <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" />
                  <path d="M14 2v6h6M12 18v-6M9 15l3-3 3 3" />
                </svg>
              </div>
              <p className="text-sm font-medium text-foreground">
                {isDragging ? 'Drop to upload' : 'Drop your PDF here'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">or click to browse — PDF, up to 50MB</p>
            </div>

            <div className="mt-4 text-center">
              <button
                onClick={onSkip}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
              >
                Skip for now
              </button>
            </div>
          </>
        ) : (
          /* Ingestion progress */
          <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <svg className="size-5 text-muted-foreground" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path d="M12 2H6a1 1 0 00-1 1v14a1 1 0 001 1h8a1 1 0 001-1V6l-4-4z" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M12 2v4h4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{filename}</p>
                <p className={cn('text-xs mt-0.5', statusConfig[status as Exclude<UploadStatus, 'idle'>].color)}>
                  {statusConfig[status as Exclude<UploadStatus, 'idle'>].label}
                </p>
              </div>
              {status === 'processing' && <Spinner size="sm" className="text-brand-500" />}
              {status === 'ready' && (
                <svg className="size-5 text-green-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              )}
            </div>

            {/* Progress steps */}
            <div className="space-y-2">
              {(['uploading', 'processing', 'ready'] as const).map((step, i) => {
                const statuses: UploadStatus[] = ['uploading', 'processing', 'ready']
                const currentIdx = statuses.indexOf(status as UploadStatus)
                const stepIdx = statuses.indexOf(step)
                const done = stepIdx < currentIdx || status === 'ready'
                const active = step === status

                return (
                  <div key={step} className="flex items-center gap-2.5">
                    <div className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                      done ? 'bg-green-500 text-white'
                        : active ? 'bg-brand-500 text-white'
                        : 'bg-muted text-muted-foreground',
                    )}>
                      {done ? (
                        <svg className="size-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        i + 1
                      )}
                    </div>
                    <span className={cn('text-xs', active ? 'text-foreground font-medium' : done ? 'text-muted-foreground line-through' : 'text-muted-foreground')}>
                      {step === 'uploading' ? 'Uploading file' : step === 'processing' ? 'Processing chunks' : 'Ready to query'}
                    </span>
                  </div>
                )
              })}
            </div>

            {status === 'error' && (
              <Button variant="outline" size="sm" onClick={() => { setStatus('idle'); setError('') }}>
                Try again
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="mt-8 flex items-center gap-4">
        <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
          <svg className="size-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6H3M5 3L2 6l3 3" />
          </svg>
          Back
        </button>
      </div>
    </div>
  )
}
