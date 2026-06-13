import { NextRequest, NextResponse } from 'next/server'
import {
  compose,
  withErrorHandler,
  withRequestId,
  withLogging,
  withAuth,
} from '@/lib/middleware'
import { RequestContext } from '@/lib/middleware/types'
import { backendClient } from '@/lib/backend-client'

// GET /api/memories — list user's long-term memories (proxies to Python backend)
async function getHandler(
  req: NextRequest,
  context: RequestContext
): Promise<NextResponse> {
  const { userId } = context
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const result = await backendClient.listMemories(userId)
  return NextResponse.json(result)
}

const wrappedGet = compose(
  withErrorHandler, withRequestId, withLogging, withAuth({ required: true })
)(getHandler)

export async function GET(req: NextRequest) {
  return wrappedGet(req, { requestId: '', startTime: 0 })
}
