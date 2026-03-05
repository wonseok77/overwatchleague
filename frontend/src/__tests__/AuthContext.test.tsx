import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'

// Mock API module
vi.mock('@/api/auth', () => ({
  login: vi.fn(),
  register: vi.fn(),
  getMe: vi.fn(),
}))

import * as authApi from '@/api/auth'

const mockedLogin = vi.mocked(authApi.login)
const mockedGetMe = vi.mocked(authApi.getMe)

// Helper: AuthContext 값을 표시하는 컴포넌트
function AuthDisplay() {
  const { user, isLoading, isAdmin, logout, token } = useAuth()
  if (isLoading) return <div data-testid="loading">Loading...</div>
  return (
    <div>
      <span data-testid="user">{user ? user.nickname : 'null'}</span>
      <span data-testid="is-admin">{String(isAdmin)}</span>
      <span data-testid="token">{token ?? 'null'}</span>
      <button data-testid="logout-btn" onClick={logout}>Logout</button>
    </div>
  )
}

// Helper: PrivateRoute (App.tsx와 동일 패턴)
function PrivateRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return null
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AdminRoute({ children }: { children: ReactNode }) {
  const { isAdmin, isLoading } = useAuth()
  if (isLoading) return null
  if (!isAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}

function renderWithProviders(ui: ReactNode, { route = '/' } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>{ui}</AuthProvider>
    </MemoryRouter>
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

afterEach(() => {
  localStorage.clear()
})

describe('AuthContext', () => {
  describe('초기 상태', () => {
    it('토큰 없으면 user=null, isLoading=false', async () => {
      mockedGetMe.mockRejectedValue(new Error('no token'))
      renderWithProviders(<AuthDisplay />)
      await waitFor(() => {
        expect(screen.getByTestId('user').textContent).toBe('null')
      })
    })

    it('localStorage에 토큰이 있으면 getMe 호출', async () => {
      localStorage.setItem('access_token', 'saved-token')
      mockedGetMe.mockResolvedValue({
        id: '1',
        community_id: 'c1',
        real_name: 'Test',
        nickname: 'tester',
        discord_id: null,
        email: 'test@t.com',
        role: 'member',
        created_at: '',
      })

      renderWithProviders(<AuthDisplay />)
      await waitFor(() => {
        expect(screen.getByTestId('user').textContent).toBe('tester')
      })
      expect(mockedGetMe).toHaveBeenCalledOnce()
    })

    it('getMe 실패 시 자동 로그아웃', async () => {
      localStorage.setItem('access_token', 'expired-token')
      mockedGetMe.mockRejectedValue(new Error('401'))

      renderWithProviders(<AuthDisplay />)
      await waitFor(() => {
        expect(screen.getByTestId('user').textContent).toBe('null')
        expect(screen.getByTestId('token').textContent).toBe('null')
      })
      expect(localStorage.getItem('access_token')).toBeNull()
    })
  })

  describe('login', () => {
    it('로그인 성공 시 토큰 저장 + user 로드', async () => {
      mockedLogin.mockResolvedValue({ access_token: 'new-token', token_type: 'bearer' })
      mockedGetMe.mockResolvedValue({
        id: '1',
        community_id: 'c1',
        real_name: 'User',
        nickname: 'logged_in',
        discord_id: null,
        email: 'u@t.com',
        role: 'member',
        created_at: '',
      })

      function LoginTestComponent() {
        const { login, user } = useAuth()
        return (
          <div>
            <button onClick={() => login('u@t.com', 'pass')}>Login</button>
            <span data-testid="user">{user?.nickname ?? 'null'}</span>
          </div>
        )
      }

      renderWithProviders(<LoginTestComponent />)
      const user = userEvent.setup()
      await user.click(screen.getByText('Login'))

      await waitFor(() => {
        expect(screen.getByTestId('user').textContent).toBe('logged_in')
      })
      expect(localStorage.getItem('access_token')).toBe('new-token')
    })
  })

  describe('logout', () => {
    it('로그아웃 시 토큰 제거 + user=null', async () => {
      localStorage.setItem('access_token', 'valid-token')
      mockedGetMe.mockResolvedValue({
        id: '1',
        community_id: 'c1',
        real_name: 'User',
        nickname: 'active',
        discord_id: null,
        email: 'u@t.com',
        role: 'member',
        created_at: '',
      })

      renderWithProviders(<AuthDisplay />)
      await waitFor(() => {
        expect(screen.getByTestId('user').textContent).toBe('active')
      })

      const user = userEvent.setup()
      await user.click(screen.getByTestId('logout-btn'))

      expect(screen.getByTestId('user').textContent).toBe('null')
      expect(localStorage.getItem('access_token')).toBeNull()
    })
  })

  describe('isAdmin', () => {
    it('admin role이면 isAdmin=true', async () => {
      localStorage.setItem('access_token', 'admin-token')
      mockedGetMe.mockResolvedValue({
        id: '1',
        community_id: 'c1',
        real_name: 'Admin',
        nickname: 'admin',
        discord_id: null,
        email: 'admin@t.com',
        role: 'admin',
        created_at: '',
      })

      renderWithProviders(<AuthDisplay />)
      await waitFor(() => {
        expect(screen.getByTestId('is-admin').textContent).toBe('true')
      })
    })

    it('member role이면 isAdmin=false', async () => {
      localStorage.setItem('access_token', 'member-token')
      mockedGetMe.mockResolvedValue({
        id: '1',
        community_id: 'c1',
        real_name: 'Member',
        nickname: 'member',
        discord_id: null,
        email: 'm@t.com',
        role: 'member',
        created_at: '',
      })

      renderWithProviders(<AuthDisplay />)
      await waitFor(() => {
        expect(screen.getByTestId('is-admin').textContent).toBe('false')
      })
    })
  })

  describe('PrivateRoute 가드', () => {
    it('미인증 사용자는 /login으로 리다이렉트', async () => {
      mockedGetMe.mockRejectedValue(new Error('no auth'))

      render(
        <MemoryRouter initialEntries={['/profile/1']}>
          <AuthProvider>
            <Routes>
              <Route path="/profile/:id" element={<PrivateRoute><div>Profile</div></PrivateRoute>} />
              <Route path="/login" element={<div data-testid="login-page">Login Page</div>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByTestId('login-page')).toBeInTheDocument()
      })
    })

    it('인증 사용자는 보호된 페이지 접근 가능', async () => {
      localStorage.setItem('access_token', 'valid')
      mockedGetMe.mockResolvedValue({
        id: '1',
        community_id: 'c1',
        real_name: 'U',
        nickname: 'u',
        discord_id: null,
        email: 'u@t.com',
        role: 'member',
        created_at: '',
      })

      render(
        <MemoryRouter initialEntries={['/profile/1']}>
          <AuthProvider>
            <Routes>
              <Route path="/profile/:id" element={<PrivateRoute><div data-testid="profile">Profile</div></PrivateRoute>} />
              <Route path="/login" element={<div>Login</div>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByTestId('profile')).toBeInTheDocument()
      })
    })
  })

  describe('AdminRoute 가드', () => {
    it('member는 / 으로 리다이렉트', async () => {
      localStorage.setItem('access_token', 'member')
      mockedGetMe.mockResolvedValue({
        id: '1',
        community_id: 'c1',
        real_name: 'M',
        nickname: 'm',
        discord_id: null,
        email: 'm@t.com',
        role: 'member',
        created_at: '',
      })

      render(
        <MemoryRouter initialEntries={['/admin']}>
          <AuthProvider>
            <Routes>
              <Route path="/admin" element={<AdminRoute><div>Admin</div></AdminRoute>} />
              <Route path="/" element={<div data-testid="home">Home</div>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByTestId('home')).toBeInTheDocument()
      })
    })

    it('admin은 관리자 페이지 접근 가능', async () => {
      localStorage.setItem('access_token', 'admin')
      mockedGetMe.mockResolvedValue({
        id: '1',
        community_id: 'c1',
        real_name: 'A',
        nickname: 'admin',
        discord_id: null,
        email: 'a@t.com',
        role: 'admin',
        created_at: '',
      })

      render(
        <MemoryRouter initialEntries={['/admin']}>
          <AuthProvider>
            <Routes>
              <Route path="/admin" element={<AdminRoute><div data-testid="admin-page">Admin Page</div></AdminRoute>} />
              <Route path="/" element={<div>Home</div>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByTestId('admin-page')).toBeInTheDocument()
      })
    })
  })
})
