import 'server-only'

import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

export interface AccessTokenPayload extends JWTPayload {
  sub: string
  email: string
  type: 'access'
}

export interface RefreshTokenPayload extends JWTPayload {
  sub: string
  type: 'refresh'
  tokenVersion: number
}

const ACCESS_SECRET = new TextEncoder().encode(
  (process.env.JWT_SECRET ?? 'dev-secret-change-in-production') + '_access'
)

const REFRESH_SECRET = new TextEncoder().encode(
  (process.env.JWT_SECRET ?? 'dev-secret-change-in-production') + '_refresh'
)

export async function signAccessToken(
  userId: string,
  email: string
): Promise<string> {
  return new SignJWT({ email, type: 'access' } satisfies Omit<AccessTokenPayload, keyof JWTPayload>)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(ACCESS_SECRET)
}

export async function signRefreshToken(
  userId: string,
  tokenVersion = 0
): Promise<string> {
  return new SignJWT({ type: 'refresh', tokenVersion } satisfies Omit<RefreshTokenPayload, keyof JWTPayload>)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(REFRESH_SECRET)
}

export async function verifyAccessToken(
  token: string
): Promise<AccessTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, ACCESS_SECRET)
    if (payload['type'] !== 'access') return null
    return payload as AccessTokenPayload
  } catch {
    return null
  }
}

export async function verifyRefreshToken(
  token: string
): Promise<RefreshTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, REFRESH_SECRET)
    if (payload['type'] !== 'refresh') return null
    return payload as RefreshTokenPayload
  } catch {
    return null
  }
}
