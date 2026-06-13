import { NextRequest, NextResponse } from 'next/server'
import {
  compose,
  withErrorHandler,
  withRequestId,
  withLogging,
  withAuth,
} from '@/lib/middleware'
import { RequestContext } from '@/lib/middleware/types'
import {
  createConversation,
  findConversationsByUser,
} from '@/db/repositories/conversations'

// GET /api/conversations — list user's 20 most recent conversations
async function listHandler(
  req: NextRequest,
  context: RequestContext
): Promise<NextResponse> {
  const { userId } = context
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const conversations = await findConversationsByUser(userId, 20)
  return NextResponse.json({ conversations })
}

// POST /api/conversations — create a new conversation
async function createHandler(
  req: NextRequest,
  context: RequestContext
): Promise<NextResponse> {
  const { userId } = context
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const conversation = await createConversation({ userId })
  return NextResponse.json(conversation, { status: 201 })
}

const wrappedGet = compose(
  withErrorHandler, withRequestId, withLogging, withAuth({ required: true })
)(listHandler)

const wrappedPost = compose(
  withErrorHandler, withRequestId, withLogging, withAuth({ required: true })
)(createHandler)

export async function GET(req: NextRequest) {
  return wrappedGet(req, { requestId: '', startTime: 0 })
}

export async function POST(req: NextRequest) {
  return wrappedPost(req, { requestId: '', startTime: 0 })
}
