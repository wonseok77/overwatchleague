import type { ReactNode } from 'react'
import { cn } from '../lib/utils'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface StatCardProps {
  label: string
  value: string | number
  icon?: ReactNode
  trend?: 'up' | 'down' | 'neutral'
  className?: string
}

const trendConfig = {
  up: { icon: TrendingUp, color: 'text-green-500' },
  down: { icon: TrendingDown, color: 'text-red-500' },
  neutral: { icon: Minus, color: 'text-gray-400' },
} as const

export function StatCard({ label, value, icon, trend, className }: StatCardProps) {
  const TrendIcon = trend ? trendConfig[trend].icon : null

  return (
    <div className={cn('rounded-lg border bg-white p-4 shadow-sm', className)}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-2xl font-bold">{value}</span>
        {TrendIcon && (
          <TrendIcon className={cn('h-5 w-5', trendConfig[trend!].color)} />
        )}
      </div>
    </div>
  )
}
