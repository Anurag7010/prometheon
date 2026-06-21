'use client'

import { useState, useCallback } from 'react'
import type { AsyncState, AgentRunResponse, AgentStep } from '@/types'
import { getAccessToken } from './useAuth'

interface UseAgentReturn {
  state: AsyncState<AgentRunResponse>
  steps: AgentStep[]
  isRunning: boolean
  run: (query: string, history?: Array<{ role: string; content: string }>) => Promise<void>
  reset: () => void
}

export function useAgent(): UseAgentReturn {
  const [state, setState] = useState<AsyncState<AgentRunResponse>>({ status: 'idle' })
  const [steps, setSteps] = useState<AgentStep[]>([])
  const [isRunning, setIsRunning] = useState(false)

  const run = useCallback(async (
    query: string,
    history: Array<{ role: string; content: string }> = []
  ) => {
    setState({ status: 'loading' })
    setSteps([])
    setIsRunning(true)

    try {
      const token = getAccessToken()
      const res = await fetch('/api/agent/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ query, history }),
      })

      const data: unknown = await res.json()

      if (!res.ok) {
        const errData = data as { message?: string }
        setState({ status: 'error', error: errData.message ?? 'Agent run failed' })
        return
      }

      const result = data as AgentRunResponse
      setSteps([...result.steps])
      setState({ status: 'success', data: result })
    } catch {
      setState({ status: 'error', error: 'Network error' })
    } finally {
      setIsRunning(false)
    }
  }, [])

  const reset = useCallback(() => {
    setState({ status: 'idle' })
    setSteps([])
    setIsRunning(false)
  }, [])

  return { state, steps, isRunning, run, reset }
}
