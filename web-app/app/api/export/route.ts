import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { compose, withErrorHandler, withRequestId, withAuth } from '@/lib/middleware'
import { RequestContext } from '@/lib/middleware/types'
import { queriesRepository, documentsRepository } from '@/db'
import { findConversationsByUser } from '@/db/repositories/conversations'

async function exportHandler(req: NextRequest, context: RequestContext): Promise<NextResponse> {
  const { userId } = context
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const [userQueries, userConversations, userDocuments] = await Promise.all([
    queriesRepository.findByUser(userId, 10000),
    findConversationsByUser(userId, 1000),
    documentsRepository.findByUser(userId),
  ])

  const exportData = {
    exportedAt: new Date().toISOString(),
    userId,
    queries: userQueries,
    conversations: userConversations,
    documents: userDocuments.map(d => ({
      id: d.id,
      filename: d.filename,
      status: d.status,
      chunkCount: d.chunkCount,
      createdAt: d.createdAt,
    })),
  }

  const dateStr = new Date().toISOString().split('T')[0]
  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="docmind-export-${dateStr}.json"`,
    },
  })
}

const handler = compose(
  withErrorHandler,
  withRequestId,
  withAuth({ required: true })
)(exportHandler)

export async function GET(req: NextRequest) {
  return handler(req, { requestId: '', startTime: Date.now() })
}
