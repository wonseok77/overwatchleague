import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar } from '@/components/Avatar'
import { Table, TableHeader, TableBody, TableRow, TableHead } from '@/components/ui/table'
import { RoleBadge } from '@/components/RoleBadge'
import { RankBadge } from '@/components/RankBadge'
import { HeroBadge } from '@/components/HeroBadge'
import { StatCard } from '@/components/StatCard'
import { MatchHistoryRow } from '@/components/MatchHistoryRow'
import { SeasonStatRow } from '@/components/SeasonStatRow'
import { HighlightCard } from '@/components/HighlightCard'
import { useAuth } from '@/contexts/AuthContext'
import { getUserProfile, uploadAvatar, updateProfile } from '@/api/members'
import { getHeroes, type Hero } from '@/api/heroes'
import { getCommunityHighlights } from '@/api/matches'
import { getSeasonRanks, setUserRanks } from '@/api/ranks'
import { getSeasons } from '@/api/seasons'
import type { ProfileResponse } from '@/api/members'
import type { Season } from '@/types'
import type { HighlightData } from '@/components/HighlightCard'
import type { MatchHistoryData } from '@/components/MatchHistoryRow'
import type { SeasonStatData } from '@/components/SeasonStatRow'
import type { Highlight, Team, MatchResult, PositionRank, PositionType } from '@/types'
import { Trophy, Target, TrendingUp, Gamepad2, Camera, Loader2, Pencil, Check, X, Swords, Shield, Heart, Skull, Crosshair } from 'lucide-react'
import { cn } from '@/lib/utils'

const BASE_RANKS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Grandmaster', 'Champion']
const RANK_OPTIONS = BASE_RANKS.flatMap(r => [5, 4, 3, 2, 1].map(n => `${r} ${n}`))

const POSITIONS: { key: PositionType; label: string; color: string }[] = [
  { key: 'tank', label: '탱커 (Tank)', color: '#4FC1E9' },
  { key: 'dps', label: '딜러 (DPS)', color: '#F87171' },
  { key: 'support', label: '서포터 (Support)', color: '#4ADE80' },
]

export default function ProfilePage() {
  const { id } = useParams<{ id: string }>()
  const { user, isAdmin } = useAuth()
  const [profile, setProfile] = useState<ProfileResponse | null>(null)
  const [highlights, setHighlights] = useState<HighlightData[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [positionRanks, setPositionRanks] = useState<PositionRank[]>([])
  const [editingRanks, setEditingRanks] = useState(false)
  const [draftRanks, setDraftRanks] = useState<Record<PositionType, string>>({ tank: '', dps: '', support: '' })
  const [savingRanks, setSavingRanks] = useState(false)

  // 시즌 선택
  const [seasons, setSeasons] = useState<Season[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null)
  const [seasonRanksLoading, setSeasonRanksLoading] = useState(false)

  // 프로필 수정 (주 포지션 + 주 영웅) 상태
  const [heroes, setHeroes] = useState<Hero[]>([])
  const [editingProfile, setEditingProfile] = useState(false)
  const [draftNickname, setDraftNickname] = useState<string>('')
  const [draftRole, setDraftRole] = useState<string>('')
  const [draftHeroes, setDraftHeroes] = useState<string[]>([])
  const [savingProfile, setSavingProfile] = useState(false)

  const userId = id === 'me' ? user?.id : id
  const isOwner = user?.id === userId
  const canEdit = isOwner || isAdmin
  const canEditRanks = isOwner || isAdmin

  const loadData = (uid: string, communityId?: string) => {
    setLoading(true)

    const loadProfile = getUserProfile(uid)
      .then(setProfile)
      .catch(() => {})

    const loadHighlights = communityId
      ? getCommunityHighlights(communityId, { limit: 50 })
          .then((list: Highlight[]) => {
            const userHighlights = list
              .filter((h) => h.user_id === uid)
              .slice(0, 6)
              .map((h) => ({
                id: h.id,
                title: h.title,
                youtube_url: h.youtube_url,
                registered_at: h.registered_at,
              }))
            setHighlights(userHighlights)
          })
          .catch(() => {})
      : Promise.resolve()

    const loadSeasons = communityId
      ? getSeasons(communityId)
          .then((list) => {
            setSeasons(list)
            const active = list.find(s => s.status === 'active')
            if (active) {
              setSelectedSeasonId(active.id)
              return getSeasonRanks(uid, active.id).then((ranks) => {
                setPositionRanks(ranks)
                const rankMap: Record<PositionType, string> = { tank: '', dps: '', support: '' }
                ranks.forEach((r) => { rankMap[r.position] = r.rank })
                setDraftRanks(rankMap)
              })
            }
          })
          .catch(() => {})
      : Promise.resolve()

    Promise.all([loadProfile, loadHighlights, loadSeasons]).finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!userId) return
    loadData(userId, user?.community_id)
  }, [userId, user])

  // 영웅 목록 로드 (한 번만)
  useEffect(() => {
    getHeroes().then(setHeroes).catch(() => {})
  }, [])

  const openProfileEdit = () => {
    setDraftNickname(profile?.user.nickname ?? '')
    setDraftRole(profile?.player_profile?.main_role ?? '')
    setDraftHeroes(profile?.player_profile?.main_heroes ?? [])
    setEditingProfile(true)
  }

  const cancelProfileEdit = () => {
    setEditingProfile(false)
  }

  const handleSaveProfile = async () => {
    if (!userId) return
    setSavingProfile(true)
    try {
      const result = await updateProfile(userId, {
        nickname: draftNickname || undefined,
        main_role: draftRole || undefined,
        main_heroes: draftHeroes,
      })
      // 프로필 상태에 반영
      setProfile((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          user: {
            ...prev.user,
            nickname: result.nickname ?? prev.user.nickname,
          },
          player_profile: prev.player_profile
            ? {
                ...prev.player_profile,
                main_role: (result.main_role as typeof prev.player_profile.main_role) ?? prev.player_profile.main_role,
                main_heroes: result.main_heroes,
                current_rank: result.current_rank,
                mmr: result.mmr,
              }
            : prev.player_profile,
        }
      })
      setEditingProfile(false)
    } catch {
      // ignore
    } finally {
      setSavingProfile(false)
    }
  }

  const toggleHero = (heroName: string) => {
    setDraftHeroes((prev) => {
      if (prev.includes(heroName)) return prev.filter((h) => h !== heroName)
      // 역할군별 최대 3개 제한
      const hero = heroes.find((h) => h.name === heroName)
      if (hero) {
        const sameRoleCount = prev.filter((h) => heroes.find((x) => x.name === h)?.role === hero.role).length
        if (sameRoleCount >= 3) return prev
      }
      return [...prev, heroName]
    })
  }

  const handleSeasonChange = async (seasonId: string | null) => {
    setSelectedSeasonId(seasonId)
    setEditingRanks(false)
    if (!userId || !seasonId) return
    setSeasonRanksLoading(true)
    try {
      const ranks = await getSeasonRanks(userId, seasonId)
      setPositionRanks(ranks)
      const rankMap: Record<PositionType, string> = { tank: '', dps: '', support: '' }
      ranks.forEach((r) => { rankMap[r.position] = r.rank })
      setDraftRanks(rankMap)
    } catch {
      setPositionRanks([])
      setDraftRanks({ tank: '', dps: '', support: '' })
    } finally {
      setSeasonRanksLoading(false)
    }
  }

  const handleEditRanks = () => {
    const rankMap: Record<PositionType, string> = { tank: '', dps: '', support: '' }
    positionRanks.forEach((r) => { rankMap[r.position] = r.rank })
    setDraftRanks(rankMap)
    setEditingRanks(true)
  }

  const handleCancelRanks = () => {
    setEditingRanks(false)
  }

  const handleSaveRanks = async () => {
    if (!userId) return
    setSavingRanks(true)
    try {
      const payload = POSITIONS
        .filter((p) => draftRanks[p.key])
        .map((p) => ({
          position: p.key,
          rank: draftRanks[p.key],
          season_id: selectedSeasonId ?? null,
        }))
      const updated = await setUserRanks(userId, payload)
      setPositionRanks(updated)
      setEditingRanks(false)
    } catch {
      // ignore
    } finally {
      setSavingRanks(false)
    }
  }

  const handleAvatarClick = () => {
    if (canEdit) fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !userId) return
    setUploading(true)
    try {
      await uploadAvatar(userId, file)
      loadData(userId, user?.community_id)
    } catch {
      // ignore
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="py-12 text-center text-muted-foreground">로딩 중...</div>
      </Layout>
    )
  }

  if (!profile) {
    return (
      <Layout>
        <div className="py-12 text-center text-muted-foreground">프로필을 찾을 수 없습니다.</div>
      </Layout>
    )
  }

  const { user: profileUser, player_profile, stats, recent_matches, season_stats } = profile

  const matchHistory: MatchHistoryData[] = recent_matches
    .filter((m) => m.team && m.result && m.map_name && m.scheduled_at)
    .map((m) => ({
      title: m.title,
      map_name: m.map_name!,
      scheduled_at: m.scheduled_at!,
      team: m.team as Team,
      result: m.result as MatchResult,
      mmr_change: m.mmr_change ?? 0,
      heroes_played: m.heroes_played ?? [],
    }))

  const seasonStatData: SeasonStatData[] = season_stats.map((s) => ({
    season_name: s.season_name,
    wins: s.wins,
    losses: s.losses,
    win_rate: s.win_rate ?? 0,
    final_mmr: s.final_mmr ?? 0,
    rank_position: s.rank_position ?? 0,
  }))

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header Card */}
        <Card>
          <CardContent className="flex flex-wrap items-center gap-4 p-6">
            {/* 아바타 + 업로드 */}
            <div className="relative">
              <Avatar nickname={profileUser.nickname} src={profileUser.avatar_url} size="xl" role={player_profile?.main_role} />
              {canEdit && (
                <button
                  type="button"
                  onClick={handleAvatarClick}
                  disabled={uploading}
                  className="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-black/50 opacity-0 hover:opacity-100 transition-opacity cursor-pointer disabled:cursor-not-allowed"
                  aria-label="프로필 사진 변경"
                >
                  {uploading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-white" />
                  ) : (
                    <>
                      <Camera className="h-6 w-6 text-white" />
                      <span className="mt-1 text-[10px] font-medium text-white">변경</span>
                    </>
                  )}
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold">{profileUser.nickname}</h1>
                {canEdit && !editingProfile && (
                  <button
                    type="button"
                    onClick={openProfileEdit}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    aria-label="프로필 수정"
                  >
                    <Pencil className="h-3 w-3" />
                    편집
                  </button>
                )}
              </div>

              {!editingProfile ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    {player_profile && (
                      <>
                        <RoleBadge role={player_profile.main_role} />
                        {player_profile.current_rank && <RankBadge rank={player_profile.current_rank} />}
                      </>
                    )}
                  </div>
                  {player_profile?.main_heroes && player_profile.main_heroes.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1 pt-1">
                      {player_profile.main_heroes.slice(0, 9).map((hero) => (
                        <HeroBadge key={hero} hero={hero} />
                      ))}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={openProfileEdit}
                          className="ml-1 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                          aria-label="주 영웅 수정"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ) : canEdit ? (
                    <button
                      type="button"
                      onClick={openProfileEdit}
                      className="mt-1 flex items-center gap-1.5 rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                    >
                      <Pencil className="h-3 w-3" />
                      주 영웅을 설정해보세요
                    </button>
                  ) : null}
                </>
              ) : (
                <div className="mt-3 space-y-4 rounded-lg border bg-muted/30 p-4">
                  {/* 닉네임 수정 */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">닉네임</label>
                    <input
                      type="text"
                      value={draftNickname}
                      onChange={(e) => setDraftNickname(e.target.value)}
                      className="w-full rounded-md border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="닉네임 입력"
                      aria-label="닉네임"
                    />
                  </div>

                  {/* 주 포지션 선택 */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">주 포지션</label>
                    <select
                      value={draftRole}
                      onChange={(e) => setDraftRole(e.target.value)}
                      className="w-full rounded-md border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      aria-label="주 포지션 선택"
                    >
                      <option value="">미설정</option>
                      <option value="tank">탱커</option>
                      <option value="dps">딜러</option>
                      <option value="support">지원</option>
                    </select>
                  </div>

                  {/* 주 영웅 선택 */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      주 영웅 ({draftHeroes.length}개 선택됨)
                    </label>
                    {(['tank', 'dps', 'support'] as const).map((role) => {
                      const roleHeroes = heroes.filter((h) => h.role === role)
                      if (roleHeroes.length === 0) return null
                      const roleLabel = role === 'tank' ? '탱커' : role === 'dps' ? '딜러' : '지원'
                      const roleColor = role === 'tank' ? 'text-[#4FC1E9]' : role === 'dps' ? 'text-[#F87171]' : 'text-[#4ADE80]'
                      const selectedCount = draftHeroes.filter((h) => heroes.find((x) => x.name === h)?.role === role).length
                      const isFull = selectedCount >= 3
                      return (
                        <div key={role}>
                          <p className={cn('mb-1.5 text-xs font-medium', roleColor)}>
                            {roleLabel} ({selectedCount}/3)
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {roleHeroes.map((h) => {
                              const selected = draftHeroes.includes(h.name)
                              const disabled = !selected && isFull
                              return (
                                <button
                                  key={h.id}
                                  type="button"
                                  onClick={() => toggleHero(h.name)}
                                  disabled={disabled}
                                  className={cn(
                                    'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                                    selected
                                      ? 'border-primary bg-primary text-primary-foreground'
                                      : disabled
                                        ? 'border-border bg-background text-foreground opacity-40 cursor-not-allowed'
                                        : 'border-border bg-background text-foreground hover:bg-accent'
                                  )}
                                  aria-pressed={selected}
                                  aria-label={`${h.name} 선택`}
                                >
                                  {h.portrait_url && (
                                    <img src={h.portrait_url} alt="" className="h-4 w-4 rounded-full object-cover" />
                                  )}
                                  {h.name}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* 저장 / 취소 */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleSaveProfile}
                      disabled={savingProfile}
                      className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                      aria-label="저장"
                    >
                      {savingProfile ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      저장
                    </button>
                    <button
                      type="button"
                      onClick={cancelProfileEdit}
                      disabled={savingProfile}
                      className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
                      aria-label="취소"
                    >
                      <X className="h-3.5 w-3.5" />
                      취소
                    </button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 gap-4">
          <StatCard
            label="총 경기수"
            value={stats.total_matches}
            icon={<Gamepad2 className="h-5 w-5" />}
          />
          <StatCard
            label="승률"
            value={`${stats.win_rate}%`}
            icon={<Target className="h-5 w-5" />}
            trend={stats.win_rate >= 50 ? 'up' : stats.win_rate > 0 ? 'down' : 'neutral'}
          />
          <StatCard
            label="승리"
            value={stats.wins}
            icon={<Trophy className="h-5 w-5" />}
          />
          <StatCard
            label="패배"
            value={stats.losses}
            icon={<TrendingUp className="h-5 w-5" />}
          />
        </div>

        {/* 전투 통계 */}
        {profile.combat_stats && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">전투 통계</CardTitle>
              <p className="text-xs text-muted-foreground">
                스탯이 기록된 {profile.combat_stats.games_with_stats}경기 기준
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard
                  label="K/D"
                  value={profile.combat_stats.kd_ratio.toFixed(2)}
                  icon={<Crosshair className="h-5 w-5" />}
                  trend={profile.combat_stats.kd_ratio >= 1 ? 'up' : 'down'}
                />
                <StatCard
                  label="KDA"
                  value={profile.combat_stats.kda_ratio.toFixed(2)}
                  icon={<Swords className="h-5 w-5" />}
                  trend={profile.combat_stats.kda_ratio >= 2 ? 'up' : 'down'}
                />
                <StatCard
                  label="경기당 처치"
                  value={profile.combat_stats.avg_kills.toFixed(1)}
                  icon={<Target className="h-5 w-5" />}
                />
                <StatCard
                  label="경기당 죽음"
                  value={profile.combat_stats.avg_deaths.toFixed(1)}
                  icon={<Skull className="h-5 w-5" />}
                />
                <StatCard
                  label="경기당 딜량"
                  value={profile.combat_stats.avg_damage_dealt.toLocaleString()}
                  icon={<Swords className="h-5 w-5" />}
                />
                <StatCard
                  label="경기당 치유"
                  value={profile.combat_stats.avg_healing_done.toLocaleString()}
                  icon={<Heart className="h-5 w-5" />}
                />
                <StatCard
                  label="경기당 경감"
                  value={profile.combat_stats.avg_damage_mitigated.toLocaleString()}
                  icon={<Shield className="h-5 w-5" />}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* 포지션별 티어 */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-lg">포지션별 티어</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                {/* 시즌 선택 드롭다운 */}
                {seasons.length > 0 && (
                  <select
                    value={selectedSeasonId ?? ''}
                    onChange={(e) => handleSeasonChange(e.target.value || null)}
                    className="rounded-md border bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    aria-label="시즌 선택"
                    disabled={editingRanks || seasonRanksLoading}
                  >
                    {seasons.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                )}
                {/* 수정 / 저장 / 취소 버튼 */}
                {canEditRanks && !editingRanks && (
                  <button
                    type="button"
                    onClick={handleEditRanks}
                    className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    aria-label="포지션 랭크 수정"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    수정
                  </button>
                )}
                {editingRanks && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSaveRanks}
                      disabled={savingRanks}
                      className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                      aria-label="저장"
                    >
                      {savingRanks ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      저장
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelRanks}
                      disabled={savingRanks}
                      className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
                      aria-label="취소"
                    >
                      <X className="h-3.5 w-3.5" />
                      취소
                    </button>
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {seasonRanksLoading ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                불러오는 중...
              </div>
            ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {POSITIONS.map((pos) => {
                const posRank = positionRanks.find((r) => r.position === pos.key)
                const currentRank = posRank?.rank ?? ''
                const mmrValue = posRank?.mmr
                return (
                  <div
                    key={pos.key}
                    className="flex flex-col gap-2 rounded-lg border p-4"
                    style={{ borderColor: `${pos.color}33` }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: pos.color }}
                      />
                      <span className="text-sm font-medium">{pos.label}</span>
                    </div>
                    {editingRanks ? (
                      <select
                        value={draftRanks[pos.key]}
                        onChange={(e) => setDraftRanks((prev) => ({ ...prev, [pos.key]: e.target.value }))}
                        className="rounded-md border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        aria-label={`${pos.label} 랭크 선택`}
                      >
                        <option value="">미설정</option>
                        {RANK_OPTIONS.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    ) : currentRank ? (
                      <div className="flex items-center gap-1">
                        <RankBadge rank={currentRank} />
                        {mmrValue != null && (
                          <span className="text-xs text-muted-foreground font-mono ml-1">{mmrValue}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">미설정</span>
                    )}
                  </div>
                )
              })}
            </div>
            )}
          </CardContent>
        </Card>

        {/* Season Stats */}
        {seasonStatData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">시즌별 기록</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>시즌</TableHead>
                    <TableHead className="text-center">승</TableHead>
                    <TableHead className="text-center">패</TableHead>
                    <TableHead className="text-center">승률</TableHead>
                    <TableHead className="text-center">MMR</TableHead>
                    <TableHead className="text-center">순위</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {seasonStatData.map((s) => (
                    <SeasonStatRow key={s.season_name} stat={s} />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Recent Matches */}
        {matchHistory.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">최근 경기</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {matchHistory.map((m, i) => (
                <MatchHistoryRow key={i} match={m} />
              ))}
            </CardContent>
          </Card>
        )}

        {/* Highlights */}
        {highlights.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">하이라이트</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {highlights.map((h) => (
                  <HighlightCard key={h.id} highlight={h} />
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  )
}
