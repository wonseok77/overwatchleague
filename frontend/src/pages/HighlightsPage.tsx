import { useEffect, useState } from 'react'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { HighlightCard } from '@/components/HighlightCard'
import { useAuth } from '@/contexts/AuthContext'
import { useCommunityId } from '@/hooks/useCommunityId'
import { getCommunityHighlights, createHighlight, deleteHighlight, getMatches } from '@/api/matches'
import { getMembers } from '@/api/members'
import { getSeasons } from '@/api/seasons'
import type { Highlight, Match } from '@/types'
import type { HighlightData } from '@/components/HighlightCard'
import type { MemberResponse } from '@/api/members'
import { Plus, Film } from 'lucide-react'

export default function HighlightsPage() {
  const { isAdmin } = useAuth()
  const communityId = useCommunityId()
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [members, setMembers] = useState<MemberResponse[]>([])
  const [completedMatches, setCompletedMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [filterPlayer, setFilterPlayer] = useState('')
  const [showDialog, setShowDialog] = useState(false)
  const [form, setForm] = useState({ matchId: '', title: '', youtube_url: '', user_id: '' })

  useEffect(() => {
    if (!communityId) return
    setLoading(true)

    const loadHighlights = getCommunityHighlights(communityId, { limit: 100 })
      .then(setHighlights)
      .catch(() => {})

    const loadMembers = getMembers(communityId)
      .then(setMembers)
      .catch(() => {})

    const loadMatches = getSeasons(communityId)
      .then(async (seasons) => {
        const allMatches: Match[] = []
        for (const season of seasons) {
          const matches = await getMatches(season.id)
          allMatches.push(...matches.filter((m) => m.status === 'completed'))
        }
        setCompletedMatches(allMatches)
      })
      .catch(() => {})

    Promise.all([loadHighlights, loadMembers, loadMatches]).finally(() => setLoading(false))
  }, [communityId])

  const handleAdd = async () => {
    if (!form.matchId || !form.title || !form.youtube_url) return
    try {
      await createHighlight(form.matchId, {
        title: form.title,
        youtube_url: form.youtube_url,
        user_id: form.user_id || undefined,
      })
      if (communityId) {
        const updated = await getCommunityHighlights(communityId, { limit: 100 })
        setHighlights(updated)
      }
      setShowDialog(false)
      setForm({ matchId: '', title: '', youtube_url: '', user_id: '' })
    } catch {
      // ignore
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteHighlight(id)
      setHighlights((prev) => prev.filter((h) => h.id !== id))
    } catch {
      // ignore
    }
  }

  const getMemberNickname = (userId: string | null) => {
    if (!userId) return undefined
    return members.find((m) => m.id === userId)?.nickname
  }

  const filtered = filterPlayer
    ? highlights.filter((h) => h.user_id === filterPlayer)
    : highlights

  const highlightData: HighlightData[] = filtered.map((h) => ({
    id: h.id,
    title: h.title,
    youtube_url: h.youtube_url,
    user_nickname: getMemberNickname(h.user_id),
    registered_at: h.registered_at,
  }))

  if (loading) {
    return (
      <Layout>
        <div className="py-12 text-center text-muted-foreground">로딩 중...</div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">하이라이트</h1>
          <div className="flex items-center gap-2">
            <Select
              value={filterPlayer}
              onChange={(e) => setFilterPlayer(e.target.value)}
              className="w-40"
            >
              <option value="">전체 플레이어</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.nickname}</option>
              ))}
            </Select>
            {isAdmin && (
              <Button size="sm" onClick={() => setShowDialog(true)}>
                <Plus className="mr-1 h-4 w-4" />
                추가
              </Button>
            )}
          </div>
        </div>

        {/* Grid */}
        {highlightData.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
            <Film className="h-12 w-12" />
            <p>아직 하이라이트가 없습니다.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {highlightData.map((h) => (
              <HighlightCard
                key={h.id}
                highlight={h}
                isAdmin={isAdmin}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add Dialog */}
      <Dialog open={showDialog} onClose={() => setShowDialog(false)}>
        <DialogHeader>
          <DialogTitle>하이라이트 추가</DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="hl-match">경기 선택</Label>
            <Select
              id="hl-match"
              value={form.matchId}
              onChange={(e) => setForm((p) => ({ ...p, matchId: e.target.value }))}
            >
              <option value="">경기를 선택하세요</option>
              {completedMatches.map((m) => (
                <option key={m.id} value={m.id}>{m.title}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="hl-player">플레이어 선택</Label>
            <Select
              id="hl-player"
              value={form.user_id}
              onChange={(e) => setForm((p) => ({ ...p, user_id: e.target.value }))}
            >
              <option value="">선택 안함</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.nickname}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="hl-url">YouTube URL</Label>
            <Input
              id="hl-url"
              value={form.youtube_url}
              onChange={(e) => setForm((p) => ({ ...p, youtube_url: e.target.value }))}
              placeholder="https://youtu.be/..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hl-title">제목</Label>
            <Input
              id="hl-title"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="하이라이트 제목"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>취소</Button>
            <Button
              onClick={handleAdd}
              disabled={!form.matchId || !form.title || !form.youtube_url}
            >
              추가
            </Button>
          </DialogFooter>
        </div>
      </Dialog>
    </Layout>
  )
}
