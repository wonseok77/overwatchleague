import { Badge } from './ui/badge'
import { cn } from '../lib/utils'

const rankColors: Record<string, string> = {
  Bronze: 'bg-amber-700 text-white',
  Silver: 'bg-gray-400 text-white',
  Gold: 'bg-yellow-500 text-white',
  Platinum: 'bg-cyan-500 text-white',
  Diamond: 'bg-blue-500 text-white',
  Master: 'bg-purple-500 text-white',
  Grandmaster: 'bg-yellow-400 text-black',
  Champion: 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white',
}

interface RankBadgeProps {
  rank: string
  className?: string
}

export function RankBadge({ rank, className }: RankBadgeProps) {
  const baseRank = rank.split(' ')[0]
  const colorClass = rankColors[baseRank] ?? 'bg-gray-500 text-white'

  return (
    <Badge className={cn('border-transparent', colorClass, className)}>
      {rank}
    </Badge>
  )
}
