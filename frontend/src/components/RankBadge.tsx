import { Badge } from './ui/badge'
import { cn } from '../lib/utils'

const rankColors: Record<string, string> = {
  Bronze: 'bg-amber-800 text-amber-200',
  Silver: 'bg-gray-400 text-white',
  Gold: 'bg-yellow-600 text-yellow-100',
  Platinum: 'bg-teal-500 text-white',
  Diamond: 'bg-blue-500 text-white',
  Master: 'bg-lime-500 text-white',
  Grandmaster: 'bg-purple-600 text-white',
  Champion: 'bg-pink-500 text-white',
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
