'use client'

import { useRef, useEffect, KeyboardEvent } from 'react'
import { cn } from '@/lib/cn'

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onCancel?: () => void
  isStreaming?: boolean
  disabled?: boolean
  placeholder?: string
  maxLength?: number
}

const MAX_LENGTH = 2000

export function ChatInput({
  value,
  onChange,
  onSubmit,
  onCancel,
  isStreaming,
  disabled,
  placeholder = 'Ask a question about your documents...',
  maxLength = MAX_LENGTH,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
  }, [value])

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim() && !isStreaming && !disabled) {
        onSubmit()
      }
    }
    if (e.key === 'Escape' && isStreaming && onCancel) {
      onCancel()
    }
  }

  const charCount = value.length
  const isNearLimit = charCount > maxLength * 0.8
  const isAtLimit = charCount >= maxLength

  return (
    <div
      className={cn(
        'focus-within-wrapper relative border border-stone-mid/40 rounded-2xl transition-all duration-200',
        'focus-within:border-ember/60 focus-within:shadow-[0_0_0_2px_rgba(212,87,42,0.15),0_0_16px_rgba(212,87,42,0.06)]',
        disabled && 'opacity-60',
      )}
      style={{ background: 'rgba(23,27,31,0.8)' }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={1}
        className={cn(
          'w-full resize-none bg-transparent px-4 pt-3 pb-12',
          'text-sm text-parchment placeholder:text-ash-gray',
          'focus:outline-none',
          'min-h-[52px] max-h-[200px]',
        )}
        style={{ borderColor: 'transparent', boxShadow: 'none' }}
      />

      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-ash-gray/50 hidden sm:flex items-center gap-1">
            <kbd className="kbd">↵</kbd> send
            <span className="mx-1">·</span>
            <kbd className="kbd">⇧↵</kbd> newline
          </span>
          {isStreaming && (
            <span className="text-xs text-ember animate-pulse">Generating...</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isNearLimit && (
            <span
              className={cn(
                'text-xs font-mono',
                isAtLimit ? 'text-red-400' : 'text-ash-gray',
              )}
            >
              {charCount}/{maxLength}
            </span>
          )}

          {isStreaming ? (
            <button
              onClick={onCancel}
              className="h-7 px-3 rounded-xl text-xs bg-stone-mid/30 text-ash-gray hover:text-parchment transition-colors"
            >
              ■ Stop
            </button>
          ) : (
            <button
              onClick={onSubmit}
              disabled={!value.trim() || disabled || isAtLimit}
              className={cn(
                'h-7 px-4 rounded-xl text-sm font-medium transition-all duration-150',
                value.trim() && !disabled && !isAtLimit
                  ? 'bg-ember text-parchment hover:scale-[1.02] active:scale-[0.97]'
                  : 'bg-stone-mid/30 text-ash-gray cursor-not-allowed',
              )}
            >
              →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
