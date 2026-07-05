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
import { getConversationMessages, addMessage } from '@/db/repositories/messages'
import { findConversationById, updateConversationTitle } from '@/db/repositories/conversations'
import { MAX_QUERY_LENGTH } from '@/lib/constants'

// /ask auto-routes complex queries to the ReAct agent, which can make ~9
// sequential LLM calls on the free (Groq) tier. Match the agent route's budget
// so a long agent-routed answer doesn't get cut off by Vercel's default limit.
export const maxDuration = 60

const AskSchema = z.object({
  query: z.string().min(1, 'Query is required').max(MAX_QUERY_LENGTH),
  topK: z.number().int().min(1).max(20).optional().default(5),
  strategy: z.enum(['semantic', 'hybrid', 'multi_query', 'rrf']).optional().default('semantic'),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional().default([]),
  documentId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
})

async function listHandler(
  req: NextRequest,
  context: RequestContext
): Promise<NextResponse> {
  const { searchParams } = req.nextUrl
  const documentId = searchParams.get('documentId')

  const { userId } = context
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const results = documentId
    ? await queriesRepository.findByDocument(documentId)
    : await queriesRepository.findByUser(userId)

  return NextResponse.json({ data: results, requestId: context.requestId })
}

async function createHandler(
  req: NextRequest,
  context: RequestContext
): Promise<NextResponse> {
  const { userId } = context
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const body = context.parsedBody as z.infer<typeof AskSchema>
  const { conversationId } = body

  // Ownership check up front: a caller must not read history from or write
  // messages into a conversation that belongs to another user.
  const conversation = conversationId
    ? await findConversationById(conversationId, userId)
    : null
  if (conversationId && !conversation) {
    return NextResponse.json(
      { error: 'NOT_FOUND', message: 'Conversation not found', requestId: context.requestId },
      { status: 404 }
    )
  }

  // Load conversation history from DB if conversationId is provided
  let historyFromDB: Array<{ role: 'user' | 'assistant'; content: string }> = []
  if (conversationId) {
    const dbMessages = await getConversationMessages(conversationId, 100)
    historyFromDB = dbMessages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))
  }

  // DB history takes precedence over history in request body
  const effectiveHistory = historyFromDB.length > 0 ? historyFromDB : body.history

  // Create query record before AI call — we have a record even if AI fails
  const queryRecord = await queriesRepository.create({
    userId: userId,
    queryText: body.query,
    documentId: body.documentId ?? null,
  })

  try {
    const aiResponse = await backendClient.ask(body.query, {
      topK: body.topK,
      strategy: body.strategy,
      history: effectiveHistory,
      traceId: context.requestId,
      userId: userId,
      userEmail: context.email,
    })

    // Persist answer and latency for query history (latencyMs is integer column — round float)
    await queriesRepository.updateAnswer(
      queryRecord.id,
      aiResponse.answer,
      Math.round(aiResponse.latencyBreakdown.totalMs),
      { sources: aiResponse.sources, traceId: aiResponse.traceId }
    )

    // Persist messages to conversation if conversationId was provided
    if (conversationId && conversation) {
      await addMessage({ conversationId, role: 'user', content: body.query, tokenCount: 0 })
      await addMessage({ conversationId, role: 'assistant', content: aiResponse.answer, tokenCount: 0 })

      // Auto-title: update if still default title
      if (conversation.title === 'New Conversation') {
        await updateConversationTitle(conversationId, userId, body.query.slice(0, 50))
      }

      // Non-blocking: trigger memory extraction for the conversation
      const aiBackendUrl = process.env.AI_BACKEND_URL ?? ''
      fetch(`${aiBackendUrl}/memories/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.AI_BACKEND_API_KEY ?? '',
        },
        body: JSON.stringify({
          user_id: userId,
          messages: [
            ...historyFromDB,
            { role: 'user', content: body.query },
            { role: 'assistant', content: aiResponse.answer },
          ],
        }),
      }).catch(() => { /* non-fatal */ })
    }

    // Return AskResponse directly — the browser needs the AI answer, not the DB record
    return NextResponse.json(aiResponse, { status: 200 })

  } catch (err) {
    const serviceError = err instanceof BackendError
      ? mapBackendError(err)
      : mapBackendError(err)

    // Persist failure so query history reflects the error
    await queriesRepository.updateAnswer(
      queryRecord.id,
      '',
      0,
      { error: serviceError.code }
    )

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
}

const getHandler = compose(
  withErrorHandler, withRequestId, withLogging, withAuth({ required: true })
)(listHandler)

const postHandler = compose(
  withErrorHandler, withRequestId, withLogging,
  withAuth({ required: true }),
  withValidation(AskSchema)
)(createHandler)

export async function GET(req: NextRequest) {
  return getHandler(req, { requestId: '', startTime: 0 })
}
export async function POST(req: NextRequest) {
  return postHandler(req, { requestId: '', startTime: 0 })
}
