import 'server-only'

import bcrypt from 'bcryptjs'

const COST_FACTOR = 12

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST_FACTOR)
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash)
  } catch {
    return false
  }
}

export function validatePasswordStrength(password: string): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters')
  }
  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number')
  }
  if (!/[a-zA-Z]/.test(password)) {
    errors.push('Password must contain at least one letter')
  }

  return { valid: errors.length === 0, errors }
}
