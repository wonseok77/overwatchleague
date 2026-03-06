import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { RankBadge } from '@/components/RankBadge'
import { RoleBadge } from '@/components/RoleBadge'
import { useAuth } from '@/contexts/AuthContext'
import {
  getSession,
  registerForSession,
  cancelSessionRegistration,
  getRegistrations,
  runMatchmaking,
  getMatchmakingPreview,
  confirmMatchmaking,
  updateSession,
  adminRegisterMember,
} from '@/api/sessions'
import { getAdminMembers, type AdminMemberResponse } from '@/api/admin'
import type { MatchSession, SessionRegistration, MatchmakingResult, MatchmakingGame, PositionType, SessionStatus, MainRole } from '@/types'
import { cn } from '@/lib/utils'

const POSITION_LABELS: Record<PositionType, string> = {
  tank: '탱커',
  dps: '딜러',
  support: '서포터',
}

const STATUS_CONFIG: Record<SessionStatus, { label: string; className: string }> = {
  open: { label: '모집 중', className: 'bg-green-500 text-white' },
  closed: { label: '마감', className: 'bg-gray-500 text-white' },
  in_progress: { label: '진행 중', className: 'bg-blue-500 text-white' },
  completed: { label: '완료', className: 'bg-slate-500 text-white' },
}

const POSITIONS: PositionType[] = ['tank', 'dps', 'support']

function PositionSelect({
  value,
  onChange,
  placeholder,
  excludeValues,
}: {
  value: PositionType | ''
  onChange: (v: PositionType | '') => void
  placeholder: string
  excludeValues?: (PositionType | '')[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as PositionType | '')}
      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    >
      <option value="">{placeholder}</option>
      {POSITIONS.filter((p) => !excludeValues?.includes(p) || p === value).map((pos) => (
        <option key={pos} value={pos}>
          {POSITION_LABELS[pos]}
        </option>
      ))}
    </select>
  )
}

// score_diff → 색상 (0에 가까울수록 녹색, 클수록 빨간색)
function scoreDiffColor(diff: number): string {
  if (diff <= 0.5) return 'text-green-600'
  if (diff <= 1.5) return 'text-yellow-600'
  return 'text-red-500'
}

function GameTeamTable({ players, teamLabel, teamScore }: {
  players: MatchmakingGame['team_a']
  teamLabel: string
  teamScore: number
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{teamLabel}</span>
        <span className="text-sm font-mono font-bold">{(teamScore ?? 0).toFixed(2)}</span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">닉네임</TableHead>
            <TableHead className="text-xs">포지션</TableHead>
            <TableHead className="text-xs">지망</TableHead>
            <TableHead className="text-xs text-right">점수</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(players ?? []).map((p) => (
            <TableRow key={p.user_id}>
              <TableCell className="text-sm font-medium">{p.nickname ?? '-'}</TableCell>
              <TableCell>
                <RoleBadge role={p.assigned_position as MainRole} showIcon={false} />
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{p.priority_used}지망</TableCell>
              <TableCell className="text-xs font-mono text-right">{(p.score ?? 0).toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function MatchmakingPreview({
  preview,
  onRerun,
  onConfirm,
  matchmakeLoading,
  confirmLoading,
}: {
  preview: MatchmakingResult
  onRerun: () => void
  onConfirm: () => void
  matchmakeLoading: boolean
  confirmLoading: boolean
}) {
  const games = preview.games ?? []
  const bench = preview.bench ?? []
  const playerStats = preview.player_stats ?? []
  const [activeTab, setActiveTab] = useState(games.length > 0 ? `game-${games[0].game_no}` : 'stats')

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-0.5">
            <CardTitle className="text-base">매치메이킹 결과 미리보기</CardTitle>
            <p className="text-xs text-muted-foreground">
              총 {games.length}게임 · 대기: {bench.length}명
              {preview.is_confirmed && (
                <span className="ml-2 text-green-600 font-medium">확정됨</span>
              )}
            </p>
          </div>
          {!preview.is_confirmed && (
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={onRerun} disabled={matchmakeLoading}>
                재실행
              </Button>
              <Button size="sm" onClick={onConfirm} disabled={confirmLoading}>
                {confirmLoading ? '확정 중...' : '확정하기'}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap h-auto gap-1">
            {games.map((g) => (
              <TabsTrigger key={g.game_no} value={`game-${g.game_no}`}>
                Game {g.game_no}
              </TabsTrigger>
            ))}
            {bench.length > 0 && (
              <TabsTrigger value="bench">대기자</TabsTrigger>
            )}
            <TabsTrigger value="stats">참여 통계</TabsTrigger>
          </TabsList>

          {/* 게임별 탭 */}
          {games.map((game) => (
            <TabsContent key={game.game_no} value={`game-${game.game_no}`} className="mt-4 space-y-4">
              {/* 밸런스 지표 */}
              <div className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground">점수 차이</span>
                <span className={cn('font-mono font-bold', scoreDiffColor(game.score_diff ?? 0))}>
                  {(game.score_diff ?? 0).toFixed(2)}
                </span>
                <span className="text-xs text-muted-foreground">
                  (A: {(game.team_a_score ?? 0).toFixed(2)} vs B: {(game.team_b_score ?? 0).toFixed(2)})
                </span>
              </div>

              {/* 2-column 팀 레이아웃 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="rounded-lg border border-blue-200 bg-blue-50/30 p-4">
                  <GameTeamTable
                    players={game.team_a}
                    teamLabel="Team A"
                    teamScore={game.team_a_score}
                  />
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50/30 p-4">
                  <GameTeamTable
                    players={game.team_b}
                    teamLabel="Team B"
                    teamScore={game.team_b_score}
                  />
                </div>
              </div>
            </TabsContent>
          ))}

          {/* 대기자 탭 */}
          {bench.length > 0 && (
            <TabsContent value="bench" className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>닉네임</TableHead>
                    <TableHead>사유</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bench.map((b) => (
                    <TableRow key={b.user_id}>
                      <TableCell className="font-medium">{b.nickname}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{b.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
          )}

          {/* 참여 통계 탭 */}
          <TabsContent value="stats" className="mt-4 space-y-3">
            <p className="text-xs text-muted-foreground">플레이어별 배정된 게임 수</p>
            {playerStats.length === 0 ? (
              <p className="text-sm text-muted-foreground">데이터 없음</p>
            ) : (
              <div className="space-y-2">
                {playerStats
                  .slice()
                  .sort((a, b) => b.games_played - a.games_played)
                  .map((ps) => {
                    const maxGames = Math.max(...playerStats.map((s) => s.games_played), 1)
                    const pct = (ps.games_played / maxGames) * 100
                    return (
                      <div key={ps.user_id} className="flex items-center gap-3">
                        <span className="w-28 text-sm truncate shrink-0">{ps.nickname}</span>
                        <div className="flex-1 h-5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary/70 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono w-8 text-right">{ps.games_played}</span>
                      </div>
                    )
                  })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user, isAdminOrManager } = useAuth()

  const [session, setSession] = useState<MatchSession | null>(null)
  const [registrations, setRegistrations] = useState<SessionRegistration[]>([])
  const [myRegistration, setMyRegistration] = useState<SessionRegistration | null>(null)
  const [preview, setPreview] = useState<MatchmakingResult | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [matchmakeLoading, setMatchmakeLoading] = useState(false)
  const [confirmLoading, setConfirmLoading] = useState(false)

  // 참여자 추가 다이얼로그
  const [showAddMemberDialog, setShowAddMemberDialog] = useState(false)
  const [allMembers, setAllMembers] = useState<AdminMemberResponse[]>([])
  const [addMemberForm, setAddMemberForm] = useState({
    user_id: '',
    priority_1: '' as PositionType | '',
    priority_2: '' as PositionType | '',
    priority_3: '' as PositionType | '',
    min_games: 1,
    max_games: 999,
  })
  const [addingMember, setAddingMember] = useState(false)

  // 세션 수정 다이얼로그
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editForm, setEditForm] = useState({
    title: '',
    scheduled_date: '',
    scheduled_start: '',
    total_games: 1,
    team_size: 5,
    tank_count: 2,
    dps_count: 2,
    support_count: 1,
  })
  const [savingEdit, setSavingEdit] = useState(false)

  // 신청 폼
  const [priority1, setPriority1] = useState<PositionType | ''>('')
  const [priority2, setPriority2] = useState<PositionType | ''>('')
  const [priority3, setPriority3] = useState<PositionType | ''>('')
  const [minGames, setMinGames] = useState(1)
  const [maxGames, setMaxGames] = useState(999)

  const loadData = useCallback(async () => {
    if (!id) return
    try {
      setLoading(true)
      setError(null)
      const [sess, regs] = await Promise.all([
        getSession(id),
        getRegistrations(id).catch(() => [] as SessionRegistration[]),
      ])
      setSession(sess)
      setRegistrations(regs)
      if (user) {
        const mine = regs.find((r) => r.user_id === user.id) ?? null
        setMyRegistration(mine)
      }

      // 매치메이킹 미리보기 조회
      const prev = await getMatchmakingPreview(id).catch(() => null)
      setPreview(prev)
    } catch {
      setError('내전 정보를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [id, user])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleOpenAddMember = async () => {
    try {
      const members = await getAdminMembers()
      setAllMembers(members)
    } catch {
      alert('멤버 목록을 불러오지 못했습니다.')
      return
    }
    setAddMemberForm({ user_id: '', priority_1: '', priority_2: '', priority_3: '', min_games: 1, max_games: 999 })
    setShowAddMemberDialog(true)
  }

  const handleAddMember = async () => {
    if (!id || !addMemberForm.user_id || !addMemberForm.priority_1) return
    setAddingMember(true)
    try {
      await adminRegisterMember(id, {
        user_id: addMemberForm.user_id,
        priority_1: addMemberForm.priority_1,
        priority_2: addMemberForm.priority_2 || null,
        priority_3: addMemberForm.priority_3 || null,
        min_games: addMemberForm.min_games,
        max_games: addMemberForm.max_games,
      })
      setShowAddMemberDialog(false)
      await loadData()
    } catch {
      alert('참여자 추가에 실패했습니다.')
    } finally {
      setAddingMember(false)
    }
  }

  const handleOpenEdit = () => {
    if (!session) return
    setEditForm({
      title: session.title,
      scheduled_date: session.scheduled_date,
      scheduled_start: session.scheduled_start ?? '',
      total_games: session.total_games,
      team_size: session.team_size,
      tank_count: session.tank_count,
      dps_count: session.dps_count,
      support_count: session.support_count,
    })
    setShowEditDialog(true)
  }

  const handleSaveEdit = async () => {
    if (!id) return
    setSavingEdit(true)
    try {
      await updateSession(id, {
        title: editForm.title,
        scheduled_date: editForm.scheduled_date,
        scheduled_start: editForm.scheduled_start || null,
        total_games: editForm.total_games,
        team_size: editForm.team_size,
        tank_count: editForm.tank_count,
        dps_count: editForm.dps_count,
        support_count: editForm.support_count,
      })
      setShowEditDialog(false)
      await loadData()
    } catch {
      alert('세션 수정에 실패했습니다.')
    } finally {
      setSavingEdit(false)
    }
  }

  const handleRegister = async () => {
    if (!id || !priority1) return
    setSubmitting(true)
    try {
      await registerForSession(id, {
        priority_1: priority1,
        priority_2: priority2 || null,
        priority_3: priority3 || null,
        min_games: minGames,
        max_games: maxGames,
      })
      await loadData()
    } catch {
      alert('신청에 실패했습니다. 다시 시도해주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = async () => {
    if (!id) return
    if (!confirm('참가 신청을 취소하시겠습니까?')) return
    setSubmitting(true)
    try {
      await cancelSessionRegistration(id)
      await loadData()
    } catch {
      alert('취소에 실패했습니다. 다시 시도해주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleMatchmake = async () => {
    if (!id) return
    setMatchmakeLoading(true)
    try {
      const result = await runMatchmaking(id, {})
      setPreview(result)
    } catch {
      alert('매치메이킹 실행에 실패했습니다.')
    } finally {
      setMatchmakeLoading(false)
    }
  }

  const handleConfirm = async () => {
    if (!id) return
    if (!confirm('매치메이킹 결과를 확정하시겠습니까?')) return
    setConfirmLoading(true)
    try {
      const res = await confirmMatchmaking(id)
      alert(`확정 완료: ${res?.matches_created ?? 0}개 매치 생성`)
      await loadData()
    } catch {
      alert('확정에 실패했습니다.')
    } finally {
      setConfirmLoading(false)
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-24 text-muted-foreground">불러오는 중...</div>
      </Layout>
    )
  }

  if (error || !session) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-24 text-destructive">{error ?? '내전을 찾을 수 없습니다.'}</div>
      </Layout>
    )
  }

  const statusConfig = STATUS_CONFIG[session.status] ?? { label: session.status, className: 'bg-gray-500 text-white' }
  const isOpen = session.status === 'open'

  return (
    <Layout>
      <div className="space-y-8 max-w-4xl mx-auto">
        {/* 헤더 */}
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">{session.title}</h1>
              <p className="text-muted-foreground text-sm">
                {session.scheduled_date}
                {session.scheduled_start && ` · ${session.scheduled_start}`}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge className={cn('border-transparent', statusConfig.className)}>
                {statusConfig.label}
              </Badge>
              {isAdminOrManager && session && (
                <select
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                  value={session.status}
                  onChange={async (e) => {
                    const newStatus = e.target.value as SessionStatus
                    try {
                      const updated = await updateSession(session.id, { status: newStatus })
                      setSession(updated)
                    } catch {
                      alert('상태 변경에 실패했습니다.')
                    }
                  }}
                >
                  <option value="open">모집중</option>
                  <option value="closed">마감</option>
                  <option value="in_progress">진행중</option>
                  <option value="completed">완료</option>
                </select>
              )}
              {isAdminOrManager && (
                <Button variant="outline" size="sm" onClick={handleOpenEdit}>
                  수정
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">구성</span>
              <span className="font-medium">
                {session.team_size}v{session.team_size} (탱 {session.tank_count} / 딜 {session.dps_count} / 힐{' '}
                {session.support_count})
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">총 게임</span>
              <span className="font-medium">{session.total_games}게임</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">신청자</span>
              <span className="font-medium">{registrations.length}명</span>
            </div>
          </div>
        </div>

        <Separator />

        {/* 참가 신청 섹션 */}
        {isOpen && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">참가 신청</CardTitle>
            </CardHeader>
            <CardContent>
              {myRegistration ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">1지망</span>
                      <p className="font-medium">{POSITION_LABELS[myRegistration.priority_1] ?? myRegistration.priority_1}</p>
                    </div>
                    {myRegistration.priority_2 && (
                      <div>
                        <span className="text-muted-foreground">2지망</span>
                        <p className="font-medium">{POSITION_LABELS[myRegistration.priority_2] ?? myRegistration.priority_2}</p>
                      </div>
                    )}
                    {myRegistration.priority_3 && (
                      <div>
                        <span className="text-muted-foreground">3지망</span>
                        <p className="font-medium">{POSITION_LABELS[myRegistration.priority_3] ?? myRegistration.priority_3}</p>
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground">참여 게임 수</span>
                      <p className="font-medium">
                        {myRegistration.min_games} ~ {myRegistration.max_games === 999 ? '무제한' : myRegistration.max_games}
                      </p>
                    </div>
                  </div>
                  <Button variant="destructive" onClick={handleCancel} disabled={submitting} size="sm">
                    {submitting ? '처리 중...' : '참가 취소'}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label>1지망 포지션 *</Label>
                      <PositionSelect
                        value={priority1}
                        onChange={(v) => {
                          setPriority1(v)
                          if (priority2 === v) setPriority2('')
                          if (priority3 === v) setPriority3('')
                        }}
                        placeholder="선택하세요"
                        excludeValues={[priority2, priority3]}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>2지망 포지션</Label>
                      <PositionSelect
                        value={priority2}
                        onChange={(v) => {
                          setPriority2(v)
                          if (priority3 === v) setPriority3('')
                        }}
                        placeholder="선택 안 함"
                        excludeValues={[priority1, priority3]}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>3지망 포지션</Label>
                      <PositionSelect
                        value={priority3}
                        onChange={setPriority3}
                        placeholder="선택 안 함"
                        excludeValues={[priority1, priority2]}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="min-games">최소 참여 게임 수</Label>
                      <Input
                        id="min-games"
                        type="number"
                        min={1}
                        value={minGames}
                        onChange={(e) => setMinGames(Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="max-games">최대 참여 게임 수</Label>
                      <Input
                        id="max-games"
                        type="number"
                        min={1}
                        value={maxGames}
                        onChange={(e) => setMaxGames(Number(e.target.value))}
                      />
                    </div>
                  </div>

                  <Button onClick={handleRegister} disabled={!priority1 || submitting}>
                    {submitting ? '신청 중...' : '참가 신청'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Admin 전용 섹션 */}
        {isAdminOrManager && (
          <div className="space-y-6">
            <Separator />

            {/* 신청자 목록 */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-base">신청자 목록</CardTitle>
                {isOpen && (
                  <Button size="sm" variant="outline" onClick={handleOpenAddMember}>
                    참여자 추가
                  </Button>
                )}
              </CardHeader>
              <CardContent className="p-0">
                {registrations.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-6 py-4">신청자가 없습니다.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>닉네임</TableHead>
                        <TableHead>1지망</TableHead>
                        <TableHead>2지망</TableHead>
                        <TableHead>3지망</TableHead>
                        <TableHead>최소</TableHead>
                        <TableHead>최대</TableHead>
                        <TableHead>티어</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {registrations.map((reg) => (
                        <TableRow key={reg.id}>
                          <TableCell className="font-medium">{reg.nickname ?? '-'}</TableCell>
                          <TableCell>{POSITION_LABELS[reg.priority_1] ?? reg.priority_1}</TableCell>
                          <TableCell>{reg.priority_2 ? (POSITION_LABELS[reg.priority_2] ?? reg.priority_2) : '-'}</TableCell>
                          <TableCell>{reg.priority_3 ? (POSITION_LABELS[reg.priority_3] ?? reg.priority_3) : '-'}</TableCell>
                          <TableCell>{reg.min_games}</TableCell>
                          <TableCell>{reg.max_games === 999 ? '무제한' : reg.max_games}</TableCell>
                          <TableCell>
                            {reg.position_ranks && reg.position_ranks.length > 0 ? (
                              <div className="space-y-0.5">
                                {reg.position_ranks.map((pr) => (
                                  <div key={pr.position} className="flex items-center gap-1 text-xs">
                                    <span className="text-muted-foreground w-7 shrink-0">{POSITION_LABELS[pr.position]}</span>
                                    <RankBadge rank={pr.rank} />
                                    {pr.mmr != null && <span className="text-muted-foreground">({pr.mmr})</span>}
                                  </div>
                                ))}
                              </div>
                            ) : reg.current_rank ? (
                              <RankBadge rank={reg.current_rank} />
                            ) : (
                              <span className="text-muted-foreground text-xs">미입력</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* 매치메이킹 실행 패널 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">매치메이킹</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  포지션별 MMR 기반으로 양팀을 균등하게 배분합니다.
                </p>
                <Button onClick={handleMatchmake} disabled={matchmakeLoading}>
                  {matchmakeLoading ? '실행 중...' : '매치메이킹 실행'}
                </Button>
              </CardContent>
            </Card>

            {/* 매치메이킹 결과 미리보기 */}
            {preview && <MatchmakingPreview
              preview={preview}
              onRerun={handleMatchmake}
              onConfirm={handleConfirm}
              matchmakeLoading={matchmakeLoading}
              confirmLoading={confirmLoading}
            />}
          </div>
        )}
      </div>

      {/* 참여자 추가 다이얼로그 */}
      <Dialog open={showAddMemberDialog} onClose={() => setShowAddMemberDialog(false)}>
        <DialogHeader>
          <DialogTitle>참여자 추가</DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="add-member-select">멤버 선택 *</Label>
            <select
              id="add-member-select"
              value={addMemberForm.user_id}
              onChange={(e) => setAddMemberForm((prev) => ({ ...prev, user_id: e.target.value }))}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">멤버를 선택하세요</option>
              {allMembers
                .filter((m) => !registrations.some((r) => r.user_id === m.user_id))
                .map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.nickname} ({m.real_name})
                  </option>
                ))}
            </select>
            {(() => {
              const selectedMember = allMembers.find((m) => m.user_id === addMemberForm.user_id)
              if (!selectedMember) return null
              const positionLabels: Record<string, string> = { tank: '탱크', dps: '딜러', support: '힐러' }
              if (selectedMember.position_ranks.length === 0) {
                return <p className="text-xs text-muted-foreground mt-1">포지션 랭크 정보 없음</p>
              }
              return (
                <div className="flex flex-wrap gap-3 mt-2">
                  {selectedMember.position_ranks.map((pr) => (
                    <div key={pr.position} className="flex items-center gap-1.5 text-xs">
                      <span className="font-medium">{positionLabels[pr.position] ?? pr.position}</span>
                      <RankBadge rank={pr.rank} />
                      {pr.mmr != null && <span className="text-muted-foreground">({pr.mmr})</span>}
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>1지망 포지션 *</Label>
              <PositionSelect
                value={addMemberForm.priority_1}
                onChange={(v) => {
                  setAddMemberForm((prev) => ({
                    ...prev,
                    priority_1: v,
                    priority_2: prev.priority_2 === v ? '' : prev.priority_2,
                    priority_3: prev.priority_3 === v ? '' : prev.priority_3,
                  }))
                }}
                placeholder="선택하세요"
                excludeValues={[addMemberForm.priority_2, addMemberForm.priority_3]}
              />
            </div>
            <div className="space-y-1.5">
              <Label>2지망 포지션</Label>
              <PositionSelect
                value={addMemberForm.priority_2}
                onChange={(v) => {
                  setAddMemberForm((prev) => ({
                    ...prev,
                    priority_2: v,
                    priority_3: prev.priority_3 === v ? '' : prev.priority_3,
                  }))
                }}
                placeholder="선택 안 함"
                excludeValues={[addMemberForm.priority_1, addMemberForm.priority_3]}
              />
            </div>
            <div className="space-y-1.5">
              <Label>3지망 포지션</Label>
              <PositionSelect
                value={addMemberForm.priority_3}
                onChange={(v) => setAddMemberForm((prev) => ({ ...prev, priority_3: v }))}
                placeholder="선택 안 함"
                excludeValues={[addMemberForm.priority_1, addMemberForm.priority_2]}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="add-min-games">최소 게임 수</Label>
              <Input
                id="add-min-games"
                type="number"
                min={1}
                value={addMemberForm.min_games}
                onChange={(e) => setAddMemberForm((prev) => ({ ...prev, min_games: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-max-games">최대 게임 수</Label>
              <Input
                id="add-max-games"
                type="number"
                min={1}
                value={addMemberForm.max_games}
                onChange={(e) => setAddMemberForm((prev) => ({ ...prev, max_games: Number(e.target.value) }))}
              />
            </div>
          </div>
        </div>
        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={() => setShowAddMemberDialog(false)}>취소</Button>
          <Button
            onClick={handleAddMember}
            disabled={addingMember || !addMemberForm.user_id || !addMemberForm.priority_1}
          >
            {addingMember ? '추가 중...' : '추가'}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* 세션 수정 다이얼로그 */}
      <Dialog open={showEditDialog} onClose={() => setShowEditDialog(false)}>
        <DialogHeader>
          <DialogTitle>내전 수정</DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-title">제목</Label>
            <Input
              id="edit-title"
              value={editForm.title}
              onChange={(e) => setEditForm((prev) => ({ ...prev, title: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-date">날짜</Label>
              <Input
                id="edit-date"
                type="date"
                value={editForm.scheduled_date}
                onChange={(e) => setEditForm((prev) => ({ ...prev, scheduled_date: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-start">시작 시간 (HH:MM)</Label>
              <Input
                id="edit-start"
                type="time"
                value={editForm.scheduled_start}
                onChange={(e) => setEditForm((prev) => ({ ...prev, scheduled_start: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-total-games">총 게임 수</Label>
              <Input
                id="edit-total-games"
                type="number"
                min={1}
                value={editForm.total_games}
                onChange={(e) => setEditForm((prev) => ({ ...prev, total_games: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-team-size">팀 크기</Label>
              <Input
                id="edit-team-size"
                type="number"
                min={1}
                value={editForm.team_size}
                onChange={(e) => setEditForm((prev) => ({ ...prev, team_size: Number(e.target.value) }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-tank">탱커 수</Label>
              <Input
                id="edit-tank"
                type="number"
                min={0}
                value={editForm.tank_count}
                onChange={(e) => setEditForm((prev) => ({ ...prev, tank_count: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-dps">딜러 수</Label>
              <Input
                id="edit-dps"
                type="number"
                min={0}
                value={editForm.dps_count}
                onChange={(e) => setEditForm((prev) => ({ ...prev, dps_count: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-support">지원 수</Label>
              <Input
                id="edit-support"
                type="number"
                min={0}
                value={editForm.support_count}
                onChange={(e) => setEditForm((prev) => ({ ...prev, support_count: Number(e.target.value) }))}
              />
            </div>
          </div>
        </div>
        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={() => setShowEditDialog(false)}>취소</Button>
          <Button onClick={handleSaveEdit} disabled={savingEdit || !editForm.title || !editForm.scheduled_date}>
            {savingEdit ? '저장 중...' : '저장'}
          </Button>
        </DialogFooter>
      </Dialog>
    </Layout>
  )
}
