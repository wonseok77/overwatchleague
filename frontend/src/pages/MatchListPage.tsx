import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { MatchCard } from '@/components/MatchCard'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useAuth } from '@/contexts/AuthContext'
import { getSeasons } from '@/api/seasons'
import { getMatches, createMatch, registerForMatch, cancelRegistration, closeRegistration } from '@/api/matches'
import type { Match } from '@/types'
import { Plus, Calendar, List, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type ViewMode = 'list' | 'calendar'

// 달력 헬퍼
function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const MONTH_NAMES = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']

interface CalendarViewProps {
  matches: Match[]
  onSelectDate: (date: Date | null) => void
  selectedDate: Date | null
}

function CalendarView({ matches, onSelectDate, selectedDate }: CalendarViewProps) {
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

  // 해당 날짜에 경기가 있는지 체크
  const hasMatch = (day: number) => {
    return matches.some((m) => {
      const d = new Date(m.scheduled_at)
      return d.getFullYear() === viewYear && d.getMonth() === viewMonth && d.getDate() === day
    })
  }

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  // 6행 맞추기
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
          const matchDay = hasMatch(day)

          return (
            <button
              key={day}
              type="button"
              onClick={() => {
                if (isSelected) onSelectDate(null)
                else onSelectDate(thisDate)
              }}
              className={cn(
                'relative flex h-10 w-full flex-col items-center justify-center text-sm transition-colors',
                'hover:bg-muted',
                isSelected && 'bg-ow-orange-500 text-white hover:bg-ow-orange-500/90',
                isToday && !isSelected && 'font-bold text-ow-orange-500',
              )}
              aria-label={`${viewYear}년 ${viewMonth + 1}월 ${day}일`}
            >
              {day}
              {matchDay && (
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

export default function MatchListPage() {
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [matches, setMatches] = useState<Match[]>([])
  const [seasonId, setSeasonId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ title: '', scheduled_at: '' })
  const [loading, setLoading] = useState(false)
  const [registeredMatchIds, setRegisteredMatchIds] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  useEffect(() => {
    if (!user) return
    const load = async () => {
      try {
        const seasons = await getSeasons(user.community_id)
        const activeSeason = seasons.find((s) => s.status === 'active')
        if (!activeSeason) return
        setSeasonId(activeSeason.id)
        const m = await getMatches(activeSeason.id)
        setMatches(m.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()))
      } catch {
        // ignore
      }
    }
    load()
  }, [user])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!seasonId) return
    setLoading(true)
    try {
      const m = await createMatch(seasonId, createForm)
      setMatches((prev) => [...prev, m].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()))
      setShowCreate(false)
      setCreateForm({ title: '', scheduled_at: '' })
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (matchId: string) => {
    try {
      await registerForMatch(matchId)
      setRegisteredMatchIds((prev) => new Set(prev).add(matchId))
    } catch {
      // ignore
    }
  }

  const handleCancel = async (matchId: string) => {
    try {
      await cancelRegistration(matchId)
      setRegisteredMatchIds((prev) => {
        const next = new Set(prev)
        next.delete(matchId)
        return next
      })
    } catch {
      // ignore
    }
  }

  const handleCloseRegistration = async (matchId: string) => {
    try {
      await closeRegistration(matchId)
      navigate(`/matches/${matchId}/teams`)
    } catch {
      // ignore
    }
  }

  // 날짜 필터링
  const displayedMatches = selectedDate
    ? matches.filter((m) => isSameDay(new Date(m.scheduled_at), selectedDate))
    : matches

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">내전 일정</h1>
          <div className="flex items-center gap-2">
            {/* 뷰 토글 */}
            <div className="flex rounded-md border bg-muted p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={cn(
                  'flex h-7 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors',
                  viewMode === 'list'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                aria-label="리스트 뷰"
              >
                <List className="h-3.5 w-3.5" />
                리스트
              </button>
              <button
                type="button"
                onClick={() => setViewMode('calendar')}
                className={cn(
                  'flex h-7 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors',
                  viewMode === 'calendar'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                aria-label="달력 뷰"
              >
                <Calendar className="h-3.5 w-3.5" />
                달력
              </button>
            </div>

            {isAdmin && (
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus className="mr-1 h-4 w-4" />
                내전 생성
              </Button>
            )}
          </div>
        </div>

        {/* 달력 뷰 */}
        {viewMode === 'calendar' && (
          <CalendarView
            matches={matches}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
        )}

        {/* 선택된 날짜 표시 */}
        {selectedDate && (
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">
              {selectedDate.getMonth() + 1}월 {selectedDate.getDate()}일 경기 ({displayedMatches.length}건)
            </p>
            <button
              type="button"
              onClick={() => setSelectedDate(null)}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              전체 보기
            </button>
          </div>
        )}

        {/* 경기 목록 */}
        {displayedMatches.length === 0 ? (
          <EmptyState
            icon={<Calendar className="h-8 w-8" />}
            title="예정된 경기가 없습니다"
            description={selectedDate ? '이 날짜에 예정된 경기가 없습니다.' : '관리자가 새 내전을 등록하면 여기에 표시됩니다.'}
          />
        ) : (
          <div className="space-y-4">
            {displayedMatches.map((m) => {
              const participantCount = (m as Match & { participants?: unknown[] }).participants?.length ?? 0
              return (
                <div key={m.id} className="space-y-2">
                  <MatchCard
                    title={m.title}
                    scheduledAt={m.scheduled_at}
                    status={m.status}
                    currentParticipants={participantCount}
                  />
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
            })}
          </div>
        )}
      </div>

      <Dialog open={showCreate} onClose={() => setShowCreate(false)}>
        <DialogHeader>
          <DialogTitle>내전 생성</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreate} className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="match-title">제목</Label>
            <Input
              id="match-title"
              value={createForm.title}
              onChange={(e) => setCreateForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="예: 2026.03.10 정기 내전"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="match-date">날짜/시간</Label>
            <Input
              id="match-date"
              type="datetime-local"
              value={createForm.scheduled_at}
              onChange={(e) => setCreateForm((p) => ({ ...p, scheduled_at: e.target.value }))}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>취소</Button>
            <Button type="submit" disabled={loading}>{loading ? '생성 중...' : '생성'}</Button>
          </DialogFooter>
        </form>
      </Dialog>
    </Layout>
  )
}
