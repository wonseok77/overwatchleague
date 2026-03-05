import { Card, CardContent } from './ui/card'
import { Avatar } from './ui/avatar'
import { RoleBadge } from './RoleBadge'
import { HeroBadge } from './HeroBadge'
import type { MainRole } from '../types'

interface PlayerCardProps {
  nickname: string
  mainRole: MainRole
  mmr: number
  mainHeroes: string[]
  rank?: string | null
  className?: string
}

export function PlayerCard({ nickname, mainRole, mmr, mainHeroes, className }: PlayerCardProps) {
  return (
    <Card className={className}>
      <CardContent className="flex items-center gap-4 p-4">
        <Avatar nickname={nickname} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-base truncate">{nickname}</h3>
            <RoleBadge role={mainRole} />
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">MMR {mmr}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {mainHeroes.slice(0, 3).map((hero) => (
              <HeroBadge key={hero} hero={hero} />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
