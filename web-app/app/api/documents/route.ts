import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  compose,
  withErrorHandler,
  withRequestId,
  withLogging,
  withAuth,
  withValidation,
} from '@/lib/middleware'
import { RequestContext } from '@/lib/middleware/types'
import { aiService } from '@/services/ai-service'

// Schema for document upload body
const IngestSchema = z.object({
  filename: z.string().min(1, 'Filename is required'),
})

// GET — list documents, auth required, no body validation
async function listDocumentsHandler(
  req: NextRequest,
  context: RequestContext
): Promise<NextResponse> {
  // Stub — real implementation queries document store
  return NextResponse.json({
    data: [],
    requestId: context.requestId,
    userId: context.userId,
  })
}

// POST — ingest document, auth required, body validated
async function ingestDocumentHandler(
  req: NextRequest,
  context: RequestContext
): Promise<NextResponse> {
  // FormData is handled differently — not JSON
  // withValidation handles JSON body — for file upload we read FormData directly
  const formData = await req.formData()
  const file = formData.get('file')

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      {
        error: 'VALIDATION_ERROR',
        message: 'File is required',
        requestId: context.requestId,
        timestamp: new Date().toISOString(),
      },
      { status: 422 }
    )
  }

  const response = await aiService.ingest({ file })

  if (response.error) {
    return NextResponse.json(
      {
        error: response.error.code,
        message: response.error.message,
        requestId: context.requestId,
        timestamp: new Date().toISOString(),
      },
      { status: response.status ?? 500 }
    )
  }

  return NextResponse.json(
    {
      data: response.data,
      requestId: context.requestId,
    },
    { status: 201 }
  )
}

// GET — no validation middleware needed, no body to parse
const getHandler = compose(
  withErrorHandler,
  withRequestId,
  withLogging,
  withAuth({ required: true })
)(listDocumentsHandler)

// POST — file upload handled in handler directly, not via withValidation
const postHandler = compose(
  withErrorHandler,
  withRequestId,
  withLogging,
  withAuth({ required: true })
)(ingestDocumentHandler)

export async function GET(req: NextRequest): Promise<NextResponse> {
  const context: RequestContext = { requestId: '', startTime: 0 }
  return getHandler(req, context)
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const context: RequestContext = { requestId: '', startTime: 0 }
  return postHandler(req, context)
}