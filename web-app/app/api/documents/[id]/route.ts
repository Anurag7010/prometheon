import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
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
import { documentsRepository } from '@/db'

const UpdateStatusSchema = z.object({
  status: z.enum(['pending', 'ingested', 'failed']),
  chunkCount: z.number().int().nonnegative().optional(),
})

// Shared ownership check — used by GET, PATCH, DELETE
async function getOwnedDocument(id: string, userId: string) {
  const document = await documentsRepository.findById(id)

  if (!document) return { document: null, error: 'not_found' as const }

  // Authorization check — user can only access their own documents
  // Without this, any authenticated user could read/modify any document
  if (document.userId !== userId) return { document: null, error: 'forbidden' as const }

  return { document, error: null }
}

async function getHandler(
  req: NextRequest,
  context: RequestContext & { params: { id: string } }
): Promise<NextResponse> {
  const { userId } = context
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const { document, error } = await getOwnedDocument(
    context.params.id,
    userId
  )

  if (error === 'not_found') {
    return NextResponse.json(
      { error: 'NOT_FOUND', message: 'Document not found', requestId: context.requestId },
      { status: 404 }
    )
  }
  if (error === 'forbidden') {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: 'Access denied', requestId: context.requestId },
      { status: 403 }
    )
  }

  return NextResponse.json({ data: document, requestId: context.requestId })
}

async function patchHandler(
  req: NextRequest,
  context: RequestContext & { params: { id: string } }
): Promise<NextResponse> {
  const { userId } = context
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const { error } = await getOwnedDocument(
    context.params.id,
    userId
  )

  if (error === 'not_found') {
    return NextResponse.json(
      { error: 'NOT_FOUND', message: 'Document not found', requestId: context.requestId },
      { status: 404 }
    )
  }
  if (error === 'forbidden') {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: 'Access denied', requestId: context.requestId },
      { status: 403 }
    )
  }

  const body = context.parsedBody as z.infer<typeof UpdateStatusSchema>

  const updated = await documentsRepository.updateStatus(
    context.params.id,
    body.status,
    body.chunkCount
  )

  return NextResponse.json({ data: updated, requestId: context.requestId })
}

async function deleteHandler(
  req: NextRequest,
  context: RequestContext & { params: { id: string } }
): Promise<NextResponse> {
  const { userId } = context
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const { error } = await getOwnedDocument(context.params.id, userId)

  if (error === 'not_found') {
    return NextResponse.json(
      { error: 'NOT_FOUND', message: 'Document not found', requestId: context.requestId },
      { status: 404 }
    )
  }
  if (error === 'forbidden') {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: 'Access denied', requestId: context.requestId },
      { status: 403 }
    )
  }

  await documentsRepository.deleteDocument(context.params.id)
  revalidateTag('documents', 'default')
  revalidateTag(`document-${context.params.id}`, 'default')

  // 204 No Content — success, nothing to return
  // 200 would imply a response body exists
  return new NextResponse(null, { status: 204 })
}

// Route handlers receive params from Next.js as second argument
type RouteProps = { params: Promise<{ id: string }> }

const wrappedGet = compose(withErrorHandler, withRequestId, withLogging, withAuth({ required: true }))(
  (req, ctx) => getHandler(req, ctx as unknown as RequestContext & { params: { id: string } })
)
const wrappedPatch = compose(withErrorHandler, withRequestId, withLogging, withAuth({ required: true }), withValidation(UpdateStatusSchema))(
  (req, ctx) => patchHandler(req, ctx as unknown as RequestContext & { params: { id: string } })
)
const wrappedDelete = compose(withErrorHandler, withRequestId, withLogging, withAuth({ required: true }))(
  (req, ctx) => deleteHandler(req, ctx as unknown as RequestContext & { params: { id: string } })
)

export async function GET(req: NextRequest, { params }: RouteProps) {
  const resolvedParams = await params;
  return wrappedGet(req, { requestId: '', startTime: 0, params: resolvedParams } as unknown as RequestContext)
}
export async function PATCH(req: NextRequest, { params }: RouteProps) {
  const resolvedParams = await params;
  return wrappedPatch(req, { requestId: '', startTime: 0, params: resolvedParams } as unknown as RequestContext)
}
export async function DELETE(req: NextRequest, { params }: RouteProps) {
  const resolvedParams = await params;
  return wrappedDelete(req, { requestId: '', startTime: 0, params: resolvedParams } as unknown as RequestContext)
}