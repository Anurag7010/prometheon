// Base class for all application errors
// Extends Error so they can be thrown and caught normally
// Adds statusCode and code so error handler can map them to HTTP responses
export class AppError extends Error {
  statusCode: number
  code: string

  constructor(message: string, statusCode: number, code: string) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.code = code
    Object.setPrototypeOf(this, AppError.prototype)
  }
}

export class AuthError extends AppError {
  constructor(message = 'Unauthorized', code = 'AUTH_ERROR') {
    super(message, 401, code)
    this.name = 'AuthError'
    Object.setPrototypeOf(this, AuthError.prototype)
  }
}

export class ValidationError extends AppError {
  fields: Array<{ field: string; message: string }>

  constructor(
    message = 'Validation failed',
    fields: Array<{ field: string; message: string }> = []
  ) {
    super(message, 422, 'VALIDATION_ERROR')
    this.name = 'ValidationError'
    this.fields = fields
    Object.setPrototypeOf(this, ValidationError.prototype)
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND')
    this.name = 'NotFoundError'
    Object.setPrototypeOf(this, NotFoundError.prototype)
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409, 'CONFLICT')
    this.name = 'ConflictError'
    Object.setPrototypeOf(this, ConflictError.prototype)
  }
}