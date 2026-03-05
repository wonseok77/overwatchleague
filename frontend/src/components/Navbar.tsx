import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Button } from './ui/button'
import { Swords, Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavbarProps {
  isLoggedIn?: boolean
  nickname?: string
  onLogout?: () => void
  isAdmin?: boolean
}

export function Navbar({ isLoggedIn = false, nickname, onLogout, isAdmin }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/')

  const navLinkClass = (path: string) =>
    cn(
      'relative text-sm font-medium transition-colors',
      isActive(path)
        ? 'text-foreground after:absolute after:bottom-[-2px] after:left-0 after:h-[2px] after:w-full after:rounded-full after:bg-ow-orange-500'
        : 'text-muted-foreground hover:text-foreground'
    )

  const navLinks = (
    <>
      <Link
        to="/matches"
        className={navLinkClass('/matches')}
        onClick={() => setMobileOpen(false)}
      >
        내전 일정
      </Link>
      <Link
        to="/leaderboard"
        className={navLinkClass('/leaderboard')}
        onClick={() => setMobileOpen(false)}
      >
        파워랭킹
      </Link>
      <Link
        to="/highlights"
        className={navLinkClass('/highlights')}
        onClick={() => setMobileOpen(false)}
      >
        하이라이트
      </Link>
      {isAdmin && (
        <Link
          to="/admin"
          className={navLinkClass('/admin')}
          onClick={() => setMobileOpen(false)}
        >
          관리
        </Link>
      )}
    </>
  )

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-ow-orange-500">
              <Swords className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-base tracking-tight">
              OW <span className="text-ow-orange-500">League</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            {navLinks}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {isLoggedIn ? (
            <>
              <Link to="/profile/me">
                <Button variant="ghost" size="sm" className="text-sm font-medium">
                  {nickname}
                </Button>
              </Link>
              <Button variant="outline" size="sm" onClick={onLogout} className="text-sm">
                로그아웃
              </Button>
            </>
          ) : (
            <Link to="/login">
              <Button size="sm" className="text-sm">로그인</Button>
            </Link>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>
      {mobileOpen && (
        <nav className="flex flex-col gap-1 border-t border-border/50 bg-background px-4 py-3 md:hidden">
          {navLinks}
        </nav>
      )}
    </header>
  )
}
