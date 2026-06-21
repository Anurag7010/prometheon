'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'
import { MarkdownMessage } from '@/components/chat/MarkdownMessage'
import { SourceCitations } from '@/components/chat/SourceCitations'
import { formatDistanceToNow } from 'date-fns'
import type { Message, Source } from '@/types'

interface MessageBubbleProps {
  message: Message
  sources?: readonly Source[]
  isStreaming?: boolean
  retrievalQuality?: {
    quality: 'good' | 'fair' | 'poor' | 'no_results'
    maxScore: number
  }
  routedTo?: 'rag' | 'agent'
  timestamp?: Date
  onCopy?: () => void
  onRegenerate?: () => void
}

export function MessageBubble({
  message,
  sources,
  isStreaming,
  retrievalQuality,
  routedTo,
  timestamp,
  onCopy,
  onRegenerate,
}: MessageBubbleProps) {
  const [showActions, setShowActions] = useState(false)

  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  const isWarning = message.role === 'warning'

  if (!message.content && !isStreaming) return null

  return (
    <motion.div
      className={cn('group flex gap-3', isUser && 'flex-row-reverse')}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Avatar */}
      <div
        className={cn(
          'shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold mt-0.5',
          isUser
            ? 'bg-ember/20 text-ember'
            : isWarning
              ? 'bg-yellow-500/10 text-yellow-600 border border-yellow-500/20'
              : 'bg-forge-dark border border-stone-mid/40 text-ash-gray',
        )}
      >
        {isUser ? (
          'U'
        ) : (
          <svg viewBox="0 0 16 16" className="size-3.5 fill-current">
            <path d="M8 1l1.5 4.5L14 7l-4.5 1.5L8 13l-1.5-4.5L2 7l4.5-1.5z" />
          </svg>
        )}
      </div>

      {/* Content column */}
      <div className={cn('flex flex-col gap-1 max-w-[80%]', isUser && 'items-end')}>
        {/* Bubble */}
        <div
          className={cn(
            'rounded-2xl px-4 py-3 text-sm',
            isUser
              ? 'bg-ember text-parchment rounded-tr-sm'
              : isWarning
                ? 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-200 rounded-tl-sm'
                : 'bg-forge-dark border border-stone-mid/30 text-parchment/90 rounded-tl-sm',
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
          ) : (
            <>
              {isStreaming && !message.content ? (
                <div className="flex gap-1.5 py-1.5 px-0.5">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-ash-gray/60"
                      style={{
                        animation: 'typingPulse 1.2s ease-in-out infinite',
                        animationDelay: `${i * 0.18}s`,
                      }}
                    />
                  ))}
                </div>
              ) : (
                <MarkdownMessage content={message.content} />
              )}
              {isStreaming && message.content && (
                <motion.span
                  className="inline-block w-0.5 h-[1.1em] bg-ember ml-0.5 align-middle rounded-full"
                  animate={{ scaleY: [1, 0.3, 1] }}
                  transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}
            </>
          )}
        </div>

        {/* Metadata row */}
        {isAssistant && !isStreaming && (
          <div className="flex items-center gap-2 px-1 flex-wrap">
            {routedTo && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-mono',
                  routedTo === 'agent'
                    ? 'bg-ember/10 text-ember'
                    : 'bg-stone-mid/20 text-ash-gray',
                )}
              >
                {routedTo === 'agent' ? (
                  <>
                    <svg viewBox="0 0 12 12" fill="currentColor" className="w-2.5 h-2.5"><path d="M6 0l1.2 3.8H11l-3 2.2 1.1 3.8L6 7.6l-3.1 2.2L4 6 1 3.8h3.8z"/></svg>
                    agent
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-2.5 h-2.5"><circle cx="5" cy="5" r="3.5"/><path d="M10 10l-2-2"/></svg>
                    rag
                  </>
                )}
              </span>
            )}
            {retrievalQuality && retrievalQuality.quality !== 'no_results' && (
              <span
                className={cn(
                  'text-xs',
                  retrievalQuality.quality === 'good'
                    ? 'text-green-600'
                    : retrievalQuality.quality === 'fair'
                      ? 'text-yellow-600'
                      : 'text-muted-foreground',
                )}
              >
                {retrievalQuality.quality === 'good'
                  ? 'High confidence'
                  : retrievalQuality.quality === 'fair'
                    ? 'Medium confidence'
                    : 'Low confidence'}
              </span>
            )}
            {timestamp && (
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(timestamp, { addSuffix: true })}
              </span>
            )}
          </div>
        )}

        {/* Action buttons on hover */}
        {isAssistant && !isStreaming && showActions && (
          <div className="flex items-center gap-1 px-1">
            {onCopy && (
              <button
                onClick={onCopy}
                className="p-1 rounded text-ash-gray hover:text-parchment hover:bg-stone-mid/15 transition-colors text-xs"
                title="Copy response"
              >
                Copy
              </button>
            )}
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="p-1 rounded text-ash-gray hover:text-parchment hover:bg-stone-mid/15 transition-colors text-xs"
                title="Regenerate response"
              >
                Retry
              </button>
            )}
          </div>
        )}

        {/* Source citations */}
        {isAssistant && sources && sources.length > 0 && !isStreaming && (
          <SourceCitations sources={sources} className="w-full" />
        )}
      </div>
    </motion.div>
  )
}
