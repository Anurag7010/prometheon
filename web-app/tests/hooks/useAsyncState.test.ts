import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAsyncState } from '../../hooks/useAsyncState'

describe('useAsyncState', () => {

  it('starts in idle state', () => {
    const { result } = renderHook(() => useAsyncState<string>())
    expect(result.current.state.status).toBe('idle')
  })

  it('idle → loading → success transition', async () => {
    // Proving the full happy path state machine:
    // idle on mount, loading during execute, success after resolution
    const { result } = renderHook(() => useAsyncState<string>())

    let resolvePromise!: (val: string) => void
    const slowFn = () => new Promise<string>(res => { resolvePromise = res })

    // Start execute — state should go loading
    act(() => { result.current.execute(slowFn) })
    expect(result.current.state.status).toBe('loading')

    // Resolve the promise — state should go success
    await act(async () => { resolvePromise('hello') })

    expect(result.current.state.status).toBe('success')
    if (result.current.state.status === 'success') {
      expect(result.current.state.data).toBe('hello')
    }
  })

  it('idle → loading → error transition', async () => {
    // Proving errors are normalized to strings not raw Error objects.
    // Components receive state.error as string — no need to handle Error instances.
    const { result } = renderHook(() => useAsyncState<string>())

    await act(async () => {
      await result.current.execute(() => Promise.reject(new Error('something broke')))
    })

    expect(result.current.state.status).toBe('error')
    if (result.current.state.status === 'error') {
      expect(typeof result.current.state.error).toBe('string')
      expect(result.current.state.error).toBe('something broke')
    }
  })

  it('reset() from success returns to idle', async () => {
    // Proving reset works from success state — needed for clear/retry flows
    const { result } = renderHook(() => useAsyncState<string>())

    await act(async () => {
      await result.current.execute(() => Promise.resolve('data'))
    })
    expect(result.current.state.status).toBe('success')

    act(() => { result.current.reset() })
    expect(result.current.state.status).toBe('idle')
  })

  it('reset() from error returns to idle', async () => {
    const { result } = renderHook(() => useAsyncState<string>())

    await act(async () => {
      await result.current.execute(() => Promise.reject(new Error('fail')))
    })
    expect(result.current.state.status).toBe('error')

    act(() => { result.current.reset() })
    expect(result.current.state.status).toBe('idle')
  })

  it('execute() does not block concurrent calls', async () => {
    // Proving execute does not guard against concurrent calls.
    // Both proceed — whichever resolves last sets the final state.
    const { result } = renderHook(() => useAsyncState<string>())

    let resolveFirst!: (v: string) => void
    let resolveSecond!: (v: string) => void

    const first = () => new Promise<string>(res => { resolveFirst = res })
    const second = () => new Promise<string>(res => { resolveSecond = res })

    act(() => { result.current.execute(first) })
    act(() => { result.current.execute(second) })

    await act(async () => { resolveSecond('second result') })
    await act(async () => { resolveFirst('first result') })

    // Last resolution wins
    expect(result.current.state.status).toBe('success')
    if (result.current.state.status === 'success') {
      expect(result.current.state.data).toBe('first result')
    }
  })

  it('execute() never throws — catches non-Error thrown values', async () => {
    // Proving execute catches all thrown values including strings, numbers, objects.
    // Without this, throwing a string would produce an unhandled rejection.
    const { result } = renderHook(() => useAsyncState<string>())

    // Does not throw even though fn throws a string (not an Error)
    await act(async () => {
      await result.current.execute(() => Promise.reject('plain string error'))
    })

    expect(result.current.state.status).toBe('error')
    if (result.current.state.status === 'error') {
      expect(typeof result.current.state.error).toBe('string')
      // Non-Error values get a generic fallback message
      expect(result.current.state.error).toBe('An unexpected error occurred')
    }
  })

})