import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyAccessToken } from '@/lib/jwt'
import { toUserId } from '@/types'
import { Middleware } from './types'

interface AuthOptions {
  required: boolean
}

const ACCESS_TOKEN_COOKIE = 'access_token'

export function withAuth(options: AuthOptions = { required: true }): Middleware {
  return (handler) => {
    return async (req, context) => {
      const authHeader = req.headers.get('authorization')
      let token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

      // Fallback to cookie — handles SSR/page-load requests where the
      // client-side Bearer token hasn't been restored from the refresh cookie yet.
      // cookies() throws outside a Next.js request context (e.g. unit tests); treat as no cookie.
      if (!token) {
        try {
          const cookieStore = await cookies()
          token = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value ?? null
        } catch {
          token = null
        }
      }

      if (!token) {
        if (options.required) {
          return NextResponse.json(
            {
              error: 'AUTH_ERROR',
              message: 'Authentication required',
              requestId: context.requestId,
              timestamp: new Date().toISOString(),
            },
            {
              status: 401,
              headers: { 'WWW-Authenticate': 'Bearer' },
            }
          )
        }
        return handler(req, context)
      }

      const payload = await verifyAccessToken(token)
      if (!payload) {
        return NextResponse.json(
          {
            error: 'AUTH_ERROR',
            message: 'Invalid or expired token',
            requestId: context.requestId,
            timestamp: new Date().toISOString(),
          },
          { status: 401 }
        )
      }

      context.userId = toUserId(payload.sub)
      context.email = payload.email
      context.accessToken = token

      return handler(req, context)
    }
  }
}
