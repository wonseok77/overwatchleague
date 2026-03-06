# HANDOFF — 오버워치 커뮤니티 내전 플랫폼 Phase 1 + Phase 2

> 작성일: 2026-03-05
> TTH 사일로: 사티아(PO) + 피차이(Architect) + 팀쿡(Design) + 저커버그(Frontend) + 젠슨(Backend) + 베조스(QA)

---

## 변경 사항 요약

### Phase 1 (이전 세션)

**인프라:**
- `docker-compose.yml` — frontend(3000) + backend(8000) + PostgreSQL(5432)
- `backend/.env.example` — 환경변수 템플릿
- `backend/Dockerfile` — Python 3.9-slim, uvicorn 실행
- `frontend/Dockerfile` — node:20 멀티스테이지 빌드 → nginx:alpine 서빙
- `frontend/nginx.conf` — React SPA fallback + `/api/` → backend:8000 프록시

**백엔드 (FastAPI + Python 3.9):**
- `backend/app/models/` — 9개 SQLAlchemy 모델
- `backend/app/routers/` — 5개 라우터 (auth, community, members, seasons, matches)
- `backend/app/services/` — auth(JWT/bcrypt), balancing(팀 밸런싱), discord(Webhook)
- `backend/alembic/` — DB 마이그레이션
- `backend/tests/` — pytest 55개 테스트

**프론트엔드 (React 18 + Vite + TypeScript):**
- `frontend/src/types/index.ts` — 전체 도메인 TypeScript 타입
- `frontend/src/contexts/AuthContext.tsx` — 인증 상태 관리
- `frontend/src/api/` — 5개 API 클라이언트 모듈
- `frontend/src/components/` — shadcn/ui 기반 13개 UI + 7개 도메인 컴포넌트
- `frontend/src/pages/` — 9개 페이지 (Main, Login, Register, MatchList, MatchDetail, TeamComposition, Leaderboard, Profile, Admin)
- `frontend/src/__tests__/` — vitest 11개 테스트

### Phase 2 (이번 세션)

**백엔드:**
- `backend/app/models/match.py` — SQLAlchemy relationship 추가 (Match ↔ MatchParticipant/PlayerMatchStat/Highlight)
- `backend/app/routers/matches.py` — `GET /matches/{id}` 상세 조회 엔드포인트 추가 (participants + stats + highlights)
- `backend/app/routers/profiles.py` (신규) — `GET /users/{user_id}/profile` (누적 스탯 + 최근 20경기 + 시즌별)
- `backend/app/routers/highlights.py` (신규) — 하이라이트 CRUD (GET/POST/DELETE)
- `backend/app/main.py` — StaticFiles `/uploads` 마운트, 신규 라우터 등록
- `backend/tests/test_stats.py` (신규) — Phase 2 테스트 20개

**프론트엔드:**
- `frontend/src/pages/MatchDetailPage.tsx` — 경기 상세 (팀 구성, 운영자 결과 입력, 하이라이트 CRUD)
- `frontend/src/pages/ProfilePage.tsx` — 개인 프로필 (StatCard 4개, 시즌별 기록, 최근 경기, 하이라이트)
- `frontend/src/pages/HighlightsPage.tsx` (신규) — 커뮤니티 하이라이트 그리드 (플레이어 필터, 관리자 추가/삭제)
- `frontend/src/api/matches.ts` — getMatch, submitMatchStats, getMatchHighlights, createHighlight, deleteHighlight, getCommunityHighlights 추가
- `frontend/src/api/members.ts` — getUserProfile, ProfileResponse 타입 추가
- `frontend/src/App.tsx` — `/highlights` 라우트 추가
- `frontend/src/components/Navbar.tsx` — 하이라이트 메뉴 링크 추가
- `frontend/src/components/` — Phase 2 컴포넌트 7개 신규: ScreenshotDropzone, YouTubeEmbed, StatCard, MatchHistoryRow, HighlightCard, SeasonStatRow, MatchResultForm
- `frontend/src/__tests__/MatchDetailPage.test.tsx` (신규) — 14개 테스트

---

## 아키텍처 결정

| 결정 | 이유 |
|------|------|
| React SPA (Vite) + FastAPI 분리 | 팀 역할 분리 명확, Vite 프록시로 CORS 단순화 |
| SQLite in-memory (테스트) | PostgreSQL 의존 없이 CI 테스트 가능 |
| JWT HS256 7일 만료 | 단순하고 stateless, 커뮤니티 규모에 적합 |
| 완전탐색 밸런싱 (≤10명) | itertools.combinations로 최적해 보장 |
| Discord Webhook (Bot 아님) | 설정 5분, HTTP POST 한 줄, 유지보수 없음 |
| YouTube URL 임베드 | 파일 저장 불필요, 무제한 확장 |
| StaticFiles /uploads 마운트 | 로컬 스크린샷 서빙, 무료 PostgreSQL과 분리 |
| SQLAlchemy selectin relationship | N+1 쿼리 방지, 경기 상세 한 번에 로딩 |

---

## 팀 밸런싱 알고리즘

```
점수 = rank_score * 0.4 + mmr * 0.006
rank_score: Bronze=1 ~ Grandmaster/Champion=7
숫자 처리: "Diamond 3" → 5 - (3-1)*0.1 = 4.8

최적화: itertools.combinations로 모든 5인 조합 탐색
역할군 균형: Tank1/DPS2/Support2 우선 배분
반환: team_a, team_b, balance_reason(점수차, 역할분포)

MMR 변동:
승리: +20 + max(0, 상대점수-우리점수)*2 (최대 +30)
패배: -20 - max(0, 우리점수-상대점수)*2 (최대 -30)
```

---

## 테스트 결과

| 범위 | 개수 | 결과 |
|------|------|------|
| 백엔드 pytest (Phase 1) | 55 | ✅ 전부 통과 |
| 백엔드 pytest (Phase 2) | 20 (2 skip) | ✅ 통과 (skip: SQLite ARRAY 비호환) |
| 프론트엔드 vitest (Phase 1) | 11 | ✅ 전부 통과 |
| 프론트엔드 vitest (Phase 2) | 14 | ✅ 전부 통과 |
| **합계** | **100** | **✅ 98 통과 / 2 skip** |

---

## Ralph Loop 통계 (Phase 2)

| 지표 | 값 |
|------|------|
| 총 스토리 | 6개 (S0~S5) |
| 1회 통과 | 6개 |
| 재시도 | 0회 |
| 에스컬레이션 | 0회 |

---

## 남은 작업 (Phase 3~4)

### 핫픽스 / 개선 (Phase 2 이후)
- [x] `backend/Dockerfile`, `frontend/Dockerfile`, `nginx.conf` 추가 — docker-compose up 가능
- [x] 티어 세부 단계 1~5 추가 — RegisterPage RANKS, RankBadge 기본 티어 파싱
- [x] 영웅 선택 드롭다운 — DB 관리 + 초상화 이미지 + AdminPage 영웅 관리
  - `backend/app/models/hero.py` (Hero 모델)
  - `backend/app/routers/heroes.py` (CRUD + 이미지 업로드 + 시드)
  - `frontend/src/api/heroes.ts`
  - `frontend/src/components/HeroSelect.tsx` (커스텀 드롭다운, 역할군 그룹)
  - `frontend/src/components/MatchResultForm.tsx` — HeroSelect로 교체
  - `frontend/src/pages/AdminPage.tsx` — 영웅 관리 구현
- [x] 회원가입 영웅 선택 드롭다운 + 로그인/회원가입 상단 로고
  - `backend/app/schemas/auth.py` — `RegisterRequest`에 `main_heroes: Optional[List[str]]` 추가
  - `backend/app/routers/auth.py` — `PlayerProfile` 생성 시 `main_heroes` 전달
  - `frontend/src/contexts/AuthContext.tsx` — register 인터페이스에 `main_heroes?: string[]` 추가
  - `frontend/src/pages/RegisterPage.tsx` — hero1/2/3 텍스트 Input → HeroSelect, submit 시 main_heroes 배열 전달
  - `frontend/src/pages/LoginPage.tsx` — 좌측 상단 "OW League / 내전 플랫폼" 로고 (Link to="/")
  - `frontend/src/pages/RegisterPage.tsx` — 동일 로고 추가

### Phase 3: 운영 기능 ✅ 완료
- [x] AdminPage 확장 — 탭 4개 (영웅/시즌/멤버/Webhook)
- [x] Discord Webhook 알림 2종 — match_scheduled, match_result (BackgroundTasks)
- [x] 시즌 집계 — POST /admin/seasons/{id}/finalize → SeasonStat upsert

**Phase 3 신규 파일:**
- `backend/app/routers/admin.py` — 8개 admin 전용 엔드포인트 (/admin prefix)
- `backend/tests/test_admin.py` — Admin API 테스트 26개
- `backend/tests/test_discord.py` — Discord 알림 mock 테스트 4개
- `frontend/src/api/admin.ts` — Admin API 클라이언트 8개 함수
- `frontend/src/__tests__/AdminPage.test.tsx` — AdminPage 탭 테스트 8개

**Phase 3 수정 파일:**
- `backend/app/services/discord.py` — send_match_scheduled, send_match_result 추가
- `backend/app/routers/matches.py` — BackgroundTasks로 Discord 알림 연동
- `backend/app/main.py` — admin 라우터 등록
- `frontend/src/pages/AdminPage.tsx` — 탭 구조로 확장 (HeroesTab/SeasonsTab/MembersTab/WebhookTab)

**테스트 결과:**
- Backend pytest: 104 passed, 2 skipped (SQLite ARRAY 기존 이슈)
- Frontend vitest: 33 passed
- Build: tsc + vite build OK

### Hotfix 1: 프로필 사진 + UI 개선

**백엔드:**
- `backend/app/models/user.py` — User.avatar_url 컬럼 추가 (String(500), nullable)
- `backend/alembic/versions/001_add_avatar_url.py` — 첫 alembic migration
- `backend/app/routers/profiles.py` — POST /users/{id}/avatar 엔드포인트 추가, UserInfo에 avatar_url 포함
- `backend/app/routers/auth.py` — main_heroes 빈 배열 SQLite 호환 수정
- `backend/tests/test_avatar.py` (신규) — 아바타 업로드 테스트 5개

**프론트엔드:**
- `frontend/src/components/Avatar.tsx` (신규) — src/role/size props, 이미지+이니셜 fallback
- `frontend/src/components/EmptyState.tsx` (신규) — icon/title/description props
- `frontend/src/components/Navbar.tsx` — 브랜딩 개선, 활성 링크 표시
- `frontend/src/pages/MainPage.tsx` — Hero 섹션 + Top5 아바타 표시
- `frontend/src/pages/LeaderboardPage.tsx` — Avatar + 금/은/동 배지 + EmptyState
- `frontend/src/pages/ProfilePage.tsx` — 아바타 업로드 UI (isOwner hover 오버레이)
- `frontend/src/pages/RegisterPage.tsx` — 회원가입 시 프로필 사진 선택
- `frontend/src/pages/MatchListPage.tsx` — 달력/리스트 뷰 토글 + EmptyState
- `frontend/src/api/members.ts` — uploadAvatar() 추가

**테스트 결과:**
- Backend pytest: 110 passed, 2 skipped (기존 SQLite ARRAY 이슈)
- Frontend: tsc --noEmit OK, vite build OK

### Phase 5: 매치메이킹 고도화 (백엔드) ✅ 완료

**팀:** 사티아(PO) + 피차이(Architect) + 젠슨(Backend) + 베조스(QA)
**테스트:** 149 passed, 2 skipped, 0 failed

**신규 파일 (6개):**
- `backend/app/models/session.py` — MatchSession, SessionRegistration, MatchmakingResult 모델
- `backend/app/services/matchmaking.py` — 3단계 매치메이킹 알고리즘
- `backend/app/routers/sessions.py` — 세션 CRUD + 신청 + 매치메이킹 API
- `backend/app/routers/ranks.py` — 포지션별·시즌별 랭크 CRUD
- `backend/app/schemas/session.py` — Pydantic 스키마
- `backend/alembic/versions/002_phase5_matchmaking.py` — 신규 테이블 4개 + ALTER 3개

**수정 파일 (7개):**
- `backend/app/models/user.py` — PlayerPositionRank 추가, PlayerProfile.win_rate
- `backend/app/models/match.py` — MatchParticipant +4컬럼, PlayerMatchStat +7컬럼
- `backend/app/models/__init__.py` — 신규 모델 import
- `backend/app/main.py` — sessions, ranks 라우터 등록
- `backend/app/services/balancing.py` — compute_player_score 4가중치 확장, Champion=8
- `backend/tests/conftest.py` — JSONB SQLite 컴파일러, StaticPool 격리
- `backend/tests/test_balancing.py` — Champion 기대값 8.0

**신규 테스트 (38개):**
- `tests/test_sessions.py` — 13 tests
- `tests/test_matchmaking.py` — 15 tests
- `tests/test_ranks.py` — 10 tests

**아키텍처 결정:**
- 세션-매치 2계층: MatchSession(하루) → 매치메이킹 → Match(개별 경기)
- 밸런싱 이원화: auto_balance_teams(기존) + balance_with_weights(세션 매치메이킹)
- compute_player_score 하위호환: weights=None→기존 공식, weights→4가중치
- 균등 분배: session_games[user] 적은 순 선발 → ±1경기 오차
- EXHAUSTIVE_THRESHOLD=14: C(14,7)=3432, 5v5~7v7 완전탐색

**Ralph Loop:** 8 스토리 전부 1회 통과, 에스컬레이션 0

### Phase 5b: 매치메이킹 프론트엔드 ✅ 완료

**팀:** 사티아(PO) + 저커버그(Frontend) x3 + 베조스(QA)
**테스트:** tsc OK, vitest 33 passed, build OK, pytest 149 passed

**신규 파일 (3개):**
- `frontend/src/api/sessions.ts` — 세션 CRUD + 신청 + 매치메이킹 API 클라이언트
- `frontend/src/api/ranks.ts` — 포지션별 랭크 API 클라이언트
- `frontend/src/pages/SessionDetailPage.tsx` — 세션 상세 + 참가 신청 + 매치메이킹 미리보기

**수정 파일 (5개):**
- `frontend/src/types/index.ts` — MatchSession, SessionRegistration, MatchmakingResult, PositionRank 타입 추가
- `frontend/src/pages/MatchListPage.tsx` — '내전 생성' 탭 리디자인 (2-column: 달력 + 세션 패널)
- `frontend/src/pages/ProfilePage.tsx` — 포지션별 티어 설정 UI (탱커/딜러/서포터)
- `frontend/src/components/Navbar.tsx` — '내전 일정' → '내전 생성'
- `frontend/src/App.tsx` — `/sessions/:id` 라우트 추가

**Ralph Loop:** 7 스토리, S1(사티아 직접), S2/S3/S5 병렬, S4 순차, S6(QA), S7(문서)
전부 1회 통과, 에스컬레이션 0

### Phase 5c: OCR + Discord Webhook ✅ 완료

**팀:** 사티아(PO, S1 직접) + 젠슨(Backend, S2) + 저커버그(Frontend, S3)
**테스트:** tsc OK, vitest 33p, build OK, pytest 155p/2s

**신규 파일:**
- `backend/app/services/ocr.py` — Tesseract OCR 스코어보드 스탯 추출
- `backend/tests/test_ocr.py` — OCR 테스트 6개

**수정 파일:**
- `backend/app/services/discord.py` — `send_matchmaking_confirmed()` 추가
- `backend/app/routers/sessions.py` — confirm에 BackgroundTasks Discord 알림
- `backend/app/routers/matches.py` — `POST /matches/{id}/stats/{userId}/ocr` 추가
- `backend/requirements.txt` — pytesseract, Pillow
- `frontend/src/api/matches.ts` — `triggerOcr()` 추가
- `frontend/src/pages/MatchDetailPage.tsx` — OCR 추출 버튼

**남은 작업 (다음 세션):**
- [ ] Claude Vision OCR 추가 (Tesseract fallback 이미 구현)
- [ ] 멀티 커뮤니티 온보딩 플로우
- [ ] Discord OAuth 선택적 연동

### Batch 7: 관리자 프로필 수정 + 내전 참여자 추가 (2026-03-06)

**백엔드:**
- `backend/app/routers/admin.py` — AdminMemberUpdate에 nickname/real_name/main_role/main_heroes 추가, update_member 확장 (profile 없으면 자동 생성)
- `backend/app/routers/sessions.py` — POST /sessions/{id}/register-member 엔드포인트 추가 (관리자/매니저 전용)
- `backend/app/routers/members.py` — 리더보드 "전체" 시 포지션별 최고 MMR 집계 로직
- `backend/app/routers/auth.py` — get_me()에서 avatar_url 반환
- `backend/app/schemas/auth.py` — UserResponse에 avatar_url 필드 추가

**프론트엔드:**
- `frontend/src/api/admin.ts` — AdminMemberUpdate 인터페이스 확장
- `frontend/src/api/sessions.ts` — adminRegisterMember 함수 추가
- `frontend/src/pages/AdminPage.tsx` — 멤버 프로필 수정 다이얼로그 (닉네임/본명/주포지션/주영웅)
- `frontend/src/pages/SessionDetailPage.tsx` — 관리자 참여자 추가 다이얼로그
- `frontend/src/pages/LeaderboardPage.tsx` — 포지션별 Tank/DPS/Support 3개 컬럼 분리 + 티어 색상

**테스트:** tsc OK, vite build OK, backend import OK

### Phase 4: 확장
- [ ] 멀티 커뮤니티 온보딩 플로우
- [ ] Discord OAuth 선택적 연동
- [ ] 공동 운영자 권한

---

## 시작 방법

```bash
# 1. 환경변수 설정
cp backend/.env.example backend/.env
# backend/.env 수정: SECRET_KEY, DISCORD_WEBHOOK_URL

# 2. Docker 실행
docker-compose up --build

# 3. DB 마이그레이션
docker-compose exec backend alembic upgrade head

# 4. 접속
# 프론트엔드: http://localhost:3000
# 백엔드 API 문서: http://localhost:8000/docs
```

---

## 배운 점

- Python 3.9 환경에서 `str | None` 문법 미지원 → `Optional[str]` 사용 필수
- bcrypt 4.1+ 버전이 passlib과 충돌 → `requirements.txt`에 `bcrypt<4.1` 고정
- SQLite ARRAY 타입 미지원 → 테스트 환경에서 TypeDecorator로 TEXT 변환 필요
- SQLAlchemy relationship 없이 join 쿼리 시 에러 → selectin lazy loading으로 해결
- react-dropzone의 FileRejection 타입 → 직접 타입 정의 대신 `import { type FileRejection }` 사용
- `npm run build = tsc && vite build` → noUnusedLocals 등 strict 설정이 빌드에 영향
- 테스트 파일 미사용 선언도 빌드 실패 원인 → `_` prefix가 아닌 완전 삭제로 해결
- 티어 세부 단계 1~5: `RankBadge`에서 `rank.split(' ')[0]`으로 기본 티어 추출 필요
- `RANKS` 생성 패턴: `BASE_RANKS.flatMap(r => [5,4,3,2,1].map(n => \`${r} ${n}\`))` 로 40개 옵션 자동 생성
- JSONB는 SQLite에서 compiles 핸들러로 TEXT 대응 (with_variant 불필요)
- SQLite StaticPool + `sqlite://` 패턴으로 테스트 격리 (cache=shared 대신)
- compute_player_score 확장 시 기본 파라미터(win_rate=0.0, role_stat_score=0.0)로 하위호환 유지
- Champion rank_score는 8 (Grandmaster=7과 구분)
