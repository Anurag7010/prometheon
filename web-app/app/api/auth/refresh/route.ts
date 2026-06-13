import { NextRequest, NextResponse } from 'next/server'
import { compose, withErrorHandler, withRequestId, withLogging } from '@/lib/middleware'
import type { RequestContext } from '@/lib/middleware/types'
import { getRefreshTokenFromCookie, createSessionCookies, verifyRefreshToken } from '@/lib/auth'
import { findById } from '@/db/repositories/users'

async function refreshHandler(_req: NextRequest, context: RequestContext): Promise<NextResponse> {
  const refreshToken = await getRefreshTokenFromCookie()
  if (!refreshToken) {
    return NextResponse.json(
      {
        error: 'AUTH_ERROR',
        message: 'No refresh token',
        requestId: context.requestId,
        timestamp: new Date().toISOString(),
      },
      { status: 401 }
    )
  }

  const payload = await verifyRefreshToken(refreshToken)
  if (!payload) {
    return NextResponse.json(
      {
        error: 'AUTH_ERROR',
        message: 'Invalid or expired refresh token',
        requestId: context.requestId,
        timestamp: new Date().toISOString(),
      },
      { status: 401 }
    )
  }

  const user = await findById(payload.sub ?? '')
  if (!user) {
    return NextResponse.json(
      {
        error: 'AUTH_ERROR',
        message: 'User not found',
        requestId: context.requestId,
        timestamp: new Date().toISOString(),
      },
      { status: 401 }
    )
  }

  const { accessToken } = await createSessionCookies(user.id, user.email)

  return NextResponse.json({ accessToken, user: { id: user.id, email: user.email } })
}

const postHandler = compose(
  withErrorHandler,
  withRequestId,
  withLogging
)(refreshHandler)

export async function POST(req: NextRequest) {
  return postHandler(req, { requestId: '', startTime: 0 })
}
