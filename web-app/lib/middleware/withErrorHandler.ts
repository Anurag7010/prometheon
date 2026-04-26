import { NextResponse } from 'next/server'
import { Middleware } from './types'
import { AppError, ValidationError } from '../errors'

export const withErrorHandler: Middleware = (handler) => {
  return async (req, context) => {
    try {
      return await handler(req, context)

    } catch (err) {

      // Known application errors — map to correct status codes
      if (err instanceof ValidationError) {
        return NextResponse.json(
          {
            error: err.code,
            message: err.message,
            fields: err.fields,
            requestId: context.requestId,
            timestamp: new Date().toISOString(),
          },
          { status: err.statusCode }
        )
      }

      if (err instanceof AppError) {
        // AuthError, NotFoundError, ConflictError all extend AppError
        // statusCode and code are set in their constructors
        return NextResponse.json(
          {
            error: err.code,
            message: err.message,
            requestId: context.requestId,
            timestamp: new Date().toISOString(),
          },
          { status: err.statusCode }
        )
      }

      // Unknown error — 500
      // Log full details internally, never expose to client
      console.error('[unhandled error]', JSON.stringify({
        requestId: context.requestId,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      }))

      return NextResponse.json(
        {
          error: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred',
          requestId: context.requestId,
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      )
    }
  }
}