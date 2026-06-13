import { Middleware } from './types'

export const withRequestId: Middleware = (handler) => {
  return async (req, context) => {
    // Use client-provided ID if present — allows end-to-end tracing
    // If not present, generate a simple unique ID
    // crypto.randomUUID() is available in Node.js 14.17+ and all modern browsers
    const requestId =
      req.headers.get('x-request-id') ?? crypto.randomUUID()

    // Attach to context so all downstream middleware and handlers can use it
    context.requestId = requestId

    // Call the next handler in the chain
    const response = await handler(req, context)

    // Attach to response so client can reference it in support requests
    response.headers.set('x-request-id', requestId)

    return response
  }
}