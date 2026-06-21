'use client'

import { useState } from 'react'
import { cn } from '@/lib/cn'
import { MarkdownMessage } from '@/components/chat/MarkdownMessage'
import type { AgentStep } from '@/types'

const TOOL_COLORS: Record<string, string> = {
  search_documents: 'bg-ember/10 text-ember border-ember/20',
  get_document_list: 'bg-stone-mid/20 text-parchment/80 border-stone-mid/40',
  get_document_metadata: 'bg-stone-mid/20 text-parchment/80 border-stone-mid/40',
  calculate: 'bg-ember/10 text-ember border-ember/20',
  web_search: 'bg-stone-mid/20 text-parchment/80 border-stone-mid/40',
}

interface AgentStepCardProps {
  step: AgentStep
  isLast: boolean
  isAnimating?: boolean
}

export function AgentStepCard({ step, isLast, isAnimating }: AgentStepCardProps) {
  const [showFullObservation, setShowFullObservation] = useState(false)
  const [collapsed, setCollapsed] = useState(!isLast)

  const toolColor = step.action ? (TOOL_COLORS[step.action] ?? 'bg-muted text-muted-foreground border-border') : ''
  const observationPreview = step.observation ? step.observation.slice(0, 280) : null
  const hasMoreObservation = step.observation ? step.observation.length > 280 : false

  return (
    <div className={cn('relative', isAnimating && 'animate-in fade-in duration-300')}>
      {/* Connecting line */}
      {!isLast && (
        <div className="absolute left-3.5 top-8 bottom-0 w-px bg-border" />
      )}

      <div className="flex gap-3">
        {/* Step indicator circle */}
        <div
          className={cn(
            'shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold z-10 bg-forge-dark border-2',
            step.isFinal
              ? 'border-ember text-ember'
              : 'border-stone-mid/50 text-ash-gray',
          )}
        >
          {step.isFinal ? '✓' : step.stepNumber}
        </div>

        {/* Step content */}
        <div className="flex-1 pb-4">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-between py-0.5 text-left"
          >
            <div className="flex items-center gap-2 flex-wrap">
              {step.isFinal ? (
                <span className="text-sm font-semibold text-ember">Final Answer</span>
              ) : step.action ? (
                <>
                  <span className="text-xs text-muted-foreground">Called</span>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded-full border',
                      toolColor,
                    )}
                  >
                    {step.action}
                  </span>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">Reasoning...</span>
              )}
            </div>
            <svg
              viewBox="0 0 16 16"
              className={cn(
                'size-3.5 text-muted-foreground transition-transform duration-200 fill-none stroke-current shrink-0',
                !collapsed && 'rotate-180',
              )}
              strokeWidth="1.5"
            >
              <path d="M4 6l4 4 4-4" />
            </svg>
          </button>

          {!collapsed && (
            <div className="mt-2 space-y-2">
              {/* Tool input */}
              {step.actionInput && Object.keys(step.actionInput).length > 0 && (
                <div className="rounded-lg bg-forge-dark border border-stone-mid/30 overflow-hidden">
                  <div className="px-3 py-1.5 border-b border-stone-mid/20">
                    <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-ash-gray">Input</span>
                  </div>
                  <pre className="px-3 py-2 text-xs font-mono overflow-x-auto text-parchment/70">
                    {JSON.stringify(step.actionInput, null, 2)}
                  </pre>
                </div>
              )}

              {/* Observation */}
              {step.observation && (
                <div className="rounded-lg bg-forge-dark/60 border border-stone-mid/20 overflow-hidden">
                  <div className="px-3 py-1.5 border-b border-stone-mid/20 flex items-center justify-between">
                    <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-ash-gray">Result</span>
                    {hasMoreObservation && (
                      <button
                        onClick={() => setShowFullObservation(!showFullObservation)}
                        className="text-[10px] text-ember hover:underline"
                      >
                        {showFullObservation ? 'Show less' : 'Show more'}
                      </button>
                    )}
                  </div>
                  <pre className="px-3 py-2 text-xs font-mono overflow-x-auto text-parchment/65 whitespace-pre-wrap">
                    {showFullObservation ? step.observation : observationPreview}
                    {!showFullObservation && hasMoreObservation && '...'}
                  </pre>
                </div>
              )}

              {/* Final answer */}
              {step.finalAnswer && (
                <div className="rounded-lg bg-ember/5 border border-ember/20 px-4 py-3">
                  <MarkdownMessage content={step.finalAnswer} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
