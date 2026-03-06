# CHANGELOG

## [Unreleased]

### Planned
- Claude Vision OCR 추가 (Tesseract fallback 이미 구현)
- 멀티 커뮤니티 온보딩 플로우
- Discord OAuth 선택적 연동

---

## [Phase 5c] — 2026-03-06

### Added (Backend)
- `backend/app/services/ocr.py` — Tesseract OCR 스코어보드 스탯 추출 (이미지 전처리 + 정규식 파싱)
- `POST /matches/{match_id}/stats/{user_id}/ocr` — OCR 자동 추출 엔드포인트
- `backend/tests/test_ocr.py` — OCR 테스트 6개
- `discord.py`: `send_matchmaking_confirmed()` — 매치메이킹 확정 시 Discord 알림
- `pytesseract==0.3.10`, `Pillow==10.2.0` 의존성

### Changed (Backend)
- `sessions.py`: confirm_matchmaking에 BackgroundTasks Discord 알림 추가

### Added (Frontend)
- `matches.ts`: `triggerOcr()` 함수
- `MatchDetailPage.tsx`: admin OCR 추출 버튼 (스크린샷 업로드된 플레이어)

---

## [Phase 5b] — 2026-03-06

### Added (Frontend)
- `frontend/src/api/sessions.ts` — 세션 CRUD + 신청 + 매치메이킹 API 클라이언트
- `frontend/src/api/ranks.ts` — 포지션별 랭크 API 클라이언트
- `frontend/src/pages/SessionDetailPage.tsx` — 세션 상세 + 참가 신청 + 매치메이킹 미리보기
- `frontend/src/types/index.ts` — MatchSession, SessionRegistration, MatchmakingResult, PositionRank 타입

### Changed (Frontend)
- `MatchListPage.tsx` — '내전 생성' 탭으로 리디자인 (2-column: 달력 + 세션 패널)
- `ProfilePage.tsx` — 포지션별 티어 설정 UI (탱커/딜러/서포터 + 편집/저장)
- `Navbar.tsx` — '내전 일정' → '내전 생성' 텍스트 변경
- `App.tsx` — `/sessions/:id` 라우트 추가

---

## [Phase 5a] — 2026-03-06

### Added (Backend)
- `match_sessions` 모델 (하루 단위 내전 세션)
- `session_registrations` 모델 (1/2/3지망 포지션 + min/max_games)
- `matchmaking_results` 모델 (미리보기 스냅샷)
- `player_position_ranks` 모델 (포지션별·시즌별 티어)
- `player_match_stats` 확장: kills/deaths/assists/damage_dealt/healing_done
- `player_profiles.win_rate` 컬럼
- 세션 CRUD API, 세션 신청 API
- 매치메이킹 실행/미리보기/확정 API
- 포지션별 랭크 설정 API
- 3단계 매치메이킹 알고리즘 (균등분배 → 포지션배정 → 4가중치밸런싱)
- `compute_player_score` 4가중치 확장 (rank/mmr/win_rate/stat_score)

---

## [Hotfix 1] — 2026-03-05

### Added
- `users.avatar_url` 컬럼 (alembic `001_add_avatar_url.py`)
- `POST /users/{id}/avatar` 아바타 업로드 API
- `Avatar` 컴포넌트 (src+이미지 지원, 이니셜 fallback)
- `EmptyState` 컴포넌트
- ProfilePage 아바타 업로드 UI (hover 오버레이)
- RegisterPage 프로필 사진 선택
- MatchListPage 달력/리스트 뷰 토글

### Changed
- Navbar 브랜딩 개선, 활성 링크 표시
- MainPage Hero 섹션 + Top5 아바타
- LeaderboardPage 금/은/동 배지 + Avatar 컬럼

### Fixed
- `auth.py`: `main_heroes` 빈 배열 → `None` 저장 (SQLite 호환)

---

## [Phase 3] — 2026-03-05

### Added
- `backend/app/routers/admin.py` — 8개 admin 전용 엔드포인트
- `backend/tests/test_admin.py` — 26개 테스트
- Discord `send_match_scheduled`, `send_match_result`
- `POST /admin/seasons/{id}/finalize` — SeasonStat 집계
- AdminPage 탭 4개 (영웅/시즌/멤버/Webhook)
- `frontend/src/api/admin.ts`

---

## [Phase 2] — 2026-03-05

### Added
- `GET /matches/{id}` 상세 조회 (participants + stats + highlights)
- `GET /users/{user_id}/profile` 개인 프로필 누적 스탯
- 하이라이트 CRUD API
- MatchDetailPage, ProfilePage, HighlightsPage
- Phase 2 컴포넌트 7개: ScreenshotDropzone, YouTubeEmbed, StatCard, MatchHistoryRow, HighlightCard, SeasonStatRow, MatchResultForm

---

## [Phase 1] — 2026-03-05

### Added
- Docker Compose (frontend + backend + PostgreSQL)
- FastAPI 백엔드: 9개 SQLAlchemy 모델, 5개 라우터
- JWT 인증, 팀 밸런싱 알고리즘, Discord Webhook
- React 18 + Vite + TypeScript 프론트엔드
- shadcn/ui 기반 13개 UI + 7개 도메인 컴포넌트, 9개 페이지

---

## 버그 수정 이력

| 날짜 | 파일 | 내용 |
|------|------|------|
| 2026-03-05 | `balancing.py` | Champion rank_score 7→8 수정 |
| 2026-03-05 | `App.tsx` | React Router v7 future flags 추가 |
| 2026-03-05 | `auth.py` | main_heroes 빈 배열 SQLite 호환 수정 |
