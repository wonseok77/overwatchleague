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
| SessionDetailPage | `/sessions/:id` | 로그인 필요 |
| LeaderboardPage | `/leaderboard` | 공개 |
| HighlightsPage | `/highlights` | 공개 |
| ProfilePage | `/profile/:id` | 로그인 필요 |
| AdminPage | `/admin/*` | admin |

### `MatchListPage`
- 달력/리스트 뷰 토글 (CalendarIcon/ListIcon)
- 커스텀 월별 달력 (외부 라이브러리 없음)
- 오렌지 dot → 경기 있는 날, 날짜 클릭 → 해당 날 경기 필터링
- Phase 5b: 내전 생성 탭 추가 (세션 생성 폼 포함)

### `SessionDetailPage` (`pages/SessionDetailPage.tsx`)
세션 상세 + 참가 신청 + 매치메이킹 실행/확인 통합 페이지.

**일반 유저 화면:**
- 세션 메타 정보 (날짜, 팀 구성, 총 게임 수, 신청자 수)
- `status=open` 일 때 참가 신청 폼 (1/2/3지망 포지션 + min/max 게임 수)
- 이미 신청했으면 신청 내역 + 취소 버튼

**Admin 화면 (추가):**
- 신청자 목록 테이블 (닉네임 / 지망 / 티어)
- 매치메이킹 실행 패널: 4개 가중치를 슬라이더로 조정, 합이 1.00일 때만 실행 허용
- `MatchmakingPreview` 컴포넌트: 게임별 탭 + 대기자 탭 + 참여 통계 탭

**내부 컴포넌트:**
- `PositionSelect`: 중복 선택 방지 (이미 선택된 포지션을 다른 지망에서 제외)
- `WeightSlider`: 가중치 조정용 range input 래퍼
- `GameTeamTable`: 단일 팀 플레이어 테이블 (포지션 배지 + 지망 순위 + 점수)
- `MatchmakingPreview`: 매치메이킹 결과 카드 (재실행/확정 버튼 포함)

**주의사항:**
- 가중치 합이 정확히 1.00이 아니면 실행 자체를 막음 (부동소수점 허용 오차 0.01)
- `getMatchmakingPreview` 실패는 무시 (세션 첫 진입 시 404 정상)

### `MatchDetailPage` (Phase 5c 변경)
- OCR 버튼 추가: 스크린샷이 있는 참가자 행에 "OCR 추출" 버튼 표시 (admin 전용)
- `triggerOcr(matchId, userId)` 호출 → 성공 시 매치 데이터 재조회

### `ProfilePage`
- `isOwner`: `user?.id === userId` 체크
- 아바타 hover 오버레이 → 숨겨진 file input 트리거 → `uploadAvatar()` 호출
- Phase 5b: 포지션 랭크 섹션 추가 (tank/dps/support별 티어 표시 + 수정)

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
| `matches.ts` | getMatches, getMatch, submitMatchStats, createHighlight, **triggerOcr** |
| `heroes.ts` | getHeroes, seedHeroes |
| `admin.ts` | getAdminSeasons, finalizeAdminSeason, updateWebhook, testWebhook |
| `sessions.ts` | getSessions, getSession, createSession, updateSession, deleteSession, registerForSession, cancelSessionRegistration, getRegistrations, runMatchmaking, getMatchmakingPreview, confirmMatchmaking |
| `ranks.ts` | getUserRanks, setUserRanks, getCurrentRanks |

### `sessions.ts`

- `runMatchmaking(sessionId, weights?)`: weights 미전달 시 서버 기본값 사용 (rank=0.3, mmr=0.4 등)
- `getMatchmakingPreview`: 세션 진입 시 자동 조회, 404면 null 처리

### `ranks.ts`

- `setUserRanks`: PUT이므로 전체 포지션 목록을 한 번에 전송 (부분 업데이트 지원 안 함)
- `getCurrentRanks`: season_id=null인 레코드만 반환 (공통 랭크)
