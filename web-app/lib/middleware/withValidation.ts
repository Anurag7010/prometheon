import { NextResponse } from 'next/server'
import { ZodSchema } from 'zod'
import { Middleware } from './types'

export function withValidation<T>(schema: ZodSchema<T>): Middleware {
  return (handler) => {
    return async (req, context) => {

      // Attempt to parse JSON body — this can fail independently of Zod
      let rawBody: unknown
      try {
        rawBody = await req.json()
      } catch {
        // Body is not valid JSON at all — different from a Zod validation failure
        return NextResponse.json(
          {
            error: 'INVALID_JSON',
            message: 'Request body is not valid JSON',
            requestId: context.requestId,
            timestamp: new Date().toISOString(),
          },
          { status: 400 }
        )
      }

      // Run Zod validation against the parsed body
      const result = schema.safeParse(rawBody)

      if (!result.success) {
        // Map Zod issues to flat field-level error array
        // Each issue has a path array (field name) and a message
        const fields = result.error.issues.map(issue => ({
          field: issue.path.join('.'), // nested fields: "user.email"
          message: issue.message,
        }))

        return NextResponse.json(
          {
            error: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            fields,
            requestId: context.requestId,
            timestamp: new Date().toISOString(),
          },
          { status: 422 }
        )
      }

      // Attach parsed + typed body to context
      // Handler receives it from context — does not need to call req.json() again
      // req.json() can only be called once per request — body stream is consumed
      context.parsedBody = result.data

      return handler(req, context)
    }
  }
}