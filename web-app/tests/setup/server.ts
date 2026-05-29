import { NextRequest, NextResponse } from 'next/server'
import type { RequestInit } from 'next/dist/server/web/spec-extension/request'
import { createHmac } from 'crypto'
import { RequestContext } from '../../lib/middleware/types'

// Fixed test user ID — used when no specific userId needed
export const TEST_USER_ID = '00000000-0000-0000-0000-000000000001'

const JWT_SECRET_BASE = process.env.JWT_SECRET ?? 'dev-secret-change-in-production'
// Access token secret must match lib/jwt.ts — JWT_SECRET + '_access'
const ACCESS_TOKEN_SECRET = JWT_SECRET_BASE + '_access'

export const TEST_USER_EMAIL = 'test@example.com'

interface RequestOptions {
  method?: string
  body?: unknown
  headers?: Record<string, string>
  params?: Record<string, string>
  searchParams?: Record<string, string>
}

interface TestResponse {
  status: number
  body: unknown
  headers: Headers
}

// Builds a minimal HS256 JWT using Node.js crypto directly.
// Avoids jose in the test environment — jose's webapi bundle has a cross-realm
// Uint8Array issue in vitest's VM isolation that causes SignJWT to throw.
function base64url(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export async function generateTestToken(
  userId = TEST_USER_ID,
  email = TEST_USER_EMAIL
): Promise<string> {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const exp = Math.floor(Date.now() / 1000) + 3600
  // Payload must include type: 'access' and email to match verifyAccessToken expectations
  const payload = base64url(JSON.stringify({ sub: userId, email, type: 'access', exp }))
  const data = `${header}.${payload}`
  const sig = base64url(
    createHmac('sha256', ACCESS_TOKEN_SECRET).update(data).digest()
  )
  return `${data}.${sig}`
}

/**
 * Calls a route handler directly — simulates Next.js request lifecycle.
 * Returns parsed response for assertions.
 */
export async function makeRequest(
  handler: (req: NextRequest, ctx?: any) => Promise<NextResponse>,
  options: RequestOptions = {}
): Promise<TestResponse> {
  const {
    method = 'GET',
    body,
    headers = {},
    params = {},
    searchParams = {},
  } = options

  // Build URL with search params
  const url = new URL(`http://localhost/api/test`)
  Object.entries(searchParams).forEach(([k, v]) => url.searchParams.set(k, v))

  const requestInit: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  } as RequestInit

  if (body !== undefined) {
    requestInit.body = JSON.stringify(body)
  }

  const req = new NextRequest(url.toString(), requestInit)

  // Pass params as Next.js route context (for [id] routes)
  const response = await handler(req, { params })

  // Parse body — handle empty responses (204)
  let parsedBody: unknown = null
  const contentType = response.headers.get('content-type')
  if (contentType?.includes('application/json')) {
    const text = await response.text()
    parsedBody = text ? JSON.parse(text) : null
  }

  return {
    status: response.status,
    body: parsedBody,
    headers: response.headers,
  }
}

/**
 * Creates a request with a FormData body — used for file upload route tests.
 * Sets no Content-Type so the browser boundary is preserved.
 */
export async function makeFormDataRequest(
  handler: (req: NextRequest, ctx?: any) => Promise<NextResponse>,
  formData: FormData,
  options: Omit<RequestOptions, 'body'> = {},
  userId = TEST_USER_ID
): Promise<TestResponse> {
  const token = await generateTestToken(userId)
  const url = new URL('http://localhost/api/test')

  const req = new NextRequest(url.toString(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
    body: formData,
  } as RequestInit)

  const response = await handler(req, { params: options.params ?? {} })

  let parsedBody: unknown = null
  const contentType = response.headers.get('content-type')
  if (contentType?.includes('application/json')) {
    const text = await response.text()
    parsedBody = text ? JSON.parse(text) : null
  }

  return { status: response.status, body: parsedBody, headers: response.headers }
}

/**
 * Same as makeRequest but injects a valid JWT.
 * Tests protected routes without a real auth system.
 */
export async function makeAuthRequest(
  handler: (req: NextRequest, ctx?: any) => Promise<NextResponse>,
  options: RequestOptions = {},
  userId = TEST_USER_ID
): Promise<TestResponse> {
  const token = await generateTestToken(userId)
  return makeRequest(handler, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  })
}