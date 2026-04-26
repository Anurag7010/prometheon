import { NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { Middleware } from './types'
import { AuthError } from '../errors'

interface AuthOptions {
  // If true: missing/invalid token returns 401
  // If false: valid token attaches userId, missing token is allowed
  required: boolean
}

// JWT secret — in production this comes from environment variable
// Must be the same secret used to sign tokens in your auth system
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'dev-secret-change-in-production'
)

export function withAuth(options: AuthOptions = { required: true }): Middleware {
  return (handler) => {
    return async (req, context) => {
      const authHeader = req.headers.get('authorization')

      // Extract Bearer token from "Authorization: Bearer <token>"
      const token = authHeader?.startsWith('Bearer ')
        ? authHeader.slice(7) // remove "Bearer " prefix
        : null

      if (!token) {
        if (options.required) {
          // Return 401 with WWW-Authenticate header — standard for Bearer auth
          return NextResponse.json(
            {
              error: 'AUTH_REQUIRED',
              message: 'Authentication token is required',
              requestId: context.requestId,
              timestamp: new Date().toISOString(),
            },
            {
              status: 401,
              headers: { 'WWW-Authenticate': 'Bearer' },
            }
          )
        }
        // Not required — continue without userId
        return handler(req, context)
      }

      try {
        // Verify signature + expiry — jose throws on any failure
        const { payload } = await jwtVerify(token, JWT_SECRET)

        // Attach userId to context — downstream handlers use context.userId
        // Never mutate NextRequest — use context instead
        context.userId = payload.sub as string

        return handler(req, context)

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : ''

        // jose uses error names to distinguish failure types
        const code = errorMessage.includes('expired')
          ? 'AUTH_EXPIRED'
          : 'AUTH_INVALID'

        const message = code === 'AUTH_EXPIRED'
          ? 'Token has expired — please refresh'
          : 'Token is invalid'

        return NextResponse.json(
          {
            error: code,
            message,
            requestId: context.requestId,
            timestamp: new Date().toISOString(),
          },
          { status: 401 }
        )
      }
    }
  }
}