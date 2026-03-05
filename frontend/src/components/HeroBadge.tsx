import { Badge } from './ui/badge'

interface HeroBadgeProps {
  hero: string
  className?: string
}

export function HeroBadge({ hero, className }: HeroBadgeProps) {
  return (
    <Badge variant="secondary" className={className}>
      {hero}
    </Badge>
  )
}
