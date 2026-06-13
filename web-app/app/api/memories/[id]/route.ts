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

// DELETE /api/memories/[id] — delete a memory
async function deleteHandler(
  req: NextRequest,
  context: RequestContext & { params: { id: string } }
): Promise<NextResponse> {
  const { userId } = context
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  await backendClient.deleteMemory(context.params.id, userId)
  return new NextResponse(null, { status: 204 })
}

type RouteProps = { params: Promise<{ id: string }> }

const wrappedDelete = compose(
  withErrorHandler, withRequestId, withLogging, withAuth({ required: true })
)(
  (req, ctx) => deleteHandler(req, ctx as RequestContext & { params: { id: string } })
)

export async function DELETE(req: NextRequest, { params }: RouteProps) {
  const resolvedParams = await params
  return wrappedDelete(req, { requestId: '', startTime: 0, params: resolvedParams } as unknown as RequestContext)
}
