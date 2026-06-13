'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { cn } from '@/lib/cn'

interface DataPoint {
  date: string
  avgLatencyMs: number
}

interface LatencyChartProps {
  data: DataPoint[]
  threshold?: number
  className?: string
}

interface TooltipProps {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null
  const entry = payload[0]
  if (!entry) return null
  const ms = entry.value
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="text-muted-foreground mb-1">{label}</p>
      <p className={cn(
        'font-semibold',
        ms > 5000 ? 'text-red-500' : ms > 3000 ? 'text-yellow-500' : 'text-green-600'
      )}>
        {ms.toLocaleString()}ms avg
      </p>
    </div>
  )
}

export function LatencyChart({ data, threshold = 5000, className }: LatencyChartProps) {
  return (
    <div className={cn('w-full', className)}>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}s`}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine
            y={threshold}
            stroke="hsl(var(--destructive))"
            strokeDasharray="4 4"
            strokeOpacity={0.5}
          />
          <Line
            type="monotone"
            dataKey="avgLatencyMs"
            stroke="hsl(217 91% 60%)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
