import type { ReactNode } from 'react'
import { Navbar } from './Navbar'
import { useAuth } from '@/contexts/AuthContext'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth()

  return (
    <div className="min-h-screen bg-background">
      <Navbar
        isLoggedIn={!!user}
        nickname={user?.nickname}
        realName={user?.real_name}
        avatarUrl={user?.avatar_url ?? null}
        onLogout={logout}
        isAdmin={user?.role === 'admin' || user?.role === 'manager'}
      />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  )
}
