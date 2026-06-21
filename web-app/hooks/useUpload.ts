import { useReducer, useCallback } from 'react'
import { aiService } from '../services/ai-service'
import type { UploadStateWithProgress } from '../types'
import type { IngestResponse } from '../types'

type UploadAction =
  | { type: 'UPLOADING'; progress: number }
  | { type: 'PROCESSING' }
  | { type: 'SUCCESS'; data: IngestResponse }
  | { type: 'ERROR'; error: string }
  | { type: 'RESET' }

function uploadReducer(
  state: UploadStateWithProgress,
  action: UploadAction
): UploadStateWithProgress {
  switch (action.type) {
    case 'UPLOADING':   return { status: 'uploading', progress: action.progress }
    case 'PROCESSING':  return { status: 'processing' }
    case 'SUCCESS':     return { status: 'success', data: action.data }
    case 'ERROR':       return { status: 'error', error: action.error }
    case 'RESET':       return { status: 'idle' }
  }
}

export function useUpload(): {
  state: UploadStateWithProgress
  upload: (file: File, signal?: AbortSignal) => Promise<string | null>
  reset: () => void
} {
  // UploadStateWithProgress instead of AsyncState<IngestResponse> because
  // upload has two extra intermediate states: 'uploading' (bytes transferring)
  // and 'processing' (file received, backend pipeline running).
  // AsyncState only has loading/success/error — not granular enough for file upload UX.
  const [state, dispatch] = useReducer(uploadReducer, { status: 'idle' })

  const upload = useCallback(async (file: File, signal?: AbortSignal): Promise<string | null> => {
    // 'uploading' = bytes are being transferred from browser to server.
    // Progress percentage reflects how much of the file has been sent.
    dispatch({ type: 'UPLOADING', progress: 0 })

    try {
      // AIService.ingest uses fetch — no XHR progress events available via fetch API.
      // We go straight to 100% upload then transition to processing.
      // If XHR progress is needed in future: replace this with an XHR-based upload.
      dispatch({ type: 'UPLOADING', progress: 100 })

      // 'processing' = file fully received by server, ingestion pipeline running.
      // This is different from 'uploading' — no more bytes to transfer,
      // but the backend is now chunking, embedding, and storing the document.
      // Can take seconds to minutes depending on file size.
      dispatch({ type: 'PROCESSING' })

      const response = await aiService.ingest(file, signal)

      if (response.error) {
        const message = signal?.aborted ? 'Upload cancelled' : response.error.message
        dispatch({ type: 'ERROR', error: message })
        return message
      }

      dispatch({ type: 'SUCCESS', data: response.data! })
      return null

    } catch (err) {
      const message = signal?.aborted ? 'Upload cancelled'
        : err instanceof Error ? err.message : 'Upload failed'
      dispatch({ type: 'ERROR', error: message })
      return message
    }
  }, [])

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' })
  }, [])

  return { state, upload, reset }
}