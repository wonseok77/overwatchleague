import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { User } from '@/types'
import * as authApi from '@/api/auth'

interface AuthContextType {
  user: User | null
  token: string | null
  login: (email: string, password: string) => Promise<void>
  register: (data: {
    email: string
    password: string
    real_name: string
    nickname: string
    community_slug: string
    main_role?: string
    current_rank?: string
    main_heroes?: string[]
  }) => Promise<void>
  logout: () => void
  isAdmin: boolean
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('access_token'))
  const [isLoading, setIsLoading] = useState(!!localStorage.getItem('access_token'))

  const logout = useCallback(() => {
    setUser(null)
    setToken(null)
    localStorage.removeItem('access_token')
  }, [])

  useEffect(() => {
    if (!token) {
      setIsLoading(false)
      return
    }
    authApi.getMe()
      .then(setUser)
      .catch(() => logout())
      .finally(() => setIsLoading(false))
  }, [token, logout])

  const login = async (email: string, password: string) => {
    const res = await authApi.login(email, password)
    localStorage.setItem('access_token', res.access_token)
    setToken(res.access_token)
  }

  const register = async (data: Parameters<AuthContextType['register']>[0]) => {
    const res = await authApi.register(data)
    localStorage.setItem('access_token', res.access_token)
    setToken(res.access_token)
  }

  const isAdmin = user?.role === 'admin'

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, isAdmin, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
