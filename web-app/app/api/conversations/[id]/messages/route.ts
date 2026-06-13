import { NextRequest, NextResponse } from 'next/server'
import {
  compose,
  withErrorHandler,
  withRequestId,
  withLogging,
  withAuth,
} from '@/lib/middleware'
import { RequestContext } from '@/lib/middleware/types'
import { findConversationById } from '@/db/repositories/conversations'
import { getConversationMessages } from '@/db/repositories/messages'

// GET /api/conversations/[id]/messages — load message history for a conversation
// Verifies ownership before returning messages
async function getHandler(
  req: NextRequest,
  context: RequestContext & { params: { id: string } }
): Promise<NextResponse> {
  const { userId } = context
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const conversation = await findConversationById(context.params.id, userId)
  if (!conversation) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  }
  const messages = await getConversationMessages(context.params.id, 100)
  return NextResponse.json({ messages })
}

type RouteProps = { params: Promise<{ id: string }> }

const wrappedGet = compose(
  withErrorHandler, withRequestId, withLogging, withAuth({ required: true })
)(
  (req, ctx) => getHandler(req, ctx as RequestContext & { params: { id: string } })
)

export async function GET(req: NextRequest, { params }: RouteProps) {
  const resolvedParams = await params
  return wrappedGet(req, { requestId: '', startTime: 0, params: resolvedParams } as unknown as RequestContext)
}
