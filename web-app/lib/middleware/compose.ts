import { Middleware, RouteHandler } from './types'

/**
 * Composes multiple middlewares into one.
 * Execution order is left to right — first in array runs first (outermost).
 *
 * Example:
 *   compose(withErrorHandler, withRequestId, withLogging, withAuth)(handler)
 *
 * Execution order:
 *   withErrorHandler → withRequestId → withLogging → withAuth → handler
 */
export function compose(...middlewares: Middleware[]): Middleware {
  return (handler: RouteHandler): RouteHandler => {
    // reduceRight applies middlewares from right to left in the array
    // so the first middleware in the array becomes the outermost wrapper
    // This gives us left-to-right execution order when the request arrives
    return middlewares.reduceRight(
      (wrappedHandler, middleware) => middleware(wrappedHandler),
      handler
    )
  }
}

