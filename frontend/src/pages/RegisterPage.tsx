import { useState, useEffect, useRef, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { HeroSelect } from '@/components/HeroSelect'
import { getHeroes, type Hero } from '@/api/heroes'
import { getMe } from '@/api/auth'
import { uploadAvatar } from '@/api/members'
import { Swords, Camera } from 'lucide-react'

const BASE_RANKS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Grandmaster', 'Champion']
const RANKS = BASE_RANKS.flatMap((r) => [5, 4, 3, 2, 1].map((n) => `${r} ${n}`))

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    email: '',
    password: '',
    real_name: '',
    nickname: '',
    community_slug: '',
    main_role: '',
    current_rank: '',
    hero1: '',
    hero2: '',
    hero3: '',
  })
  const [heroes, setHeroes] = useState<Hero[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getHeroes().then(setHeroes).catch(() => {})
  }, [])

  const update = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }))

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    const url = URL.createObjectURL(file)
    setAvatarPreview(url)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await register({
        email: form.email,
        password: form.password,
        real_name: form.real_name,
        nickname: form.nickname,
        community_slug: form.community_slug,
        main_role: form.main_role || undefined,
        current_rank: form.current_rank || undefined,
        main_heroes: [form.hero1, form.hero2, form.hero3].filter(Boolean),
      })
      if (avatarFile) {
        try {
          const me = await getMe()
          await uploadAvatar(me.id, avatarFile)
        } catch {
          // 아바타 업로드 실패해도 가입 자체는 성공
        }
      }
      navigate('/')
    } catch {
      setError('회원가입에 실패했습니다. 정보를 확인해주세요.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="absolute left-4 top-4">
        <Link to="/" className="flex items-center gap-2 text-ow-orange-500 hover:opacity-80 transition-opacity">
          <Swords className="h-5 w-5" />
          <div>
            <p className="text-sm font-bold leading-tight">OW League</p>
            <p className="text-xs text-muted-foreground leading-tight">내전 플랫폼</p>
          </div>
        </Link>
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-ow-orange-500/10">
            <Swords className="h-6 w-6 text-ow-orange-500" />
          </div>
          <CardTitle className="text-2xl">회원가입</CardTitle>
          <CardDescription>OW League에 가입하고 내전에 참여하세요</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="real_name">본명</Label>
                <Input id="real_name" value={form.real_name} onChange={(e) => update('real_name', e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nickname">닉네임</Label>
                <Input id="nickname" value={form.nickname} onChange={(e) => update('nickname', e.target.value)} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">이메일</Label>
              <Input id="email" type="email" placeholder="you@example.com" value={form.email} onChange={(e) => update('email', e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">비밀번호</Label>
              <Input id="password" type="password" value={form.password} onChange={(e) => update('password', e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="community_slug">커뮤니티</Label>
              <Input id="community_slug" placeholder="커뮤니티 슬러그" value={form.community_slug} onChange={(e) => update('community_slug', e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="main_role">역할군</Label>
                <Select id="main_role" value={form.main_role} onChange={(e) => update('main_role', e.target.value)}>
                  <option value="">선택</option>
                  <option value="tank">Tank</option>
                  <option value="dps">DPS</option>
                  <option value="support">Support</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="current_rank">현시즌 랭크</Label>
                <Select id="current_rank" value={form.current_rank} onChange={(e) => update('current_rank', e.target.value)}>
                  <option value="">선택</option>
                  {RANKS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>메인 영웅 Top 3</Label>
              <div className="grid grid-cols-3 gap-2">
                <HeroSelect value={form.hero1} onChange={(v) => update('hero1', v)} heroes={heroes} placeholder="영웅 1" />
                <HeroSelect value={form.hero2} onChange={(v) => update('hero2', v)} heroes={heroes} placeholder="영웅 2" />
                <HeroSelect value={form.hero3} onChange={(v) => update('hero3', v)} heroes={heroes} placeholder="영웅 3" />
              </div>
            </div>

            {/* 프로필 사진 (선택) */}
            <div className="space-y-2">
              <Label>프로필 사진 (선택)</Label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-border bg-muted hover:border-ow-orange-500 hover:bg-ow-orange-500/5 transition-colors"
                  aria-label="프로필 사진 선택"
                >
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="미리보기" className="h-full w-full object-cover rounded-full" />
                  ) : (
                    <Camera className="h-5 w-5 text-muted-foreground" />
                  )}
                </button>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">
                    {avatarFile ? avatarFile.name : 'JPG, PNG, WebP (최대 5MB)'}
                  </p>
                  {avatarFile && (
                    <button
                      type="button"
                      onClick={() => { setAvatarFile(null); setAvatarPreview(null) }}
                      className="mt-1 text-xs text-muted-foreground hover:text-foreground underline"
                    >
                      제거
                    </button>
                  )}
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '가입 중...' : '가입하기'}
            </Button>
            <p className="text-sm text-muted-foreground">
              이미 계정이 있으신가요?{' '}
              <Link to="/login" className="text-ow-orange-500 hover:underline">로그인</Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
