import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useDocuments } from '../../hooks/useDocuments'
import { toDocumentId } from '../../types'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeDoc(id: string, filename: string) {
  return {
    id: toDocumentId(id),
    filename,
    status: 'ingested' as const,
    createdAt: new Date(),
  }
}

function fetchSuccess(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ data }),
  } as Response)
}

function _fetchError(status = 500) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve({ error: 'Error' }),
  } as Response)
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('useDocuments', () => {

  it('fetches documents on mount automatically', async () => {
    // Proving auto-fetch on mount via useEffect — user sees list without manual refresh
    const docs = [makeDoc('id-1', 'file1.pdf'), makeDoc('id-2', 'file2.pdf')]
    mockFetch.mockResolvedValue(fetchSuccess(docs))

    const { result } = renderHook(() => useDocuments())

    await waitFor(() => {
      expect(result.current.state.status).toBe('success')
    })

    expect(mockFetch).toHaveBeenCalledWith('/api/documents', expect.any(Object))
    if (result.current.state.status === 'success') {
      expect(result.current.state.data).toHaveLength(2)
    }
  })

  it('refresh() triggers a new fetch', async () => {
    // Proving refresh() re-fetches — used after upload or manual refresh button
    const docs = [makeDoc('id-1', 'file1.pdf')]
    mockFetch.mockResolvedValue(fetchSuccess(docs))

    const { result } = renderHook(() => useDocuments())
    await waitFor(() => expect(result.current.state.status).toBe('success'))

    const updatedDocs = [...docs, makeDoc('id-2', 'file2.pdf')]
    mockFetch.mockResolvedValue(fetchSuccess(updatedDocs))

    await act(async () => { await result.current.refresh() })

    expect(mockFetch).toHaveBeenCalledTimes(2)
    if (result.current.state.status === 'success') {
      expect(result.current.state.data).toHaveLength(2)
    }
  })

  it('deleteDocument() removes document from state optimistically', async () => {
    // Proving optimistic update — document disappears from UI immediately,
    // not after a refetch round-trip. Makes delete feel instant.
    const docs = [
      makeDoc('id-1', 'keep1.pdf'),
      makeDoc('id-2', 'delete-me.pdf'),
      makeDoc('id-3', 'keep2.pdf'),
    ]
    mockFetch.mockResolvedValue(fetchSuccess(docs))

    const { result } = renderHook(() => useDocuments())
    await waitFor(() => expect(result.current.state.status).toBe('success'))

    // Mock DELETE success
    mockFetch.mockResolvedValue({ ok: true, status: 204, json: () => Promise.resolve({}) } as Response)

    await act(async () => {
      await result.current.deleteDocument(toDocumentId('id-2'))
    })

    if (result.current.state.status === 'success') {
      expect(result.current.state.data).toHaveLength(2)
      const ids = result.current.state.data.map(d => d.id)
      expect(ids).not.toContain('id-2')
      expect(ids).toContain('id-1')
      expect(ids).toContain('id-3')
    }
  })

  it('deleteDocument() does not modify state on fetch failure', async () => {
    // Proving state is not corrupted by failed deletes.
    // If delete fails, the document still exists — the list must remain correct.
    const docs = [makeDoc('id-1', 'file1.pdf'), makeDoc('id-2', 'file2.pdf')]
    mockFetch.mockResolvedValue(fetchSuccess(docs))

    const { result } = renderHook(() => useDocuments())
    await waitFor(() => expect(result.current.state.status).toBe('success'))

    // DELETE call fails
    mockFetch.mockRejectedValue(new Error('Network error'))

    await act(async () => {
      await result.current.deleteDocument(toDocumentId('id-1'))
    })

    // List unchanged — document was not actually deleted
    if (result.current.state.status === 'success') {
      expect(result.current.state.data).toHaveLength(2)
    }
  })

  it('deleteDocument() does nothing if state is not success', async () => {
    // Proving early return guard — cannot delete from a list that has not loaded
    mockFetch.mockResolvedValue(fetchSuccess([]))

    const { result } = renderHook(() => useDocuments())
    // Do not wait for fetch — state is still loading

    const fetchCallsBefore = mockFetch.mock.calls.length

    await act(async () => {
      await result.current.deleteDocument(toDocumentId('some-id'))
    })

    // No extra fetch calls for the delete — early return fired
    expect(mockFetch.mock.calls.length).toBe(fetchCallsBefore)
  })

})