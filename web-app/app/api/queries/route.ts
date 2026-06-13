import { NextRequest, NextResponse } from 'next/server'
import {
  compose,
  withErrorHandler,
  withRequestId,
  withLogging,
  withAuth,
} from '@/lib/middleware'
import { RequestContext } from '@/lib/middleware/types'
import { queriesRepository } from '@/db'

async function listHandler(
  req: NextRequest,
  context: RequestContext
): Promise<NextResponse> {
  const { userId } = context
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const queries = await queriesRepository.findByUser(userId)
  return NextResponse.json({ data: queries, requestId: context.requestId })
}

const getHandler = compose(
  withErrorHandler,
  withRequestId,
  withLogging,
  withAuth({ required: true })
)(listHandler)

export async function GET(req: NextRequest) {
  return getHandler(req, { requestId: '', startTime: 0 })
}
