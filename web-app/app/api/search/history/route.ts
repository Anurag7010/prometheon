import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { compose, withErrorHandler, withRequestId, withAuth } from '@/lib/middleware'
import { RequestContext } from '@/lib/middleware/types'
import { getSearchHistory, clearSearchHistory } from '@/db/repositories/search-history'

async function getHistoryHandler(req: NextRequest, context: RequestContext): Promise<NextResponse> {
  const { userId } = context
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const history = await getSearchHistory(userId, 10)
  return NextResponse.json({ history })
}

async function deleteHistoryHandler(req: NextRequest, context: RequestContext): Promise<NextResponse> {
  const { userId } = context
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  await clearSearchHistory(userId)
  return new NextResponse(null, { status: 204 })
}

const getHandler = compose(
  withErrorHandler,
  withRequestId,
  withAuth({ required: true })
)(getHistoryHandler)

const deleteHandler = compose(
  withErrorHandler,
  withRequestId,
  withAuth({ required: true })
)(deleteHistoryHandler)

export async function GET(req: NextRequest) {
  return getHandler(req, { requestId: '', startTime: Date.now() })
}

export async function DELETE(req: NextRequest) {
  return deleteHandler(req, { requestId: '', startTime: Date.now() })
}
