import { NextRequest, NextResponse } from 'next/server'
import {
  compose,
  withErrorHandler,
  withRequestId,
  withLogging,
  withAuth,
} from '@/lib/middleware'
import { RequestContext } from '@/lib/middleware/types'
import { updateConversationTitle, findConversationById } from '@/db/repositories/conversations'

async function patchHandler(
  req: NextRequest,
  context: RequestContext & { params: { id: string } }
): Promise<NextResponse> {
  const { userId } = context
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 })
  }

  if (
    !body ||
    typeof body !== 'object' ||
    !('title' in body) ||
    typeof (body as { title: unknown }).title !== 'string'
  ) {
    return NextResponse.json({ error: 'title is required and must be a string' }, { status: 422 })
  }

  const title = ((body as { title: string }).title).trim().slice(0, 100)
  if (!title) {
    return NextResponse.json({ error: 'title must not be empty' }, { status: 422 })
  }

  const conversation = await findConversationById(context.params.id, userId)
  if (!conversation) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  }

  await updateConversationTitle(context.params.id, userId, title)
  return NextResponse.json({ id: context.params.id, title })
}

type RouteProps = { params: Promise<{ id: string }> }

const wrappedPatch = compose(
  withErrorHandler, withRequestId, withLogging, withAuth({ required: true })
)(
  (req, ctx) => patchHandler(req, ctx as RequestContext & { params: { id: string } })
)

export async function PATCH(req: NextRequest, { params }: RouteProps) {
  const resolvedParams = await params
  return wrappedPatch(req, { requestId: '', startTime: 0, params: resolvedParams } as unknown as RequestContext)
}
