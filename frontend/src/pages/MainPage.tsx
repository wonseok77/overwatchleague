import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { MatchCard } from '@/components/MatchCard'
import { RoleBadge } from '@/components/RoleBadge'
import { Avatar } from '@/components/Avatar'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { getSeasons } from '@/api/seasons'
import { getMatches } from '@/api/matches'
import { getLeaderboard } from '@/api/leaderboard'
import type { Match } from '@/types'
import type { MemberResponse } from '@/api/members'
import { Trophy, Calendar, TrendingUp, Swords, ArrowRight } from 'lucide-react'

export default function MainPage() {
  const { user } = useAuth()
  const [nextMatch, setNextMatch] = useState<Match | null>(null)
  const [recentMatches, setRecentMatches] = useState<Match[]>([])
  const [topPlayers, setTopPlayers] = useState<MemberResponse[]>([])

  useEffect(() => {
    if (!user) return
    const load = async () => {
      try {
        const seasons = await getSeasons(user.community_id)
        const activeSeason = seasons.find((s) => s.status === 'active')
        if (!activeSeason) return

        const matches = await getMatches(activeSeason.id)
        const now = new Date()
        const upcoming = matches
          .filter((m) => new Date(m.scheduled_at) > now && m.status === 'open')
          .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
        if (upcoming.length > 0) setNextMatch(upcoming[0])

        const completed = matches
          .filter((m) => m.status === 'completed')
          .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
          .slice(0, 3)
        setRecentMatches(completed)

        const lb = await getLeaderboard(user.community_id)
        setTopPlayers(lb.slice(0, 5))
      } catch {
        // silently fail on main page
      }
    }
    load()
  }, [user])

  const rankMedal = (i: number) => {
    if (i === 0) return <span className="text-base">🥇</span>
    if (i === 1) return <span className="text-base">🥈</span>
    if (i === 2) return <span className="text-base">🥉</span>
    return <span className="w-6 text-center text-sm font-bold text-muted-foreground">{i + 1}</span>
  }

  return (
    <Layout>
      <div className="space-y-10">
        {!user && (
          <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-background via-background to-ow-orange-500/5 px-8 py-16 text-center shadow-sm">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-ow-orange-500/10 via-transparent to-transparent" />
            <div className="relative space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-ow-orange-500 shadow-lg">
                <Swords className="h-7 w-7 text-white" />
              </div>
              <div className="space-y-2">
                <h1 className="text-4xl font-extrabold tracking-tight">OW League</h1>
                <p className="text-lg text-muted-foreground">
                  오버워치 내전 커뮤니티 플랫폼 — 팀 구성부터 기록까지
                </p>
              </div>
              <div className="flex justify-center gap-3 pt-2">
                <Link to="/login">
                  <Button size="lg" className="px-8">로그인</Button>
                </Link>
                <Link to="/register">
                  <Button variant="outline" size="lg" className="px-8">회원가입</Button>
                </Link>
              </div>
            </div>
          </section>
        )}

        {user && nextMatch && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Calendar className="h-4 w-4 text-ow-orange-500" />
                다음 내전
              </h2>
              <Link to="/matches" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-ow-orange-500 transition-colors">
                전체 일정 <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <Link to="/matches">
              <MatchCard
                title={nextMatch.title}
                scheduledAt={nextMatch.scheduled_at}
                status={nextMatch.status}
                currentParticipants={0}
                className="cursor-pointer transition-shadow hover:shadow-md"
              />
            </Link>
          </section>
        )}

        {user && topPlayers.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Trophy className="h-4 w-4 text-ow-orange-500" />
                파워랭킹 Top 5
              </h2>
              <Link to="/leaderboard" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-ow-orange-500 transition-colors">
                전체 보기 <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <Card className="overflow-hidden shadow-sm">
              <CardContent className="divide-y p-0">
                {topPlayers.map((p, i) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex w-7 items-center justify-center">
                      {rankMedal(i)}
                    </div>
                    <Avatar nickname={p.nickname} size="sm" role={p.main_role as 'tank' | 'dps' | 'support' | undefined} />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{p.nickname}</span>
                    </div>
                    {p.main_role && (
                      <RoleBadge role={p.main_role as 'tank' | 'dps' | 'support'} />
                    )}
                    <span className="text-sm font-semibold tabular-nums text-muted-foreground">
                      {p.mmr ?? 1000} MMR
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
        )}

        {user && recentMatches.length > 0 && (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <TrendingUp className="h-4 w-4 text-ow-orange-500" />
              최근 경기 결과
            </h2>
            <div className="space-y-2">
              {recentMatches.map((m) => (
                <Card key={m.id} className="shadow-sm transition-shadow hover:shadow-md">
                  <CardContent className="flex items-center justify-between px-5 py-4">
                    <div className="space-y-0.5">
                      <p className="font-medium">{m.title}</p>
                      {m.map_name && (
                        <p className="text-sm text-muted-foreground">{m.map_name}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold tabular-nums">
                        {m.team_a_score} : {m.team_b_score}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {m.result === 'team_a' ? 'A팀 승리' : m.result === 'team_b' ? 'B팀 승리' : '무승부'}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}
      </div>
    </Layout>
  )
}
