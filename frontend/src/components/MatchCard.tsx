import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Progress } from './ui/progress'
import { Calendar, Clock, Users } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { MatchStatus } from '../types'

const statusConfig: Record<MatchStatus, { label: string; className: string }> = {
  open: { label: '모집중', className: 'bg-green-500 text-white border-transparent' },
  closed: { label: '마감', className: 'bg-gray-500 text-white border-transparent' },
  in_progress: { label: '진행중', className: 'bg-ow-orange-500 text-white border-transparent' },
  completed: { label: '완료', className: 'bg-ow-blue-500 text-white border-transparent' },
}

interface MatchCardProps {
  title: string
  scheduledAt: string
  status: MatchStatus
  currentParticipants: number
  maxParticipants?: number
  className?: string
  onClick?: () => void
}

export function MatchCard({
  title,
  scheduledAt,
  status,
  currentParticipants,
  maxParticipants = 10,
  className,
  onClick,
}: MatchCardProps) {
  const date = new Date(scheduledAt)
  const statusInfo = statusConfig[status]

  return (
    <Card className={className} onClick={onClick} role={onClick ? 'button' : undefined}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{title}</CardTitle>
          <Badge className={statusInfo.className}>{statusInfo.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            {format(date, 'M월 d일 (eee)', { locale: ko })}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {format(date, 'HH:mm')}
          </span>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Users className="h-4 w-4" />
              참가 인원
            </span>
            <span className="font-medium">
              {currentParticipants}/{maxParticipants}
            </span>
          </div>
          <Progress value={currentParticipants} max={maxParticipants} />
        </div>
      </CardContent>
    </Card>
  )
}
