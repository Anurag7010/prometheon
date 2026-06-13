'use client'

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { cn } from '@/lib/cn'

interface DataPoint {
  date: string
  queries: number
}

interface QueryVolumeChartProps {
  data: DataPoint[]
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
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="text-muted-foreground mb-1">{label}</p>
      <p className="font-semibold text-foreground">
        {entry.value} {entry.value === 1 ? 'query' : 'queries'}
      </p>
    </div>
  )
}

export function QueryVolumeChart({ data, className }: QueryVolumeChartProps) {
  return (
    <div className={cn('w-full', className)}>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="queryGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(217 91% 60%)" stopOpacity={0.15} />
              <stop offset="95%" stopColor="hsl(217 91% 60%)" stopOpacity={0} />
            </linearGradient>
          </defs>
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
            allowDecimals={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--border))' }} />
          <Area
            type="monotone"
            dataKey="queries"
            stroke="hsl(217 91% 60%)"
            strokeWidth={2}
            fill="url(#queryGradient)"
            dot={false}
            activeDot={{ r: 4, fill: 'hsl(217 91% 60%)' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
