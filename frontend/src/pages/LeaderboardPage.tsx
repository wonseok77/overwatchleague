import { useEffect, useState } from 'react'
import { Layout } from '@/components/Layout'
import { RoleBadge } from '@/components/RoleBadge'
import { Avatar } from '@/components/Avatar'
import { EmptyState } from '@/components/EmptyState'
import { Select } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { useCommunityId } from '@/hooks/useCommunityId'
import { getSeasons } from '@/api/seasons'
import { getLeaderboard, type LeaderboardEntry } from '@/api/leaderboard'
import { getHeroes, type Hero } from '@/api/heroes'
import { HeroPortrait } from '@/components/HeroPortrait'
import type { Season, MainRole } from '@/types'
import { RankBadge as TierBadge } from '@/components/RankBadge'
import { Trophy } from 'lucide-react'

function RankNumber({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-yellow-100 text-sm font-bold text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
        1
      </span>
    )
  }
  if (rank === 2) {
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        2
      </span>
    )
  }
  if (rank === 3) {
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
        3
      </span>
    )
  }
  return <span className="text-sm font-medium text-muted-foreground">{rank}</span>
}

export default function LeaderboardPage() {
  const communityId = useCommunityId()
  const [seasons, setSeasons] = useState<Season[]>([])
  const [selectedSeason, setSelectedSeason] = useState('')
  const [players, setPlayers] = useState<LeaderboardEntry[]>([])
  const [roleFilter, setRoleFilter] = useState('tank')
  const [heroMap, setHeroMap] = useState<Map<string, Hero>>(new Map())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!communityId) return
    const load = async () => {
      try {
        const [s, heroes] = await Promise.all([
          getSeasons(communityId),
          getHeroes(),
        ])
        setSeasons(s)
        const map = new Map<string, Hero>()
        heroes.forEach((h) => map.set(h.name, h))
        setHeroMap(map)
        const active = s.find((ss) => ss.status === 'active')
        if (active) setSelectedSeason(active.id)
      } catch {
        // ignore
      }
    }
    load()
  }, [communityId])

  useEffect(() => {
    if (!communityId) return
    const load = async () => {
      setLoading(true)
      try {
        const lb = await getLeaderboard(
          communityId,
          selectedSeason || undefined,
        )
        setPlayers(lb)
      } catch {
        setPlayers([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [communityId, selectedSeason])

  // 포지션 탭 선택 시: 해당 포지션 rank가 있는 사람 필터 + 해당 포지션 MMR 기준 정렬
  const getPositionMmr = (p: LeaderboardEntry, position: string): number | null => {
    const pr = p.position_ranks.find((r) => r.position === position)
    return pr?.mmr ?? null
  }

  const filtered = players.filter((p) => getPositionMmr(p, roleFilter) != null)

  const sorted = [...filtered].sort((a, b) => {
    return (getPositionMmr(b, roleFilter) ?? 0) - (getPositionMmr(a, roleFilter) ?? 0)
  })

  const selectedSeasonName = seasons.find((s) => s.id === selectedSeason)?.name ?? ''

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <Trophy className="h-6 w-6 text-ow-orange-500" />
              파워랭킹
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {selectedSeasonName} 기준
            </p>
          </div>
          {seasons.length > 0 && (
            <Select
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(e.target.value)}
              className="w-48"
              aria-label="시즌 선택"
            >
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </div>

        <Tabs value={roleFilter} onValueChange={setRoleFilter}>
          <TabsList>
            <TabsTrigger value="tank">Tank</TabsTrigger>
            <TabsTrigger value="dps">DPS</TabsTrigger>
            <TabsTrigger value="support">Support</TabsTrigger>
          </TabsList>

          <TabsContent value={roleFilter}>
            {loading ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                불러오는 중...
              </div>
            ) : sorted.length === 0 ? (
              <EmptyState
                icon={<Trophy className="h-8 w-8" />}
                title="랭킹 데이터가 없습니다"
                description="시즌이 진행되면 파워랭킹이 표시됩니다."
              />
            ) : (
              <div className="overflow-hidden rounded-lg border shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="w-16 text-center font-semibold">순위</TableHead>
                      <TableHead className="font-semibold">플레이어</TableHead>
                      <TableHead className="hidden sm:table-cell font-semibold">본명</TableHead>
                      <TableHead className="font-semibold">역할군</TableHead>
                      <TableHead className="hidden md:table-cell font-semibold">주 영웅</TableHead>
                      <TableHead className="text-center font-semibold">티어</TableHead>
                      <TableHead className="text-right font-semibold">MMR</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((p, i) => (
                      <TableRow
                        key={p.id}
                        className={i < 3 ? 'bg-muted/20 hover:bg-muted/40' : 'hover:bg-muted/20'}
                      >
                        <TableCell className="text-center">
                          <RankNumber rank={i + 1} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar
                              nickname={p.nickname}
                              src={p.avatar_url ?? null}
                              size="sm"
                              role={p.main_role as MainRole | undefined}
                            />
                            <span className="font-medium">{p.nickname}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground">
                          {p.real_name}
                        </TableCell>
                        <TableCell>
                          {p.main_role && <RoleBadge role={p.main_role as MainRole} />}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {(() => {
                            const displayHeroes = (p.main_heroes ?? []).filter((h) => heroMap.get(h)?.role === roleFilter).slice(0, 3)
                            return displayHeroes.length > 0 ? (
                              <div className="flex items-center gap-1">
                                {displayHeroes.map((hero) => (
                                  <HeroPortrait key={hero} hero={hero} heroMap={heroMap} size="h-6 w-6" />
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )
                          })()}
                        </TableCell>
                        {(() => {
                          const pr = p.position_ranks.find((r) => r.position === roleFilter)
                          return (
                            <TableCell className="text-center">
                              {pr?.rank ? (
                                <TierBadge rank={pr.rank} />
                              ) : '-'}
                            </TableCell>
                          )
                        })()}
                        <TableCell className="text-right">
                          <span className="tabular-nums font-semibold">
                            {getPositionMmr(p, roleFilter) ?? '-'}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  )
}
