import { NextResponse } from 'next/server'
import { verifyAccessToken } from '@/lib/jwt'
import { toUserId } from '@/types'
import { Middleware } from './types'

interface AuthOptions {
  required: boolean
}

export function withAuth(options: AuthOptions = { required: true }): Middleware {
  return (handler) => {
    return async (req, context) => {
      const authHeader = req.headers.get('authorization')
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

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
