import { NextRequest, NextResponse } from 'next/server'
import type { UserId } from '../../types'

export interface RequestContext {
  requestId: string
  startTime: number
  userId?: UserId
  email?: string
  accessToken?: string
  parsedBody?: unknown
}

export type RouteHandler = (
  req: NextRequest,
  context: RequestContext
) => Promise<NextResponse>

export type Middleware = (handler: RouteHandler) => RouteHandler
