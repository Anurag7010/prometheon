import { useState, useCallback, useRef } from 'react'
import { useAsyncState } from './useAsyncState'
import { useAbortController } from './useAbortController'
import { aiService } from '../services/ai-service'
import { CancellationError } from '../lib/async'
import type { Message, AskResponse, Source, RetrievalQuality } from '../types'
import type { AsyncState } from '../types'

export function useAsk(): {
  state: AsyncState<AskResponse>
  messages: Message[]
  ask: (query: string) => Promise<void>
  askStream: (query: string) => Promise<boolean>
  clearHistory: () => void
  loadHistory: (msgs: Message[]) => void
  isStreaming: boolean
} {
  const { state, execute, reset } = useAsyncState<AskResponse>()
  const abortCtrl = useAbortController()
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)

  // Token batching: accumulate tokens in a ref and flush to state every 16ms.
  // Without batching: every token triggers a setState + re-render cycle (60+ fps).
  // With batching: we cap re-renders to ~60 fps while still showing tokens fast.
  const tokenBuffer = useRef('')
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flushTokens = useCallback(() => {
    if (!tokenBuffer.current) return
    const flushed = tokenBuffer.current
    tokenBuffer.current = ''
    setMessages(prev => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      if (!last || last.role !== 'assistant') return prev
      return [...prev.slice(0, -1), { ...last, content: last.content + flushed }]
    })
  }, [])

  const scheduleFlush = useCallback(() => {
    if (flushTimer.current) clearTimeout(flushTimer.current)
    flushTimer.current = setTimeout(flushTokens, 16)
  }, [flushTokens])

  const ask = useCallback(async (query: string) => {
    // If a previous ask is in-flight, abort it before starting a new one.
    // Without this: two concurrent asks race to update state — whichever
    // arrives last wins regardless of which was sent last. User sees wrong answer.
    abortCtrl.abort()
    abortCtrl.reset()

    // Capture the NEW signal AFTER reset — the signal before reset is already aborted.
    // We check this same signal after the await to detect if a third ask() came in.
    const currentSignal = abortCtrl.signal

    // Capture history BEFORE appending the new user message.
    // The AI backend receives previous context but not the current question
    // duplicated — the question is in the 'query' field, not the history array.
    const historyBeforeThisMessage = [...messages]

    // Append user message immediately — before the API call.
    // This gives instant visual feedback: user sees their message appear
    // the moment they send it, not after the AI responds (which could take seconds).
    setMessages(prev => [...prev, { role: 'user', content: query }])

    await execute(async () => {
      const response = await aiService.ask({
        query,
        history: historyBeforeThisMessage,
        signal: currentSignal,
      })

      // If a newer ask() aborted this one, do not append the stale answer.
      // Throw CancellationError so useAsyncState resets to idle (not error state).
      if (currentSignal.aborted) throw new CancellationError('ask superseded by newer call')

      if (response.error) {
        throw new Error(response.error.message)
      }

      const data = response.data!

      // Append assistant message only on success.
      // On error we do not append — no fake or empty assistant message
      // appears in the chat. The error surfaces in state.error instead.
      // Guardrail rejections and no-results are visually distinguished via 'warning' role.
      const messageRole = (data.guardrailRejected || data.noResults) ? 'warning' : 'assistant'
      setMessages(prev => [...prev, { role: messageRole, content: data.answer, sources: data.sources }])

      return data
    })
  }, [messages, execute, abortCtrl])

  const askStream = useCallback(async (query: string): Promise<boolean> => {
    abortCtrl.abort()
    abortCtrl.reset()
    const currentSignal = abortCtrl.signal

    const historyBeforeThisMessage = [...messages]

    // Clear any pending token flush from a previous stream
    if (flushTimer.current) clearTimeout(flushTimer.current)
    tokenBuffer.current = ''

    setMessages(prev => [
      ...prev,
      { role: 'user', content: query },
      { role: 'assistant', content: '' },  // placeholder for streaming tokens
    ])
    setIsStreaming(true)
    reset()  // reset to idle so state.status === 'loading' via execute

    let sources: Source[] = []
    let streamError: string | null = null
    let succeeded = false
    let noResults = false
    let retrievalQuality: RetrievalQuality | undefined

    await execute(async () => {
      const generator = aiService.askStream(
        query,
        historyBeforeThisMessage,
        currentSignal,
      )

      for await (const event of generator) {
        if (currentSignal.aborted) break

        if (event.type === 'token') {
          tokenBuffer.current += event.content
          scheduleFlush()
        } else if (event.type === 'sources') {
          sources = event.sources
        } else if (event.type === 'done') {
          noResults = event.noResults ?? false
          retrievalQuality = event.retrievalQuality
          // Flush any remaining buffered tokens synchronously before settling
          if (flushTimer.current) {
            clearTimeout(flushTimer.current)
            flushTimer.current = null
          }
          flushTokens()
          break
        } else if (event.type === 'error') {
          streamError = event.message
          break
        }
      }

      // Always flush remaining tokens on generator exit
      if (flushTimer.current) {
        clearTimeout(flushTimer.current)
        flushTimer.current = null
      }
      flushTokens()
      setIsStreaming(false)

      if (currentSignal.aborted) throw new CancellationError('stream aborted')
      if (streamError) throw new Error(streamError)

      // Build a synthetic AskResponse from the streamed content.
      // Quality and no_results come from the backend's done event; if an older
      // backend omits them, fall back to what the sources themselves tell us —
      // never claim confidence for an answer with zero retrieved sources.
      const synthResponse: AskResponse = {
        answer: '',    // hook consumers read from messages[], not from state.data
        sources,
        traceId: '',
        latencyBreakdown: { retrievalMs: 0, generationMs: 0, totalMs: 0 },
        guardrailRejected: false,
        noResults,
        retrievalQuality: retrievalQuality ?? {
          quality: sources.length === 0 ? 'no_results' : 'good',
          maxScore: 0,
          avgScore: 0,
          chunkCount: sources.length,
        },
      }

      // Attach sources and apply warning role if guardrail rejected or no results
      const streamedMessageRole = (synthResponse.guardrailRejected || synthResponse.noResults) ? 'warning' : 'assistant'
      setMessages(prev => {
        if (prev.length === 0) return prev
        const last = prev[prev.length - 1]
        if (!last || last.role !== 'assistant') return prev
        return [
          ...prev.slice(0, -1),
          { ...last, role: streamedMessageRole, ...(sources.length > 0 ? { sources } : {}) },
        ]
      })

      succeeded = true  // only set on the happy path
      return synthResponse
    })

    return succeeded
  }, [messages, execute, reset, abortCtrl, scheduleFlush, flushTokens])

  const clearHistory = useCallback(() => {
    if (flushTimer.current) {
      clearTimeout(flushTimer.current)
      flushTimer.current = null
    }
    tokenBuffer.current = ''
    setMessages([])
    setIsStreaming(false)
    reset()
    abortCtrl.abort()
    abortCtrl.reset()
  }, [reset, abortCtrl])

  const loadHistory = useCallback((msgs: Message[]) => {
    if (flushTimer.current) {
      clearTimeout(flushTimer.current)
      flushTimer.current = null
    }
    tokenBuffer.current = ''
    setMessages(msgs)
    setIsStreaming(false)
    reset()
  }, [reset])

  return { state, messages, ask, askStream, clearHistory, loadHistory, isStreaming }
}
