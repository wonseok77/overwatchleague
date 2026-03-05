import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { Layout } from '@/components/Layout'
import { PlayerCard } from '@/components/PlayerCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useAuth } from '@/contexts/AuthContext'
import { closeRegistration, updateTeams } from '@/api/matches'
import { getMembers, type MemberResponse } from '@/api/members'
import type { BalanceResult, MainRole } from '@/types'
import { Send } from 'lucide-react'

interface TeamMember extends MemberResponse {
  team: 'A' | 'B'
}

function DroppableTeamCard({ team, members, label }: { team: string; members: TeamMember[]; label: string }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2" data-team={team}>
        {members.map((m) => (
          <div key={m.id} data-member-id={m.id} data-team={team}>
            <PlayerCard
              nickname={m.nickname}
              mainRole={(m.main_role as MainRole) ?? 'dps'}
              mmr={m.mmr ?? 1000}
              mainHeroes={m.main_heroes ?? []}
            />
          </div>
        ))}
        {members.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">멤버를 드래그하여 추가</p>
        )}
      </CardContent>
    </Card>
  )
}

export default function TeamCompositionPage() {
  const { id: matchId } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [balanceReason, setBalanceReason] = useState<BalanceResult['balance_reason'] | null>(null)
  const [saving, setSaving] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  useEffect(() => {
    if (!matchId || !user) return
    const load = async () => {
      try {
        const result = await closeRegistration(matchId)
        const members = await getMembers(user.community_id)
        const memberMap = new Map(members.map((m) => [m.id, m]))

        const teamA: TeamMember[] = result.team_a.map((p) => ({
          ...(memberMap.get(p.user_id) ?? { id: p.user_id, real_name: '', nickname: p.user_id, email: '', role: 'member', main_role: null, current_rank: null, current_sr: null, main_heroes: null, mmr: null }),
          team: 'A' as const,
        }))
        const teamB: TeamMember[] = result.team_b.map((p) => ({
          ...(memberMap.get(p.user_id) ?? { id: p.user_id, real_name: '', nickname: p.user_id, email: '', role: 'member', main_role: null, current_rank: null, current_sr: null, main_heroes: null, mmr: null }),
          team: 'B' as const,
        }))

        setTeamMembers([...teamA, ...teamB])
        setBalanceReason(result.balance_reason)
      } catch {
        // ignore - may already be closed
      }
    }
    load()
  }, [matchId, user])

  const teamA = teamMembers.filter((m) => m.team === 'A')
  const teamB = teamMembers.filter((m) => m.team === 'B')

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return

    const memberId = active.id as string
    const targetTeam = (over.id as string).startsWith('team-') ? (over.id as string).replace('team-', '') as 'A' | 'B' : null
    if (!targetTeam) return

    setTeamMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, team: targetTeam } : m))
    )
  }

  const handleSaveAndNotify = async () => {
    if (!matchId) return
    setSaving(true)
    try {
      const teams = teamMembers.map((m) => ({ user_id: m.id, team: m.team }))
      await updateTeams(matchId, teams)
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  const roleCount = (members: TeamMember[]) => {
    const counts: Record<string, number> = { tank: 0, dps: 0, support: 0 }
    members.forEach((m) => {
      if (m.main_role) counts[m.main_role] = (counts[m.main_role] || 0) + 1
    })
    return counts
  }

  const teamARoles = roleCount(teamA)
  const teamBRoles = roleCount(teamB)

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">팀 구성</h1>
          <Button onClick={handleSaveAndNotify} disabled={saving}>
            <Send className="mr-1 h-4 w-4" />
            {saving ? '저장 중...' : 'Discord 발송'}
          </Button>
        </div>

        {balanceReason && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">밸런스 점수</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-4">
                <span className="w-16 text-sm font-medium">A팀</span>
                <div className="flex-1">
                  <Progress value={balanceReason.team_a_score} max={Math.max(balanceReason.team_a_score, balanceReason.team_b_score) * 1.2} />
                </div>
                <span className="w-12 text-right text-sm font-semibold">{balanceReason.team_a_score.toFixed(1)}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="w-16 text-sm font-medium">B팀</span>
                <div className="flex-1">
                  <Progress value={balanceReason.team_b_score} max={Math.max(balanceReason.team_a_score, balanceReason.team_b_score) * 1.2} />
                </div>
                <span className="w-12 text-right text-sm font-semibold">{balanceReason.team_b_score.toFixed(1)}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                팀 점수 차이: {balanceReason.score_diff.toFixed(1)}점
              </p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-medium">A팀 역할군</p>
                  <p className="text-muted-foreground">Tank {teamARoles.tank} / DPS {teamARoles.dps} / Support {teamARoles.support}</p>
                </div>
                <div>
                  <p className="font-medium">B팀 역할군</p>
                  <p className="text-muted-foreground">Tank {teamBRoles.tank} / DPS {teamBRoles.dps} / Support {teamBRoles.support}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="grid gap-6 md:grid-cols-2">
            <DroppableTeamCard team="A" members={teamA} label="A팀" />
            <DroppableTeamCard team="B" members={teamB} label="B팀" />
          </div>
        </DndContext>
      </div>
    </Layout>
  )
}
