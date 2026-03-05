# 프론트엔드 컴포넌트

## 디자인 원칙
- `cn()` 유틸: `src/lib/utils.ts` — Tailwind 클래스 병합
- 색상: Tank=#4FC1E9, DPS=#F87171, Support=#4ADE80, Brand=#F99E1A
- UI 기반: shadcn/ui (`src/components/ui/`)

---

## 도메인 컴포넌트

### `Avatar` (`components/Avatar.tsx`)
이미지 + 이니셜 fallback 아바타.
```tsx
<Avatar src={user.avatar_url} nickname="홍길동" role="dps" size="xl" />
```
- `size`: sm(32px) | md(40px) | lg(56px) | xl(120px)
- `role`: 없으면 회색, tank/dps/support는 역할 색상 배경
- 이미지 로드 실패 시 nickname 첫 글자 이니셜로 fallback
- **주의**: `ui/avatar.tsx`(이니셜만)와 별개 파일. import 경로 혼동 주의

### `HeroSelect` (`components/HeroSelect.tsx`)
네이티브 `<select>` 대신 커스텀 드롭다운 (이미지 표시를 위해).
```tsx
<HeroSelect value={hero} onChange={setHero} heroes={heroList} placeholder="영웅 선택" />
```
- `useRef` + `mousedown` 이벤트로 외부 클릭 닫기 구현
- 역할군별 그룹핑 (Tank / DPS / Support)

### `RankBadge` (`components/RankBadge.tsx`)
세부 단계 포함 랭크 문자열 표시.
```tsx
<RankBadge rank="Diamond 3" />
```
- 내부에서 `rank.split(' ')[0]`으로 기본 티어 추출 (색상 매핑용)

### `EmptyState` (`components/EmptyState.tsx`)
빈 상태 표시 공통 컴포넌트.
```tsx
<EmptyState icon={<CalendarIcon />} title="경기가 없습니다" description="내전을 생성해주세요" />
```

### `MatchResultForm` (`components/MatchResultForm.tsx`)
경기 결과 입력 폼 (맵, 승패, 참가자별 영웅 + 스탯).
- `HeroSelect`로 영웅 선택 (기존 텍스트 input 교체)

### `ScreenshotDropzone` (`components/ScreenshotDropzone.tsx`)
react-dropzone 기반 스크린샷 업로드.
- `FileRejection` 타입: `import { type FileRejection } from 'react-dropzone'` 사용

---

## 페이지

| 페이지 | 경로 | 권한 |
|--------|------|------|
| MainPage | `/` | 공개 |
| LoginPage | `/login` | 공개 |
| RegisterPage | `/register` | 공개 |
| MatchListPage | `/matches` | 공개 |
| MatchDetailPage | `/matches/:id` | 공개 |
| TeamCompositionPage | `/matches/:id/teams` | admin |
| LeaderboardPage | `/leaderboard` | 공개 |
| HighlightsPage | `/highlights` | 공개 |
| ProfilePage | `/profile/:id` | 로그인 필요 |
| AdminPage | `/admin/*` | admin |

### `MatchListPage`
- 달력/리스트 뷰 토글 (CalendarIcon/ListIcon)
- 커스텀 월별 달력 (외부 라이브러리 없음)
- 오렌지 dot → 경기 있는 날, 날짜 클릭 → 해당 날 경기 필터링

### `ProfilePage`
- `isOwner`: `user?.id === userId` 체크
- 아바타 hover 오버레이 → 숨겨진 file input 트리거 → `uploadAvatar()` 호출

### `AdminPage`
- 탭 4개: `heroes` | `seasons` | `members` | `webhook`
- `useState<'heroes'|'seasons'|'members'|'webhook'>` 상태 관리

---

## API 클라이언트 (`src/api/`)

모든 클라이언트는 `axios` 기반 `client.ts` 인스턴스 공유.
인증 토큰은 localStorage에서 자동 주입 (interceptor).

| 파일 | 주요 함수 |
|------|----------|
| `auth.ts` | register, login, getMe |
| `members.ts` | getUserProfile, uploadAvatar |
| `matches.ts` | getMatches, getMatch, submitMatchStats, createHighlight |
| `heroes.ts` | getHeroes, seedHeroes |
| `admin.ts` | getAdminSeasons, finalizeAdminSeason, updateWebhook, testWebhook |
