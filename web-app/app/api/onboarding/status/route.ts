import { NextRequest, NextResponse } from 'next/server'
import {
  compose,
  withErrorHandler,
  withRequestId,
  withLogging,
  withAuth,
} from '@/lib/middleware'
import { RequestContext } from '@/lib/middleware/types'
import { isOnboardingComplete } from '@/db/repositories/users'

async function handler(
  req: NextRequest,
  context: RequestContext,
): Promise<NextResponse> {
  const { userId } = context
  if (!userId) return NextResponse.json({ completed: false })

  const completed = await isOnboardingComplete(userId)
  return NextResponse.json({ completed })
}

const wrapped = compose(
  withErrorHandler, withRequestId, withLogging, withAuth({ required: true })
)(handler)

export async function GET(req: NextRequest) {
  return wrapped(req, { requestId: '', startTime: 0 })
}
