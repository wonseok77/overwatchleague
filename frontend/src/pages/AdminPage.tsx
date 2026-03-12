import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScreenshotDropzone } from '@/components/ScreenshotDropzone'
import {
  getHeroes,
  createHero,
  updateHero,
  deleteHero,
  uploadHeroPortrait,
  seedHeroes,
  type Hero,
} from '@/api/heroes'
import {
  getAdminSeasons,
  createAdminSeason,
  updateAdminSeason,
  finalizeAdminSeason,
  deleteAdminSeason,
  getAdminMembers,
  updateAdminMember,
  updateAdminMemberMMR,
  deleteAdminMember,
  toggleMemberHidden,
  updateWebhook,
  testWebhook,
  type AdminSeasonResponse,
  type AdminMemberResponse,
  type AdminPositionRankUpdate,
} from '@/api/admin'
import { setUserRanks } from '@/api/ranks'
import { Plus, Pencil, Trash2, Download, Shield, Sword, Heart, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RankBadge } from '@/components/RankBadge'
import { useAuth } from '@/contexts/AuthContext'

// ─── 상수 ───
const ROLE_LABEL = { tank: '탱커', dps: '딜러', support: '지원' } as const
const ROLE_COLOR = {
  tank: 'bg-[#4FC1E9]/10 text-[#4FC1E9] border-[#4FC1E9]/20',
  dps: 'bg-[#F87171]/10 text-[#F87171] border-[#F87171]/20',
  support: 'bg-[#4ADE80]/10 text-[#4ADE80] border-[#4ADE80]/20',
} as const
const ROLE_ICON = { tank: Shield, dps: Sword, support: Heart }

const BASE_RANKS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Grandmaster', 'Champion']
const RANKS = BASE_RANKS.flatMap((r) => [5, 4, 3, 2, 1].map((n) => `${r} ${n}`))

// ─── 타입 ───
interface HeroFormState {
  name: string
  role: 'tank' | 'dps' | 'support' | ''
  portrait_url: string
  portraitFile: File | null
}

// ─── 공통 컴포넌트 ───
function HeroPortraitImg({ url, name }: { url: string | null; name: string }) {
  const [err, setErr] = useState(false)
  if (!url || err) {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-bold text-muted-foreground">
        {name.charAt(0)}
      </div>
    )
  }
  return (
    <img
      src={url}
      alt={name}
      className="h-10 w-10 rounded-full object-cover"
      onError={() => setErr(true)}
    />
  )
}

// ─── 탭 1: 영웅 관리 ───
function HeroesTab() {
  const [heroes, setHeroes] = useState<Hero[]>([])
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [editTarget, setEditTarget] = useState<Hero | null>(null)
  const [form, setForm] = useState<HeroFormState>({ name: '', role: '', portrait_url: '', portraitFile: null })
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    getHeroes().then(setHeroes).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openAdd = () => {
    setEditTarget(null)
    setForm({ name: '', role: '', portrait_url: '', portraitFile: null })
    setShowDialog(true)
  }

  const openEdit = (h: Hero) => {
    setEditTarget(h)
    setForm({ name: h.name, role: h.role, portrait_url: h.portrait_url ?? '', portraitFile: null })
    setShowDialog(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.role) return
    setSaving(true)
    try {
      let hero: Hero
      if (editTarget) {
        hero = await updateHero(editTarget.id, {
          name: form.name,
          role: form.role,
          portrait_url: form.portrait_url || undefined,
        })
      } else {
        hero = await createHero({
          name: form.name,
          role: form.role,
          portrait_url: form.portrait_url || undefined,
        })
      }
      if (form.portraitFile) {
        await uploadHeroPortrait(hero.id, form.portraitFile)
      }
      setShowDialog(false)
      load()
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } }
      const msg = axiosErr?.response?.data?.detail ?? '영웅 저장에 실패했습니다.'
      alert(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    try {
      await deleteHero(id)
      setHeroes((prev) => prev.filter((h) => h.id !== id))
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } }
      const msg = axiosErr?.response?.data?.detail ?? '영웅 삭제에 실패했습니다.'
      alert(msg)
    }
  }

  const handleSeed = async () => {
    setSeeding(true)
    try {
      const res = await seedHeroes()
      alert(res.message)
      load()
    } catch {
      alert('시드 실패 — 관리자 권한을 확인해주세요.')
    } finally {
      setSeeding(false)
    }
  }

  const byRole = (['tank', 'dps', 'support'] as const).map((role) => ({
    role,
    items: heroes.filter((h) => h.role === role),
  }))

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleSeed} disabled={seeding}>
            <Download className="mr-1 h-4 w-4" />
            {seeding ? '시드 중...' : '기본 영웅 시드'}
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus className="mr-1 h-4 w-4" />
            영웅 추가
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-muted-foreground">로딩 중...</div>
      ) : (
        byRole.map(({ role, items }) => {
          const Icon = ROLE_ICON[role]
          return (
            <Card key={role}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="h-4 w-4" />
                  {ROLE_LABEL[role]}
                  <Badge variant="secondary" className="ml-1">{items.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {items.map((h) => (
                    <div
                      key={h.id}
                      className="flex items-center gap-3 rounded-lg border bg-white p-3 shadow-sm"
                    >
                      <HeroPortraitImg url={h.portrait_url} name={h.name} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{h.name}</p>
                        <Badge
                          variant="outline"
                          className={cn('mt-0.5 text-xs', ROLE_COLOR[h.role as keyof typeof ROLE_COLOR])}
                        >
                          {ROLE_LABEL[h.role as keyof typeof ROLE_LABEL]}
                        </Badge>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(h)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-red-500"
                          onClick={() => handleDelete(h.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <p className="text-sm text-muted-foreground col-span-full py-4 text-center">
                      영웅 없음
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })
      )}

      <Dialog open={showDialog} onClose={() => setShowDialog(false)}>
        <DialogHeader>
          <DialogTitle>{editTarget ? '영웅 수정' : '새 영웅 추가'}</DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="hero-name">영웅 이름</Label>
            <Input
              id="hero-name"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="예: Venture"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hero-role">역할군</Label>
            <Select
              id="hero-role"
              value={form.role}
              onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as typeof form.role }))}
            >
              <option value="">역할군 선택</option>
              <option value="tank">탱커</option>
              <option value="dps">딜러</option>
              <option value="support">지원</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="hero-url">초상화 URL (선택)</Label>
            <Input
              id="hero-url"
              value={form.portrait_url}
              onChange={(e) => setForm((p) => ({ ...p, portrait_url: e.target.value }))}
              placeholder="https://..."
            />
            <p className="text-xs text-muted-foreground">
              Blizzard CDN URL 또는 아래에서 직접 이미지 업로드
            </p>
          </div>
          <div className="space-y-2">
            <Label>이미지 업로드 (선택, URL보다 우선)</Label>
            <ScreenshotDropzone
              onFileSelect={(file) => setForm((p) => ({ ...p, portraitFile: file }))}
            />
          </div>
        </div>
        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={() => setShowDialog(false)}>취소</Button>
          <Button onClick={handleSave} disabled={!form.name || !form.role || saving}>
            {saving ? '저장 중...' : (editTarget ? '수정' : '추가')}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  )
}

// ─── 탭 2: 시즌 관리 ───
function SeasonsTab() {
  const [seasons, setSeasons] = useState<AdminSeasonResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newStartedAt, setNewStartedAt] = useState('')
  const [newEndedAt, setNewEndedAt] = useState('')
  const [creating, setCreating] = useState(false)
  const [editSeason, setEditSeason] = useState<AdminSeasonResponse | null>(null)
  const [editName, setEditName] = useState('')
  const [editStartedAt, setEditStartedAt] = useState('')
  const [editEndedAt, setEditEndedAt] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    getAdminSeasons().then(setSeasons).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      await createAdminSeason({ name: newName.trim(), started_at: newStartedAt || undefined, ended_at: newEndedAt || undefined })
      setNewName('')
      setNewStartedAt('')
      setNewEndedAt('')
      setShowCreate(false)
      load()
    } catch {
      alert('시즌 생성 실패')
    } finally {
      setCreating(false)
    }
  }

  const handleClose = async (id: string) => {
    if (!confirm('시즌을 종료하시겠습니까?')) return
    try {
      await updateAdminSeason(id, { status: 'closed' })
      load()
    } catch {
      alert('시즌 종료 실패')
    }
  }

  const handleFinalize = async (id: string) => {
    if (!confirm('시즌 집계를 실행하시겠습니까?')) return
    try {
      const res = await finalizeAdminSeason(id)
      alert(`${res.message} (${res.stats_created}건 생성)`)
      load()
    } catch {
      alert('집계 실패')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('시즌을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return
    try {
      await deleteAdminSeason(id)
      load()
    } catch {
      alert('시즌 삭제 실패. 내전이 있는 시즌은 삭제할 수 없습니다.')
    }
  }

  const handleReopen = async (id: string) => {
    if (!confirm('시즌을 다시 시작하시겠습니까?')) return
    try {
      await updateAdminSeason(id, { status: 'active' })
      load()
    } catch {
      alert('시즌 재시작 실패')
    }
  }

  const openEdit = (s: AdminSeasonResponse) => {
    setEditSeason(s)
    setEditName(s.name)
    setEditStartedAt(s.started_at ? s.started_at.split('T')[0] : '')
    setEditEndedAt(s.ended_at ? s.ended_at.split('T')[0] : '')
  }

  const handleSaveEdit = async () => {
    if (!editSeason) return
    setSaving(true)
    try {
      await updateAdminSeason(editSeason.id, {
        name: editName || undefined,
        started_at: editStartedAt || undefined,
        ended_at: editEndedAt || undefined,
      })
      setEditSeason(null)
      load()
    } catch {
      alert('시즌 수정 실패')
    } finally {
      setSaving(false)
    }
  }

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('ko-KR') : '-'

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">시즌 목록</h2>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="mr-1 h-4 w-4" />
          시즌 생성
        </Button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-muted-foreground">로딩 중...</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">이름</th>
                  <th className="px-4 py-3 font-medium">상태</th>
                  <th className="px-4 py-3 font-medium">시작일</th>
                  <th className="px-4 py-3 font-medium">종료일</th>
                  <th className="px-4 py-3 font-medium text-right">액션</th>
                </tr>
              </thead>
              <tbody>
                {seasons.map((s) => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium">{s.name}</td>
                    <td className="px-4 py-3">
                      <Badge variant={s.status === 'active' ? 'default' : 'secondary'}
                        className={s.status === 'active' ? 'bg-green-500/10 text-green-600 border-green-500/20' : ''}
                      >
                        {s.status === 'active' ? '진행중' : '종료'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(s.started_at)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(s.ended_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="outline" size="sm" onClick={() => openEdit(s)}>
                          수정
                        </Button>
                        {s.status === 'active' && (
                          <Button variant="outline" size="sm" onClick={() => handleClose(s.id)}>
                            종료
                          </Button>
                        )}
                        {s.status === 'closed' && (
                          <Button variant="outline" size="sm" onClick={() => handleReopen(s.id)}>
                            다시 시작
                          </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={() => handleFinalize(s.id)}>
                          집계
                        </Button>
                        <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(s.id)}>
                          삭제
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {seasons.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      시즌이 없습니다
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={showCreate} onClose={() => setShowCreate(false)}>
        <DialogHeader>
          <DialogTitle>시즌 생성</DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="season-name">시즌 이름</Label>
            <Input
              id="season-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="예: 시즌 1"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="season-started-at">시작일 (선택)</Label>
            <Input
              id="season-started-at"
              type="date"
              value={newStartedAt}
              onChange={(e) => setNewStartedAt(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="season-ended-at">종료 예정일 (선택)</Label>
            <Input
              id="season-ended-at"
              type="date"
              value={newEndedAt}
              onChange={(e) => setNewEndedAt(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={() => setShowCreate(false)}>취소</Button>
          <Button onClick={handleCreate} disabled={!newName.trim() || creating}>
            {creating ? '생성 중...' : '생성'}
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={!!editSeason} onClose={() => setEditSeason(null)}>
        <DialogHeader>
          <DialogTitle>시즌 수정</DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-season-name">시즌 이름</Label>
            <Input
              id="edit-season-name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-season-started-at">시작일</Label>
            <Input
              id="edit-season-started-at"
              type="date"
              value={editStartedAt}
              onChange={(e) => setEditStartedAt(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-season-ended-at">종료일</Label>
            <Input
              id="edit-season-ended-at"
              type="date"
              value={editEndedAt}
              onChange={(e) => setEditEndedAt(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={() => setEditSeason(null)}>취소</Button>
          <Button onClick={handleSaveEdit} disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  )
}

// ─── 탭 3: 멤버 관리 ───
const POSITION_LABEL: Record<string, string> = {
  tank: '돌격',
  dps: '공격',
  support: '지원',
}
const POSITION_COLOR: Record<string, string> = {
  tank: 'text-[#4FC1E9]',
  dps: 'text-[#F87171]',
  support: 'text-[#4ADE80]',
}

const POSITIONS_FOR_MMR = ['tank', 'dps', 'support'] as const
type PositionKey = typeof POSITIONS_FOR_MMR[number]

const MMR_POSITION_LABEL: Record<PositionKey, string> = {
  tank: '탱커',
  dps: '딜러',
  support: '지원',
}

// MMR에서 티어 기본값 매핑
const TIER_MMR: Record<string, number> = {
  Champion: 4500,
  Grandmaster: 4000,
  Master: 3500,
  Diamond: 3000,
  Platinum: 2500,
  Gold: 2000,
  Silver: 1500,
  Bronze: 1000,
}

function MembersTab() {
  const [members, setMembers] = useState<AdminMemberResponse[]>([])
  const [loading, setLoading] = useState(true)

  // 포지션 랭크 수정 다이얼로그 상태
  const [mmrTarget, setMmrTarget] = useState<AdminMemberResponse | null>(null)
  const [mmrDraft, setMmrDraft] = useState<Record<PositionKey, string>>({ tank: '', dps: '', support: '' })
  const [rankDraft, setRankDraft] = useState<Record<PositionKey, string>>({ tank: '', dps: '', support: '' })
  const [rankSeasonId, setRankSeasonId] = useState<string>('')
  const [seasons, setSeasons] = useState<AdminSeasonResponse[]>([])
  const [savingMMR, setSavingMMR] = useState(false)

  const load = () => {
    setLoading(true)
    getAdminMembers().then(setMembers).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    getAdminSeasons().then(setSeasons).catch(() => {})
  }, [])

  const handleRoleChange = async (userId: string, role: 'admin' | 'manager' | 'member') => {
    try {
      const updated = await updateAdminMember(userId, { role })
      setMembers((prev) => prev.map((m) => (m.user_id === userId ? updated : m)))
    } catch {
      alert('역할 변경 실패')
    }
  }

  const openMMRDialog = (m: AdminMemberResponse) => {
    const mmr: Record<PositionKey, string> = { tank: '', dps: '', support: '' }
    const rank: Record<PositionKey, string> = { tank: '', dps: '', support: '' }
    m.position_ranks.forEach((pr) => {
      if (pr.mmr != null) mmr[pr.position] = String(pr.mmr)
      if (pr.rank) rank[pr.position] = pr.rank
    })
    setMmrDraft(mmr)
    setRankDraft(rank)
    // 활성 시즌을 기본 선택
    const activeSeason = seasons.find(s => s.status === 'active')
    setRankSeasonId(activeSeason?.id ?? '')
    setMmrTarget(m)
  }

  const handleRankSelect = (pos: PositionKey, rank: string) => {
    setRankDraft((prev) => ({ ...prev, [pos]: rank }))
    const baseTier = rank.split(' ')[0]
    const mmr = TIER_MMR[baseTier]
    if (mmr != null) {
      setMmrDraft((prev) => ({ ...prev, [pos]: String(mmr) }))
    }
  }

  const handleSaveMMR = async () => {
    if (!mmrTarget) return
    setSavingMMR(true)
    try {
      // 1. 티어 텍스트 저장 (setUserRanks)
      const rankPayload = POSITIONS_FOR_MMR
        .filter((pos) => rankDraft[pos] !== '')
        .map((pos) => ({
          position: pos,
          rank: rankDraft[pos],
          season_id: rankSeasonId || null,
        }))
      if (rankPayload.length > 0) {
        await setUserRanks(mmrTarget.user_id, rankPayload)
      }

      // 2. MMR 수동 override
      const mmrPayload: AdminPositionRankUpdate[] = POSITIONS_FOR_MMR
        .filter((pos) => mmrDraft[pos] !== '')
        .map((pos) => ({ position: pos, mmr: Number(mmrDraft[pos]) }))
      if (mmrPayload.length > 0) {
        await updateAdminMemberMMR(mmrTarget.user_id, mmrPayload, rankSeasonId || undefined)
      }

      load()
      setMmrTarget(null)
    } catch {
      alert('저장 실패')
    } finally {
      setSavingMMR(false)
    }
  }

  const handleDeleteMember = async (m: AdminMemberResponse) => {
    if (!confirm(`정말로 ${m.nickname} 멤버를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return
    try {
      await deleteAdminMember(m.user_id)
      setMembers((prev) => prev.filter((mm) => mm.user_id !== m.user_id))
    } catch {
      alert('멤버 삭제 실패')
    }
  }

  const handleToggleHidden = async (userId: string) => {
    try {
      const result = await toggleMemberHidden(userId)
      setMembers((prev) => prev.map((m) =>
        m.user_id === userId ? { ...m, is_hidden: result.is_hidden } : m
      ))
    } catch {
      alert('숨김 상태 변경 실패')
    }
  }

  if (loading) {
    return <div className="py-12 text-center text-muted-foreground">로딩 중...</div>
  }

  return (
    <>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">멤버</th>
                <th className="px-4 py-3 font-medium">역할</th>
                <th className="px-4 py-3 font-medium">포지션 랭크</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id} className={cn("border-b last:border-0", m.is_hidden && "opacity-50")}>
                  {/* 닉네임 + 아바타 */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {m.avatar_url ? (
                        <img src={m.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
                          {m.nickname.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-sm">{m.nickname}</p>
                        <p className="text-xs text-muted-foreground">{m.real_name}</p>
                      </div>
                      <Link
                        to={`/profile/${m.user_id}`}
                        className="inline-flex h-6 w-6 ml-1 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        title="프로필 수정"
                      >
                        <Pencil className="h-3 w-3" />
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-yellow-500"
                        onClick={() => handleToggleHidden(m.user_id)}
                        title={m.is_hidden ? '멤버 표시' : '멤버 숨김'}
                      >
                        {m.is_hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </Button>
                      {m.is_hidden && (
                        <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-400">숨김</Badge>
                      )}
                      {m.real_name !== '장원석' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-red-500"
                          onClick={() => handleDeleteMember(m)}
                          title="멤버 삭제"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </td>
                  {/* 역할 */}
                  <td className="px-4 py-3">
                    {m.real_name === '장원석' ? (
                      <Badge variant="outline" className="text-xs">관리자</Badge>
                    ) : (
                      <Select
                        className="h-8 w-28"
                        value={m.role}
                        onChange={(e) => handleRoleChange(m.user_id, e.target.value as 'admin' | 'manager' | 'member')}
                      >
                        <option value="admin">관리자</option>
                        <option value="manager">매니저</option>
                        <option value="member">멤버</option>
                      </Select>
                    )}
                  </td>
                  {/* 포지션별 랭크/MMR */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="space-y-1">
                        {m.position_ranks.length > 0 ? (
                          m.position_ranks.map((pr) => (
                            <div key={pr.position} className="flex items-center gap-2 text-xs">
                              <span className={`font-medium ${POSITION_COLOR[pr.position]}`}>
                                {POSITION_LABEL[pr.position]}
                              </span>
                              <RankBadge rank={pr.rank} className="text-[10px] px-1.5 py-0" />
                              {pr.mmr != null && (
                                <span className="text-muted-foreground">({pr.mmr})</span>
                              )}
                            </div>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">미설정</span>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0 text-xs"
                        onClick={() => openMMRDialog(m)}
                      >
                        <Pencil className="mr-1 h-3 w-3" />
                        랭크 수정
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    멤버가 없습니다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* 포지션 랭크 수정 다이얼로그 */}
      <Dialog open={!!mmrTarget} onClose={() => setMmrTarget(null)}>
        <DialogHeader>
          <DialogTitle>포지션 랭크 수정 — {mmrTarget?.nickname}</DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-5">
          {/* 시즌 선택 */}
          <div className="space-y-2">
            <Label htmlFor="rank-season">시즌 (선택)</Label>
            <Select
              id="rank-season"
              value={rankSeasonId}
              onChange={(e) => setRankSeasonId(e.target.value)}
            >
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </div>

          {/* 포지션별 랭크 + MMR */}
          {POSITIONS_FOR_MMR.map((pos) => (
            <div key={pos} className="rounded-lg border p-3 space-y-3">
              <p className={cn('text-sm font-semibold', ROLE_COLOR[pos])}>
                {MMR_POSITION_LABEL[pos]}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`rank-select-${pos}`} className="text-xs text-muted-foreground">랭크</Label>
                  <Select
                    id={`rank-select-${pos}`}
                    value={rankDraft[pos]}
                    onChange={(e) => handleRankSelect(pos, e.target.value)}
                  >
                    <option value="">미설정</option>
                    {RANKS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`mmr-${pos}`} className="text-xs text-muted-foreground">MMR (직접 입력)</Label>
                  <Input
                    id={`mmr-${pos}`}
                    type="number"
                    min={0}
                    max={10000}
                    step={1}
                    placeholder="예: 2500"
                    value={mmrDraft[pos]}
                    onChange={(e) => setMmrDraft((prev) => ({ ...prev, [pos]: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            랭크 선택 시 MMR이 자동 입력됩니다. 직접 수정도 가능합니다.
          </p>
        </div>
        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={() => setMmrTarget(null)}>취소</Button>
          <Button onClick={handleSaveMMR} disabled={savingMMR}>
            {savingMMR ? '저장 중...' : '저장'}
          </Button>
        </DialogFooter>
      </Dialog>

    </>
  )
}

// ─── 탭 4: Webhook 설정 ───
function WebhookTab() {
  const [url, setUrl] = useState('')
  const [savedUrl, setSavedUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const res = await updateWebhook({ webhook_url: url.trim() || null })
      setSavedUrl(res.webhook_url)
      setMessage(res.message)
    } catch {
      setMessage('저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setMessage(null)
    try {
      const res = await testWebhook()
      setMessage(res.message)
    } catch {
      setMessage('테스트 발송 실패')
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Discord Webhook</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {savedUrl && (
          <p className="text-sm text-muted-foreground">
            현재 URL: <span className="font-mono text-xs">{savedUrl}</span>
          </p>
        )}
        <div className="space-y-2">
          <Label htmlFor="webhook-url">Webhook URL</Label>
          <Input
            id="webhook-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://discord.com/api/webhooks/..."
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </Button>
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={testing || (!savedUrl && !url.trim())}
          >
            {testing ? '발송 중...' : '테스트 발송'}
          </Button>
        </div>
        {message && (
          <p className="text-sm font-medium text-ow-orange-500">{message}</p>
        )}
      </CardContent>
    </Card>
  )
}

// ─── 메인 ───
export default function AdminPage() {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState('seasons')

  return (
    <Layout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">관리자 대시보드</h1>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full justify-start">
            {isAdmin && <TabsTrigger value="heroes">영웅 관리</TabsTrigger>}
            <TabsTrigger value="seasons">시즌 관리</TabsTrigger>
            {isAdmin && <TabsTrigger value="members">멤버 관리</TabsTrigger>}
            {isAdmin && <TabsTrigger value="webhook">Webhook 설정</TabsTrigger>}
          </TabsList>

          {isAdmin && (
            <TabsContent value="heroes" className="space-y-6">
              <HeroesTab />
            </TabsContent>
          )}

          <TabsContent value="seasons" className="space-y-6">
            <SeasonsTab />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="members" className="space-y-6">
              <MembersTab />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="webhook" className="space-y-6">
              <WebhookTab />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </Layout>
  )
}
