'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import { ArrowUpRight, Filter, Maximize2, Upload, MessageSquare, Cpu, Archive } from 'lucide-react'
import { SpotlightCard, CountUp } from '@/components/ui/motion'
import { EASE_ENTRANCE, DURATION } from '@/lib/motion'
import { cn } from '@/lib/cn'
import { TOKEN_BUDGET_DEFAULT } from '@/lib/constants'

const PERIODS = ['This Week', 'This Month', 'All Time'] as const
type Period = typeof PERIODS[number]

interface AiStats {
  avgLatencyMs: number
  errorRate: number
  cacheHitRate: number
  estimatedCostUsd: number
  totalTokens: number
  slowQueries: number
  failedRetrievals: number
}

interface RecentActivityItem {
  id: string
  type: string
  description: string
  createdAt: string
  status: string
}

interface RecentDoc {
  id: string
  name: string
  time: string
  status: 'ingested' | 'pending' | 'failed'
}

interface DashboardClientProps {
  totalDocs: number
  ingestedDocs: number
  failedDocs: number
  totalQueries: number
  queriesToday: number
  aiStats: AiStats | null
  recentActivity: RecentActivityItem[]
  recentDocs: RecentDoc[]
  queryVolumeData: Array<{ date: string; queries: number }> | null
}

function Widget({
  children,
  index,
  className,
}: {
  children: React.ReactNode
  index: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{
        duration: DURATION.base,
        ease: EASE_ENTRANCE,
        delay: index * 0.1,
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

function formatRelativeTime(isoString: string): string {
  const now = Date.now()
  const then = new Date(isoString).getTime()
  const diff = now - then
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function DashboardClient({
  totalDocs,
  ingestedDocs,
  failedDocs,
  totalQueries,
  queriesToday,
  aiStats,
  recentActivity,
  recentDocs,
  queryVolumeData,
}: DashboardClientProps) {
  const [insightIndex, setInsightIndex] = useState(0)
  const [period, setPeriod] = useState<Period>('This Month')
  const router = useRouter()

  const insights = [
    {
      text: totalDocs > 0
        ? `Your document index has grown to ${totalDocs} documents`
        : 'Upload your first document to get started',
      label: 'Document Index',
    },
    {
      text: aiStats?.cacheHitRate !== null && aiStats?.cacheHitRate !== undefined
        ? `Cache hit rate: ${(aiStats.cacheHitRate * 100).toFixed(0)}% — your queries are lightning fast`
        : 'Cache metrics will appear after your first queries',
      label: 'Cache Performance',
    },
    {
      text: queriesToday > 0
        ? `${queriesToday} queries today — knowledge is flowing`
        : 'No queries today yet — ask the oracle something',
      label: 'Query Activity',
    },
  ]

  const budgetUsed = aiStats?.totalTokens
    ? Math.min((aiStats.totalTokens / TOKEN_BUDGET_DEFAULT) * 100, 100)
    : 0

  function showComingSoon() {
    // use a simple visible toast via DOM since we may not have toast context available here
    const id = 'dashboard-toast-' + Date.now()
    const el = document.createElement('div')
    el.id = id
    el.textContent = 'Widget marketplace launching soon.'
    Object.assign(el.style, {
      position: 'fixed', bottom: '24px', right: '24px',
      background: '#232830', border: '1px solid rgba(76,85,96,0.6)',
      color: '#EDE8E0', fontSize: '13px', padding: '12px 18px',
      borderRadius: '12px', zIndex: '9999',
      boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      animation: 'fadeIn 0.2s ease',
    })
    document.body.appendChild(el)
    setTimeout(() => el.remove(), 2500)
  }

  return (
    <div className="min-h-screen bg-forge-dark p-4 md:p-6">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1 bg-ember-black/60 border border-stone-mid/30 rounded-full p-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'rounded-full px-3 py-1 text-xs transition-all duration-150',
                period === p
                  ? 'bg-ember/15 text-parchment font-medium'
                  : 'text-ash-gray hover:text-parchment/70',
              )}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={showComingSoon}
            className="liquid-glass rounded-full px-4 py-2 text-xs text-parchment/70 hover:text-parchment transition-colors"
          >
            Manage Widgets
          </button>
          <button
            onClick={showComingSoon}
            className="bg-ember text-parchment rounded-full px-4 py-2 text-xs font-medium hover:shadow-[0_0_20px_rgba(212,87,42,0.3)] transition-all"
          >
            Add new Widget
          </button>
        </div>
      </div>

      {/* Quick Actions Bar */}
      <Widget index={0}>
        <div className="bg-ember-black border border-stone-mid/40 rounded-2xl px-6 py-4 flex flex-wrap gap-3 mb-4">
          {[
            { label: 'Upload Document', icon: Upload, href: '/documents' },
            { label: 'Ask a Question', icon: MessageSquare, href: '/chat' },
            { label: 'Run Agent Task', icon: Cpu, href: '/agent' },
            { label: 'View Memory', icon: Archive, href: '/settings' },
          ].map(({ label, icon: Icon, href }) => (
            <motion.button
              key={label}
              onClick={() => router.push(href)}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2 bg-forge-dark border border-stone-mid/40 rounded-xl px-4 py-2.5 text-parchment/80 text-sm hover:border-ember/40 transition-all duration-150"
            >
              <Icon className="h-4 w-4 text-ember" />
              {label}
            </motion.button>
          ))}
        </div>
      </Widget>

      {/* Widget grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
        {/* Widget 1 — AI Insights Carousel */}
        <Widget index={1}>
          <div className="rounded-2xl bg-black border border-stone-mid/40 relative overflow-hidden min-h-[320px] flex flex-col">
            <div
              className="absolute inset-0 opacity-30"
              style={{
                background:
                  'radial-gradient(ellipse at 30% 50%, rgba(218,210,188,0.2) 0%, transparent 60%), radial-gradient(ellipse at 70% 80%, rgba(169,153,133,0.15) 0%, transparent 50%)',
              }}
            />
            <div className="relative z-10 p-6 flex flex-col h-full">
              <p className="text-[10px] uppercase tracking-[0.2em] text-stone-mid mb-auto">
                AI Insights
              </p>

              <div className="my-auto overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={insightIndex}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <p className="text-parchment text-lg font-medium leading-relaxed">
                      {insights[insightIndex]?.text}
                    </p>
                    <p className="text-ash-gray text-xs mt-2">{insights[insightIndex]?.label}</p>
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="flex items-center justify-between mt-auto pt-4">
                <div className="flex gap-1.5">
                  {insights.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setInsightIndex(i)}
                      className={cn(
                        'w-1.5 h-1.5 rounded-full transition-all duration-200',
                        i === insightIndex ? 'bg-ember w-4' : 'bg-stone-mid/40'
                      )}
                    />
                  ))}
                </div>
                <Link
                  href="/chat"
                  className="rounded-full h-8 w-8 flex items-center justify-center bg-ember/10 hover:bg-ember/20 transition-colors"
                >
                  <ArrowUpRight className="w-4 h-4 text-parchment" />
                </Link>
              </div>
            </div>
          </div>
        </Widget>

        {/* Widget 2 — Knowledge Overview */}
        <Widget index={2}>
          <SpotlightCard className="rounded-2xl bg-forge-dark/60 border border-stone-mid/40 p-6 h-full min-h-[320px]">
            <p className="text-sm font-medium text-parchment mb-1">Knowledge Overview</p>
            <p className="text-xs text-ash-gray mb-6">Document intelligence at a glance</p>

            <div className="grid grid-cols-3 gap-4 mb-6">
              <div>
                <CountUp to={totalDocs} className="text-2xl font-light text-parchment" />
                <p className="text-[10px] text-ash-gray mt-1">Total Docs</p>
              </div>
              <div>
                <CountUp to={ingestedDocs} className="text-2xl font-light text-parchment/80" />
                <p className="text-[10px] text-ash-gray mt-1">Indexed</p>
              </div>
              <div>
                <CountUp to={totalQueries} className="text-2xl font-light text-stone-mid" />
                <p className="text-[10px] text-ash-gray mt-1">Queries</p>
              </div>
            </div>

            {/* Mini bar chart */}
            <div className="flex items-end gap-1 h-20">
              {(queryVolumeData ?? Array.from({ length: 7 }, () => ({ queries: 0 }))).slice(-7).map((d, i) => {
                const max = Math.max(...(queryVolumeData ?? []).map(dd => dd.queries), 1)
                const height = ((d.queries ?? 0) / max) * 100
                return (
                  <motion.div
                    key={i}
                    className="flex-1 flex flex-col justify-end group cursor-default"
                    title={`${d.queries ?? 0} queries`}
                  >
                    <motion.div
                      className="rounded-t-sm w-full transition-colors duration-150 group-hover:bg-ember/50"
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ duration: 0.4, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                      style={{ height: `${Math.max(height, 4)}%`, background: 'rgba(212,87,42,0.22)', transformOrigin: 'bottom' }}
                    />
                  </motion.div>
                )
              })}
            </div>
          </SpotlightCard>
        </Widget>

        {/* Widget 3 — Query Volume / Budget */}
        <Widget index={3}>
          <SpotlightCard className="rounded-2xl bg-forge-dark/60 border border-stone-mid/40 p-6 h-full min-h-[320px]">
            <p className="text-sm font-medium text-parchment mb-1">Query Volume</p>
            <p className="text-xs text-ash-gray mb-6">Daily usage and budget</p>

            <div className="flex flex-col items-center justify-center flex-1 py-4">
              {/* Gauge */}
              <div className="relative w-32 h-32">
                <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                  <circle
                    cx="60" cy="60" r="50"
                    fill="none"
                    stroke="#4C5560"
                    strokeWidth="8"
                    opacity="0.15"
                  />
                  <circle
                    cx="60" cy="60" r="50"
                    fill="none"
                    stroke="#D4572A"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${budgetUsed * 3.14} 314`}
                    className="transition-all duration-1000"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-light text-parchment">{budgetUsed.toFixed(0)}%</span>
                  <span className="text-[10px] text-ash-gray">used</span>
                </div>
              </div>

              <div className="flex justify-between w-full mt-6 text-xs">
                <div>
                  <p className="text-ash-gray">Current</p>
                  <p className="text-parchment font-medium">
                    {aiStats?.totalTokens ? `${(aiStats.totalTokens / 1000).toFixed(1)}K` : '0'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-ash-gray">Daily limit</p>
                  <p className="text-parchment font-medium">100K</p>
                </div>
              </div>
            </div>
          </SpotlightCard>
        </Widget>

        {/* Widget 4 — Recent Activity (wide) */}
        <Widget index={4} className="md:col-span-2">
          <div className="rounded-2xl bg-forge-dark/60 border border-stone-mid/40 p-6 min-h-[280px]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-parchment">Recent Activity</p>
                <p className="text-xs text-ash-gray">Documents and queries</p>
              </div>
              <div className="flex items-center gap-2">
                <button className="p-1.5 rounded-lg hover:bg-parchment/5 transition-colors text-ash-gray">
                  <Filter className="w-4 h-4" />
                </button>
                <button className="p-1.5 rounded-lg hover:bg-parchment/5 transition-colors text-ash-gray">
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-0">
              {/* Header */}
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 pb-2 border-b border-stone-mid/10 text-[10px] uppercase tracking-wider text-ash-gray">
                <span>Name</span>
                <span>Source</span>
                <span>Time</span>
                <span>Status</span>
              </div>

              {recentActivity.length === 0 && recentDocs.length === 0 ? (
                <p className="text-sm text-ash-gray text-center py-8">No recent activity</p>
              ) : (
                <>
                  {recentDocs.map((doc) => (
                    <div
                      key={doc.id}
                      className="grid grid-cols-[1fr_auto_auto_auto] gap-4 py-2.5 border-b border-stone-mid/5 items-center"
                    >
                      <span className="text-sm text-parchment truncate">{doc.name}</span>
                      <span className="text-xs text-ash-gray">document</span>
                      <span className="text-xs text-ash-gray">{formatRelativeTime(doc.time)}</span>
                      <span
                        className={cn(
                          'text-xs px-2 py-0.5 rounded-full',
                          doc.status === 'ingested' && 'bg-ember/10 text-parchment/80',
                          doc.status === 'pending' && 'bg-stone-mid/15 text-ash-gray',
                          doc.status === 'failed' && 'bg-red-500/15 text-red-400',
                        )}
                      >
                        {doc.status}
                      </span>
                    </div>
                  ))}
                  {recentActivity.slice(0, 3).map((item) => (
                    <div
                      key={item.id}
                      className="grid grid-cols-[1fr_auto_auto_auto] gap-4 py-2.5 border-b border-stone-mid/5 items-center"
                    >
                      <span className="text-sm text-parchment truncate">{item.description}</span>
                      <span className="text-xs text-ash-gray">query</span>
                      <span className="text-xs text-ash-gray">{formatRelativeTime(item.createdAt)}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-ember/10 text-parchment/80">
                        completed
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </Widget>

        {/* Widget 5 — Memory Vault */}
        <Widget index={5}>
          <SpotlightCard className="rounded-2xl bg-forge-dark/60 border border-stone-mid/40 p-6 h-full min-h-[280px]">
            <p className="text-sm font-medium text-parchment mb-1">Memory Vault</p>
            <p className="text-xs text-ash-gray mb-6">System memory distribution</p>

            {/* Category bars */}
            <div className="space-y-4">
              {[
                { label: 'Documents', value: totalDocs, color: '#D4572A' },
                { label: 'Queries', value: totalQueries, color: '#4C5560' },
                { label: 'Indexed', value: ingestedDocs, color: '#7A7068' },
                { label: 'Failed', value: failedDocs, color: '#EDE8E0' },
              ].map((cat) => {
                const maxVal = Math.max(totalDocs, totalQueries, ingestedDocs, 1)
                const pct = (cat.value / maxVal) * 100
                return (
                  <div key={cat.label}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-ash-gray">{cat.label}</span>
                      <span className="text-parchment font-medium">{cat.value}</span>
                    </div>
                    <div className="h-1.5 bg-stone-mid/10 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-1000"
                        style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: cat.color }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* AI health summary */}
            <div className="mt-6 pt-4 border-t border-stone-mid/10 space-y-2">
              {[
                {
                  label: 'Error Rate',
                  value: aiStats?.errorRate !== null && aiStats?.errorRate !== undefined ? `${(aiStats.errorRate * 100).toFixed(1)}%` : '--',
                },
                {
                  label: 'Cost Today',
                  value: aiStats?.estimatedCostUsd !== null && aiStats?.estimatedCostUsd !== undefined ? `$${aiStats.estimatedCostUsd.toFixed(4)}` : '--',
                },
              ].map((metric) => (
                <div key={metric.label} className="flex justify-between text-xs">
                  <span className="text-ash-gray">{metric.label}</span>
                  <span className="text-parchment font-mono">{metric.value}</span>
                </div>
              ))}
            </div>
          </SpotlightCard>
        </Widget>

        {/* Widget 6 — System Status */}
        <Widget index={6}>
          <div className="bg-forge-dark border border-stone-mid/40 rounded-2xl px-6 py-5 h-full min-h-[200px]">
            <p className="text-parchment/80 text-sm font-medium mb-4">System Status</p>
            <div className="space-y-0">
              {[
                { label: 'RAG Pipeline', status: 'Online', dotClass: 'bg-green-400' },
                { label: 'Agent Reasoning', status: 'Online', dotClass: 'bg-green-400' },
                { label: 'Memory Store', status: 'Active', dotClass: 'bg-ember' },
              ].map((row, i, arr) => (
                <div
                  key={row.label}
                  className={cn(
                    'flex justify-between items-center py-2.5',
                    i < arr.length - 1 && 'border-b border-stone-mid/20',
                  )}
                >
                  <span className="text-ash-gray text-xs">{row.label}</span>
                  <span className="flex items-center gap-1.5">
                    <span className="relative flex w-2 h-2 shrink-0">
                      {row.status === 'Online' && (
                        <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full opacity-50', row.dotClass)} />
                      )}
                      <span className={cn('relative rounded-full w-2 h-2', row.dotClass)} />
                    </span>
                    <span className="text-xs text-parchment/70">{row.status}</span>
                  </span>
                </div>
              ))}
            </div>

            {aiStats && (
              <div className="mt-4 pt-3 border-t border-stone-mid/20">
                <div className="flex justify-between text-xs">
                  <span className="text-ash-gray">Avg latency</span>
                  <span className="text-parchment font-mono">
                    {aiStats.avgLatencyMs ? `${aiStats.avgLatencyMs.toFixed(0)}ms` : '--'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </Widget>
      </div>
    </div>
  )
}
