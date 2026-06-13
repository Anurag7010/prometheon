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

// POST /api/memories/extract — trigger memory extraction (internal)
async function postHandler(
  req: NextRequest,
  context: RequestContext
): Promise<NextResponse> {
  const { userId } = context
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const body = await req.json()
  await backendClient.extractMemories(userId, body.messages ?? [])
  return NextResponse.json({ status: 'ok' })
}

const wrappedPost = compose(
  withErrorHandler, withRequestId, withLogging, withAuth({ required: true })
)(postHandler)

export async function POST(req: NextRequest) {
  return wrappedPost(req, { requestId: '', startTime: 0 })
}
