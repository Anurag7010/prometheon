'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUp, FileText, Search, Brain, Sparkles, Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { EASE_CINEMATIC, DURATION } from '@/lib/motion'

const COMMAND_SUGGESTIONS = [
  { icon: <FileText className="w-4 h-4" />, label: 'Ingest Document', description: 'Upload and index a document', prefix: '/ingest' },
  { icon: <Search className="w-4 h-4" />, label: 'Search Knowledge', description: 'Semantic search across documents', prefix: '/search' },
  { icon: <Brain className="w-4 h-4" />, label: 'Agent Mode', description: 'Activate multi-step reasoning', prefix: '/agent' },
  { icon: <Sparkles className="w-4 h-4" />, label: 'Memory Recall', description: 'Surface what I know about you', prefix: '/memory' },
]

interface AnimatedAIChatProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  isStreaming?: boolean
  placeholder?: string
}

export function AnimatedAIChat({
  value,
  onChange,
  onSubmit,
  isStreaming = false,
  placeholder = 'Ask anything. The oracle is ready.',
}: AnimatedAIChatProps) {
  const [focused, setFocused] = useState(false)
  const showCommands = useMemo(() => value === '/', [value])
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [value])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim() && !isStreaming) onSubmit()
    }
  }

  function handleCommandSelect(prefix: string) {
    onChange(prefix + ' ')
    textareaRef.current?.focus()
  }

  const hasContent = value.trim().length > 0

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Heading — shown when input is empty and not streaming */}
      <AnimatePresence>
        {!hasContent && !isStreaming && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: DURATION.base, ease: EASE_CINEMATIC }}
            className="text-center mb-6"
          >
            <h2 className="text-2xl sm:text-3xl font-bold text-[#F5F1ED] mb-2">
              What knowledge do you seek?
            </h2>
            <p className="text-sm text-[#70798C]">Ask anything. The oracle is ready.</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input container */}
      <div className="relative">
        {/* Ambient glow */}
        <div
          className="absolute -inset-2 rounded-2xl opacity-0 transition-opacity duration-500 pointer-events-none"
          style={{
            opacity: focused ? 0.6 : 0,
            background: 'radial-gradient(ellipse at center, rgba(218,210,188,0.1) 0%, rgba(169,153,133,0.05) 50%, transparent 100%)',
          }}
        />

        <div
          className={cn(
            'relative bg-black/40 rounded-2xl border transition-all duration-300',
            focused ? 'border-[#DAD2BC]/30' : 'border-[#A99985]/15',
          )}
        >
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            className={cn(
              'w-full bg-transparent text-[#F5F1ED] text-sm resize-none',
              'px-4 pt-4 pb-12 focus:outline-none',
              'placeholder-[#70798C]',
            )}
            style={{ minHeight: '56px', maxHeight: '200px' }}
          />

          {/* Bottom bar */}
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-4 py-3">
            {/* Left — streaming indicator */}
            <div className="flex items-center gap-2">
              {isStreaming && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-1.5"
                >
                  <Loader2 className="w-3 h-3 text-[#DAD2BC] animate-spin" />
                  <span className="text-[10px] text-[#DAD2BC] uppercase tracking-wider">prometheus</span>
                </motion.div>
              )}
            </div>

            {/* Right — send button */}
            <button
              onClick={() => {
                if (hasContent && !isStreaming) onSubmit()
              }}
              disabled={!hasContent || isStreaming}
              className={cn(
                'rounded-full p-2 transition-all duration-200',
                hasContent && !isStreaming
                  ? 'bg-[#F5F1ED] text-[#252323] hover:shadow-[0_0_15px_rgba(218,210,188,0.3)]'
                  : 'bg-[#A99985]/20 text-[#70798C] cursor-not-allowed',
              )}
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Command suggestions dropdown */}
        <AnimatePresence>
          {showCommands && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-full left-0 right-0 mb-2 bg-black/90 border border-[#A99985]/20 rounded-xl overflow-hidden backdrop-blur-lg"
            >
              {COMMAND_SUGGESTIONS.map((cmd) => (
                <button
                  key={cmd.prefix}
                  onClick={() => handleCommandSelect(cmd.prefix)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#F5F1ED]/5 transition-colors"
                >
                  <span className="text-[#A99985]">{cmd.icon}</span>
                  <div>
                    <p className="text-sm text-[#F5F1ED] font-medium">{cmd.label}</p>
                    <p className="text-xs text-[#70798C]">{cmd.description}</p>
                  </div>
                  <span className="ml-auto text-xs text-[#70798C] font-mono">{cmd.prefix}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
