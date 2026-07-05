'use client'

import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useAgent } from '@/hooks'
import { AgentStepCard } from '@/components/agent/AgentStepCard'
import { ChatInput } from '@/components/chat/ChatInput'
import { Spinner } from '@/components/ui'
import { cn } from '@/lib/cn'

const TOOL_BADGES = [
  {
    label: 'Search docs',
    template: 'Search my documents for ',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" className="h-3 w-3" style={{ color: '#D4572A' }}>
        <circle cx="6.5" cy="6.5" r="4.5" /><path d="M13 13l-3-3" />
      </svg>
    ),
  },
  {
    label: 'List files',
    template: 'List all my documents with their names and chunk counts',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" className="h-3 w-3" style={{ color: '#D4572A' }}>
        <path d="M11 2H5a1 1 0 00-1 1v10a1 1 0 001 1h6a1 1 0 001-1V5L11 2z" />
        <path d="M11 2v3h3" />
      </svg>
    ),
  },
  {
    label: 'Calculate',
    template: 'Calculate ',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" className="h-3 w-3" style={{ color: '#D4572A' }}>
        <rect x="2" y="2" width="12" height="12" rx="1.5" />
        <path d="M5 8h6M8 5v6" />
      </svg>
    ),
  },
  {
    label: 'Web search',
    template: 'Search the web for ',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" className="h-3 w-3" style={{ color: '#D4572A' }}>
        <circle cx="8" cy="8" r="6" /><path d="M8 2c-2 2-2 8 0 12M8 2c2 2 2 8 0 12M2 8h12" />
      </svg>
    ),
  },
  {
    label: 'Get metadata',
    template: 'Get metadata for my document ',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" className="h-3 w-3" style={{ color: '#D4572A' }}>
        <circle cx="8" cy="8" r="6" /><path d="M8 7v4M8 5.5v.5" />
      </svg>
    ),
  },
]

const SUGGESTED_QUERIES = [
  {
    label: 'Document inventory',
    query: 'List all my documents with their names and chunk counts',
  },
  {
    label: 'Research + web update',
    query: 'Search my documents for the main topic, then check the web for the latest developments on it',
  },
  {
    label: 'Cross-document analysis',
    query: 'Search across all my documents and find the most important recurring themes',
  },
  {
    label: 'Fact check with sources',
    query: 'What specific claims are made in my documents and what evidence supports them?',
  },
]

function FlameIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="none" className="h-8 w-8" style={{ color: '#D4572A' }}>
      <path
        d="M16 3c0 0-5.5 5.5-5.5 11 0 3.5 2 5.5 2 5.5s-.7-2.8 1.4-4.8c.7 2.8 2.8 4.8 2.8 7.7 1.4-1.4 2.1-3.5 2.1-5.5 1.4 2.1 1.4 4.8 1.4 4.8s2.8-2.8 2.8-5.5C23.1 11 19 6.5 19 6.5s.7 4.2-2.1 5.5C15.5 8.5 16 3 16 3z"
        fill="currentColor"
        opacity="0.95"
      />
      <circle cx="16" cy="27" r="2" fill="currentColor" opacity="0.5" />
    </svg>
  )
}

export default function AgentInterface() {
  const { state, steps, isRunning, run, reset } = useAgent()
  const [query, setQuery] = useState('')
  // The input clears on submit, so the recap needs its own copy of what ran.
  const [submittedQuery, setSubmittedQuery] = useState('')
  const stepsEndRef = useRef<HTMLDivElement>(null)

  async function handleSuggestionClick(text: string) {
    if (isRunning) return
    setSubmittedQuery(text)
    await run(text)
  }

  useEffect(() => {
    if (steps.length > 0) {
      stepsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [steps])

  async function handleSubmit() {
    if (!query.trim() || isRunning) return
    const q = query.trim()
    setQuery('')
    setSubmittedQuery(q)
    await run(q)
  }

  const hasResult = state.status === 'success' || state.status === 'error'

  return (
    <div className="flex flex-col h-full bg-ember-black">
      {/* Header */}
      <div className="shrink-0 px-8 pt-8 pb-0">
        <p className="text-ash-gray text-[10px] tracking-[0.2em] uppercase mb-2">PROMETHEUS PROTOCOL</p>
        <h1 className="font-cormorant text-4xl font-light text-parchment mb-2">Agent Reasoning</h1>
        <p className="text-ash-gray text-sm">Complex queries. Multi-step thinking. Full reasoning trace.</p>

        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="h-px mt-6 origin-left"
          style={{ background: 'rgba(76,85,96,0.4)' }}
        />

        {/* Tool capability badges */}
        <div className="flex flex-wrap gap-2 pt-4 pb-2">
          {TOOL_BADGES.map((badge, i) => (
            <motion.button
              key={badge.label}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
              onClick={() => {
                if (isRunning) return
                setQuery(badge.template)
              }}
              disabled={isRunning}
              className={cn(
                'flex items-center gap-1.5 bg-forge-dark border border-stone-mid/50 rounded-full px-3 py-1.5',
                'text-parchment/70 text-xs font-medium transition-all duration-150',
                'hover:border-ember/50 hover:text-parchment hover:bg-stone-mid/10',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              )}
            >
              {badge.icon}
              {badge.label}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {steps.length === 0 && state.status === 'idle' ? (
          /* min-h-full (not h-full) — see ChatInterface.tsx for why: prevents
             the flame icon from clipping off the top of the scroll region
             on short mobile viewports. */
          <div className="flex items-center justify-center min-h-full py-10">
            <div className="max-w-md w-full px-6 text-center">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="relative flex justify-center mb-6">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full blur-xl" style={{ background: 'rgba(212,87,42,0.10)' }} />
                  </div>
                  <FlameIcon />
                </div>

                <h2 className="font-cormorant text-2xl font-light text-parchment mb-2">Multi-step Reasoning</h2>
                <p className="text-ash-gray text-sm text-center max-w-sm mx-auto mb-6">
                  The agent breaks complex tasks into steps, uses tools, and shows its full reasoning trace.
                </p>

                <div className="space-y-2">
                  {SUGGESTED_QUERIES.map((sq, i) => (
                    <motion.button
                      key={sq.label}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: 0.08 * i, ease: [0.16, 1, 0.3, 1] }}
                      onClick={() => handleSuggestionClick(sq.query)}
                      whileTap={{ scale: 0.98 }}
                      className={cn(
                        'w-full text-left bg-forge-dark border border-stone-mid/40 rounded-2xl px-5 py-4',
                        'flex items-center justify-between group',
                        'transition-all duration-150 hover:border-ember/40 hover:bg-stone-mid/10',
                      )}
                    >
                      <div>
                        <span className="text-parchment/85 text-sm font-medium">{sq.label}</span>
                        <p className="text-ash-gray text-xs leading-relaxed mt-1 line-clamp-1">{sq.query}</p>
                      </div>
                      <motion.span
                        className="shrink-0 ml-3 text-ember"
                        whileHover={{ x: 3 }}
                        transition={{ duration: 0.15 }}
                      >
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" className="h-4 w-4">
                          <path d="M3 8h10M9 4l4 4-4 4" />
                        </svg>
                      </motion.span>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            </div>
          </div>
        ) : (
          <div className="px-6 py-6 max-w-2xl mx-auto w-full">
            {/* Query recap */}
            {steps.length > 0 && (
              <div className="mb-6 p-4 rounded-xl bg-forge-dark border border-stone-mid/40">
                <p className="text-ash-gray text-[10px] tracking-widest uppercase mb-1">Query</p>
                <p className="text-sm text-parchment/85">
                  {submittedQuery || 'Running...'}
                </p>
              </div>
            )}

            {/* Reasoning trace */}
            <div>
              <p className="text-ash-gray text-[10px] tracking-widest uppercase mb-4">Reasoning Trace</p>
              <div>
                {steps.map((step, i) => (
                  <motion.div
                    key={step.stepNumber}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.4,
                      delay: i * 0.08,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                  >
                    <AgentStepCard
                      step={step}
                      isLast={i === steps.length - 1 && !isRunning}
                    />
                  </motion.div>
                ))}

                {isRunning && (
                  <div className="flex gap-3 items-center py-2 pl-3">
                    <div className="shrink-0 w-7 h-7 rounded-full border-2 border-ember/30 bg-ember/5 flex items-center justify-center">
                      <Spinner size="sm" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-ash-gray">Thinking</span>
                      <div className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <motion.span
                            key={i}
                            className="w-1 h-1 rounded-full bg-ember/60"
                            animate={{ opacity: [0.3, 1, 0.3] }}
                            transition={{ duration: 1, repeat: Infinity, delay: i * 0.2, ease: [0.45, 0, 0.55, 1] }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {state.status === 'error' && (
              <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                <p className="text-sm text-red-400">{state.error}</p>
              </div>
            )}

            {hasResult && (
              <div className="mt-6 flex gap-2">
                <button
                  onClick={reset}
                  className="text-sm px-3 py-1.5 rounded-lg border border-stone-mid/40 text-parchment/70 hover:text-parchment hover:border-stone-mid/70 transition-colors"
                >
                  New task
                </button>
                {state.status === 'success' && (
                  <button
                    onClick={() => navigator.clipboard.writeText(state.data.answer)}
                    className="text-sm px-3 py-1.5 rounded-lg text-ash-gray hover:text-parchment transition-colors"
                  >
                    Copy answer
                  </button>
                )}
              </div>
            )}

            <div ref={stepsEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-stone-mid/30 bg-ember-black px-6 py-4">
        <ChatInput
          value={query}
          onChange={setQuery}
          onSubmit={handleSubmit}
          isStreaming={isRunning}
          disabled={isRunning}
          placeholder="Assign the oracle a multi-step task..."
        />
      </div>
    </div>
  )
}
