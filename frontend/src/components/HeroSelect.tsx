import { useState, useRef, useEffect } from 'react'
import { cn } from '../lib/utils'
import { ChevronDown, X } from 'lucide-react'
import type { Hero } from '../api/heroes'

const ROLE_LABEL: Record<string, string> = { tank: '탱커', dps: '딜러', support: '지원' }
const ROLE_COLOR: Record<string, string> = {
  tank: 'text-[#4FC1E9]',
  dps: 'text-[#F87171]',
  support: 'text-[#4ADE80]',
}

interface HeroSelectProps {
  value: string          // hero name or ''
  onChange: (name: string) => void
  heroes: Hero[]
  placeholder?: string
  className?: string
}

function HeroPortrait({ url, name, size = 28 }: { url: string | null; name: string; size?: number }) {
  const [err, setErr] = useState(false)
  if (!url || err) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground"
        style={{ width: size, height: size, flexShrink: 0 }}
      >
        {name.charAt(0)}
      </span>
    )
  }
  return (
    <img
      src={url}
      alt={name}
      width={size}
      height={size}
      className="rounded-full object-cover"
      style={{ width: size, height: size, flexShrink: 0 }}
      onError={() => setErr(true)}
    />
  )
}

export function HeroSelect({ value, onChange, heroes, placeholder = '영웅 선택', className }: HeroSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // 클릭 외부 감지
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = heroes.find((h) => h.name === value) ?? null

  const byRole = (['tank', 'dps', 'support'] as const).map((role) => ({
    role,
    items: heroes.filter((h) => h.role === role),
  }))

  return (
    <div ref={ref} className={cn('relative', className)}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-2 text-sm ring-offset-background',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          open && 'ring-2 ring-ring ring-offset-2'
        )}
      >
        {selected ? (
          <>
            <HeroPortrait url={selected.portrait_url} name={selected.name} />
            <span className="flex-1 truncate text-left">{selected.name}</span>
            <X
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); onChange('') }}
            />
          </>
        ) : (
          <>
            <span className="flex-1 text-left text-muted-foreground">{placeholder}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-64 rounded-md border bg-popover shadow-lg">
          <div className="max-h-72 overflow-y-auto p-1">
            {/* 선택 해제 */}
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false) }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent"
            >
              없음
            </button>

            {byRole.map(({ role, items }) => (
              items.length === 0 ? null : (
                <div key={role}>
                  <div className={cn('px-2 py-1 text-xs font-semibold', ROLE_COLOR[role])}>
                    {ROLE_LABEL[role]}
                  </div>
                  {items.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => { onChange(h.name); setOpen(false) }}
                      className={cn(
                        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent',
                        value === h.name && 'bg-accent font-medium'
                      )}
                    >
                      <HeroPortrait url={h.portrait_url} name={h.name} size={24} />
                      <span className="truncate">{h.name}</span>
                    </button>
                  ))}
                </div>
              )
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
