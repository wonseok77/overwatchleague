import { Badge } from './ui/badge'
import { HeroBadge } from './HeroBadge'
import { cn } from '../lib/utils'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { Team, MatchResult } from '../types'

interface MatchHistoryData {
  title: string
  map_name: string
  scheduled_at: string
  team: Team
  result: MatchResult
  mmr_change: number
  heroes_played: string[]
}

interface MatchHistoryRowProps {
  match: MatchHistoryData
  className?: string
}

function getResultLabel(team: Team, result: MatchResult): { label: string; won: boolean | null } {
  if (result === 'draw') return { label: '무승부', won: null }
  const won = (team === 'A' && result === 'team_a') || (team === 'B' && result === 'team_b')
  return { label: won ? '승리' : '패배', won }
}

export function MatchHistoryRow({ match, className }: MatchHistoryRowProps) {
  const date = new Date(match.scheduled_at)
  const { label, won } = getResultLabel(match.team, match.result)

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-white p-3 shadow-sm',
        className
      )}
    >
      {/* Row 1 on mobile, inline on desktop */}
      <span className="text-sm text-muted-foreground whitespace-nowrap">
        {format(date, 'M/d (eee)', { locale: ko })}
      </span>
      <span className="text-sm font-medium truncate max-w-[140px]">{match.map_name}</span>
      <Badge variant="secondary" className="text-xs">
        {match.team}팀
      </Badge>
      <Badge
        className={cn(
          'text-xs border-transparent text-white',
          won === true && 'bg-green-500',
          won === false && 'bg-red-500',
          won === null && 'bg-gray-500'
        )}
      >
        {label}
      </Badge>
      <span
        className={cn(
          'text-sm font-semibold tabular-nums',
          match.mmr_change > 0 && 'text-green-600',
          match.mmr_change < 0 && 'text-red-600',
          match.mmr_change === 0 && 'text-gray-500'
        )}
      >
        {match.mmr_change > 0 ? '+' : ''}
        {match.mmr_change}
      </span>
      <div className="flex gap-1 flex-wrap">
        {match.heroes_played.map((hero) => (
          <HeroBadge key={hero} hero={hero} />
        ))}
      </div>
    </div>
  )
}

export type { MatchHistoryData }
