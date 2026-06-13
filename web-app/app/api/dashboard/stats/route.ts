import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import {
  compose,
  withErrorHandler,
  withRequestId,
  withLogging,
  withAuth,
} from '@/lib/middleware'
import { RequestContext } from '@/lib/middleware/types'
import { documentsRepository, queriesRepository } from '@/db'
import { backendClient } from '@/lib/backend-client'

async function statsHandler(
  req: NextRequest,
  context: RequestContext
): Promise<NextResponse> {
  const { userId } = context
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const [documentsResult, queriesResult, aiMetricsResult] = await Promise.allSettled([
    documentsRepository.findByUser(userId),
    queriesRepository.findByUser(userId, 1000),
    backendClient.getMetrics(24),
  ])

  const docs = documentsResult.status === 'fulfilled' ? documentsResult.value : []
  const qs = queriesResult.status === 'fulfilled' ? queriesResult.value : []
  const metrics = aiMetricsResult.status === 'fulfilled' ? aiMetricsResult.value : null

  const now = Date.now()
  const last24h = now - 24 * 60 * 60 * 1000

  return NextResponse.json(
    {
      documents: {
        total: docs.length,
        ingested: docs.filter((d) => d.status === 'ingested').length,
        failed: docs.filter((d) => d.status === 'failed').length,
        pending: docs.filter((d) => d.status === 'pending').length,
      },
      queries: {
        total: qs.length,
        last24h: qs.filter((q) => new Date(q.createdAt).getTime() > last24h).length,
      },
      ai: metrics
        ? {
            avgLatencyMs: metrics.avg_latency_ms,
            errorRate: metrics.error_rate,
            cacheHitRate: metrics.cache_hit_rate,
            estimatedCostUsd: metrics.estimated_cost_usd,
            totalTokens: metrics.total_tokens,
            slowQueries: metrics.slow_queries,
            failedRetrievals: metrics.failed_retrievals,
          }
        : null,
    },
    {
      headers: {
        'Cache-Control': 'private, max-age=30',
      },
    }
  )
}

const handler = compose(
  withErrorHandler,
  withRequestId,
  withLogging,
  withAuth({ required: true })
)(statsHandler)

export async function GET(req: NextRequest) {
  return handler(req, { requestId: '', startTime: 0 })
}
