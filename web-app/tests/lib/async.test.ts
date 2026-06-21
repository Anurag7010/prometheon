import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  withRetry,
  withTimeout,
  withCancellation,
  resilientCall,
  TimeoutError,
  CancellationError,
  RetryExhaustedError,
} from '../../lib/async'

// ============================================================
// withRetry
// ============================================================

describe('withRetry', () => {

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('succeeds on first attempt — fn is called exactly once', async () => {
    // Proves that a successful call does not trigger any retry logic
    const fn = vi.fn().mockResolvedValue('ok')

    const result = await withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 100,
      maxDelayMs: 1000,
    })

    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('succeeds on third attempt after two failures — fn called exactly 3 times', async () => {
    // Proves retry loop continues after retryable failures and returns on success
    const fn = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('fail'), { status: 503 }))
      .mockRejectedValueOnce(Object.assign(new Error('fail'), { status: 503 }))
      .mockResolvedValueOnce('recovered')

    const promise = withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 100,
      maxDelayMs: 1000,
    })

    await vi.runAllTimersAsync()

    const result = await promise
    expect(result).toBe('recovered')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('throws RetryExhaustedError after all attempts fail', async () => {
    // Proves that exhausting all attempts throws the correct error type
    // and wraps the last underlying error as cause
    const underlying = Object.assign(new Error('always fails'), { status: 503 })
    const fn = vi.fn().mockRejectedValue(underlying)

    const promise = withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 100,
      maxDelayMs: 1000,
    })

    // Attach rejection handler before advancing timers to avoid unhandled rejection event
    const assertion = expect(promise).rejects.toThrow(RetryExhaustedError)
    await vi.runAllTimersAsync()
    await assertion
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('does not retry when isRetryable returns false — throws immediately', async () => {
    // Proves non-retryable errors short-circuit the retry loop immediately
    // A 400 error should never be retried — retrying won't fix a bad request
    const err = Object.assign(new Error('bad request'), { status: 400 })
    const fn = vi.fn().mockRejectedValue(err)

    await expect(
      withRetry(fn, {
        maxAttempts: 5,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        isRetryable: () => false,
      })
    ).rejects.toThrow('bad request')

    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('does not retry on CancellationError even if isRetryable would return true', async () => {
    // Proves CancellationError is always treated as non-retryable
    // regardless of the isRetryable predicate — caller intent must be respected
    const fn = vi.fn().mockRejectedValue(new CancellationError('cancelled'))

    await expect(
      withRetry(fn, {
        maxAttempts: 5,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        isRetryable: () => true,
      })
    ).rejects.toThrow(CancellationError)

    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('applies exponential backoff delay between retries', async () => {
    // Proves sleep() is called with increasing delays between attempts
    // globalThis is the correct cross-environment reference (works in Node, browser, and Vitest)
    // `global` is Node-only and fails under strict TS / browser-targeted configs
    const fn = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('fail'), { status: 503 }))
      .mockRejectedValueOnce(Object.assign(new Error('fail'), { status: 503 }))
      .mockResolvedValueOnce('ok')

    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

    const promise = withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 100,
      maxDelayMs: 5000,
    })

    await vi.runAllTimersAsync()
    await promise

    // Extract numeric delay values passed to setTimeout
    // Explicit types on the callback params silence TS7006 implicit-any errors
    const delayValues = setTimeoutSpy.mock.calls
      .map((call: [TimerHandler, ...unknown[]]) => call[1] as number)
      .filter((ms: number) => typeof ms === 'number' && ms > 0)

    // First delay:  random(0, min(5000, 100 * 2^0)) = random(0, 100)
    // Second delay: random(0, min(5000, 100 * 2^1)) = random(0, 200)
    expect(delayValues[0]).toBeGreaterThanOrEqual(0)
    expect(delayValues[0]).toBeLessThanOrEqual(100)
    expect(delayValues[1]).toBeGreaterThanOrEqual(0)
    expect(delayValues[1]).toBeLessThanOrEqual(200)
  })

})

// ============================================================
// withTimeout
// ============================================================

describe('withTimeout', () => {

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves normally when fn completes before timeout', async () => {
    // Proves withTimeout does not interfere when fn finishes in time
    const fn = vi.fn().mockResolvedValue('data')

    const result = await withTimeout(fn, 3000)
    expect(result).toBe('data')
  })

  it('rejects with TimeoutError when fn takes longer than timeoutMs', async () => {
    // fn returns a Promise that never resolves — simulates a hung server
    const fn = vi.fn().mockReturnValue(new Promise(() => {}))

    const promise = withTimeout(fn, 2000)

    // Attach rejection handlers before advancing timers to avoid unhandled rejection event
    const assertType = expect(promise).rejects.toThrow(TimeoutError)
    const assertMsg = expect(promise).rejects.toThrow('2000ms')
    await vi.advanceTimersByTimeAsync(2001)
    await assertType
    await assertMsg
  })

  it('clears the timeout timer when fn resolves before deadline', async () => {
    // Proves clearTimeout is called on success — prevents timer leak
    // globalThis instead of global — same fix as the setTimeout spy above
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    const fn = vi.fn().mockResolvedValue('ok')

    await withTimeout(fn, 3000)

    expect(clearTimeoutSpy).toHaveBeenCalled()
  })

})

// ============================================================
// withCancellation
// ============================================================

describe('withCancellation', () => {

  it('resolves normally when signal is not aborted', async () => {
    // Proves withCancellation does not interfere with a normal successful call
    const controller = new AbortController()
    const fn = vi.fn().mockResolvedValue('result')

    const result = await withCancellation(fn, controller.signal)
    expect(result).toBe('result')
    expect(fn).toHaveBeenCalledWith(controller.signal)
  })

  it('rejects with CancellationError immediately if signal is already aborted', async () => {
    // Proves pre-aborted signal is detected before fn is even called
    const controller = new AbortController()
    controller.abort()

    const fn = vi.fn().mockResolvedValue('result')

    await expect(
      withCancellation(fn, controller.signal)
    ).rejects.toThrow(CancellationError)

    expect(fn).not.toHaveBeenCalled()
  })

  it('rejects with CancellationError when signal is aborted mid-flight', async () => {
    // Proves that aborting while fn is in progress cancels the result
    const controller = new AbortController()
    const fn = vi.fn().mockReturnValue(new Promise(() => {}))

    const promise = withCancellation(fn, controller.signal)
    controller.abort()

    await expect(promise).rejects.toThrow(CancellationError)
  })

})

// ============================================================
// resilientCall
// ============================================================

describe('resilientCall', () => {

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('full happy path — resolves with correct value on first attempt', async () => {
    // Proves the combined utility works end-to-end without interference
    const fn = vi.fn().mockResolvedValue('success')

    const result = await resilientCall(fn, {
      maxAttempts: 3,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      timeoutMs: 5000,
    })

    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on retryable error then succeeds', async () => {
    // Proves resilientCall retries after a 503 and returns the eventual success
    const fn = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('503'), { status: 503 }))
      .mockResolvedValueOnce('recovered')

    const promise = resilientCall(fn, {
      maxAttempts: 3,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      timeoutMs: 5000,
    })

    await vi.runAllTimersAsync()

    const result = await promise
    expect(result).toBe('recovered')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('stops retrying when external signal is aborted', async () => {
    // Proves that aborting the external signal mid-retry throws CancellationError
    // and does not launch another attempt
    const controller = new AbortController()

    let callCount = 0
    const fn = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        controller.abort()
        return Promise.reject(Object.assign(new Error('503'), { status: 503 }))
      }
      return Promise.resolve('should not reach here')
    })

    const promise = resilientCall(fn, {
      maxAttempts: 5,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      timeoutMs: 5000,
      signal: controller.signal,
    })

    // Attach rejection handler before advancing timers to avoid unhandled rejection event
    const assertion = expect(promise).rejects.toThrow(CancellationError)
    await vi.runAllTimersAsync()
    await assertion
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('rejects with RetryExhaustedError if every attempt times out', async () => {
    // Proves per-attempt timeout fires correctly and exhausts all retries
    // fn never resolves — every attempt hits the timeout ceiling
    const fn = vi.fn().mockReturnValue(new Promise(() => {}))

    const promise = resilientCall(fn, {
      maxAttempts: 3,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      timeoutMs: 500,
    })

    // Attach rejection handler before advancing timers to avoid unhandled rejection event
    const assertion = expect(promise).rejects.toThrow(RetryExhaustedError)
    await vi.runAllTimersAsync()
    await assertion
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('does not retry on non-retryable error', async () => {
    // Proves a 400 error throws immediately without any retry attempts
    const err = Object.assign(new Error('bad request'), { status: 400 })
    const fn = vi.fn().mockRejectedValue(err)

    const promise = resilientCall(fn, {
      maxAttempts: 5,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      timeoutMs: 5000,
    })

    // Attach rejection handler before advancing timers to avoid unhandled rejection event
    const assertion = expect(promise).rejects.toThrow('bad request')
    await vi.runAllTimersAsync()
    await assertion
    expect(fn).toHaveBeenCalledTimes(1)
  })

})