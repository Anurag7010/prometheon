import { NextRequest, NextResponse } from 'next/server'
import { ZodTypeAny, z } from 'zod'

export interface RequestContext {
  requestId: string       // unique trace ID for this request
  userId?: string         // attached by withAuth if token is valid
  startTime: number       // ms timestamp — set by withLogging
  parsedBody?: unknown    // attached by withValidation after parsing
}

export type RouteHandler = (
  req: NextRequest,
  context: RequestContext
) => Promise<NextResponse>

// A middleware takes a handler and returns a wrapped handler
export type Middleware = (handler: RouteHandler) => RouteHandler