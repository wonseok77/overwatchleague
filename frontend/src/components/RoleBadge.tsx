import { Badge } from './ui/badge'
import { Shield, Crosshair, Heart } from 'lucide-react'
import type { MainRole } from '../types'

const roleConfig: Record<MainRole, { label: string; variant: 'tank' | 'dps' | 'support'; icon: typeof Shield }> = {
  tank: { label: 'Tank', variant: 'tank', icon: Shield },
  dps: { label: 'DPS', variant: 'dps', icon: Crosshair },
  support: { label: 'Support', variant: 'support', icon: Heart },
}

interface RoleBadgeProps {
  role: MainRole
  showIcon?: boolean
  className?: string
}

export function RoleBadge({ role, showIcon = true, className }: RoleBadgeProps) {
  const config = roleConfig[role]
  const Icon = config.icon

  return (
    <Badge variant={config.variant} className={className}>
      {showIcon && <Icon className="mr-1 h-3 w-3" />}
      {config.label}
    </Badge>
  )
}
