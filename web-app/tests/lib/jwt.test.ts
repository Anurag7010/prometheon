import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

// Jose has a cross-realm Uint8Array issue in vitest's VM isolation that prevents
// both sign and verify from working. Mock the jose module and test the wrapper
// logic: type field enforcement, error→null conversion, and payload passthrough.

const mockJwtVerifyResult = vi.fn()
const mockSignJwtInstance = {
  setProtectedHeader: vi.fn().mockReturnThis(),
  setSubject: vi.fn().mockReturnThis(),
  setIssuedAt: vi.fn().mockReturnThis(),
  setExpirationTime: vi.fn().mockReturnThis(),
  sign: vi.fn().mockResolvedValue('mock.jwt.token'),
}

// Must be a regular function (not arrow) — arrow functions can't be used with `new`
const MockSignJWT = vi.fn(function () {
  return mockSignJwtInstance
})

vi.mock('jose', () => ({
  SignJWT: MockSignJWT,
  jwtVerify: mockJwtVerifyResult,
}))

const { verifyAccessToken, verifyRefreshToken } = await import('../../lib/jwt')

describe('JWT utilities', () => {
  describe('verifyAccessToken', () => {
    it('returns correct payload for valid access token', async () => {
      mockJwtVerifyResult.mockResolvedValue({
        payload: { sub: 'user-1', email: 'u@example.com', type: 'access', exp: 9999999999 },
      })
      const payload = await verifyAccessToken('any.token')
      expect(payload?.sub).toBe('user-1')
      expect(payload?.email).toBe('u@example.com')
      expect(payload?.type).toBe('access')
    })

    it('returns null for expired token (jwtVerify throws)', async () => {
      mockJwtVerifyResult.mockRejectedValue(new Error('JWTExpired'))
      expect(await verifyAccessToken('any.token')).toBeNull()
    })

    it('returns null for tampered token (jwtVerify throws)', async () => {
      mockJwtVerifyResult.mockRejectedValue(new Error('JWSSignatureVerificationFailed'))
      expect(await verifyAccessToken('bad.token')).toBeNull()
    })

    it('returns null for refresh token payload used as access token (type mismatch)', async () => {
      mockJwtVerifyResult.mockResolvedValue({
        payload: { sub: 'user-1', type: 'refresh', tokenVersion: 0 },
      })
      expect(await verifyAccessToken('any.token')).toBeNull()
    })
  })

  describe('verifyRefreshToken', () => {
    it('returns correct payload for valid refresh token', async () => {
      mockJwtVerifyResult.mockResolvedValue({
        payload: { sub: 'user-1', type: 'refresh', tokenVersion: 3 },
      })
      const payload = await verifyRefreshToken('any.token')
      expect(payload?.sub).toBe('user-1')
      expect(payload?.type).toBe('refresh')
      expect(payload?.tokenVersion).toBe(3)
    })

    it('returns null when jwtVerify throws', async () => {
      mockJwtVerifyResult.mockRejectedValue(new Error('JWTExpired'))
      expect(await verifyRefreshToken('any.token')).toBeNull()
    })

    it('returns null for access token payload used as refresh token (type mismatch)', async () => {
      mockJwtVerifyResult.mockResolvedValue({
        payload: { sub: 'user-1', email: 'u@example.com', type: 'access' },
      })
      expect(await verifyRefreshToken('any.token')).toBeNull()
    })
  })
})
