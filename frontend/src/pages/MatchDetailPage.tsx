import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { MatchResultForm } from '@/components/MatchResultForm'
import { HighlightCard } from '@/components/HighlightCard'
import { RoleBadge } from '@/components/RoleBadge'
import { RankBadge } from '@/components/RankBadge'
import { HeroBadge } from '@/components/HeroBadge'
import { HeroPortrait } from '@/components/HeroPortrait'
import { useAuth } from '@/contexts/AuthContext'
import {
  getMatch,
  submitResult,
  submitMatchStats,
  createHighlight,
  deleteHighlight,
  updateMatchStatus,
} from '@/api/matches'
import type { MatchDetail, MatchDetailParticipant } from '@/api/matches'
import type { MatchResultFormData, PlayerStatInput } from '@/components/MatchResultForm'
import type { HighlightData } from '@/components/HighlightCard'
import { getHeroes, type Hero } from '@/api/heroes'
import type { MatchStatus, MainRole } from '@/types'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Calendar, MapPin, Plus } from 'lucide-react'

const statusConfig: Record<MatchStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  open: { label: '모집 중', variant: 'default' },
  closed: { label: '마감', variant: 'secondary' },
  in_progress: { label: '진행 중', variant: 'outline' },
  completed: { label: '완료', variant: 'secondary' },
}

export default function MatchDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { isAdmin, isAdminOrManager } = useAuth()
  const [match, setMatch] = useState<MatchDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ status: number; message: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showHighlightDialog, setShowHighlightDialog] = useState(false)
  const [highlightForm, setHighlightForm] = useState({ title: '', youtube_url: '', user_id: '' })
  const [heroMap, setHeroMap] = useState<Map<string, Hero>>(new Map())

  useEffect(() => {
    getHeroes()
      .then((heroes) => {
        const map = new Map<string, Hero>()
        heroes.forEach((h) => map.set(h.name, h))
        setHeroMap(map)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    getMatch(id)
      .then(setMatch)
      .catch((err) => {
        console.error(`[MatchDetailPage] getMatch(${id}) 실패:`, err)
        const s = err?.response?.status ?? 0
        setError({
          status: s,
          message: s === 404
            ? '경기를 찾을 수 없습니다.'
            : '경기 정보를 불러오는 데 실패했습니다.',
        })
      })
      .finally(() => setLoading(false))
  }, [id])

  const handleResultSubmit = async (data: MatchResultFormData) => {
    if (!match || !id) return
    setSubmitting(true)
    try {
      const resultData = {
        map_name: data.map_name,
        team_a_score: data.result === 'team_a' ? 1 : 0,
        team_b_score: data.result === 'team_b' ? 1 : 0,
        result: data.result,
      }
      await submitResult(id, resultData)

      for (const ph of data.participant_heroes) {
        const formData = new FormData()
        if (ph.heroes.length > 0) {
          formData.append('heroes_played', JSON.stringify(ph.heroes))
        }
        if (data.screenshot) {
          formData.append('screenshot', data.screenshot)
        }
        // 스탯 데이터 추가
        const playerStat = data.player_stats?.find((s: PlayerStatInput) => s.user_id === ph.user_id)
        if (playerStat) {
          const statFields = ['kills', 'assists', 'deaths', 'damage_dealt', 'healing_done', 'damage_mitigated'] as const
          for (const key of statFields) {
            if (playerStat[key] !== undefined && playerStat[key] !== null) {
              formData.append(key, String(playerStat[key]))
            }
          }
          formData.append('stat_source', 'manual')
        }
        await submitMatchStats(id, ph.user_id, formData)
      }

      const updated = await getMatch(id)
      setMatch(updated)
    } catch {
      // ignore
    } finally {
      setSubmitting(false)
    }
  }

  const handleAddHighlight = async () => {
    if (!id || !highlightForm.title || !highlightForm.youtube_url) return
    try {
      await createHighlight(id, {
        title: highlightForm.title,
        youtube_url: highlightForm.youtube_url,
        user_id: highlightForm.user_id || undefined,
      })
      const updated = await getMatch(id)
      setMatch(updated)
      setShowHighlightDialog(false)
      setHighlightForm({ title: '', youtube_url: '', user_id: '' })
    } catch {
      // ignore
    }
  }

  const handleDeleteHighlight = async (highlightId: string) => {
    if (!id) return
    try {
      await deleteHighlight(highlightId)
      const updated = await getMatch(id)
      setMatch(updated)
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="py-12 text-center text-muted-foreground">로딩 중...</div>
      </Layout>
    )
  }

  if (error) {
    return (
      <Layout>
        <div className="py-12 text-center space-y-4">
          <p className="text-muted-foreground">{error.message}</p>
          {error.status !== 404 && (
            <Button variant="outline" size="sm" onClick={() => {
              setError(null); setLoading(true)
              getMatch(id!).then(setMatch).catch((err) => {
                const s = err?.response?.status ?? 0
                setError({ status: s, message: '경기 정보를 불러오는 데 실패했습니다.' })
              }).finally(() => setLoading(false))
            }}>다시 시도</Button>
          )}
        </div>
      </Layout>
    )
  }

  if (!match) {
    return (
      <Layout>
        <div className="py-12 text-center text-muted-foreground">경기를 찾을 수 없습니다.</div>
      </Layout>
    )
  }

  const status = statusConfig[match.status]
  const teamA = match.participants.filter((p) => p.team === 'A')
  const teamB = match.participants.filter((p) => p.team === 'B')
  const isInProgress = match.status === 'in_progress'
  const isCompleted = match.status === 'completed'

  const highlights: HighlightData[] = match.highlights.map((h) => {
    const participant = match.participants.find((p) => p.user_id === h.user_id)
    return {
      id: h.id,
      title: h.title,
      youtube_url: h.youtube_url,
      user_nickname: participant?.nickname,
      match_title: match.title,
      registered_at: h.registered_at,
    }
  })

  const renderTeam = (label: string, members: MatchDetailParticipant[]) => (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground">{label}</h3>
      <div className="space-y-1">
        {members.map((p) => (
          <div key={p.user_id} className="flex flex-wrap items-center gap-2 rounded-md border bg-white p-2">
            <Link to={`/profile/${p.user_id}`} className="text-sm font-medium hover:underline">
              {p.nickname}
            </Link>
            {p.main_role && <RoleBadge role={p.main_role as MainRole} />}
            {p.position_rank && <RankBadge rank={p.position_rank} compact />}
            {p.mmr != null && <span className="text-xs text-muted-foreground">MMR {p.mmr}</span>}
            {p.heroes_played && p.heroes_played.length > 0 && (
              <div className="flex gap-1">
                {p.heroes_played.map((h) => (
                  <HeroBadge key={h} hero={h} />
                ))}
              </div>
            )}
            {isCompleted && p.mmr_change != null && (
              <span className={`text-xs font-semibold ${p.mmr_change > 0 ? 'text-green-600' : p.mmr_change < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                {p.mmr_change > 0 ? '+' : ''}{p.mmr_change}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{match.title}</h1>
            <Badge variant={status.variant}>{status.label}</Badge>
            {isAdminOrManager && (
              <select
                value={match.status}
                onChange={async (e) => {
                  try {
                    const updated = await updateMatchStatus(match.id, e.target.value)
                    setMatch((prev) => prev ? { ...prev, ...updated } : prev)
                  } catch {
                    alert('상태 변경에 실패했습니다')
                  }
                }}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="open">모집 중</option>
                <option value="closed">마감</option>
                <option value="in_progress">진행 중</option>
                <option value="completed">완료</option>
              </select>
            )}
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {match.scheduled_at && (
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {format(new Date(match.scheduled_at), 'yyyy.M.d (eee) HH:mm', { locale: ko })}
              </span>
            )}
            {match.map_name && (
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {match.map_name}
              </span>
            )}
          </div>
        </div>

        {/* Teams */}
        {(isInProgress || isCompleted) && (teamA.length > 0 || teamB.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {isCompleted ? '경기 결과' : '팀 구성'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isCompleted && match.result && (
                <div className="mb-4 rounded-md bg-muted p-3 text-center">
                  <span className="text-lg font-bold">
                    {match.result === 'team_a' ? 'A팀 승리' : match.result === 'team_b' ? 'B팀 승리' : '무승부'}
                  </span>
                </div>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                {renderTeam('A팀', teamA)}
                {renderTeam('B팀', teamB)}
              </div>

              {/* 스탯 테이블 */}
              {isCompleted && match.participants.length > 0 && (
                <div className="mt-6 space-y-3">
                  <h3 className="text-base font-semibold">개인 스탯</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { label: 'A팀', members: teamA },
                    { label: 'B팀', members: teamB },
                  ].map(({ label, members }) => (
                    <div key={label} className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">{label}</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-base">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-2.5 px-3 font-medium">닉네임</th>
                              <th className="text-center py-2.5 px-3 font-medium">처치</th>
                              <th className="text-center py-2.5 px-3 font-medium">도움</th>
                              <th className="text-center py-2.5 px-3 font-medium">죽음</th>
                              <th className="text-center py-2.5 px-3 font-medium">피해</th>
                              <th className="text-center py-2.5 px-3 font-medium">치유</th>
                              <th className="text-center py-2.5 px-3 font-medium">경감</th>
                            </tr>
                          </thead>
                          <tbody>
                            {members.map((p) => (
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
                  ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Admin Result Form */}
        {isInProgress && isAdminOrManager && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">결과 입력</CardTitle>
            </CardHeader>
            <CardContent>
              <MatchResultForm
                match={match}
                participants={match.participants.map((p) => ({
                  id: p.id,
                  match_id: match.id,
                  user_id: p.user_id,
                  status: p.status as 'registered' | 'waitlist' | 'cancelled' | 'confirmed',
                  team: p.team as 'A' | 'B' | null,
                  registered_at: '',
                  nickname: p.nickname,
                }))}
                onSubmit={handleResultSubmit}
                isSubmitting={submitting}
              />
            </CardContent>
          </Card>
        )}

        {/* Highlights */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">하이라이트</CardTitle>
              {isAdmin && (
                <Button size="sm" onClick={() => setShowHighlightDialog(true)}>
                  <Plus className="mr-1 h-4 w-4" />
                  추가
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {highlights.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">아직 하이라이트가 없습니다.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {highlights.map((h) => (
                  <HighlightCard
                    key={h.id}
                    highlight={h}
                    isAdmin={isAdmin}
                    onDelete={handleDeleteHighlight}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Highlight Dialog */}
      <Dialog open={showHighlightDialog} onClose={() => setShowHighlightDialog(false)}>
        <DialogHeader>
          <DialogTitle>하이라이트 추가</DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="hl-title">제목</Label>
            <Input
              id="hl-title"
              value={highlightForm.title}
              onChange={(e) => setHighlightForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="하이라이트 제목"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hl-url">YouTube URL</Label>
            <Input
              id="hl-url"
              value={highlightForm.youtube_url}
              onChange={(e) => setHighlightForm((p) => ({ ...p, youtube_url: e.target.value }))}
              placeholder="https://youtu.be/..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hl-player">플레이어 선택</Label>
            <select
              id="hl-player"
              value={highlightForm.user_id}
              onChange={(e) => setHighlightForm((p) => ({ ...p, user_id: e.target.value }))}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">선택 안함</option>
              {match.participants.map((p) => (
                <option key={p.user_id} value={p.user_id}>{p.nickname}</option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHighlightDialog(false)}>취소</Button>
            <Button onClick={handleAddHighlight} disabled={!highlightForm.title || !highlightForm.youtube_url}>
              추가
            </Button>
          </DialogFooter>
        </div>
      </Dialog>
    </Layout>
  )
}
