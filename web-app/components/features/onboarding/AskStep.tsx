'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/cn'
import { useRouter } from 'next/navigation'
import { getAccessToken } from '@/hooks'

const SUGGESTED = [
  'What is this document about?',
  'Summarize the key points',
  'What are the main conclusions?',
]

interface AskStepProps {
  documentId: string
  documentName: string
  onBack: () => void
  onComplete: () => void
}

export function AskStep({ documentId, documentName, onBack, onComplete }: AskStepProps) {
  const router = useRouter()
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [sources, setSources] = useState<{ filename: string; citation_id: number }[]>([])
  const [loading, setLoading] = useState(false)
  const [asked, setAsked] = useState(false)

  async function ask(q: string) {
    if (!q.trim()) return
    setLoading(true)
    setAsked(true)
    setQuestion(q)
    setAnswer('')
    setSources([])

    try {
      const token = getAccessToken()
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ query: q, document_id: documentId }),
      })
      const data = await res.json()
      setAnswer(data.answer ?? 'No answer returned.')
      setSources(data.sources ?? [])
    } catch {
      setAnswer('Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-12">
      {/* Progress dots */}
      <div className="mb-10 flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className={cn('h-1.5 rounded-full transition-all duration-300', i === 2 ? 'w-6 bg-brand-500' : 'w-1.5 bg-brand-300 dark:bg-brand-700')} />
        ))}
      </div>

      <div className="w-full max-w-lg">
        <div className="text-center mb-8 animate-in">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Step 3 of 3</p>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Ask your first question</h2>

          {/* Document chip */}
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1">
            <svg className="size-3 text-muted-foreground" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path d="M7 1H3a1 1 0 00-1 1v8a1 1 0 001 1h6a1 1 0 001-1V4L7 1z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-xs text-muted-foreground truncate max-w-48">{documentName}</span>
          </div>
        </div>

        {!asked ? (
          <>
            {/* Suggested questions */}
            <div className="space-y-2 mb-6">
              {SUGGESTED.map((q) => (
                <button
                  key={q}
                  onClick={() => ask(q)}
                  className={cn(
                    'w-full flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3.5',
                    'text-sm text-left text-foreground',
                    'transition-all duration-150 hover:border-brand-300 hover:bg-brand-50/50 dark:hover:bg-brand-500/5',
                    'group',
                  )}
                >
                  <span>{q}</span>
                  <svg className="size-4 text-muted-foreground group-hover:text-brand-500 transition-colors shrink-0 ml-2" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8h10M9 4l4 4-4 4" />
                  </svg>
                </button>
              ))}
            </div>

            <div className="relative">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && ask(question)}
                placeholder="Or type your own question..."
                className={cn(
                  'w-full rounded-xl border border-input bg-background px-4 py-3 pr-12',
                  'text-sm text-foreground placeholder:text-muted-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-0 focus:border-brand-500',
                  'transition-colors duration-100',
                )}
                autoFocus
              />
              <button
                onClick={() => ask(question)}
                disabled={!question.trim()}
                aria-label="Ask question"
                className="absolute right-2 top-1/2 -translate-y-1/2 flex size-8 items-center justify-center rounded-lg bg-brand-500 text-white disabled:opacity-40 hover:bg-brand-600 transition-colors"
              >
                <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 8h10M9 4l4 4-4 4" />
                </svg>
              </button>
            </div>
          </>
        ) : (
          /* Answer state */
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">You asked</p>
              <p className="text-sm text-foreground">{question}</p>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 min-h-24">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner size="sm" className="text-brand-500" />
                  Thinking...
                </div>
              ) : (
                <>
                  <p className="text-sm text-foreground leading-relaxed">{answer}</p>
                  {sources.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {sources.map((s, i) => (
                        <span key={i} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          <svg className="size-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M7 1H3a1 1 0 00-1 1v8a1 1 0 001 1h6a1 1 0 001-1V4L7 1z" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          {s.filename} §{s.citation_id}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {!loading && (
              <button
                onClick={() => { setAsked(false); setQuestion(''); setAnswer('') }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
              >
                Ask another question
              </button>
            )}
          </div>
        )}

        {!loading && (
          <div className="mt-8 flex justify-center">
            <Button
              variant="brand"
              size="lg"
              onClick={() => {
                onComplete()
                router.push('/dashboard')
              }}
              rightIcon={
                <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 8h10M9 4l4 4-4 4" />
                </svg>
              }
            >
              Go to dashboard
            </Button>
          </div>
        )}
      </div>

      <div className="mt-6">
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
