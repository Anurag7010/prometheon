'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { cn } from '@/lib/cn'
import { isToday, isYesterday, isThisWeek } from 'date-fns'
import { getAccessToken } from '@/hooks'

interface ConversationItem {
  id: string
  title: string
  updatedAt: Date | string
}

interface ConversationSidebarProps {
  currentConversationId?: string
  onSelect: (id: string) => void
  onNew: () => void
  className?: string
}

export function ConversationSidebar({
  currentConversationId,
  onSelect,
  onNew,
  className,
}: ConversationSidebarProps) {
  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  const loadConversations = useCallback(async () => {
    try {
      const token = getAccessToken()
      const res = await fetch('/api/conversations', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.ok) {
        const data: unknown = await res.json()
        if (data && typeof data === 'object' && 'conversations' in data && Array.isArray(data.conversations)) {
          setConversations(data.conversations as ConversationItem[])
        }
      }
    } finally {
      setLoading(false)
    }
  }, [])

  async function commitRename(id: string) {
    const trimmed = renameValue.trim()
    setRenamingId(null)
    if (!trimmed) return
    const token = getAccessToken()
    await fetch(`/api/conversations/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ title: trimmed }),
    })
    loadConversations()
  }

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  const groups = groupByDate(conversations)

  return (
    <div className={cn('flex flex-col h-full bg-forge-dark', className)}>
      <div className="p-3 border-b border-stone-mid/30">
        <button
          onClick={onNew}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
                     border border-stone-mid/40 text-parchment/80 hover:bg-ember/10 hover:text-parchment hover:border-ember/40
                     transition-all duration-150 active:scale-[0.98]"
        >
          <svg viewBox="0 0 16 16" className="size-4 fill-current">
            <path d="M8 3v10M3 8h10" stroke="currentColor" fill="none" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          New conversation
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-9 rounded-lg shimmer" />
          ))
        ) : conversations.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <p className="text-xs text-muted-foreground">No conversations yet</p>
          </div>
        ) : (
          Object.entries(groups).map(([group, convos]) => (
            <div key={group}>
              <p className="label-uppercase px-2 mb-1">{group}</p>
              <div className="space-y-0.5">
                {convos.map((convo) => (
                  <div key={convo.id}>
                    {renamingId === convo.id ? (
                      <input
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={() => commitRename(convo.id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault()  // prevents blur from firing after Enter
                            commitRename(convo.id)
                          }
                          if (e.key === 'Escape') setRenamingId(null)
                        }}
                        className="flex-1 w-full bg-transparent text-sm text-parchment outline-none border-b border-ember/60 pb-0.5 px-3 py-2"
                        autoFocus
                      />
                    ) : (
                      <button
                        onClick={() => onSelect(convo.id)}
                        onDoubleClick={() => {
                          setRenamingId(convo.id)
                          setRenameValue(convo.title)
                        }}
                        className={cn(
                          'w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-150',
                          'flex items-start gap-2',
                          currentConversationId === convo.id
                            ? 'bg-ember/12 text-parchment font-medium'
                            : 'text-ash-gray hover:bg-stone-mid/15 hover:text-parchment',
                        )}
                      >
                        <svg viewBox="0 0 16 16" className="size-3.5 mt-0.5 shrink-0 opacity-60 fill-none stroke-current" strokeWidth="1.2">
                          <path d="M2 3h12v9H9l-3 2v-2H2z" />
                        </svg>
                        <span className="truncate flex-1">{convo.title}</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function groupByDate(conversations: ConversationItem[]): Record<string, ConversationItem[]> {
  const groups: Record<string, ConversationItem[]> = {}

  conversations.forEach((convo) => {
    const date = new Date(convo.updatedAt)
    const group = isToday(date)
      ? 'Today'
      : isYesterday(date)
        ? 'Yesterday'
        : isThisWeek(date)
          ? 'This week'
          : 'Older'

    if (!groups[group]) groups[group] = []
    groups[group].push(convo)
  })

  return groups
}
