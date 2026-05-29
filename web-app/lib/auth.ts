'use server'
import 'server-only'

import { cookies, headers } from 'next/headers'
import {
  verifyAccessToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from './jwt'

export type Session = {
  userId: string
  email: string
  accessToken: string
}

const REFRESH_TOKEN_COOKIE = 'refresh_token'
const ACCESS_TOKEN_COOKIE = 'access_token'

export async function getSession(): Promise<Session | null> {
  // Try Authorization header first (API routes, forwarded requests)
  const headerList = await headers()
  const authHeader = headerList.get('authorization')
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (bearerToken) {
    const payload = await verifyAccessToken(bearerToken)
    if (payload) {
      return { userId: payload.sub, email: payload.email, accessToken: bearerToken }
    }
  }

  // Fallback: access_token cookie (set during login/register for Server Component reads)
  const cookieStore = await cookies()
  const cookieToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value
  if (!cookieToken) return null

  const payload = await verifyAccessToken(cookieToken)
  if (!payload) return null

  return { userId: payload.sub, email: payload.email, accessToken: cookieToken }
}

export async function createSessionCookies(
  userId: string,
  email: string
): Promise<{ accessToken: string }> {
  const accessToken = await signAccessToken(userId, email)
  const refreshToken = await signRefreshToken(userId)

  const cookieStore = await cookies()

  // Refresh token — HttpOnly, restricted to refresh endpoint
  cookieStore.set(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth/refresh',
    maxAge: 7 * 24 * 60 * 60,
  })

  // Access token cookie — readable by Server Components (not HttpOnly)
  // Client also keeps a copy in memory for zero-cookie API calls
  cookieStore.set(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: false,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 15 * 60,
  })

  return { accessToken }
}

export async function clearSessionCookies(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(REFRESH_TOKEN_COOKIE, '', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth/refresh',
    maxAge: 0,
  })
  cookieStore.set(ACCESS_TOKEN_COOKIE, '', {
    httpOnly: false,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
}

export async function getRefreshTokenFromCookie(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(REFRESH_TOKEN_COOKIE)?.value ?? null
}

export { verifyRefreshToken }
