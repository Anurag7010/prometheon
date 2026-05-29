// Shared jose-free JWT implementation for tests.
// Use by adding: vi.mock('../../lib/jwt', () => jwtMock())
// at the top of any test file that needs withAuth to work.

import { createHmac } from 'crypto'

const JWT_SECRET_BASE = process.env.JWT_SECRET ?? 'dev-secret-change-in-production'
const ACCESS_SECRET = JWT_SECRET_BASE + '_access'

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function parsePayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const decoded = Buffer.from(
      parts[1].replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    ).toString('utf-8')
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

function verifyHs256(token: string, secret: string): boolean {
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [h, p, sigB64] = parts
  const expectedSig = base64url(createHmac('sha256', secret).update(`${h}.${p}`).digest())
  return expectedSig === sigB64
}

export function jwtMock() {
  return {
    verifyAccessToken: async (token: string) => {
      if (!verifyHs256(token, ACCESS_SECRET)) return null
      const payload = parsePayload(token)
      if (!payload) return null
      if (payload['type'] !== 'access') return null
      if (typeof payload['exp'] === 'number' && payload['exp'] < Date.now() / 1000) return null
      return payload
    },
    verifyRefreshToken: async () => null,
    signAccessToken: async () => 'mock-access-token',
    signRefreshToken: async () => 'mock-refresh-token',
  }
}
