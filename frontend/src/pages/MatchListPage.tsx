import React, { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { MatchCard } from '@/components/MatchCard'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useAuth } from '@/contexts/AuthContext'
import { useCommunityId } from '@/hooks/useCommunityId'
import { getHeroes, type Hero } from '@/api/heroes'
import { HeroPortrait } from '@/components/HeroPortrait'
import { getSeasons } from '@/api/seasons'
import { getMatches, getMatch, registerForMatch, cancelRegistration, closeRegistration } from '@/api/matches'
import type { MatchDetail } from '@/api/matches'
import { getSessions, createSession } from '@/api/sessions'
import type { Match, MatchSession, Season, SessionStatus } from '@/types'
import { Plus, Calendar, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

// --- 달력 헬퍼 ---
function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function toLocalDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const MONTH_NAMES = [
  '1월', '2월', '3월', '4월', '5월', '6월',
  '7월', '8월', '9월', '10월', '11월', '12월',
]

// --- 상태 배지 ---
const SESSION_STATUS_CONFIG: Record<SessionStatus, { label: string; className: string }> = {
  open: { label: '모집 중', className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' },
  closed: { label: '마감', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400' },
  in_progress: { label: '진행 중', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' },
  completed: { label: '종료', className: 'bg-muted text-muted-foreground' },
}

// 시즌별 배경색 (연한 톤, Tailwind inline style로 처리)
const SEASON_COLORS = [
  { bg: 'rgba(59,130,246,0.12)', dot: '#3b82f6' },   // blue
  { bg: 'rgba(168,85,247,0.12)', dot: '#a855f7' },    // purple
  { bg: 'rgba(16,185,129,0.12)', dot: '#10b981' },    // emerald
  { bg: 'rgba(245,158,11,0.12)', dot: '#f59e0b' },    // amber
  { bg: 'rgba(239,68,68,0.12)', dot: '#ef4444' },     // rose
]

// --- 달력 컴포넌트 ---
interface CalendarViewProps {
  sessions: MatchSession[]
  seasons: Season[]
  onSelectDate: (date: Date | null) => void
  selectedDate: Date | null
}

function CalendarView({ sessions, seasons, onSelectDate, selectedDate }: CalendarViewProps) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth)

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11) }
    else setViewMonth((m) => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0) }
    else setViewMonth((m) => m + 1)
  }

  const hasSession = (day: number) => {
    return sessions.some((s) => {
      const d = new Date(s.scheduled_date + 'T00:00:00')
      return d.getFullYear() === viewYear && d.getMonth() === viewMonth && d.getDate() === day
    })
  }

  // 이 날짜가 속하는 시즌 인덱스 반환 (-1이면 해당 없음)
  const getSeasonIndex = (day: number): number => {
    const thisDate = new Date(viewYear, viewMonth, day)
    const dayStart = thisDate.getTime()
    return seasons.findIndex((season, _idx) => {
      const start = new Date(season.started_at).getTime()
      const end = season.ended_at ? new Date(season.ended_at).getTime() : Infinity
      return dayStart >= start && dayStart <= end
    })
  }

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      {/* 헤더 */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <button
          type="button"
          onClick={prevMonth}
          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted transition-colors"
          aria-label="이전 달"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold">
          {viewYear}년 {MONTH_NAMES[viewMonth]}
        </span>
        <button
          type="button"
          onClick={nextMonth}
          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted transition-colors"
          aria-label="다음 달"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 border-b">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} className="h-10" />
          const thisDate = new Date(viewYear, viewMonth, day)
          const isToday = isSameDay(thisDate, today)
          const isSelected = selectedDate ? isSameDay(thisDate, selectedDate) : false
          const sessionDay = hasSession(day)
          const seasonIdx = getSeasonIndex(day)
          const seasonColor = seasonIdx >= 0 ? SEASON_COLORS[seasonIdx % SEASON_COLORS.length] : null

          return (
            <button
              key={day}
              type="button"
              onClick={() => {
                if (isSelected) onSelectDate(null)
                else onSelectDate(thisDate)
              }}
              style={!isSelected && seasonColor ? { backgroundColor: seasonColor.bg } : undefined}
              className={cn(
                'relative flex h-10 w-full flex-col items-center justify-center text-sm transition-colors',
                'hover:bg-muted',
                isSelected && 'bg-ow-orange-500 text-white hover:bg-ow-orange-500/90',
                isToday && !isSelected && 'font-bold text-ow-orange-500',
              )}
              aria-label={`${viewYear}년 ${viewMonth + 1}월 ${day}일`}
            >
              {day}
              {sessionDay && (
                <span
                  className={cn(
                    'absolute bottom-1 h-1 w-1 rounded-full',
                    isSelected ? 'bg-white' : 'bg-ow-orange-500'
                  )}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// --- 세션 카드 ---
interface SessionCardProps {
  session: MatchSession
  onClick: () => void
}

function SessionCard({ session, onClick }: SessionCardProps) {
  const statusCfg = SESSION_STATUS_CONFIG[session.status]
  const maxParticipants = session.team_size * 2
  const count = session.registration_count ?? 0

  const timeLabel = session.scheduled_start
    ? session.scheduled_start.slice(0, 5)
    : '시간 미정'

  const dateObj = new Date(session.scheduled_date + 'T00:00:00')
  const dateLabel = `${dateObj.getMonth() + 1}월 ${dateObj.getDate()}일 (${WEEKDAYS[dateObj.getDay()]})`

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-lg border bg-card p-4 shadow-sm hover:shadow-md hover:border-ow-orange-500/40 transition-all duration-200"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-sm">{session.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {dateLabel} · {timeLabel}
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
            statusCfg.className
          )}
        >
          {statusCfg.label}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{count}</span>
        <span>/ {maxParticipants}명</span>
        <span className="mx-1">·</span>
        <span>{session.total_games}게임</span>
        <span className="mx-1">·</span>
        <span>탱 {session.tank_count} / 딜 {session.dps_count} / 힐 {session.support_count}</span>
      </div>
    </button>
  )
}

// --- 메인 페이지 ---
interface SessionCreateForm {
  title: string
  scheduled_date: string
  scheduled_start: string
  total_games: number
  team_size: number
  tank_count: number
  dps_count: number
  support_count: number
}

export default function MatchListPage() {
  const { user, isAdmin } = useAuth()
  const communityId = useCommunityId()
  const navigate = useNavigate()

  // 영웅 맵
  const [heroMap, setHeroMap] = useState<Map<string, Hero>>(new Map())

  // 기존 Match 상태
  const [matches, setMatches] = useState<Match[]>([])
  const [seasonId, setSeasonId] = useState<string | null>(null)
  const [registeredMatchIds, setRegisteredMatchIds] = useState<Set<string>>(new Set())
  const [matchHistoryOpen, setMatchHistoryOpen] = useState(false)
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null)
  const [matchDetails, setMatchDetails] = useState<Record<string, MatchDetail>>({})
  const [failedMatchIds, setFailedMatchIds] = useState<Set<string>>(new Set())

  // 시즌 목록 상태
  const [allSeasons, setAllSeasons] = useState<Season[]>([])

  // 세션 상태
  const [sessions, setSessions] = useState<MatchSession[]>([])
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [createForm, setCreateForm] = useState<SessionCreateForm>({
    title: '',
    scheduled_date: toLocalDateString(new Date()),
    scheduled_start: '',
    total_games: 5,
    team_size: 5,
    tank_count: 1,
    dps_count: 2,
    support_count: 2,
  })

  // 날짜 선택 시 폼의 scheduled_date 자동 세팅
  const handleSelectDate = (date: Date | null) => {
    setSelectedDate(date)
    if (date) {
      setCreateForm((prev) => ({ ...prev, scheduled_date: toLocalDateString(date) }))
    }
  }

  useEffect(() => {
    if (!communityId) return
    const load = async () => {
      try {
        const [seasons, heroes] = await Promise.all([
          getSeasons(communityId),
          getHeroes(),
        ])
        setAllSeasons(seasons)
        const map = new Map<string, Hero>()
        heroes.forEach((h) => map.set(h.name, h))
        setHeroMap(map)
        const activeSeason = seasons.find((s) => s.status === 'active')
        if (!activeSeason) return
        setSeasonId(activeSeason.id)

        const [m, s] = await Promise.all([
          getMatches(activeSeason.id),
          getSessions(activeSeason.id),
        ])
        setMatches(m.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()))
        setSessions(s.sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)))
      } catch {
        // ignore
      }
    }
    load()
  }, [communityId])

  const handleCreateSession = async (e: FormEvent) => {
    e.preventDefault()
    if (!seasonId) return
    setCreateLoading(true)
    try {
      const newSession = await createSession(seasonId, {
        title: createForm.title,
        scheduled_date: createForm.scheduled_date,
        scheduled_start: createForm.scheduled_start || undefined,
        total_games: createForm.total_games,
        team_size: createForm.team_size,
        tank_count: createForm.tank_count,
        dps_count: createForm.dps_count,
        support_count: createForm.support_count,
      })
      setSessions((prev) =>
        [...prev, newSession].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
      )
      setShowCreate(false)
      setCreateForm({
        title: '',
        scheduled_date: selectedDate ? toLocalDateString(selectedDate) : toLocalDateString(new Date()),
        scheduled_start: '',
        total_games: 5,
        team_size: 5,
        tank_count: 1,
        dps_count: 2,
        support_count: 2,
      })
    } catch {
      alert('내전 생성에 실패했습니다. 활성 시즌이 있는지 확인해주세요.')
    } finally {
      setCreateLoading(false)
    }
  }

  const handleRegister = async (matchId: string) => {
    try {
      await registerForMatch(matchId)
      setRegisteredMatchIds((prev) => new Set(prev).add(matchId))
    } catch { /* ignore */ }
  }

  const handleCancel = async (matchId: string) => {
    try {
      await cancelRegistration(matchId)
      setRegisteredMatchIds((prev) => { const next = new Set(prev); next.delete(matchId); return next })
    } catch { /* ignore */ }
  }

  const handleCloseRegistration = async (matchId: string) => {
    try {
      await closeRegistration(matchId)
      navigate(`/matches/${matchId}/teams`)
    } catch { /* ignore */ }
  }

  const fetchMatchDetail = async (matchId: string) => {
    setFailedMatchIds(prev => { const next = new Set(prev); next.delete(matchId); return next })
    try {
      const detail = await getMatch(matchId)
      setMatchDetails(prev => ({ ...prev, [matchId]: detail }))
    } catch (err) {
      console.error(`[getMatch] matchId=${matchId} 실패:`, err)
      setFailedMatchIds(prev => new Set(prev).add(matchId))
    }
  }

  const handleToggleStats = async (e: React.MouseEvent, matchId: string) => {
    e.stopPropagation()
    if (expandedMatchId === matchId) {
      setExpandedMatchId(null)
      return
    }
    setExpandedMatchId(matchId)
    if (!matchDetails[matchId] && !failedMatchIds.has(matchId)) {
      fetchMatchDetail(matchId)
    }
  }

  // 세션 필터링
  const displayedSessions = selectedDate
    ? sessions.filter((s) => {
        const d = new Date(s.scheduled_date + 'T00:00:00')
        return isSameDay(d, selectedDate)
      })
    : sessions

  // 시즌별 세션 그룹핑 (날짜 필터 없을 때만 사용)
  interface SeasonGroup {
    season: Season | null
    sessions: MatchSession[]
  }
  const groupedBySeasonForDisplay = (): SeasonGroup[] => {
    if (selectedDate || allSeasons.length === 0) return []
    const groups: SeasonGroup[] = []
    const usedSessionIds = new Set<string>()

    for (const season of [...allSeasons].reverse()) {
      const inSeason = sessions.filter((s) => s.season_id === season.id)
      if (inSeason.length > 0) {
        groups.push({ season, sessions: inSeason })
        inSeason.forEach((s) => usedSessionIds.add(s.id))
      }
    }
    // 시즌에 속하지 않는 세션
    const unassigned = sessions.filter((s) => !usedSessionIds.has(s.id))
    if (unassigned.length > 0) {
      groups.push({ season: null, sessions: unassigned })
    }
    return groups
  }
  const seasonGroups = groupedBySeasonForDisplay()

  return (
    <Layout>
      <div className="space-y-6">
        {/* 페이지 헤더 */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">내전</h1>
          {isAdmin && (
            <Button size="sm" onClick={() => setShowCreate(true)} disabled={!seasonId}>
              <Plus className="mr-1 h-4 w-4" />
              내전 생성
            </Button>
          )}
        </div>

        {/* 2-column 레이아웃 */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
          {/* 왼쪽: 달력 */}
          <div className="lg:sticky lg:top-20 lg:self-start">
            <CalendarView
              sessions={sessions}
              seasons={allSeasons}
              selectedDate={selectedDate}
              onSelectDate={handleSelectDate}
            />
          </div>

          {/* 오른쪽: 세션 패널 */}
          <div className="space-y-3">
            {/* 날짜 필터 헤더 */}
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                {selectedDate
                  ? `${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일 내전 (${displayedSessions.length}건)`
                  : `전체 내전 (${sessions.length}건)`}
              </p>
              {selectedDate && (
                <button
                  type="button"
                  onClick={() => setSelectedDate(null)}
                  className="text-xs text-muted-foreground underline hover:text-foreground transition-colors"
                >
                  전체 보기
                </button>
              )}
            </div>

            {/* 세션 목록 */}
            {selectedDate ? (
              // 날짜 선택 시: 필터된 세션 단순 목록
              displayedSessions.length === 0 ? (
                <EmptyState
                  icon={<Calendar className="h-8 w-8" />}
                  title="예정된 내전이 없습니다"
                  description="이 날짜에 예정된 내전이 없습니다."
                />
              ) : (
                <div className="space-y-2">
                  {displayedSessions.map((s) => (
                    <SessionCard
                      key={s.id}
                      session={s}
                      onClick={() => navigate(`/sessions/${s.id}`)}
                    />
                  ))}
                </div>
              )
            ) : seasonGroups.length > 0 ? (
              // 전체 보기: 시즌별 그룹핑
              <div className="space-y-5">
                {seasonGroups.map(({ season, sessions: groupSessions }, groupIdx) => {
                  const seasonColor = SEASON_COLORS[groupIdx % SEASON_COLORS.length]
                  return (
                    <div key={season?.id ?? 'unassigned'} className="space-y-2">
                      {/* 시즌 헤더 */}
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: season ? seasonColor.dot : '#94a3b8' }}
                        />
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {season ? season.name : '시즌 미배정'}
                        </span>
                        {season?.status === 'active' && (
                          <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/40 dark:text-green-400">
                            진행 중
                          </span>
                        )}
                      </div>
                      {groupSessions.map((s) => (
                        <SessionCard
                          key={s.id}
                          session={s}
                          onClick={() => navigate(`/sessions/${s.id}`)}
                        />
                      ))}
                    </div>
                  )
                })}
              </div>
            ) : sessions.length === 0 ? (
              <EmptyState
                icon={<Calendar className="h-8 w-8" />}
                title="예정된 내전이 없습니다"
                description={
                  seasonId
                    ? '내전을 생성하면 여기에 표시됩니다.'
                    : '활성 시즌이 없습니다. 관리 페이지에서 시즌을 먼저 생성해주세요.'
                }
              />
            ) : (
              <div className="space-y-2">
                {sessions.map((s) => (
                  <SessionCard
                    key={s.id}
                    session={s}
                    onClick={() => navigate(`/sessions/${s.id}`)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 지난 내전 기록 접이식 섹션 */}
        <div className="rounded-xl border bg-card shadow-sm">
          <button
            type="button"
            onClick={() => setMatchHistoryOpen((o) => !o)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/50 transition-colors rounded-xl"
          >
            <span>지난 내전 기록</span>
            {matchHistoryOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {matchHistoryOpen && (
            <div className="border-t px-4 pb-4 pt-3 space-y-4">
              {matches.length === 0 ? (
                <EmptyState
                  icon={<Calendar className="h-6 w-6" />}
                  title="내전 기록이 없습니다"
                  description="완료된 내전이 여기에 표시됩니다."
                />
              ) : (
                matches.map((m) => {
                  const participantCount = (m as Match & { participants?: unknown[] }).participants?.length ?? 0
                  const isCompleted = m.status === 'completed'
                  const isExpanded = expandedMatchId === m.id
                  const detail = matchDetails[m.id]
                  return (
                    <div key={m.id} className="space-y-2">
                      <MatchCard
                        title={m.title}
                        scheduledAt={m.scheduled_at}
                        status={m.status}
                        currentParticipants={participantCount}
                        result={m.result}
                        teamAScore={m.team_a_score}
                        teamBScore={m.team_b_score}
                        mapName={m.map_name}
                        onClick={() => navigate(`/matches/${m.id}`)}
                        className="cursor-pointer"
                      />
                      {isCompleted && (
                        <button
                          type="button"
                          onClick={(e) => handleToggleStats(e, m.id)}
                          className="flex items-center gap-1 px-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          스탯 보기
                        </button>
                      )}
                      {isExpanded && !detail && !failedMatchIds.has(m.id) && (
                        <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground text-center">
                          불러오는 중...
                        </div>
                      )}
                      {isExpanded && failedMatchIds.has(m.id) && (
                        <div className="rounded-md border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 p-3 text-xs text-center space-y-2">
                          <p className="text-red-600 dark:text-red-400">스탯을 불러오지 못했습니다.</p>
                          <button type="button" onClick={(e) => { e.stopPropagation(); fetchMatchDetail(m.id) }}
                            className="text-xs text-ow-orange-500 hover:underline">다시 시도</button>
                        </div>
                      )}
                      {isExpanded && detail && detail.participants.length > 0 && (
                        <div className="rounded-md border bg-muted/30 p-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {(['A', 'B'] as const).map(team => {
                            const members = detail.participants.filter(p => p.team === team)
                            if (members.length === 0) return null
                            return (
                              <div key={team} className="space-y-1">
                                <h4 className="text-sm font-medium text-muted-foreground">{team}팀</h4>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-base">
                                    <thead>
                                      <tr className="border-b">
                                        <th className="text-left py-2.5 px-3 font-medium whitespace-nowrap">닉네임</th>
                                        <th className="text-center py-2.5 px-3 font-medium whitespace-nowrap">처치</th>
                                        <th className="text-center py-2.5 px-3 font-medium whitespace-nowrap">도움</th>
                                        <th className="text-center py-2.5 px-3 font-medium whitespace-nowrap">죽음</th>
                                        <th className="text-center py-2.5 px-3 font-medium whitespace-nowrap">피해</th>
                                        <th className="text-center py-2.5 px-3 font-medium whitespace-nowrap">치유</th>
                                        <th className="text-center py-2.5 px-3 font-medium whitespace-nowrap">경감</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {members.map(p => (
                                        <tr key={p.user_id} className="border-b last:border-0">
                                          <td className="py-2.5 px-3 font-medium whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                              <span className="w-20 truncate">{p.nickname}</span>
                                              {p.heroes_played && p.heroes_played.length > 0 && (
                                                <div className="flex gap-0.5">
                                                  {p.heroes_played.map((h) => (
                                                    <HeroPortrait key={h} hero={h} heroMap={heroMap} size="h-7 w-7" />
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                          </td>
                                          <td className="text-center py-2.5 px-3">{p.kills ?? '-'}</td>
                                          <td className="text-center py-2.5 px-3">{p.assists ?? '-'}</td>
                                          <td className="text-center py-2.5 px-3">{p.deaths ?? '-'}</td>
                                          <td className="text-center py-2.5 px-3">{p.damage_dealt != null ? p.damage_dealt.toLocaleString() : '-'}</td>
                                          <td className="text-center py-2.5 px-3">{p.healing_done != null ? p.healing_done.toLocaleString() : '-'}</td>
                                          <td className="text-center py-2.5 px-3">{p.damage_mitigated != null ? p.damage_mitigated.toLocaleString() : '-'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )
                          })}
                          </div>
                        </div>
                      )}
                      {isExpanded && detail && detail.participants.length === 0 && (
                        <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground text-center">
                          스탯 데이터가 없습니다.
                        </div>
                      )}
                      {m.status === 'open' && user && (
                        <div className="flex gap-2 px-1">
                          {registeredMatchIds.has(m.id) ? (
                            <Button variant="outline" size="sm" onClick={() => handleCancel(m.id)}>
                              참가 취소
                            </Button>
                          ) : (
                            <Button size="sm" onClick={() => handleRegister(m.id)}>
                              참가 신청
                            </Button>
                          )}
                          {isAdmin && (
                            <Button variant="outline" size="sm" onClick={() => handleCloseRegistration(m.id)}>
                              마감 및 팀 구성
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* 세션 생성 다이얼로그 */}
      <Dialog open={showCreate} onClose={() => setShowCreate(false)}>
        <DialogHeader>
          <DialogTitle>내전 생성</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreateSession} className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="session-title">제목</Label>
            <Input
              id="session-title"
              value={createForm.title}
              onChange={(e) => setCreateForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="예: 2026.03.10 정기 내전"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="session-date">날짜</Label>
              <Input
                id="session-date"
                type="date"
                value={createForm.scheduled_date}
                onChange={(e) => setCreateForm((p) => ({ ...p, scheduled_date: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="session-start">시작 시간</Label>
              <Input
                id="session-start"
                type="time"
                value={createForm.scheduled_start}
                onChange={(e) => setCreateForm((p) => ({ ...p, scheduled_start: e.target.value }))}
                placeholder="HH:MM"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="session-total-games">총 게임 수</Label>
              <Input
                id="session-total-games"
                type="number"
                min={1}
                value={createForm.total_games}
                onChange={(e) => setCreateForm((p) => ({ ...p, total_games: Number(e.target.value) }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="session-team-size">팀 사이즈</Label>
              <Input
                id="session-team-size"
                type="number"
                min={1}
                value={createForm.team_size}
                onChange={(e) => setCreateForm((p) => ({ ...p, team_size: Number(e.target.value) }))}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="session-tank">탱커 수</Label>
              <Input
                id="session-tank"
                type="number"
                min={0}
                value={createForm.tank_count}
                onChange={(e) => setCreateForm((p) => ({ ...p, tank_count: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="session-dps">딜러 수</Label>
              <Input
                id="session-dps"
                type="number"
                min={0}
                value={createForm.dps_count}
                onChange={(e) => setCreateForm((p) => ({ ...p, dps_count: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="session-support">힐러 수</Label>
              <Input
                id="session-support"
                type="number"
                min={0}
                value={createForm.support_count}
                onChange={(e) => setCreateForm((p) => ({ ...p, support_count: Number(e.target.value) }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
              취소
            </Button>
            <Button type="submit" disabled={createLoading}>
              {createLoading ? '생성 중...' : '생성'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </Layout>
  )
}
