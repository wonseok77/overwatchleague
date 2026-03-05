import * as React from 'react'
import { cn } from '../../lib/utils'

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  nickname: string
  src?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

function Avatar({ nickname, src, size = 'md', className, ...props }: AvatarProps) {
  const [imgError, setImgError] = React.useState(false)
  const initials = nickname.slice(0, 2).toUpperCase()
  const sizeClasses = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-14 w-14 text-lg',
    xl: 'h-[120px] w-[120px] text-3xl',
  }

  const showImage = src && !imgError

  return (
    <div
      className={cn(
        'inline-flex items-center justify-center rounded-full overflow-hidden font-semibold',
        !showImage && 'bg-ow-orange-500 text-white',
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
        initials
      )}
    </div>
  )
}

export { Avatar }
