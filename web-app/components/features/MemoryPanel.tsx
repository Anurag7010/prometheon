'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, Button, Badge, EmptyState, Spinner } from '@/components/ui'
import { getAccessToken } from '@/hooks'
import type { Memory } from '@/types'

export default function MemoryPanel() {
  const [memories, setMemories] = useState<Memory[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadMemories = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = getAccessToken()
      const res = await fetch('/api/memories', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.ok) {
        const data = await res.json()
        setMemories(data.memories ?? [])
      } else {
        setError('Failed to load memories')
      }
    } catch {
      setError('Failed to load memories')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Wrap in async IIFE so setState calls happen inside an async callback,
    // not synchronously in the effect body
    void (async () => {
      await loadMemories()
    })()
  }, [loadMemories])

  async function deleteMemory(id: string) {
    setDeleting(id)
    try {
      const token = getAccessToken()
      const res = await fetch(`/api/memories/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.ok || res.status === 204) {
        setMemories(prev => prev.filter(m => m.id !== id))
      }
    } finally {
      setDeleting(null)
    }
  }

  if (loading) return <Spinner size="md" />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Long-Term Memory</h3>
          <p className="text-sm text-muted-foreground">
            Facts the AI has learned about you across conversations
          </p>
        </div>
        <Badge variant="neutral">{memories.length} memories</Badge>
      </div>

      {error && (
        <p className="text-sm text-error-500">{error}</p>
      )}

      {memories.length === 0 ? (
        <EmptyState
          title="No memories yet"
          description="The AI will remember facts about you as you have more conversations"
        />
      ) : (
        <div className="space-y-2">
          {memories.map(memory => (
            <Card key={memory.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-foreground flex-1">{memory.content}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteMemory(memory.id)}
                  disabled={deleting === memory.id}
                  aria-label="Delete memory"
                  className="text-muted-foreground hover:text-destructive shrink-0"
                >
                  {deleting === memory.id ? '…' : '✕'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Accessed {memory.accessCount} times
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
