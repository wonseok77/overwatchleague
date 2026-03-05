import { useEffect, useState } from 'react'
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
  getAdminMembers,
  updateAdminMember,
  updateWebhook,
  testWebhook,
  type AdminSeasonResponse,
  type AdminMemberResponse,
} from '@/api/admin'
import { Plus, Pencil, Trash2, Download, Shield, Sword, Heart } from 'lucide-react'
import { cn } from '@/lib/utils'

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
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    try {
      await deleteHero(id)
      setHeroes((prev) => prev.filter((h) => h.id !== id))
    } catch {
      // ignore
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
  const [creating, setCreating] = useState(false)

  const load = () => {
    setLoading(true)
    getAdminSeasons().then(setSeasons).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      await createAdminSeason({ name: newName.trim() })
      setNewName('')
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
                        {s.status === 'active' && (
                          <Button variant="outline" size="sm" onClick={() => handleClose(s.id)}>
                            종료
                          </Button>
                        )}
                        {s.status === 'closed' && (
                          <Button variant="outline" size="sm" onClick={() => handleFinalize(s.id)}>
                            집계
                          </Button>
                        )}
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
        </div>
        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={() => setShowCreate(false)}>취소</Button>
          <Button onClick={handleCreate} disabled={!newName.trim() || creating}>
            {creating ? '생성 중...' : '생성'}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  )
}

// ─── 탭 3: 멤버 관리 ───
function MembersTab() {
  const [members, setMembers] = useState<AdminMemberResponse[]>([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    getAdminMembers().then(setMembers).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleRoleChange = async (userId: string, role: 'admin' | 'member') => {
    try {
      const updated = await updateAdminMember(userId, { role })
      setMembers((prev) => prev.map((m) => (m.user_id === userId ? updated : m)))
    } catch {
      alert('역할 변경 실패')
    }
  }

  const handleRankChange = async (userId: string, current_rank: string) => {
    try {
      const updated = await updateAdminMember(userId, { current_rank })
      setMembers((prev) => prev.map((m) => (m.user_id === userId ? updated : m)))
    } catch {
      alert('랭크 변경 실패')
    }
  }

  if (loading) {
    return <div className="py-12 text-center text-muted-foreground">로딩 중...</div>
  }

  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-4 py-3 font-medium">닉네임</th>
              <th className="px-4 py-3 font-medium">역할</th>
              <th className="px-4 py-3 font-medium">현재 랭크</th>
              <th className="px-4 py-3 font-medium">MMR</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.user_id} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">{m.nickname}</td>
                <td className="px-4 py-3">
                  <Select
                    className="h-8 w-28"
                    value={m.role}
                    onChange={(e) => handleRoleChange(m.user_id, e.target.value as 'admin' | 'member')}
                  >
                    <option value="admin">관리자</option>
                    <option value="member">멤버</option>
                  </Select>
                </td>
                <td className="px-4 py-3">
                  <Select
                    className="h-8 w-40"
                    value={m.current_rank ?? ''}
                    onChange={(e) => handleRankChange(m.user_id, e.target.value)}
                  >
                    <option value="">미설정</option>
                    {RANKS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </Select>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{m.mmr ?? '-'}</td>
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
  const [tab, setTab] = useState('heroes')

  return (
    <Layout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">관리자 대시보드</h1>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full justify-start">
            <TabsTrigger value="heroes">영웅 관리</TabsTrigger>
            <TabsTrigger value="seasons">시즌 관리</TabsTrigger>
            <TabsTrigger value="members">멤버 관리</TabsTrigger>
            <TabsTrigger value="webhook">Webhook 설정</TabsTrigger>
          </TabsList>

          <TabsContent value="heroes" className="space-y-6">
            <HeroesTab />
          </TabsContent>

          <TabsContent value="seasons" className="space-y-6">
            <SeasonsTab />
          </TabsContent>

          <TabsContent value="members" className="space-y-6">
            <MembersTab />
          </TabsContent>

          <TabsContent value="webhook" className="space-y-6">
            <WebhookTab />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  )
}
