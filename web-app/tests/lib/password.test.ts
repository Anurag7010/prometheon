import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { hashPassword, verifyPassword, validatePasswordStrength } =
  await import('../../lib/password')

describe('Password utilities', () => {
  describe('hashPassword', () => {
    it('returns a bcrypt hash starting with $2b$', async () => {
      const hash = await hashPassword('password123')
      expect(hash).toMatch(/^\$2b\$/)
    })

    it('same password hashes differently each time (bcrypt salt)', async () => {
      const hash1 = await hashPassword('password123')
      const hash2 = await hashPassword('password123')
      expect(hash1).not.toBe(hash2)
    })
  })

  describe('verifyPassword', () => {
    it('returns true for correct password', async () => {
      const hash = await hashPassword('mypassword1')
      expect(await verifyPassword('mypassword1', hash)).toBe(true)
    })

    it('returns false for wrong password', async () => {
      const hash = await hashPassword('mypassword1')
      expect(await verifyPassword('wrongpassword', hash)).toBe(false)
    })

    it('returns false on invalid hash — never throws', async () => {
      const result = await verifyPassword('password', 'not-a-valid-hash')
      expect(result).toBe(false)
    })
  })

  describe('validatePasswordStrength', () => {
    it('returns valid for strong password', () => {
      const result = validatePasswordStrength('StrongPass1')
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('returns error for password shorter than 8 characters', () => {
      const result = validatePasswordStrength('abc1')
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Password must be at least 8 characters')
    })

    it('returns error when password has no number', () => {
      const result = validatePasswordStrength('NoNumbersHere')
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Password must contain at least one number')
    })

    it('returns error when password has no letter', () => {
      const result = validatePasswordStrength('12345678')
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Password must contain at least one letter')
    })

    it('accumulates multiple errors', () => {
      const result = validatePasswordStrength('123')
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(1)
    })
  })
})
