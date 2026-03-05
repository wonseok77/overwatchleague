import * as React from 'react'
import { cn } from '@/lib/utils'

type MainRole = 'tank' | 'dps' | 'support'

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  nickname: string
  src?: string | null
  role?: MainRole
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const roleColors: Record<MainRole, string> = {
  tank: 'bg-[#4FC1E9] text-white',
  dps: 'bg-[#F87171] text-white',
  support: 'bg-[#4ADE80] text-white',
}

const sizeClasses = {
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-10 w-10 text-sm',
  lg: 'h-20 w-20 text-xl',
  xl: 'h-[120px] w-[120px] text-3xl',
}

export function Avatar({ nickname, src, role, size = 'md', className, ...props }: AvatarProps) {
  const [imgError, setImgError] = React.useState(false)

  const initial = nickname.slice(0, 1).toUpperCase()
  const showImage = src && !imgError
  const bgClass = role ? roleColors[role] : 'bg-ow-orange-500 text-white'

  return (
    <div
      className={cn(
        'inline-flex items-center justify-center rounded-full overflow-hidden font-semibold shrink-0',
        !showImage && bgClass,
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {showImage ? (
        <img
          src={src}
          alt={nickname}
          className="h-full w-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        initial
      )}
    </div>
  )
}
