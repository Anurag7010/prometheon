import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  compose,
  withErrorHandler,
  withRequestId,
  withLogging,
  withAuth,
  withValidation,
} from '@/lib/middleware'
import { RequestContext } from '@/lib/middleware/types'
import { queriesRepository } from '@/db'
import { backendClient } from '@/lib/backend-client'
import { BackendError, mapBackendError } from '@/lib/backend-error-mapper'
import { logError } from '@/lib/error-logger'
import { MAX_QUERY_LENGTH } from '@/lib/constants'

const AskSchema = z.object({
  query: z.string().min(1, 'Query is required').max(MAX_QUERY_LENGTH),
  topK: z.number().int().min(1).max(20).optional().default(5),
  strategy: z.enum(['semantic', 'hybrid', 'multi_query', 'rrf']).optional().default('semantic'),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional().default([]),
  documentId: z.string().uuid().optional(),
})

async function streamHandler(
  req: NextRequest,
  context: RequestContext
): Promise<NextResponse> {
  const body = context.parsedBody as z.infer<typeof AskSchema>
  const { userId } = context
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const queryRecord = await queriesRepository.create({
    userId,
    queryText: body.query,
    documentId: body.documentId ?? null,
  })

  let pythonStream: ReadableStream<Uint8Array>
  try {
    pythonStream = await backendClient.askStream(body.query, {
      topK: body.topK,
      strategy: body.strategy,
      history: body.history,
      traceId: context.requestId,
    })
  } catch (err) {
    const serviceError = err instanceof BackendError ? mapBackendError(err) : mapBackendError(err)
    await queriesRepository.updateAnswer(queryRecord.id, '', 0, { error: serviceError.code })
    return NextResponse.json(
      {
        error: serviceError.code,
        message: serviceError.message,
        requestId: context.requestId,
        timestamp: new Date().toISOString(),
      },
      { status: 502 }
    )
  }

  // TransformStream intercepts done events to persist the answer while passing
  // all bytes through unchanged. Buffer by \n\n to handle SSE events split across chunks.
  let lineBuffer = ''
  let accumulatedAnswer = ''

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      lineBuffer += new TextDecoder().decode(chunk)
      const parts = lineBuffer.split('\n\n')
      lineBuffer = parts.pop() ?? ''

      for (const part of parts) {
        const trimmed = part.trim()
        if (!trimmed.startsWith('data: ')) continue
        try {
          const data = JSON.parse(trimmed.slice(6)) as Record<string, unknown>
          if (data['type'] === 'token' && typeof data['content'] === 'string') {
            accumulatedAnswer += data['content']
          } else if (data['type'] === 'done') {
            const latencyMs = typeof data['latency_ms'] === 'number' ? data['latency_ms'] : 0
            const traceId = typeof data['trace_id'] === 'string' ? data['trace_id'] : ''
            // Fire and forget — do not block the stream
            queriesRepository
              .updateAnswer(queryRecord.id, accumulatedAnswer, latencyMs, { traceId })
              .catch((err: unknown) => logError(err instanceof Error ? err : new Error(String(err))))
          }
        } catch {
          // Malformed JSON event — pass through unchanged
        }
      }
      controller.enqueue(chunk)
    },
  })

  // Pipe Python stream through transform; errors in the pipe are logged, not thrown
  pythonStream.pipeTo(writable).catch((err: unknown) => logError(err instanceof Error ? err : new Error(String(err))))

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Request-ID': context.requestId,
    },
  }) as unknown as NextResponse
}

const postHandler = compose(
  withErrorHandler,
  withRequestId,
  withLogging,
  withAuth({ required: true }),
  withValidation(AskSchema)
)(streamHandler)

export async function POST(req: NextRequest) {
  return postHandler(req, { requestId: '', startTime: 0 })
}
