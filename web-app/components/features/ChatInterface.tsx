'use client'

import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { useAsk } from '@/hooks/useAsk'
import { ConversationSidebar } from '@/components/chat/ConversationSidebar'
import { MessageBubble } from '@/components/ui/MessageBubble'
import { ChatInput } from '@/components/chat/ChatInput'
import { cn } from '@/lib/cn'
import { getAccessToken } from '@/hooks'
import type { Message } from '@/types'

interface ChatInterfaceProps {
  documentId?: string
  documentName?: string
}

const SUGGESTED_QUESTIONS = [
  {
    title: 'What is the main topic?',
    subtitle: 'Get a high-level overview of your document',
  },
  {
    title: 'Summarize the key points',
    subtitle: 'Extract the most important ideas',
  },
  {
    title: 'What are the conclusions?',
    subtitle: 'Understand what the document argues',
  },
]

function FlameIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="none" className="h-10 w-10" style={{ color: '#D4572A' }}>
      <path
        d="M16 3c0 0-5.5 5.5-5.5 11 0 3.5 2 5.5 2 5.5s-.7-2.8 1.4-4.8c.7 2.8 2.8 4.8 2.8 7.7 1.4-1.4 2.1-3.5 2.1-5.5 1.4 2.1 1.4 4.8 1.4 4.8s2.8-2.8 2.8-5.5C23.1 11 19 6.5 19 6.5s.7 4.2-2.1 5.5C15.5 8.5 16 3 16 3z"
        fill="currentColor"
        opacity="0.95"
      />
      <circle cx="16" cy="27" r="2" fill="currentColor" opacity="0.5" />
    </svg>
  )
}

function ArrowRight() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" style={{ color: '#D4572A' }}>
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  )
}

export function ChatInterface({ documentId: _documentId, documentName }: ChatInterfaceProps) {
  const [query, setQuery] = useState('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [showSidebar, setShowSidebar] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { state, messages, askStream, clearHistory, loadHistory, isStreaming } = useAsk()
  const router = useRouter()

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isStreaming])

  useEffect(() => {
    if (!conversationId) return
    let cancelled = false
    async function fetchMessages() {
      const token = getAccessToken()
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok || cancelled) return
      const data: unknown = await res.json()
      if (
        data &&
        typeof data === 'object' &&
        'messages' in data &&
        Array.isArray((data as { messages: unknown }).messages)
      ) {
        const raw = (data as { messages: Array<{ role: string; content: string }> }).messages
        const loaded: Message[] = raw.map((m) => ({
          role: m.role as Message['role'],
          content: m.content,
        }))
        loadHistory(loaded)
      }
    }
    fetchMessages()
    return () => { cancelled = true }
  }, [conversationId, loadHistory])

  async function ensureConversation(): Promise<string> {
    if (conversationId) return conversationId
    const token = getAccessToken()
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
    const data: unknown = await res.json()
    const id = data && typeof data === 'object' && 'id' in data ? String(data.id) : ''
    setConversationId(id)
    return id
  }

  async function autoTitle(convId: string, firstUserMessage: string) {
    const title = firstUserMessage.trim().slice(0, 45)
    const token = getAccessToken()
    await fetch(`/api/conversations/${convId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ title }),
    })
  }

  async function handleSubmit() {
    if (!query.trim() || isStreaming) return
    const q = query.trim()
    setQuery('')
    const convId = await ensureConversation()
    const isFirstMessage = messages.length === 0
    await askStream(q)
    if (isFirstMessage && convId) {
      autoTitle(convId, q)
    }
  }

  function handleNewConversation() {
    clearHistory()
    setConversationId(null)
    setQuery('')
  }

  function handleSelectConversation(id: string) {
    clearHistory()
    setConversationId(id)
  }

  async function handleSuggestionClick(text: string) {
    if (isStreaming) return
    setQuery(text)
    await ensureConversation()
    await askStream(text)
  }

  const lastIndex = messages.length - 1

  return (
    <div className="flex h-full overflow-hidden bg-ember-black">
      {/* Conversation sidebar */}
      {showSidebar && (
        <div className="w-60 shrink-0 hidden md:flex flex-col bg-forge-dark border-r border-stone-mid/40">
          <ConversationSidebar
            currentConversationId={conversationId ?? undefined}
            onSelect={handleSelectConversation}
            onNew={handleNewConversation}
          />
        </div>
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0 bg-ember-black">
        {/* Top bar */}
        <div className="flex items-center px-4 py-3 shrink-0">
          <motion.button
            onClick={() => setShowSidebar(!showSidebar)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="liquid-glass rounded-lg p-2 text-ash-gray hover:text-parchment hidden md:flex transition-colors duration-150"
            title="Toggle sidebar"
          >
            <svg viewBox="0 0 16 16" className="size-4 fill-none stroke-current" strokeWidth="1.5">
              <rect x="2" y="2" width="12" height="12" rx="1.5" />
              <path d="M6 2v12" />
            </svg>
          </motion.button>
          {documentName && (
            <div className="ml-3 flex items-center gap-1.5 text-xs bg-ember/10 text-ember px-2.5 py-1 rounded-full">
              <svg viewBox="0 0 16 16" className="size-3 fill-current opacity-70">
                <path d="M3 1h7l3 3v11H3V1z" />
              </svg>
              <span className="font-medium truncate max-w-[160px]">{documentName}</span>
            </div>
          )}
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="max-w-2xl w-full px-6 text-center">
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

                  <h2 className="font-cormorant text-3xl md:text-4xl font-light text-parchment tracking-[-0.02em] mb-2">
                    What knowledge do you seek?
                  </h2>
                  <p className="text-ash-gray text-sm mb-6">
                    Upload a document. Ask anything. The oracle is ready.
                  </p>

                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="h-px w-24 mx-auto mb-8"
                    style={{ background: 'rgba(212,87,42,0.4)' }}
                  />

                  <div className="space-y-3">
                    {SUGGESTED_QUESTIONS.map((q, i) => (
                      <motion.button
                        key={q.title}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.1 * i, ease: [0.16, 1, 0.3, 1] }}
                        onClick={() => handleSuggestionClick(q.title)}
                        whileTap={{ scale: 0.98 }}
                        className="group w-full text-left bg-forge-dark border border-stone-mid/40 rounded-xl px-5 py-4 flex items-center justify-between transition-all duration-150 hover:border-ember/30 hover:bg-stone-mid/10"
                      >
                        <div>
                          <p className="text-parchment/80 text-sm font-medium">{q.title}</p>
                          <p className="text-ash-gray text-xs mt-0.5">{q.subtitle}</p>
                        </div>
                        <motion.span
                          className="shrink-0 ml-3"
                          whileHover={{ x: 2 }}
                          transition={{ duration: 0.15 }}
                        >
                          <ArrowRight />
                        </motion.span>
                      </motion.button>
                    ))}
                  </div>

                  <p className="text-ash-gray/50 text-xs text-center mt-6">
                    or upload a document to get started
                  </p>
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.5 }}
                    onClick={() => router.push('/documents')}
                    className="bg-forge-dark border border-stone-mid/40 rounded-full px-4 py-2 text-xs text-parchment/60 hover:border-ember/40 hover:text-parchment/80 flex items-center gap-2 mx-auto mt-3 transition-all duration-150"
                  >
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 text-ember">
                      <path d="M8 2v8M5 5l3-3 3 3M3 11v2a1 1 0 001 1h8a1 1 0 001-1v-2" />
                    </svg>
                    Upload a document
                  </motion.button>
                </motion.div>
              </div>
            </div>
          ) : (
            <div className="px-4 py-6 space-y-6 max-w-3xl mx-auto w-full">
              {messages.map((message: Message, i: number) => {
                const isLast = i === lastIndex
                const isLastAssistant = isLast && message.role === 'assistant'
                const sources = isLastAssistant && state.status === 'success'
                  ? state.data?.sources
                  : message.sources
                const retrievalQuality = isLastAssistant && state.status === 'success'
                  ? state.data?.retrievalQuality
                  : undefined
                const routedTo = isLastAssistant && state.status === 'success'
                  ? state.data?.routedTo
                  : undefined

                return (
                  <MessageBubble
                    key={i}
                    message={message}
                    sources={sources}
                    isStreaming={isLastAssistant && isStreaming}
                    retrievalQuality={retrievalQuality}
                    routedTo={routedTo}
                    onCopy={() => navigator.clipboard.writeText(message.content)}
                    onRegenerate={
                      isLastAssistant && !isStreaming
                        ? () => {
                            const lastUserMsg = [...messages]
                              .reverse()
                              .find((m) => m.role === 'user')
                            if (lastUserMsg) askStream(lastUserMsg.content)
                          }
                        : undefined
                    }
                  />
                )
              })}

              {state.status === 'error' && !isStreaming && (
                <div
                  className={cn(
                    'flex items-center gap-2 text-sm text-red-400',
                    'bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3',
                  )}
                >
                  <span className="shrink-0">⚠</span>
                  <span>{state.error}</span>
                  <button
                    onClick={() => {
                      const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
                      if (lastUserMsg) askStream(lastUserMsg.content)
                    }}
                    className="ml-auto text-xs underline hover:no-underline"
                  >
                    Retry
                  </button>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="shrink-0 px-4 py-4 border-t border-stone-mid/30 bg-forge-dark/60 backdrop-blur-sm">
          <div className="max-w-3xl mx-auto">
            <ChatInput
              value={query}
              onChange={setQuery}
              onSubmit={handleSubmit}
              onCancel={clearHistory}
              isStreaming={isStreaming}
              placeholder="Ask the oracle anything about your documents..."
            />
            <p className="text-ash-gray/40 text-xs text-center mt-2">
              Answers generated from your documents · Verify important information
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ChatInterface
