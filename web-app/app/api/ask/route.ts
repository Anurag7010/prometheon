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
import { aiService } from '@/services/ai-service'

// Zod schema — defines exactly what the request body must look like
const AskSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  top_k: z.number().int().positive().optional().default(5),
  history: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    })
  ).optional().default([]),
})

// Route handler — only runs if all middleware pass
// context.parsedBody is already typed and validated by withValidation
async function askHandler(
  req: NextRequest,
  context: RequestContext
): Promise<NextResponse> {
  const body = context.parsedBody as z.infer<typeof AskSchema>

  // Forward requestId to AI backend for end-to-end tracing
  const controller = new AbortController()

  const response = await aiService.ask({
    query: body.query,
    history: body.history,
    signal: controller.signal,
  })

  if (response.error) {
    return NextResponse.json(
      {
        error: response.error.code,
        message: response.error.message,
        requestId: context.requestId,
        timestamp: new Date().toISOString(),
      },
      { status: response.status ?? 500 }
    )
  }

  return NextResponse.json(
    {
      data: response.data,
      requestId: context.requestId,
      latencyMs: response.latencyMs,
    },
    { status: 200 }
  )
}

// Compose the full middleware chain
// withErrorHandler outermost — catches everything
// withRequestId second — ID must exist before logging
// withLogging third — wraps handler to capture final status
// withAuth fourth — protects business logic
// withValidation last before handler — body parsed once here
const composedHandler = compose(
  withErrorHandler,
  withRequestId,
  withLogging,
  withAuth({ required: true }),
  withValidation(AskSchema)
)(askHandler)

// Next.js App Router expects named exports per HTTP method
export async function POST(req: NextRequest): Promise<NextResponse> {
  // Initialize context — withRequestId and withLogging will populate it
  const context: RequestContext = {
    requestId: '',
    startTime: 0,
  }
  return composedHandler(req, context)
}