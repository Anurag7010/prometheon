import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { compose, withErrorHandler, withRequestId, withAuth } from '@/lib/middleware'
import { RequestContext } from '@/lib/middleware/types'
import db from '@/db/connection'
import { queries } from '@/db/schema'
import { eq, gte, and } from 'drizzle-orm'
import { subDays, format, startOfDay } from 'date-fns'

async function chartsHandler(req: NextRequest, context: RequestContext): Promise<NextResponse> {
  const { userId } = context
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const since = subDays(new Date(), 7)

  const recentQueries = await db
    .select({
      createdAt: queries.createdAt,
      latencyMs: queries.latencyMs,
    })
    .from(queries)
    .where(and(
      eq(queries.userId, userId),
      gte(queries.createdAt, since)
    ))

  // Build 7-day buckets
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = subDays(new Date(), 6 - i)
    return format(startOfDay(date), 'MMM d')
  })

  const buckets: Record<string, { count: number; latencies: number[] }> = {}
  days.forEach(d => { buckets[d] = { count: 0, latencies: [] } })

  for (const q of recentQueries) {
    if (!q.createdAt) continue
    const day = format(startOfDay(new Date(q.createdAt)), 'MMM d')
    if (buckets[day]) {
      buckets[day].count++
      if (q.latencyMs !== null && q.latencyMs !== undefined) buckets[day].latencies.push(q.latencyMs)
    }
  }

  const queryVolumeData = days.map(d => ({
    date: d,
    queries: buckets[d]?.count ?? 0,
  }))

  const latencyData = days.map(d => {
    const lats = buckets[d]?.latencies ?? []
    return {
      date: d,
      avgLatencyMs: lats.length > 0
        ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length)
        : 0,
    }
  })

  return NextResponse.json(
    { queryVolumeData, latencyData },
    { headers: { 'Cache-Control': 'private, max-age=60' } }
  )
}

const handler = compose(
  withErrorHandler,
  withRequestId,
  withAuth({ required: true })
)(chartsHandler)

export async function GET(req: NextRequest) {
  return handler(req, { requestId: '', startTime: Date.now() })
}
