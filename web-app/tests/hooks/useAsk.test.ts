import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAsk } from '../../hooks/useAsk'
import { aiService } from '../../services/ai-service'
import type { AskResponse } from '../../types'

vi.mock('../../services/ai-service', () => ({
  aiService: {
    ask: vi.fn(),
  },
}))

const mockAsk = vi.mocked(aiService.ask)

const mockAskResponse = {
  data: {
    answer: 'RAG is Retrieval-Augmented Generation.',
    sources: [],
    traceId: 'trace-001',
    latencyBreakdown: { retrievalMs: 100, generationMs: 200, totalMs: 300 },
    guardrailRejected: false,
    noResults: false,
    retrievalQuality: { quality: 'good', maxScore: 0, avgScore: 0, chunkCount: 0 },
  } as AskResponse,
  error: null,
  status: 200,
  latencyMs: 300,
}

beforeEach(() => {
  vi.resetAllMocks()
  mockAsk.mockResolvedValue(mockAskResponse)
})

describe('useAsk', () => {

  it('starts with idle state and empty messages', () => {
    // Proving hook starts clean — no stale state from previous renders
    const { result } = renderHook(() => useAsk())
    expect(result.current.state.status).toBe('idle')
    expect(result.current.messages).toEqual([])
  })

  it('appends user message immediately before API call resolves', async () => {
    // Proving optimistic user message append.
    // User sees their message instantly — not after the AI responds (which could take 5+ seconds).
    // This is critical for perceived responsiveness.
    const { result } = renderHook(() => useAsk())

    let resolveAsk!: () => void
    mockAsk.mockReturnValue(
      new Promise(res => { resolveAsk = () => res(mockAskResponse) })
    )

    // Start ask but don't await — check mid-flight state
    act(() => { result.current.ask('what is RAG?') })

    // User message is already in the array before AI responds
    expect(result.current.messages).toHaveLength(1)
    const msg0 = result.current.messages[0]
    expect(msg0?.role).toBe('user')
    expect(msg0?.content).toBe('what is RAG?')

    // Clean up
    await act(async () => { resolveAsk() })
  })

  it('appends assistant message after success', async () => {
    // Proving full message round-trip: user message → AI call → assistant message appended
    const { result } = renderHook(() => useAsk())

    await act(async () => {
      await result.current.ask('what is RAG?')
    })

    expect(result.current.messages).toHaveLength(2)
    const [userMsg, assistantMsg] = result.current.messages
    expect(userMsg?.role).toBe('user')
    expect(assistantMsg?.role).toBe('assistant')
    expect(assistantMsg?.content).toBe('RAG is Retrieval-Augmented Generation.')
    expect(result.current.state.status).toBe('success')
  })

  it('does NOT append assistant message on error', async () => {
    // Proving error handling does not pollute message history with empty/fake responses.
    // Only real successful answers appear as assistant messages.
    mockAsk.mockResolvedValue({
      data: null,
      error: { code: 'NETWORK_ERROR', message: 'Network failed', retryable: true, name: 'ServiceError', originalError: null } as unknown as import('../../services/base-service').ServiceError,
      status: 500,
      latencyMs: 50,
    })

    const { result } = renderHook(() => useAsk())

    await act(async () => {
      await result.current.ask('what is RAG?')
    })

    // Only the user message — no assistant message on failure
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0]?.role).toBe('user')
    expect(result.current.state.status).toBe('error')
  })

  it('passes history excluding the current message to AIService', async () => {
    // Proving history contract: AI sees previous context but not the current question duplicated.
    // The current question is in the 'query' field — adding it to history would duplicate it.
    const { result } = renderHook(() => useAsk())

    // First ask
    await act(async () => { await result.current.ask('first question') })
    // Second ask
    await act(async () => { await result.current.ask('second question') })
    // Third ask — capture what history was passed
    await act(async () => { await result.current.ask('third question') })

    const thirdCallArgs = mockAsk.mock.calls[2]?.[0]
    const historyPassedToThirdCall = thirdCallArgs?.history ?? []

    // History should contain first Q+A and second Q+A — not the third question
    expect(historyPassedToThirdCall).toHaveLength(4)
    expect(historyPassedToThirdCall[0]?.content).toBe('first question')
    expect(historyPassedToThirdCall[1]?.content).toBe('RAG is Retrieval-Augmented Generation.')
    expect(historyPassedToThirdCall[2]?.content).toBe('second question')
    expect(historyPassedToThirdCall[3]?.content).toBe('RAG is Retrieval-Augmented Generation.')
    // Third question is NOT in history — it is the current query
    expect(historyPassedToThirdCall.find((m: { content: string }) => m.content === 'third question')).toBeUndefined()
  })

  it('second ask() aborts the first and its answer does not appear', async () => {
    // Proving in-flight abort on concurrent calls.
    // Without abort: both answers could appear, or the first answer could overwrite the second.
    const { result } = renderHook(() => useAsk())

    let resolveFirst!: () => void
    mockAsk
      .mockReturnValueOnce(new Promise(res => { resolveFirst = () => res(mockAskResponse) }))
      .mockResolvedValueOnce({
        ...mockAskResponse,
        data: { ...mockAskResponse.data!, answer: 'Second answer' },
      })

    // Start first ask — do not await
    act(() => { result.current.ask('first') })

    // Start second ask immediately — this should abort the first
    await act(async () => { await result.current.ask('second') })

    // Resolve first after second completes — its result should not overwrite second
    await act(async () => { resolveFirst() })

    // Only second question + second answer in messages
    const assistantMessages = result.current.messages.filter(m => m.role === 'assistant')
    const lastAssistant = assistantMessages[assistantMessages.length - 1]
    expect(lastAssistant?.content).toBe('Second answer')
  })

  it('clearHistory() resets messages and state', async () => {
    // Proving full reset — chat can be cleared and started fresh
    const { result } = renderHook(() => useAsk())

    await act(async () => { await result.current.ask('question') })
    expect(result.current.messages).toHaveLength(2)

    act(() => { result.current.clearHistory() })

    expect(result.current.messages).toEqual([])
    expect(result.current.state.status).toBe('idle')
  })

})
