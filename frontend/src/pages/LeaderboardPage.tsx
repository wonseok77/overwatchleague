import { useEffect, useState } from 'react'
import { Layout } from '@/components/Layout'
import { RoleBadge } from '@/components/RoleBadge'
import { Avatar } from '@/components/Avatar'
import { EmptyState } from '@/components/EmptyState'
import { Select } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { useAuth } from '@/contexts/AuthContext'
import { getSeasons } from '@/api/seasons'
import { getLeaderboard } from '@/api/leaderboard'
import type { Season, MainRole } from '@/types'
import type { MemberResponse } from '@/api/members'
import { Trophy } from 'lucide-react'

function RankBadge({ rank }: { rank: number }) {
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
  const { user } = useAuth()
  const [seasons, setSeasons] = useState<Season[]>([])
  const [selectedSeason, setSelectedSeason] = useState('')
  const [players, setPlayers] = useState<MemberResponse[]>([])
  const [roleFilter, setRoleFilter] = useState('all')

  useEffect(() => {
    if (!user) return
    const load = async () => {
      try {
        const s = await getSeasons(user.community_id)
        setSeasons(s)
        const active = s.find((ss) => ss.status === 'active')
        if (active) setSelectedSeason(active.id)
      } catch {
        // ignore
      }
    }
    load()
  }, [user])

  useEffect(() => {
    if (!user) return
    const load = async () => {
      try {
        const lb = await getLeaderboard(user.community_id)
        setPlayers(lb)
      } catch {
        // ignore
      }
    }
    load()
  }, [user, selectedSeason])

  const filtered = roleFilter === 'all'
    ? players
    : players.filter((p) => p.main_role === roleFilter)

  const sorted = [...filtered].sort((a, b) => (b.mmr ?? 0) - (a.mmr ?? 0))

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Trophy className="h-6 w-6 text-ow-orange-500" />
            파워랭킹
          </h1>
          {seasons.length > 0 && (
            <Select
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(e.target.value)}
              className="w-48"
            >
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          )}
        </div>

        <Tabs value={roleFilter} onValueChange={setRoleFilter}>
          <TabsList>
            <TabsTrigger value="all">전체</TabsTrigger>
            <TabsTrigger value="tank">Tank</TabsTrigger>
            <TabsTrigger value="dps">DPS</TabsTrigger>
            <TabsTrigger value="support">Support</TabsTrigger>
          </TabsList>

          <TabsContent value={roleFilter}>
            {sorted.length === 0 ? (
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
                          <RankBadge rank={i + 1} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar nickname={p.nickname} src={p.avatar_url ?? null} size="sm" role={p.main_role as MainRole | undefined} />
                            <span className="font-medium">{p.nickname}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground">
                          {p.real_name}
                        </TableCell>
                        <TableCell>
                          {p.main_role && <RoleBadge role={p.main_role as MainRole} />}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="tabular-nums font-semibold">
                            {p.mmr ?? 1000}
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
