import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import type { MatchDetail } from '@/api/matches'

// Mock all API modules
vi.mock('@/api/auth', () => ({
  login: vi.fn(),
  register: vi.fn(),
  getMe: vi.fn(),
}))

vi.mock('@/api/matches', () => ({
  getMatch: vi.fn(),
  submitResult: vi.fn(),
  submitMatchStats: vi.fn(),
  createHighlight: vi.fn(),
  deleteHighlight: vi.fn(),
}))

// Mock date-fns to avoid locale issues in test
vi.mock('date-fns', () => ({
  format: vi.fn(() => '2026.3.15 (일) 19:00'),
}))

vi.mock('date-fns/locale', () => ({
  ko: {},
}))

import * as authApi from '@/api/auth'
import * as matchesApi from '@/api/matches'
import MatchDetailPage from '@/pages/MatchDetailPage'

const mockedGetMe = vi.mocked(authApi.getMe)
const mockedGetMatch = vi.mocked(matchesApi.getMatch)

const baseMatch: MatchDetail = {
  id: 'match-1',
  community_id: 'comm-1',
  season_id: 'season-1',
  title: 'Test Match',
  scheduled_at: '2026-03-15T19:00:00',
  status: 'in_progress',
  map_name: null,
  team_a_score: null,
  team_b_score: null,
  result: null,
  discord_announced: false,
  created_at: '2026-03-01T00:00:00',
  participants: [
    {
      id: 'p1',
      user_id: 'u1',
      nickname: 'Player1',
      status: 'registered',
      team: 'A',
      main_role: 'dps',
      mmr: 1200,
      heroes_played: null,
      screenshot_path: null,
      mmr_before: null,
      mmr_after: null,
      mmr_change: null,
      kills: null,
      assists: null,
      deaths: null,
      damage_dealt: null,
      healing_done: null,
      damage_mitigated: null,
      stat_source: null,
      assigned_position: null,
      position_rank: null,
    },
    {
      id: 'p2',
      user_id: 'u2',
      nickname: 'Player2',
      status: 'registered',
      team: 'B',
      main_role: 'support',
      mmr: 1400,
      heroes_played: null,
      screenshot_path: null,
      mmr_before: null,
      mmr_after: null,
      mmr_change: null,
      kills: null,
      assists: null,
      deaths: null,
      damage_dealt: null,
      healing_done: null,
      damage_mitigated: null,
      stat_source: null,
      assigned_position: null,
      position_rank: null,
    },
  ],
  highlights: [],
}

function renderPage(matchId = 'match-1') {
  return render(
    <MemoryRouter initialEntries={[`/matches/${matchId}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/matches/:id" element={<MatchDetailPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('MatchDetailPage', () => {
  describe('loading and error states', () => {
    it('shows loading text while fetching', () => {
      mockedGetMe.mockRejectedValue(new Error('no auth'))
      mockedGetMatch.mockReturnValue(new Promise(() => {})) // never resolves
      renderPage()
      expect(screen.getByText('로딩 중...')).toBeInTheDocument()
    })

    it('shows not found when match does not exist', async () => {
      mockedGetMe.mockRejectedValue(new Error('no auth'))
      const err = new Error('404') as Error & { response?: { status: number } }
      err.response = { status: 404 }
      mockedGetMatch.mockRejectedValue(err)
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('경기를 찾을 수 없습니다.')).toBeInTheDocument()
      })
    })
  })

  describe('non-admin (member) view', () => {
    beforeEach(() => {
      // Login as member
      localStorage.setItem('access_token', 'member-token')
      mockedGetMe.mockResolvedValue({
        id: 'u1',
        community_id: 'comm-1',
        real_name: 'Member',
        nickname: 'member',
        discord_id: null,
        email: 'member@test.com',
        role: 'member',
        created_at: '',
      })
    })

    it('shows match title and team composition', async () => {
      mockedGetMatch.mockResolvedValue(baseMatch)
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Test Match')).toBeInTheDocument()
      })
      expect(screen.getByText('Player1')).toBeInTheDocument()
      expect(screen.getByText('Player2')).toBeInTheDocument()
    })

    it('shows team labels A and B', async () => {
      mockedGetMatch.mockResolvedValue(baseMatch)
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Test Match')).toBeInTheDocument()
      })
      expect(screen.getByText('A팀')).toBeInTheDocument()
      expect(screen.getByText('B팀')).toBeInTheDocument()
    })

    it('does NOT show result form for non-admin', async () => {
      mockedGetMatch.mockResolvedValue(baseMatch)
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Test Match')).toBeInTheDocument()
      })
      expect(screen.queryByText('결과 입력')).not.toBeInTheDocument()
    })

    it('does NOT show highlight add button for non-admin', async () => {
      mockedGetMatch.mockResolvedValue(baseMatch)
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('하이라이트')).toBeInTheDocument()
      })
      expect(screen.queryByText('추가')).not.toBeInTheDocument()
    })

    it('shows no highlights message when empty', async () => {
      mockedGetMatch.mockResolvedValue(baseMatch)
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('아직 하이라이트가 없습니다.')).toBeInTheDocument()
      })
    })
  })

  describe('admin view', () => {
    beforeEach(() => {
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
    })

    it('shows result form for admin when match is in_progress', async () => {
      mockedGetMatch.mockResolvedValue(baseMatch)
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('결과 입력')).toBeInTheDocument()
      })
    })

    it('does NOT show result form for completed match', async () => {
      const completedMatch: MatchDetail = {
        ...baseMatch,
        status: 'completed',
        result: 'team_a',
        map_name: "King's Row",
        team_a_score: 1,
        team_b_score: 0,
        participants: baseMatch.participants.map((p, i) => ({
          ...p,
          mmr_before: 1000,
          mmr_after: i === 0 ? 1025 : 975,
          mmr_change: i === 0 ? 25 : -25,
        })),
      }
      mockedGetMatch.mockResolvedValue(completedMatch)
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('경기 결과')).toBeInTheDocument()
      })
      expect(screen.queryByText('결과 입력')).not.toBeInTheDocument()
    })

    it('shows highlight add button for admin', async () => {
      mockedGetMatch.mockResolvedValue(baseMatch)
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('추가')).toBeInTheDocument()
      })
    })

    it('renders result form with map and result selects', async () => {
      mockedGetMatch.mockResolvedValue(baseMatch)
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('결과 입력')).toBeInTheDocument()
      })
      expect(screen.getByLabelText('맵 선택')).toBeInTheDocument()
      expect(screen.getByLabelText('경기 결과')).toBeInTheDocument()
      expect(screen.getByText('결과 저장')).toBeInTheDocument()
    })
  })

  describe('completed match display', () => {
    it('shows MMR changes for completed match', async () => {
      const completedMatch: MatchDetail = {
        ...baseMatch,
        status: 'completed',
        result: 'team_a',
        map_name: "King's Row",
        team_a_score: 1,
        team_b_score: 0,
        participants: [
          {
            ...baseMatch.participants[0],
            mmr_before: 1000,
            mmr_after: 1025,
            mmr_change: 25,
          },
          {
            ...baseMatch.participants[1],
            mmr_before: 1400,
            mmr_after: 1375,
            mmr_change: -25,
          },
        ],
      }
      mockedGetMe.mockRejectedValue(new Error('no auth'))
      mockedGetMatch.mockResolvedValue(completedMatch)
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('+25')).toBeInTheDocument()
      })
      expect(screen.getByText('-25')).toBeInTheDocument()
    })

    it('shows team_a win result text', async () => {
      const completedMatch: MatchDetail = {
        ...baseMatch,
        status: 'completed',
        result: 'team_a',
        participants: baseMatch.participants.map((p) => ({
          ...p,
          mmr_before: 1000,
          mmr_after: 1000,
          mmr_change: 0,
        })),
      }
      mockedGetMe.mockRejectedValue(new Error('no auth'))
      mockedGetMatch.mockResolvedValue(completedMatch)
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('A팀 승리')).toBeInTheDocument()
      })
    })
  })

  describe('highlights display', () => {
    it('renders highlights when present', async () => {
      const matchWithHighlights: MatchDetail = {
        ...baseMatch,
        highlights: [
          {
            id: 'hl-1',
            title: 'Epic 5K',
            youtube_url: 'https://youtu.be/abc123',
            user_id: 'u1',
            registered_at: '2026-03-15T20:00:00',
          },
        ],
      }
      mockedGetMe.mockRejectedValue(new Error('no auth'))
      mockedGetMatch.mockResolvedValue(matchWithHighlights)
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Epic 5K')).toBeInTheDocument()
      })
    })
  })
})
