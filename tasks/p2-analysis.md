# Phase 2 코드 분석

## Phase 1에서 이미 구현된 것 (재사용 가능)

### Backend - DB 모델 (backend/app/models/match.py)
- `PlayerMatchStat` 모델: match_id, user_id, heroes_played(ARRAY), screenshot_path, mmr_before/after/change
- `Highlight` 모델: match_id, user_id, title, youtube_url, registered_at
- `SeasonStat` 모델: season_id, user_id, wins, losses, win_rate, final_mmr, rank_position

### Backend - API (backend/app/routers/matches.py)
- `POST /matches/{match_id}/result` - 결과 제출 시 PlayerMatchStat 생성 + MMR 계산 (mmr_before/after/change)
- 팀 밸런싱, 등록/취소, 결과 제출 전체 플로우 완성

### Backend - Pydantic 스키마 (backend/app/schemas/match.py)
- `MatchResponse`, `ParticipantResponse` 정의됨

### Frontend - 타입 (frontend/src/types/index.ts)
- `PlayerMatchStat`, `Highlight`, `SeasonStat` 타입 이미 정의됨
- `BalanceResult` 타입 정의됨

### Frontend - API 클라이언트 (frontend/src/api/matches.ts)
- getMatches, createMatch, registerForMatch, cancelRegistration, closeRegistration, updateTeams, submitResult 함수 존재

### Frontend - 라우팅 (frontend/src/App.tsx)
- `/matches/:id` -> MatchDetailPage (public)
- `/profile/:id` -> ProfilePage (PrivateRoute)
- 라우트 설정 완료, 페이지는 스텁 상태

---

## Phase 2에서 추가/수정 필요한 것

### Backend API 추가 필요

1. **GET /matches/{match_id}** - 매치 상세 조회 (participants + stats 포함)
   - 현재 단일 매치 조회 엔드포인트 없음 (목록만 있음)
   - participants, player_match_stats, highlights를 join하여 반환 필요

2. **POST /matches/{match_id}/stats/{user_id}/screenshot** - 스크린샷 업로드
   - PlayerMatchStat.screenshot_path에 저장
   - 파일 업로드 처리 (UploadFile), 디스크 저장
   - progress.txt에 경로 패턴 정의됨: `/uploads/screenshots/{match_id}/`

3. **PUT /matches/{match_id}/stats/{user_id}/heroes** - 영웅 플레이 기록 업데이트
   - PlayerMatchStat.heroes_played 업데이트

4. **CRUD /matches/{match_id}/highlights** - 하이라이트 관리
   - POST: 하이라이트 추가 (title, youtube_url)
   - GET: 매치별 하이라이트 목록
   - DELETE: 하이라이트 삭제

5. **GET /users/{user_id}/profile** - 유저 프로필 집계
   - PlayerProfile + 최근 매치 기록 + MMR 변화 히스토리
   - 시즌별 전적 (SeasonStat 활용 또는 집계 쿼리)

6. **GET /users/{user_id}/stats** - 유저 통계 집계
   - 총 전적 (wins/losses), 최근 N경기 MMR 변화, 주 사용 영웅 등

### Backend 스키마 추가 필요
- `PlayerMatchStatResponse` - stat 응답용
- `HighlightCreate`, `HighlightResponse` - 하이라이트 CRUD용
- `MatchDetailResponse` - 상세 조회용 (participants, stats, highlights 포함)
- `ProfileResponse` - 프로필 집계 응답용

### Frontend 페이지 구현 필요

1. **MatchDetailPage** (`frontend/src/pages/MatchDetailPage.tsx`)
   - 현재: 빈 스텁 ("내전 상세 페이지" 텍스트만)
   - 필요: 매치 정보, 팀 구성, 결과, 개인 스탯, 하이라이트 영상, 스크린샷 표시

2. **ProfilePage** (`frontend/src/pages/ProfilePage.tsx`)
   - 현재: 빈 스텁 ("프로필 페이지" 텍스트만)
   - 필요: 유저 정보, MMR 차트, 최근 전적, 시즌 통계, 주 사용 영웅

3. **HighlightsPage** (신규 생성 필요)
   - App.tsx에 라우트 추가 필요
   - 전체 하이라이트 목록 또는 매치별 하이라이트 표시

### Frontend API 모듈 추가 필요
- `getMatch(matchId)` - 단일 매치 상세 조회
- `uploadScreenshot(matchId, userId, file)` - 스크린샷 업로드
- `updateHeroesPlayed(matchId, userId, heroes)` - 영웅 기록
- `getHighlights(matchId)` / `createHighlight(matchId, data)` / `deleteHighlight(id)`
- `getUserProfile(userId)` / `getUserStats(userId)`

---

## 잠재적 이슈

### 1. 파일 업로드 설정
- FastAPI에 `python-multipart` 패키지 필요 (UploadFile 사용 시)
- 업로드 디렉토리 `/uploads/screenshots/{match_id}/` 생성 로직 필요
- 파일 크기 제한 설정 필요 (스크린샷이므로 ~5MB 적정)

### 2. 정적 파일 서빙
- `main.py`에 `StaticFiles` 마운트 필요: `app.mount("/uploads", StaticFiles(directory="uploads"))`
- 현재 main.py에는 정적 파일 서빙 설정 없음
- Vite proxy 설정에 `/uploads` 경로 추가 필요할 수 있음

### 3. DB 마이그레이션
- `alembic/versions/` 디렉토리에 마이그레이션 파일 없음
- 새 테이블이 필요하진 않지만 (모델은 이미 정의됨), DB에 실제 테이블이 생성되어 있는지 확인 필요

### 4. MatchResponse 확장
- 현재 `_match_response()` 헬퍼가 participants/stats를 포함하지 않음
- 상세 조회용 별도 응답 구성 필요 (join/eager loading)

### 5. match.py 라우터의 관계 설정 부족
- Match, MatchParticipant, PlayerMatchStat 모델에 SQLAlchemy relationship 미정의
- JOIN 쿼리 대신 별도 쿼리로 처리하거나 relationship 추가 필요

### 6. YouTube 임베드
- Highlight.youtube_url을 프론트에서 임베드하려면 URL 파싱 (watch?v= -> embed/) 유틸 필요

### 7. CORS / 멀티파트
- 파일 업로드 시 Content-Type이 multipart/form-data로 변경됨
- 현재 CORS 설정의 allow_headers=["*"]이므로 문제 없을 것으로 예상
