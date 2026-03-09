import { Badge } from './ui/badge'
import { cn } from '../lib/utils'

import bronzeImg from '@/assets/ranks/bronze.webp'
import silverImg from '@/assets/ranks/silver.webp'
import goldImg from '@/assets/ranks/gold.webp'
import platinumImg from '@/assets/ranks/platinum.webp'
import diamondImg from '@/assets/ranks/diamond.webp'
import masterImg from '@/assets/ranks/master.webp'
import grandmasterImg from '@/assets/ranks/grandmaster.webp'
import championImg from '@/assets/ranks/champion.webp'

const rankColors: Record<string, string> = {
  Bronze: 'bg-amber-800 text-amber-200',
  Silver: 'bg-gray-400 text-white',
  Gold: 'bg-yellow-600 text-yellow-100',
  Platinum: 'bg-teal-500 text-white',
  Diamond: 'bg-blue-500 text-white',
  Master: 'bg-lime-500 text-white',
  Grandmaster: 'bg-purple-600 text-white',
  Champion: 'bg-pink-200 text-pink-700',
}

const rankKorean: Record<string, string> = {
  Champion: '챔피언',
  Grandmaster: '그마',
  Master: '마스터',
  Diamond: '다이아',
  Platinum: '플레',
  Gold: '골드',
  Silver: '실버',
  Bronze: '브론즈',
}

export const rankImages: Record<string, string> = {
  Bronze: bronzeImg,
  Silver: silverImg,
  Gold: goldImg,
  Platinum: platinumImg,
  Diamond: diamondImg,
  Master: masterImg,
  Grandmaster: grandmasterImg,
  Champion: championImg,
}

interface RankBadgeProps {
  rank: string
  className?: string
  compact?: boolean
}

export function RankBadge({ rank, className, compact }: RankBadgeProps) {
  const baseRank = rank.split(' ')[0]
  const number = rank.split(' ')[1]
  const colorClass = rankColors[baseRank] ?? 'bg-gray-500 text-white'

  if (compact) {
    return (
      <Badge className={cn('border-transparent px-1.5 py-0.5', colorClass, className)} title={rank}>
        {rankImages[baseRank] && (
          <img src={rankImages[baseRank]} alt={baseRank} className="w-3.5 h-3.5 mr-0.5 inline-block" />
        )}
        {rankKorean[baseRank] ?? baseRank}{number ?? ''}
      </Badge>
    )
  }

  return (
    <Badge className={cn('border-transparent', colorClass, className)}>
      {rankImages[baseRank] && (
        <img src={rankImages[baseRank]} alt={baseRank} className="w-4 h-4 mr-1 inline-block" />
      )}
      {rank}
    </Badge>
  )
}
