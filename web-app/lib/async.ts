// lib/async.ts
// Production-grade async utility library
// Used across the application for all AI backend communication

// ============================================================
// CUSTOM ERROR CLASSES
// ============================================================

/**
 * Thrown when an operation exceeds its time limit.
 */
export class TimeoutError extends Error {
  constructor(message = 'Operation timed out') {
    super(message)
    this.name = 'TimeoutError'
    // Required for correct instanceof checks when compiling to ES5
    Object.setPrototypeOf(this, TimeoutError.prototype)
  }
}

/**
 * Thrown when an operation is cancelled via AbortController.
 */
export class CancellationError extends Error {
  constructor(message = 'Operation was cancelled') {
    super(message)
    this.name = 'CancellationError'
    Object.setPrototypeOf(this, CancellationError.prototype)
  }
}

/**
 * Thrown when all retry attempts are exhausted.
 * Wraps the last underlying error so callers can inspect root cause.
 */
export class RetryExhaustedError extends Error {
  public readonly cause: unknown

  constructor(message: string, cause: unknown) {
    super(message)
    this.name = 'RetryExhaustedError'
    this.cause = cause
    Object.setPrototypeOf(this, RetryExhaustedError.prototype)
  }
}

// ============================================================
// SLEEP
// ============================================================

/**
 * Returns a Promise that resolves after `ms` milliseconds.
 * Used internally for retry backoff delays.
 *
 * @param ms - Milliseconds to wait
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ============================================================
// WITH RETRY
// ============================================================

export interface RetryOptions {
  /** Maximum number of attempts (including the first call) */
  maxAttempts: number
  /** Base delay in ms — grows exponentially with jitter */
  baseDelayMs: number
  /** Hard ceiling on delay regardless of attempt number */
  maxDelayMs: number
  /**
   * Determines whether an error should trigger a retry.
   * Defaults to retrying on network errors, 429, and 5xx responses.
   */
  isRetryable?: (error: unknown) => boolean
}

/**
 * Wraps an async function with exponential backoff + full jitter retry logic.
 * Throws RetryExhaustedError if all attempts fail.
 *
 * @param fn - The async function to retry
 * @param options - Retry configuration
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const {
    maxAttempts,
    baseDelayMs,
    maxDelayMs,
    isRetryable = defaultIsRetryable,
  } = options

  let lastError: unknown

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err

      // CancellationError is never retried — caller explicitly cancelled, respect intent
      if (err instanceof CancellationError) throw err

      // Never retry non-retryable errors — no point waiting
      if (!isRetryable(err)) {
        throw err
      }

      // Last attempt — exit loop and throw below
      if (attempt === maxAttempts - 1) break

      // Full jitter: random value between 0 and min(maxDelay, baseDelay * 2^attempt)
      // Prevents thundering herd by desynchronizing retry waves
      const exponential = baseDelayMs * Math.pow(2, attempt)
      const capped = Math.min(maxDelayMs, exponential)
      const jittered = Math.random() * capped

      console.warn(
        `[withRetry] Attempt ${attempt + 1}/${maxAttempts} failed: ${(err as Error).message}. ` +
        `Retrying in ${Math.round(jittered)}ms...`
      )

      await sleep(jittered)
    }
  }

  throw new RetryExhaustedError(
    `Failed after ${maxAttempts} attempts`,
    lastError
  )
}

// ============================================================
// WITH TIMEOUT
// ============================================================

/**
 * Races an async function against a timeout deadline.
 * Throws TimeoutError if the deadline is exceeded.
 *
 * Note: the underlying fn() continues running after timeout
 * unless it respects an AbortSignal. Use resilientCall()
 * for proper cleanup.
 *
 * @param fn - The async function to time-limit
 * @param timeoutMs - Deadline in milliseconds
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>

  // Build a Promise that rejects after timeoutMs
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new TimeoutError(`Timed out after ${timeoutMs}ms`)),
      timeoutMs
    )
  })

  try {
    // Whichever settles first wins
    return await Promise.race([fn(), timeoutPromise])
  } finally {
    // Always clear the timer — prevents it firing after fn() resolves
    // Without this, the timer holds the Node.js event loop open
    clearTimeout(timer!)
  }
}

// ============================================================
// WITH CANCELLATION
// ============================================================

/**
 * Wraps an async function with AbortSignal cancellation support.
 * Rejects immediately with CancellationError if the signal fires.
 *
 * @param fn - Async function that accepts an AbortSignal
 * @param signal - External AbortSignal to listen to
 */
export async function withCancellation<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal
): Promise<T> {
  // Reject immediately if already cancelled before we start
  if (signal.aborted) {
    throw new CancellationError('Operation was cancelled before it started')
  }

  // Build a Promise that rejects the moment the signal fires
  const cancellationPromise = new Promise<never>((_, reject) => {
    signal.addEventListener(
      'abort',
      () => reject(new CancellationError('Operation was cancelled')),
      { once: true } // auto-removes listener — prevents memory leak
    )
  })

  // Race fn() against cancellation signal
  return Promise.race([fn(signal), cancellationPromise])
}

// ============================================================
// RESILIENT CALL — combines retry + timeout + cancellation
// ============================================================

export interface ResilientCallOptions {
  /** Maximum number of attempts (including the first call) */
  maxAttempts: number
  /** Base delay in ms for exponential backoff */
  baseDelayMs: number
  /** Hard ceiling on backoff delay */
  maxDelayMs: number
  /**
   * Timeout per attempt in ms — NOT total across all retries.
   * Each retry gets a fresh full window.
   */
  timeoutMs: number
  /** Optional external cancellation signal from caller */
  signal?: AbortSignal
  /**
   * Determines whether an error should trigger a retry.
   * CancellationError and AbortError are never retried regardless.
   */
  isRetryable?: (error: unknown) => boolean
}

/**
 * Production-grade resilient async call.
 * Combines per-attempt timeout, exponential backoff with jitter,
 * and external cancellation support.
 *
 * Retry is skipped on:
 * - CancellationError (caller cancelled)
 * - AbortError (signal fired)
 * - Non-retryable errors (4xx, validation, etc.)
 *
 * @param fn - Async function that accepts an AbortSignal
 * @param options - Full resilience configuration
 */
export async function resilientCall<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  options: ResilientCallOptions
): Promise<T> {
  const {
    maxAttempts,
    baseDelayMs,
    maxDelayMs,
    timeoutMs,
    signal: externalSignal,
    isRetryable = defaultIsRetryable,
  } = options

  let lastError: unknown

  for (let attempt = 0; attempt < maxAttempts; attempt++) {

    // Check external cancellation BEFORE starting the attempt.
    // Prevents launching new work after the caller has already cancelled.
    if (externalSignal?.aborted) {
      throw new CancellationError(`Cancelled before attempt ${attempt + 1}`)
    }

    // Per-attempt AbortController — merges timeout + external signal
    const attemptController = new AbortController()

    // Propagate external cancellation into this attempt's controller
    const onExternalAbort = () => attemptController.abort()
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true })

    // Set per-attempt timeout — aborts the attempt's controller when it fires
    const timer = setTimeout(() => attemptController.abort(), timeoutMs)

    try {
      // withCancellation races fn against the signal — if attemptController is aborted
      // (by timeout or external signal), the promise rejects with CancellationError.
      // Without this race, fn would hang forever if it doesn't check the signal itself.
      const result = await withCancellation(fn, attemptController.signal)

      // Success — clean up and return
      clearTimeout(timer)
      externalSignal?.removeEventListener('abort', onExternalAbort)
      return result

    } catch (err) {
      // Always clean up timer and listener on failure
      clearTimeout(timer)
      externalSignal?.removeEventListener('abort', onExternalAbort)

      lastError = err

      // AbortError means our internal controller was triggered.
      // Determine whether it was the timeout or the external signal.
      if ((err as { name?: string })?.name === 'AbortError') {
        if (externalSignal?.aborted) {
          // External signal caused the abort — treat as cancellation
          throw new CancellationError('Cancelled by caller')
        }
        // Otherwise it was our timeout firing
        lastError = new TimeoutError(
          `Attempt ${attempt + 1} timed out after ${timeoutMs}ms`
        )
      }

      // withCancellation throws CancellationError when the attemptController fires.
      // Distinguish three cases:
      //   1. External signal aborted → true cancellation, throw
      //   2. Internal controller aborted (timeout) → convert to TimeoutError for retry
      //   3. fn threw CancellationError itself → treat as non-retryable cancellation
      if (err instanceof CancellationError) {
        if (externalSignal?.aborted) {
          throw new CancellationError('Cancelled by caller')
        }
        if (attemptController.signal.aborted) {
          // Our internal timeout triggered the abort
          lastError = new TimeoutError(
            `Attempt ${attempt + 1} timed out after ${timeoutMs}ms`
          )
        }
        // else: fn threw CancellationError directly — lastError stays as-is
      }

      // Never retry cancellation — caller explicitly stopped the operation
      if (lastError instanceof CancellationError) throw lastError

      // Never retry if the error type is not worth retrying
      if (!isRetryable(lastError)) throw lastError

      // Last attempt exhausted — exit loop
      if (attempt === maxAttempts - 1) break

      // Full jitter backoff before next attempt
      const exponential = baseDelayMs * Math.pow(2, attempt)
      const capped = Math.min(maxDelayMs, exponential)
      const jittered = Math.random() * capped

      console.warn(
        `[resilientCall] Attempt ${attempt + 1}/${maxAttempts} failed: ` +
        `${(lastError as Error).message}. Retrying in ${Math.round(jittered)}ms...`
      )

      await sleep(jittered)
    }
  }

  throw new RetryExhaustedError(
    `All ${maxAttempts} attempts failed`,
    lastError
  )
}

// ============================================================
// DEFAULT IS RETRYABLE
// ============================================================

/**
 * Default retry predicate.
 *
 * Retryable:
 *   - TypeError           → network failure (fetch failed, connection reset)
 *   - TimeoutError        → per-attempt timeout, worth retrying
 *   - HTTP 429            → rate limited, server will recover
 *   - HTTP 5xx            → server error, transient
 *
 * Non-retryable:
 *   - CancellationError   → caller cancelled
 *   - HTTP 4xx (not 429)  → client error, retrying won't help
 */
function defaultIsRetryable(error: unknown): boolean {
  if (error instanceof CancellationError) return false
  if (error instanceof TimeoutError) return true
  if (error instanceof TypeError) return true // network-level failure

  const status = (error as { status?: number })?.status
  if (typeof status === 'number') {
    return status === 429 || status >= 500
  }

  return false
}