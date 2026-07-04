import type { Source, RetrievalQuality } from '@/types'

// ── SSE event types matching the Python backend ───────────────────────────────

export type SSEEvent =
  | { type: 'token'; content: string }
  | { type: 'sources'; sources: Source[] }
  | {
      type: 'done'
      traceId: string
      latencyMs: number
      noResults?: boolean
      retrievalQuality?: RetrievalQuality
    }
  | { type: 'error'; message: string }

// ── SSEParser ─────────────────────────────────────────────────────────────────
// Handles chunks that may contain multiple events or be split mid-event.
// Events are delimited by \n\n in the SSE spec.

export class SSEParser {
  private buffer = ''

  // Feed a new chunk of text. Returns any complete events found in this chunk.
  parse(chunk: string): SSEEvent[] {
    this.buffer += chunk
    const parts = this.buffer.split('\n\n')
    // Last element is either empty (trailing \n\n) or an incomplete event
    this.buffer = parts.pop() ?? ''

    const events: SSEEvent[] = []
    for (const part of parts) {
      const trimmed = part.trim()
      if (!trimmed) continue

      // Collect data lines (multi-line data is concatenated with newlines per spec,
      // but our backend always sends single-line JSON data events)
      const dataLines: string[] = []
      for (const line of trimmed.split('\n')) {
        if (line.startsWith('data: ')) {
          dataLines.push(line.slice(6))
        } else if (line === 'data:') {
          dataLines.push('')
        }
        // Skip comment lines (: ...) and field names without values
      }

      if (dataLines.length === 0) continue

      const dataStr = dataLines.join('\n')

      // OpenAI-style [DONE] sentinel — treat as a done event without fields
      if (dataStr === '[DONE]') {
        events.push({ type: 'done', traceId: '', latencyMs: 0 })
        continue
      }

      try {
        const parsed = JSON.parse(dataStr) as Record<string, unknown>
        const event = this.toTypedEvent(parsed)
        if (event) events.push(event)
      } catch {
        // Malformed JSON — skip the event rather than crashing the stream
      }
    }
    return events
  }

  reset(): void {
    this.buffer = ''
  }

  private toTypedEvent(data: Record<string, unknown>): SSEEvent | null {
    switch (data['type']) {
      case 'token':
        if (typeof data['content'] === 'string') {
          return { type: 'token', content: data['content'] }
        }
        return null
      case 'sources': {
        const rawSources = Array.isArray(data['sources']) ? data['sources'] : []
        const sources: Source[] = rawSources.map((s: unknown) => {
          const src = s as Record<string, unknown>
          return {
            content: typeof src['content'] === 'string' ? src['content'] : '',
            score: typeof src['score'] === 'number' ? src['score'] : null,
            metadata: (src['metadata'] as Record<string, unknown>) ?? {},
          }
        })
        return { type: 'sources', sources }
      }
      case 'done': {
        let retrievalQuality: RetrievalQuality | undefined
        const rawQuality = data['retrieval_quality']
        if (rawQuality && typeof rawQuality === 'object') {
          const rq = rawQuality as Record<string, unknown>
          const quality = rq['quality']
          if (
            quality === 'good' || quality === 'fair' || quality === 'poor' || quality === 'no_results'
          ) {
            retrievalQuality = {
              quality,
              maxScore: typeof rq['max_score'] === 'number' ? rq['max_score'] : 0,
              avgScore: typeof rq['avg_score'] === 'number' ? rq['avg_score'] : 0,
              chunkCount: typeof rq['chunk_count'] === 'number' ? rq['chunk_count'] : 0,
            }
          }
        }
        return {
          type: 'done',
          traceId: typeof data['trace_id'] === 'string' ? data['trace_id'] : '',
          latencyMs: typeof data['latency_ms'] === 'number' ? data['latency_ms'] : 0,
          ...(typeof data['no_results'] === 'boolean' ? { noResults: data['no_results'] } : {}),
          ...(retrievalQuality ? { retrievalQuality } : {}),
        }
      }
      case 'error':
        return {
          type: 'error',
          message: typeof data['message'] === 'string' ? data['message'] : 'Unknown stream error',
        }
      default:
        return null
    }
  }
}

// ── parseSSEStream ────────────────────────────────────────────────────────────
// Consume a ReadableStream<Uint8Array> and yield typed SSEEvents.

export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<SSEEvent> {
  const decoder = new TextDecoder()
  const parser = new SSEParser()
  const reader = stream.getReader()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const text = decoder.decode(value, { stream: true })
      const events = parser.parse(text)
      for (const event of events) {
        yield event
      }
    }
    // Flush any remaining buffered text when stream closes
    const remaining = decoder.decode()
    if (remaining) {
      const events = parser.parse(remaining)
      for (const event of events) {
        yield event
      }
    }
  } finally {
    reader.releaseLock()
  }
}
