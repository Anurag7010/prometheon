import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import {
  compose,
  withErrorHandler,
  withRequestId,
  withLogging,
  withAuth,
} from '@/lib/middleware'
import { RequestContext } from '@/lib/middleware/types'
import { documentsRepository } from '@/db'
import { toDocumentId } from '@/types'
import { backendClient } from '@/lib/backend-client'
import { BackendError, mapBackendError } from '@/lib/backend-error-mapper'

// GET — list all documents for authenticated user
async function listHandler(
  req: NextRequest,
  context: RequestContext
): Promise<NextResponse> {
  const { userId } = context
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const docs = await documentsRepository.findByUser(userId)
  return NextResponse.json({ data: docs, requestId: context.requestId })
}

// POST — ingest document: upload to Python backend, persist record to DB
// Accepts multipart/form-data with 'file' field.
// withValidation is not used here because FormData cannot be JSON-parsed.
async function createHandler(
  req: NextRequest,
  context: RequestContext
): Promise<NextResponse> {
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json(
      {
        error: 'INVALID_FORM',
        message: 'Request must be multipart/form-data with a file field',
        requestId: context.requestId,
        timestamp: new Date().toISOString(),
      },
      { status: 400 }
    )
  }

  const file = formData.get('file')
  // FormDataEntryValue is File | string — anything non-string is a file-like Blob.
  // Avoid instanceof File: cross-realm class isolation breaks it in test environments.
  if (!file || typeof file === 'string') {
    return NextResponse.json(
      {
        error: 'VALIDATION_ERROR',
        message: 'file field is required',
        requestId: context.requestId,
        timestamp: new Date().toISOString(),
      },
      { status: 422 }
    )
  }

  const { userId } = context
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  // Create DB record before calling Python — gives us a documentId to return
  // and ensures we have an audit record even if ingestion fails
  const document = await documentsRepository.create({
    userId,
    filename: file.name,
  })

  try {
    const result = await backendClient.ingest(
      file,
      file.name,
      { documentId: document.id },
      context.requestId
    )

    const finalStatus = result.status === 'ok' ? 'ingested' : 'failed'
    await documentsRepository.updateStatus(
      document.id,
      finalStatus,
      result.status === 'ok' ? result.chunkCount : undefined
    )

    if (result.status === 'error') {
      return NextResponse.json(
        {
          error: 'INGEST_FAILED',
          message: result.error ?? 'Ingestion failed',
          requestId: context.requestId,
          timestamp: new Date().toISOString(),
        },
        { status: 502 }
      )
    }

    revalidateTag('documents', 'default')
    return NextResponse.json(
      {
        data: {
          documentId: toDocumentId(document.id),
          status: 'ingested' as const,
          chunkCount: result.chunkCount,
        },
        requestId: context.requestId,
      },
      {
        status: 201,
        headers: { Location: `/api/documents/${document.id}` },
      }
    )

  } catch (err) {
    const serviceError = err instanceof BackendError
      ? mapBackendError(err)
      : mapBackendError(err)

    await documentsRepository.updateStatus(document.id, 'failed')

    return NextResponse.json(
      {
        error: serviceError.code,
        message: serviceError.message,
        requestId: context.requestId,
        timestamp: new Date().toISOString(),
      },
      { status: 502 }
    )
  }
}

const getHandler = compose(
  withErrorHandler,
  withRequestId,
  withLogging,
  withAuth({ required: true })
)(listHandler)

const postHandler = compose(
  withErrorHandler,
  withRequestId,
  withLogging,
  withAuth({ required: true })
)(createHandler)

export async function GET(req: NextRequest) {
  return getHandler(req, { requestId: '', startTime: 0 })
}

export async function POST(req: NextRequest) {
  return postHandler(req, { requestId: '', startTime: 0 })
}
