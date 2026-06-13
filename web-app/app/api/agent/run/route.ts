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
import { MAX_QUERY_LENGTH } from '@/lib/constants'

const AgentRunSchema = z.object({
  query: z.string().min(1).max(MAX_QUERY_LENGTH),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional().default([]),
})

async function agentRunHandler(
  req: NextRequest,
  context: RequestContext
): Promise<NextResponse> {
  const body = context.parsedBody as z.infer<typeof AgentRunSchema>

  const queryRecord = await queriesRepository.create({
    userId: context.userId as string,
    queryText: body.query,
    documentId: null,
  })

  const startTime = Date.now()

  const result = await backendClient.runAgent(body.query, {
    history: body.history,
    userId: context.userId as string,
    traceId: context.requestId,
  })

  await queriesRepository.updateAnswer(
    queryRecord.id,
    result.answer,
    Date.now() - startTime,
    { steps: result.totalSteps, stoppedReason: result.stoppedReason }
  )

  return NextResponse.json(result)
}

const handler = compose(
  withErrorHandler,
  withRequestId,
  withLogging,
  withAuth({ required: true }),
  withValidation(AgentRunSchema)
)(agentRunHandler)

export async function POST(req: NextRequest) {
  return handler(req, { requestId: '', startTime: 0 })
}
