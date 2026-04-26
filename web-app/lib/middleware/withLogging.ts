import { Middleware } from './types'

export const withLogging: Middleware = (handler) => {
  return async (req, context) => {
    // Record start time before handler runs — this is our latency baseline
    context.startTime = Date.now()

    // Call the handler — this runs all inner middleware + the route handler
    const response = await handler(req, context)

    // Calculate latency — only available after handler completes
    const latencyMs = Date.now() - context.startTime

    // Structured log — same JSON format as Python backend
    // userId may be undefined if route is public — log null explicitly
    const logEntry = {
      requestId: context.requestId,
      method: req.method,
      path: req.nextUrl.pathname,
      status: response.status,
      latencyMs,
      userId: context.userId ?? null,
    }

    // Use error level for 4xx/5xx so monitoring tools can alert on them
    if (response.status >= 400) {
      console.error('[request]', JSON.stringify(logEntry))
    } else {
      console.info('[request]', JSON.stringify(logEntry))
    }

    return response
  }
}