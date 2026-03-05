import { TableRow, TableCell } from './ui/table'
import { cn } from '../lib/utils'

interface SeasonStatData {
  season_name: string
  wins: number
  losses: number
  win_rate: number
  final_mmr: number
  rank_position: number
}

interface SeasonStatRowProps {
  stat: SeasonStatData
  isCurrent?: boolean
  className?: string
}

export function SeasonStatRow({ stat, isCurrent, className }: SeasonStatRowProps) {
  return (
    <TableRow
      className={cn(
        isCurrent && 'font-bold border-l-2 border-l-ow-orange-500',
        className
      )}
    >
      <TableCell>{stat.season_name}</TableCell>
      <TableCell className="text-center">{stat.wins}</TableCell>
      <TableCell className="text-center">{stat.losses}</TableCell>
      <TableCell className="text-center">{(stat.win_rate * 100).toFixed(1)}%</TableCell>
      <TableCell className="text-center tabular-nums">{stat.final_mmr}</TableCell>
      <TableCell className="text-center">#{stat.rank_position}</TableCell>
    </TableRow>
  )
}

export type { SeasonStatData }
