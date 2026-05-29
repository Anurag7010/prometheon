import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { compose, withErrorHandler, withRequestId, withLogging, withValidation } from '@/lib/middleware'
import type { RequestContext } from '@/lib/middleware/types'
import { validatePasswordStrength, hashPassword } from '@/lib/password'
import { emailExists, createUser } from '@/db/repositories/users'
import { createSessionCookies } from '@/lib/auth'

const RegisterSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

async function registerHandler(req: NextRequest, context: RequestContext): Promise<NextResponse> {
  const { email, password } = context.parsedBody as z.infer<typeof RegisterSchema>

  const strength = validatePasswordStrength(password)
  if (!strength.valid) {
    return NextResponse.json(
      {
        error: 'VALIDATION_ERROR',
        message: strength.errors.join(', '),
        requestId: context.requestId,
        timestamp: new Date().toISOString(),
      },
      { status: 422 }
    )
  }

  const exists = await emailExists(email)
  if (exists) {
    return NextResponse.json(
      {
        error: 'CONFLICT',
        message: 'Email already registered',
        requestId: context.requestId,
        timestamp: new Date().toISOString(),
      },
      { status: 409 }
    )
  }

  const passwordHash = await hashPassword(password)
  const user = await createUser({ email, passwordHash })
  const { accessToken } = await createSessionCookies(user.id, user.email)

  return NextResponse.json(
    { accessToken, user: { id: user.id, email: user.email } },
    { status: 201 }
  )
}

const postHandler = compose(
  withErrorHandler,
  withRequestId,
  withLogging,
  withValidation(RegisterSchema)
)(registerHandler)

export async function POST(req: NextRequest) {
  return postHandler(req, { requestId: '', startTime: 0 })
}
