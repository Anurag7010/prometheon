import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeRequest } from '../setup/server'

vi.mock('server-only', () => ({}))

// Mock next/headers — cookies() and headers() are not available in vitest
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(() => null),
    set: vi.fn(),
  })),
  headers: vi.fn(() => ({
    get: vi.fn(() => null),
  })),
}))

// Mock DB repositories
vi.mock('../../db/repositories/users', () => ({
  findByEmail: vi.fn(),
  createUser: vi.fn(),
  emailExists: vi.fn(),
  findById: vi.fn(),
  incrementTokenVersion: vi.fn(),
}))

// Mock password utilities
vi.mock('../../lib/password', () => ({
  hashPassword: vi.fn(async () => '$2b$12$hashedpassword'),
  verifyPassword: vi.fn(async () => true),
  validatePasswordStrength: vi.fn(() => ({ valid: true, errors: [] })),
}))

// Mock JWT / auth
vi.mock('../../lib/auth', () => ({
  createSessionCookies: vi.fn(async () => ({ accessToken: 'mock-access-token' })),
  clearSessionCookies: vi.fn(async () => {}),
  getRefreshTokenFromCookie: vi.fn(async () => null),
  verifyRefreshToken: vi.fn(async () => null),
  getSession: vi.fn(async () => null),
}))

import * as usersRepo from '../../db/repositories/users'
import * as passwordLib from '../../lib/password'
import * as authLib from '../../lib/auth'
import { POST as registerPOST } from '../../app/api/auth/register/route'
import { POST as loginPOST } from '../../app/api/auth/login/route'
import { POST as logoutPOST } from '../../app/api/auth/logout/route'
import { POST as refreshPOST } from '../../app/api/auth/refresh/route'

const mockFindByEmail = vi.mocked(usersRepo.findByEmail)
const mockCreateUser = vi.mocked(usersRepo.createUser)
const mockEmailExists = vi.mocked(usersRepo.emailExists)
const mockFindById = vi.mocked(usersRepo.findById)
const mockVerifyPassword = vi.mocked(passwordLib.verifyPassword)
const mockValidatePassword = vi.mocked(passwordLib.validatePasswordStrength)
const mockCreateSessionCookies = vi.mocked(authLib.createSessionCookies)
const mockGetRefreshToken = vi.mocked(authLib.getRefreshTokenFromCookie)
const mockVerifyRefresh = vi.mocked(authLib.verifyRefreshToken)

const MOCK_USER = {
  id: 'user-uuid-1',
  email: 'test@example.com',
  passwordHash: '$2b$12$hashedpassword',
  tokenVersion: 0,
  createdAt: new Date(),
}

const MOCK_USER_SAFE = {
  id: 'user-uuid-1',
  email: 'test@example.com',
  createdAt: new Date(),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockValidatePassword.mockReturnValue({ valid: true, errors: [] })
  mockCreateSessionCookies.mockResolvedValue({ accessToken: 'mock-access-token' })
  mockVerifyPassword.mockResolvedValue(true)
})

// ── Register ─────────────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  it('201 with accessToken and user on valid registration', async () => {
    mockEmailExists.mockResolvedValue(false)
    mockCreateUser.mockResolvedValue(MOCK_USER_SAFE)

    const res = await makeRequest(registerPOST, {
      method: 'POST',
      body: { email: 'new@example.com', password: 'Password1' },
    })

    expect(res.status).toBe(201)
    const body = res.body as Record<string, unknown>
    expect(body.accessToken).toBe('mock-access-token')
    expect((body.user as Record<string, unknown>).email).toBe('test@example.com')
  })

  it('409 CONFLICT when email already registered', async () => {
    mockEmailExists.mockResolvedValue(true)

    const res = await makeRequest(registerPOST, {
      method: 'POST',
      body: { email: 'existing@example.com', password: 'Password1' },
    })

    expect(res.status).toBe(409)
    const body = res.body as Record<string, unknown>
    expect(body.error).toBe('CONFLICT')
  })

  it('422 VALIDATION_ERROR for weak password', async () => {
    mockValidatePassword.mockReturnValue({
      valid: false,
      errors: ['Password must contain at least one number'],
    })

    const res = await makeRequest(registerPOST, {
      method: 'POST',
      body: { email: 'user@example.com', password: 'WeakPass' },
    })

    expect(res.status).toBe(422)
    const body = res.body as Record<string, unknown>
    expect(body.error).toBe('VALIDATION_ERROR')
  })

  it('422 for invalid email format', async () => {
    const res = await makeRequest(registerPOST, {
      method: 'POST',
      body: { email: 'not-an-email', password: 'Password1' },
    })

    expect(res.status).toBe(422)
  })
})

// ── Login ─────────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('200 with accessToken on valid credentials', async () => {
    mockFindByEmail.mockResolvedValue(MOCK_USER)
    mockVerifyPassword.mockResolvedValue(true)

    const res = await makeRequest(loginPOST, {
      method: 'POST',
      body: { email: 'test@example.com', password: 'Password1' },
    })

    expect(res.status).toBe(200)
    const body = res.body as Record<string, unknown>
    expect(body.accessToken).toBe('mock-access-token')
  })

  it('401 with same message when password is wrong', async () => {
    mockFindByEmail.mockResolvedValue(MOCK_USER)
    mockVerifyPassword.mockResolvedValue(false)

    const res = await makeRequest(loginPOST, {
      method: 'POST',
      body: { email: 'test@example.com', password: 'WrongPassword1' },
    })

    expect(res.status).toBe(401)
    const body = res.body as Record<string, unknown>
    expect(body.message).toBe('Invalid email or password')
  })

  it('401 with same message when email not found', async () => {
    mockFindByEmail.mockResolvedValue(null)

    const res = await makeRequest(loginPOST, {
      method: 'POST',
      body: { email: 'nobody@example.com', password: 'Password1' },
    })

    expect(res.status).toBe(401)
    const body = res.body as Record<string, unknown>
    expect(body.message).toBe('Invalid email or password')
  })

  it('calls verifyPassword even when user not found (timing attack prevention)', async () => {
    mockFindByEmail.mockResolvedValue(null)

    await makeRequest(loginPOST, {
      method: 'POST',
      body: { email: 'nobody@example.com', password: 'Password1' },
    })

    expect(mockVerifyPassword).toHaveBeenCalledOnce()
  })
})

// ── Logout ────────────────────────────────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  it('204 on logout', async () => {
    const res = await makeRequest(logoutPOST, { method: 'POST' })
    expect(res.status).toBe(204)
  })

  it('calls clearSessionCookies', async () => {
    await makeRequest(logoutPOST, { method: 'POST' })
    expect(authLib.clearSessionCookies).toHaveBeenCalledOnce()
  })
})

// ── Refresh ───────────────────────────────────────────────────────────────────

describe('POST /api/auth/refresh', () => {
  it('200 with new accessToken on valid refresh cookie', async () => {
    mockGetRefreshToken.mockResolvedValue('valid-refresh-token')
    mockVerifyRefresh.mockResolvedValue({
      sub: 'user-uuid-1',
      type: 'refresh',
      tokenVersion: 0,
    } as Parameters<typeof mockVerifyRefresh>[0] extends Promise<infer T> ? NonNullable<T> : never)
    mockFindById.mockResolvedValue(MOCK_USER_SAFE)

    const res = await makeRequest(refreshPOST, { method: 'POST' })

    expect(res.status).toBe(200)
    const body = res.body as Record<string, unknown>
    expect(body.accessToken).toBe('mock-access-token')
  })

  it('401 when no refresh token cookie', async () => {
    mockGetRefreshToken.mockResolvedValue(null)

    const res = await makeRequest(refreshPOST, { method: 'POST' })

    expect(res.status).toBe(401)
    const body = res.body as Record<string, unknown>
    expect(body.error).toBe('AUTH_ERROR')
  })

  it('401 when refresh token is invalid or expired', async () => {
    mockGetRefreshToken.mockResolvedValue('bad-token')
    mockVerifyRefresh.mockResolvedValue(null)

    const res = await makeRequest(refreshPOST, { method: 'POST' })

    expect(res.status).toBe(401)
  })
})
