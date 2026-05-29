import { NextRequest, NextResponse } from 'next/server'
import { compose, withErrorHandler, withRequestId, withLogging } from '@/lib/middleware'
import type { RequestContext } from '@/lib/middleware/types'
import { clearSessionCookies } from '@/lib/auth'

async function logoutHandler(_req: NextRequest, _context: RequestContext): Promise<NextResponse> {
  await clearSessionCookies()
  return new NextResponse(null, { status: 204 })
}

const postHandler = compose(
  withErrorHandler,
  withRequestId,
  withLogging
)(logoutHandler)

export async function POST(req: NextRequest) {
  return postHandler(req, { requestId: '', startTime: 0 })
}
