// Centralized error logging.
// Development: full error details to console.
// Production: this is where Sentry/Datadog integration would go.
// Called from: app/error.tsx, BaseService catch block, withErrorHandler middleware.

interface ErrorContext {
  userId?: string
  requestId?: string
  route?: string
  [key: string]: unknown
}

export function logError(error: Error, context?: ErrorContext): void {
  if (process.env.NODE_ENV === 'production') {
    // FUTURE: Integrate with Sentry/Datadog for production error tracking.
    // Phase 5 deployment work — requires SENTRY_DSN or DD_API_KEY env vars.
    return
  }

  console.error('[error-logger]', {
    message: error.message,
    name: error.name,
    stack: error.stack,
    ...context,
  })
}

export function logWarning(message: string, context?: ErrorContext): void {
  if (process.env.NODE_ENV === 'production') {
    // FUTURE: Integrate with monitoring service for production warning tracking.
    // Phase 5 deployment work — requires monitoring env vars.
    return
  }

  console.warn('[error-logger]', { message, ...context })
}
