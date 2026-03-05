# OW League Design Guide

## Color Palette

### Brand Colors
- `ow-orange-400`: #FFBE5C (light)
- `ow-orange-500`: #F99E1A (primary)
- `ow-orange-600`: #E08810 (hover/active)
- `ow-blue-400`: #72D4F5
- `ow-blue-500`: #4FC1E9
- `ow-blue-600`: #2EA8D0
- `ow-dark-800`: #1A1F2E (text)
- `ow-dark-900`: #13161E

### Role Colors
- Tank: `#4FC1E9` (ow-blue) - `<RoleBadge role="tank" />`
- DPS: `#F87171` (red-400) - `<RoleBadge role="dps" />`
- Support: `#4ADE80` (green-400) - `<RoleBadge role="support" />`

### Semantic Colors
- background: #FFFFFF (white-based theme)
- foreground: #1A1F2E
- muted: #F3F4F6 / foreground: #6B7280
- border: #E5E7EB
- ring (focus): #F99E1A

## Typography
- Primary: Pretendard (Korean), Inter (Latin), system-ui
- Set via CSS variable `--font-sans`

## Component Interfaces

### UI Primitives (frontend/src/components/ui/)
- `Button` - variants: default, destructive, outline, ghost, link / sizes: default, sm, lg, icon
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`
- `Badge` - variants: default, secondary, destructive, outline, tank, dps, support
- `Input`, `Label`, `FormField`
- `Select` (native select wrapper)
- `Dialog`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`
- `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`
- `Avatar` - props: nickname, size (sm/md/lg)
- `Progress` - props: value, max
- `Separator` - props: orientation (horizontal/vertical)

### Domain Components (frontend/src/components/)
- `RoleBadge` - props: `{ role: MainRole, showIcon?: boolean }`
- `RankBadge` - props: `{ rank: string }` (Bronze~Champion)
- `HeroBadge` - props: `{ hero: string }`
- `PlayerCard` - props: `{ nickname, mainRole, mmr, mainHeroes, rank? }`
- `MatchCard` - props: `{ title, scheduledAt, status, currentParticipants, maxParticipants?, onClick? }`
- `Layout` - wraps children with Navbar + max-w-6xl container
- `Navbar` - props: `{ isLoggedIn?, nickname? }`

### Phase 2 Domain Components (frontend/src/components/)

- `ScreenshotDropzone` - props: `{ onFileSelect: (file: File) => void, preview?: string }`
  - react-dropzone 기반 이미지 업로드 (JPG/PNG/WebP, 10MB)
  - 드래그앤드롭 + 파일 선택 + 미리보기
  - 사용: `<ScreenshotDropzone onFileSelect={(f) => setFile(f)} />`

- `YouTubeEmbed` - props: `{ url: string, title?: string }`
  - YouTube URL에서 videoId 추출 (youtu.be, youtube.com/watch, embed)
  - 16:9 비율 iframe, 잘못된 URL이면 에러 표시
  - 사용: `<YouTubeEmbed url="https://youtu.be/abc123" />`

- `StatCard` - props: `{ label: string, value: string | number, icon?: ReactNode, trend?: 'up' | 'down' | 'neutral' }`
  - 통계 카드 (아이콘 + 큰 수치 + 레이블 + 트렌드 화살표)
  - 사용: `<StatCard label="승률" value="65%" trend="up" />`

- `MatchHistoryRow` - props: `{ match: MatchHistoryData }`
  - 경기 히스토리 한 행 (날짜, 맵, 팀, 승패, MMR 변동, 영웅)
  - 사용: `<MatchHistoryRow match={matchData} />`

- `HighlightCard` - props: `{ highlight: HighlightData, isAdmin?: boolean, onDelete?: (id) => void }`
  - YouTube 썸네일 + 제목/닉네임/날짜 + 관리자 삭제 버튼
  - 사용: `<HighlightCard highlight={h} isAdmin={isAdmin} onDelete={handleDelete} />`

- `SeasonStatRow` - props: `{ stat: SeasonStatData, isCurrent?: boolean }`
  - 시즌 통계 테이블 행 (시즌명, 승, 패, 승률, MMR, 순위)
  - 현재 시즌이면 bold + orange border-l
  - 사용: `<SeasonStatRow stat={s} isCurrent={s.season_name === current} />`

- `MatchResultForm` - props: `{ match: Match, participants: MatchParticipant[], onSubmit: (data) => void }`
  - 운영자용 결과 입력 폼 (맵 선택, 승패, 참가자별 영웅 3개, 스크린샷)
  - 사용: `<MatchResultForm match={match} participants={list} onSubmit={handleSubmit} />`

## Utility
- `cn()` from `src/lib/utils.ts` - merges Tailwind classes with clsx + tailwind-merge
