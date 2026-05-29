import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { compose, withErrorHandler, withRequestId, withLogging, withValidation } from '@/lib/middleware'
import type { RequestContext } from '@/lib/middleware/types'
import { verifyPassword } from '@/lib/password'
import { findByEmail } from '@/db/repositories/users'
import { createSessionCookies } from '@/lib/auth'

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

// Constant-time dummy hash used when user not found — prevents email enumeration via timing
const DUMMY_HASH = '$2b$12$invalidhashfortimingprotectionXXXXXXXXXXXXXXXXXXXXXXX'

async function loginHandler(req: NextRequest, context: RequestContext): Promise<NextResponse> {
  const { email, password } = context.parsedBody as z.infer<typeof LoginSchema>

  const user = await findByEmail(email)

  // Always call verifyPassword — prevents timing attacks that reveal whether email is registered
  const hashToCheck = user?.passwordHash ?? DUMMY_HASH
  const valid = await verifyPassword(password, hashToCheck)

  if (!user || !valid) {
    return NextResponse.json(
      {
        error: 'AUTH_ERROR',
        message: 'Invalid email or password',
        requestId: context.requestId,
        timestamp: new Date().toISOString(),
      },
      { status: 401 }
    )
  }

  const { accessToken } = await createSessionCookies(user.id, user.email)

  return NextResponse.json({
    accessToken,
    user: { id: user.id, email: user.email },
  })
}

const postHandler = compose(
  withErrorHandler,
  withRequestId,
  withLogging,
  withValidation(LoginSchema)
)(loginHandler)

export async function POST(req: NextRequest) {
  return postHandler(req, { requestId: '', startTime: 0 })
}
