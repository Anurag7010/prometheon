import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUpload } from '../../hooks/useUpload'
import { aiService } from '../../services/ai-service'
import { toDocumentId } from '../../types'

vi.mock('../../services/ai-service', () => ({
  aiService: { ingest: vi.fn() },
}))

const mockIngest = vi.mocked(aiService.ingest)

const mockIngestResponse = {
  data: {
    documentId: toDocumentId('doc-001'),
    status: 'ingested' as const,
    chunkCount: 10,
  },
  error: null,
  status: 200,
  latencyMs: 500,
}

const mockFile = new File(['content'], 'test.pdf', { type: 'application/pdf' })

beforeEach(() => {
  vi.resetAllMocks()
})

describe('useUpload', () => {

  it('starts in idle state', () => {
    const { result } = renderHook(() => useUpload())
    expect(result.current.state.status).toBe('idle')
  })

  it('transitions through uploading → processing → success', async () => {
    // Proving full state machine: uploading (bytes sent) → processing (backend running) → success
    let resolveIngest!: () => void
    mockIngest.mockReturnValue(
      new Promise(res => { resolveIngest = () => res(mockIngestResponse) })
    )

    const { result } = renderHook(() => useUpload())

    // Start upload — hook dispatches UPLOADING(0) → UPLOADING(100) → PROCESSING synchronously
    // before awaiting ingest, so state is 'processing' after the sync portion
    act(() => { result.current.upload(mockFile) })
    expect(result.current.state.status).toBe('processing')

    // Resolve — success
    await act(async () => { resolveIngest() })
    expect(result.current.state.status).toBe('success')
    if (result.current.state.status === 'success') {
      expect(result.current.state.data.chunkCount).toBe(10)
    }
  })

  it('transitions to error on ingest failure', async () => {
    // Proving error path — service error surfaces in state, not as a throw
    mockIngest.mockResolvedValue({
      data: null,
      error: { code: 'HTTP_ERROR', message: 'Server error', retryable: false, name: 'ServiceError', originalError: null } as unknown as import('../../services/base-service').ServiceError,
      status: 500,
      latencyMs: 100,
    })

    const { result } = renderHook(() => useUpload())

    await act(async () => { await result.current.upload(mockFile) })

    expect(result.current.state.status).toBe('error')
    if (result.current.state.status === 'error') {
      expect(result.current.state.error).toBe('Server error')
    }
  })

  it('handles abort signal — sets error to Upload cancelled', async () => {
    // Proving cancellation is handled correctly — abort mid-upload shows
    // a user-friendly error message, not a raw AbortError
    const controller = new AbortController()

    mockIngest.mockImplementation(async () => {
      controller.abort()
      return Promise.reject(new DOMException('Aborted', 'AbortError'))
    })

    const { result } = renderHook(() => useUpload())

    await act(async () => {
      await result.current.upload(mockFile, controller.signal)
    })

    expect(result.current.state.status).toBe('error')
    if (result.current.state.status === 'error') {
      expect(result.current.state.error).toBe('Upload cancelled')
    }
  })

  it('reset() from any state returns to idle', async () => {
    // Test reset from error
    mockIngest.mockResolvedValue({
      data: null,
      error: { code: 'NETWORK_ERROR', message: 'fail', retryable: true, name: 'ServiceError', originalError: null } as unknown as import('../../services/base-service').ServiceError,
      status: 500,
      latencyMs: 10,
    })

    const { result } = renderHook(() => useUpload())

    await act(async () => { await result.current.upload(mockFile) })
    expect(result.current.state.status).toBe('error')

    act(() => { result.current.reset() })
    expect(result.current.state.status).toBe('idle')

    // Test reset from success
    mockIngest.mockResolvedValue(mockIngestResponse)
    await act(async () => { await result.current.upload(mockFile) })
    expect(result.current.state.status).toBe('success')

    act(() => { result.current.reset() })
    expect(result.current.state.status).toBe('idle')
  })

})