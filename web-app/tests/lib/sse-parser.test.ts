import { describe, it, expect, beforeEach } from 'vitest'
import { SSEParser, parseSSEStream } from '../../lib/sse-parser'

// ── SSEParser.parse() ─────────────────────────────────────────────────────────

describe('SSEParser', () => {
  let parser: SSEParser

  beforeEach(() => {
    parser = new SSEParser()
  })

  // ── Single complete events ────────────────────────────────────────────────

  it('parses a single token event', () => {
    const events = parser.parse('data: {"type":"token","content":"Hello"}\n\n')
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ type: 'token', content: 'Hello' })
  })

  it('parses a sources event with correct shape', () => {
    const sourcesJson = JSON.stringify({
      type: 'sources',
      sources: [{ content: 'chunk text', score: 0.9, metadata: { source: 'doc.pdf' } }],
    })
    const events = parser.parse(`data: ${sourcesJson}\n\n`)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'sources',
      sources: [{ content: 'chunk text', score: 0.9 }],
    })
  })

  it('parses a done event with traceId and latencyMs', () => {
    const events = parser.parse('data: {"type":"done","trace_id":"abc","latency_ms":1234}\n\n')
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ type: 'done', traceId: 'abc', latencyMs: 1234 })
  })

  it('parses no_results and retrieval_quality on the done event', () => {
    const events = parser.parse(
      'data: {"type":"done","trace_id":"abc","latency_ms":50,"no_results":true,"retrieval_quality":{"quality":"no_results","max_score":0,"avg_score":0,"chunk_count":0}}\n\n'
    )
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({
      type: 'done',
      traceId: 'abc',
      latencyMs: 50,
      noResults: true,
      retrievalQuality: { quality: 'no_results', maxScore: 0, avgScore: 0, chunkCount: 0 },
    })
  })

  it('parses real retrieval_quality scores on the done event', () => {
    const events = parser.parse(
      'data: {"type":"done","trace_id":"t","latency_ms":10,"no_results":false,"retrieval_quality":{"quality":"fair","max_score":0.72,"avg_score":0.68,"chunk_count":3}}\n\n'
    )
    expect(events[0]).toEqual({
      type: 'done',
      traceId: 't',
      latencyMs: 10,
      noResults: false,
      retrievalQuality: { quality: 'fair', maxScore: 0.72, avgScore: 0.68, chunkCount: 3 },
    })
  })

  it('omits noResults and retrievalQuality when the backend does not send them', () => {
    const events = parser.parse('data: {"type":"done","trace_id":"abc","latency_ms":5}\n\n')
    expect(events[0]).toEqual({ type: 'done', traceId: 'abc', latencyMs: 5 })
  })

  it('parses an error event', () => {
    const events = parser.parse('data: {"type":"error","message":"LLM timeout"}\n\n')
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ type: 'error', message: 'LLM timeout' })
  })

  // ── Multiple events in one chunk ──────────────────────────────────────────

  it('parses multiple events from a single chunk', () => {
    const chunk =
      'data: {"type":"token","content":"Hello"}\n\n' +
      'data: {"type":"token","content":" world"}\n\n'
    const events = parser.parse(chunk)
    expect(events).toHaveLength(2)
    expect(events[0]).toEqual({ type: 'token', content: 'Hello' })
    expect(events[1]).toEqual({ type: 'token', content: ' world' })
  })

  it('parses three events from one chunk in order', () => {
    const chunk =
      'data: {"type":"token","content":"A"}\n\n' +
      'data: {"type":"token","content":"B"}\n\n' +
      'data: {"type":"done","trace_id":"t1","latency_ms":100}\n\n'
    const events = parser.parse(chunk)
    expect(events).toHaveLength(3)
    expect(events[2]).toMatchObject({ type: 'done' })
  })

  // ── Events split across chunks ────────────────────────────────────────────

  it('returns empty array for incomplete event (first chunk)', () => {
    // Split mid-JSON — no \n\n terminator yet
    const events = parser.parse('data: {"type":"token","con')
    expect(events).toHaveLength(0)
  })

  it('yields the event when the completing chunk arrives', () => {
    parser.parse('data: {"type":"token","con')
    const events = parser.parse('tent":"Hello"}\n\n')
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ type: 'token', content: 'Hello' })
  })

  it('handles event split exactly at \\n\\n boundary', () => {
    parser.parse('data: {"type":"token","content":"A"}\n')
    const events = parser.parse('\ndata: {"type":"token","content":"B"}\n\n')
    // First event completes when second chunk adds the \n
    expect(events.some(e => e.type === 'token')).toBe(true)
  })

  // ── Malformed / unknown events ────────────────────────────────────────────

  it('skips malformed JSON events without crashing', () => {
    const chunk =
      'data: {broken json}\n\n' +
      'data: {"type":"token","content":"OK"}\n\n'
    const events = parser.parse(chunk)
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ type: 'token', content: 'OK' })
  })

  it('skips events with unknown type', () => {
    const chunk = 'data: {"type":"future_event","foo":"bar"}\n\n'
    const events = parser.parse(chunk)
    expect(events).toHaveLength(0)
  })

  // ── [DONE] sentinel ───────────────────────────────────────────────────────

  it('treats [DONE] sentinel as a done event', () => {
    const events = parser.parse('data: [DONE]\n\n')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'done' })
  })

  // ── SSE spec field handling ───────────────────────────────────────────────

  it('ignores event: field prefix lines', () => {
    // SSE spec allows "event: typename\ndata: {...}" — we only care about data
    const chunk = 'event: token\ndata: {"type":"token","content":"Hi"}\n\n'
    const events = parser.parse(chunk)
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ type: 'token', content: 'Hi' })
  })

  it('ignores id: field prefix lines', () => {
    const chunk = 'id: 42\ndata: {"type":"token","content":"Hi"}\n\n'
    const events = parser.parse(chunk)
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ type: 'token', content: 'Hi' })
  })

  // ── Edge cases ────────────────────────────────────────────────────────────

  it('handles empty data line without crashing', () => {
    const events = parser.parse('data: \n\n')
    expect(events).toHaveLength(0)
  })

  it('accepts token event with empty content string', () => {
    const events = parser.parse('data: {"type":"token","content":""}\n\n')
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ type: 'token', content: '' })
  })

  it('does not duplicate events across consecutive parse calls', () => {
    parser.parse('data: {"type":"token","content":"First"}\n\n')
    const events = parser.parse('data: {"type":"token","content":"Second"}\n\n')
    // Second call must only return the second event, not the first again
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ type: 'token', content: 'Second' })
  })

  it('reset() clears the internal buffer', () => {
    // Start an incomplete event
    parser.parse('data: {"type":"token","con')
    parser.reset()
    // After reset the incomplete data is gone — next chunk is treated fresh
    const events = parser.parse('tent":"Hello"}\n\n')
    // Without the first half, this is invalid JSON — should yield 0 events
    expect(events).toHaveLength(0)
  })
})

// ── parseSSEStream() ──────────────────────────────────────────────────────────

describe('parseSSEStream', () => {
  function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder()
    return new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk))
        }
        controller.close()
      },
    })
  }

  async function collectEvents(stream: ReadableStream<Uint8Array>) {
    const events = []
    for await (const event of parseSSEStream(stream)) {
      events.push(event)
    }
    return events
  }

  it('yields events from a complete single-chunk stream', async () => {
    const stream = makeStream([
      'data: {"type":"token","content":"Hello"}\n\ndata: {"type":"done","trace_id":"t1","latency_ms":100}\n\n',
    ])
    const events = await collectEvents(stream)
    expect(events).toHaveLength(2)
    expect(events[0]).toEqual({ type: 'token', content: 'Hello' })
    expect(events[1]).toMatchObject({ type: 'done' })
  })

  it('yields events from a multi-chunk stream', async () => {
    const stream = makeStream([
      'data: {"type":"token","content":"A"}\n\n',
      'data: {"type":"token","content":"B"}\n\n',
      'data: {"type":"done","trace_id":"t2","latency_ms":50}\n\n',
    ])
    const events = await collectEvents(stream)
    expect(events).toHaveLength(3)
    expect(events[0]).toEqual({ type: 'token', content: 'A' })
    expect(events[1]).toEqual({ type: 'token', content: 'B' })
  })

  it('handles events split across chunks', async () => {
    const stream = makeStream([
      'data: {"type":"token","con',
      'tent":"Hello"}\n\n',
    ])
    const events = await collectEvents(stream)
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ type: 'token', content: 'Hello' })
  })

  it('returns empty array for empty stream', async () => {
    const stream = makeStream([])
    const events = await collectEvents(stream)
    expect(events).toHaveLength(0)
  })
})
