import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'

// Mock API modules
vi.mock('@/api/auth', () => ({
  login: vi.fn(),
  register: vi.fn(),
  getMe: vi.fn(),
}))

vi.mock('@/api/heroes', () => ({
  getHeroes: vi.fn().mockResolvedValue([]),
  createHero: vi.fn(),
  updateHero: vi.fn(),
  deleteHero: vi.fn(),
  uploadHeroPortrait: vi.fn(),
  seedHeroes: vi.fn(),
}))

vi.mock('@/api/admin', () => ({
  getAdminSeasons: vi.fn().mockResolvedValue([]),
  createAdminSeason: vi.fn(),
  updateAdminSeason: vi.fn(),
  finalizeAdminSeason: vi.fn(),
  getAdminMembers: vi.fn().mockResolvedValue([]),
  updateAdminMember: vi.fn(),
  updateWebhook: vi.fn(),
  testWebhook: vi.fn(),
}))

import * as authApi from '@/api/auth'
import * as adminApi from '@/api/admin'
import * as heroesApi from '@/api/heroes'
import AdminPage from '@/pages/AdminPage'

const mockedGetMe = vi.mocked(authApi.getMe)
const mockedGetAdminSeasons = vi.mocked(adminApi.getAdminSeasons)
const mockedGetAdminMembers = vi.mocked(adminApi.getAdminMembers)
const mockedGetHeroes = vi.mocked(heroesApi.getHeroes)

function renderAdmin() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <AuthProvider>
        <Routes>
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()

  localStorage.setItem('access_token', 'admin-token')
  mockedGetMe.mockResolvedValue({
    id: 'admin-1',
    community_id: 'comm-1',
    real_name: 'Admin',
    nickname: 'admin',
    discord_id: null,
    email: 'admin@test.com',
    role: 'admin',
    created_at: '',
  })

  mockedGetHeroes.mockResolvedValue([])
  mockedGetAdminSeasons.mockResolvedValue([])
  mockedGetAdminMembers.mockResolvedValue([])
})

describe('AdminPage', () => {
  describe('tab rendering', () => {
    it('renders 4 tabs', async () => {
      renderAdmin()
      await waitFor(() => {
        expect(screen.getByText('관리자 대시보드')).toBeInTheDocument()
      })
      expect(screen.getByText('영웅 관리')).toBeInTheDocument()
      expect(screen.getByText('시즌 관리')).toBeInTheDocument()
      expect(screen.getByText('멤버 관리')).toBeInTheDocument()
      expect(screen.getByText('Webhook 설정')).toBeInTheDocument()
    })

    it('defaults to heroes tab', async () => {
      renderAdmin()
      await waitFor(() => {
        expect(screen.getByText('기본 영웅 시드')).toBeInTheDocument()
      })
    })
  })

  describe('tab switching', () => {
    it('switches to seasons tab', async () => {
      renderAdmin()
      const user = userEvent.setup()

      await waitFor(() => {
        expect(screen.getByText('시즌 관리')).toBeInTheDocument()
      })

      await user.click(screen.getByText('시즌 관리'))

      await waitFor(() => {
        expect(screen.getByText('시즌 목록')).toBeInTheDocument()
        expect(screen.getByText('시즌 생성')).toBeInTheDocument()
      })
    })

    it('switches to members tab', async () => {
      mockedGetAdminMembers.mockResolvedValue([
        {
          user_id: 'u1',
          nickname: 'TestPlayer',
          real_name: 'Test',
          email: 'test@test.com',
          role: 'member',
          main_role: 'dps',
          current_rank: 'Gold 3',
          mmr: 1000,
        },
      ])

      renderAdmin()
      const user = userEvent.setup()

      await waitFor(() => {
        expect(screen.getByText('멤버 관리')).toBeInTheDocument()
      })

      await user.click(screen.getByText('멤버 관리'))

      await waitFor(() => {
        expect(screen.getByText('TestPlayer')).toBeInTheDocument()
      })
    })

    it('switches to webhook tab', async () => {
      renderAdmin()
      const user = userEvent.setup()

      await waitFor(() => {
        expect(screen.getByText('Webhook 설정')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Webhook 설정'))

      await waitFor(() => {
        expect(screen.getByText('Discord Webhook')).toBeInTheDocument()
        expect(screen.getByText('저장')).toBeInTheDocument()
        expect(screen.getByText('테스트 발송')).toBeInTheDocument()
      })
    })
  })

  describe('seasons tab content', () => {
    it('shows seasons in table', async () => {
      mockedGetAdminSeasons.mockResolvedValue([
        {
          id: 's1',
          name: '시즌 1',
          status: 'active',
          started_at: '2026-01-01T00:00:00',
          ended_at: null,
        },
        {
          id: 's2',
          name: '시즌 2',
          status: 'closed',
          started_at: '2026-02-01T00:00:00',
          ended_at: '2026-02-28T00:00:00',
        },
      ])

      renderAdmin()
      const user = userEvent.setup()

      await waitFor(() => {
        expect(screen.getByText('시즌 관리')).toBeInTheDocument()
      })

      await user.click(screen.getByText('시즌 관리'))

      await waitFor(() => {
        expect(screen.getByText('시즌 1')).toBeInTheDocument()
        expect(screen.getByText('시즌 2')).toBeInTheDocument()
      })

      // Active season has close button, closed season has finalize button
      expect(screen.getByRole('button', { name: '종료' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '집계' })).toBeInTheDocument()
    })

    it('shows empty state when no seasons', async () => {
      mockedGetAdminSeasons.mockResolvedValue([])

      renderAdmin()
      const user = userEvent.setup()

      await waitFor(() => {
        expect(screen.getByText('시즌 관리')).toBeInTheDocument()
      })

      await user.click(screen.getByText('시즌 관리'))

      await waitFor(() => {
        expect(screen.getByText('시즌이 없습니다')).toBeInTheDocument()
      })
    })
  })

  describe('members tab content', () => {
    it('shows empty state when no members', async () => {
      mockedGetAdminMembers.mockResolvedValue([])

      renderAdmin()
      const user = userEvent.setup()

      await waitFor(() => {
        expect(screen.getByText('멤버 관리')).toBeInTheDocument()
      })

      await user.click(screen.getByText('멤버 관리'))

      await waitFor(() => {
        expect(screen.getByText('멤버가 없습니다')).toBeInTheDocument()
      })
    })
  })
})
