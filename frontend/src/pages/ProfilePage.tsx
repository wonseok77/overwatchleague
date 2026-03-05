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
import { getUserProfile, uploadAvatar } from '@/api/members'
import { getCommunityHighlights } from '@/api/matches'
import type { ProfileResponse } from '@/api/members'
import type { HighlightData } from '@/components/HighlightCard'
import type { MatchHistoryData } from '@/components/MatchHistoryRow'
import type { SeasonStatData } from '@/components/SeasonStatRow'
import type { Highlight, Team, MatchResult } from '@/types'
import { Trophy, Target, TrendingUp, Gamepad2, Camera, Loader2 } from 'lucide-react'

export default function ProfilePage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [profile, setProfile] = useState<ProfileResponse | null>(null)
  const [highlights, setHighlights] = useState<HighlightData[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const userId = id === 'me' ? user?.id : id
  const isOwner = user?.id === userId

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

    Promise.all([loadProfile, loadHighlights]).finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!userId) return
    loadData(userId, user?.community_id)
  }, [userId, user])

  const handleAvatarClick = () => {
    if (isOwner) fileInputRef.current?.click()
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
              {isOwner && (
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
            <div className="space-y-1">
              <h1 className="text-2xl font-bold">{profileUser.nickname}</h1>
              <div className="flex flex-wrap items-center gap-2">
                {player_profile && (
                  <>
                    <RoleBadge role={player_profile.main_role} />
                    {player_profile.current_rank && <RankBadge rank={player_profile.current_rank} />}
                    <span className="text-sm text-muted-foreground">MMR {player_profile.mmr}</span>
                  </>
                )}
              </div>
              {player_profile?.main_heroes && player_profile.main_heroes.length > 0 && (
                <div className="flex gap-1 pt-1">
                  {player_profile.main_heroes.slice(0, 3).map((hero) => (
                    <HeroBadge key={hero} hero={hero} />
                  ))}
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
