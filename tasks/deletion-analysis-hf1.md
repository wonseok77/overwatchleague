## 핫픽스 현황 파악 보고서

### User 모델 avatar_url: 없음
- `backend/app/models/user.py` User 클래스에 avatar_url 필드 없음
- PlayerProfile에도 avatar_url 없음
- 새 컬럼 추가 + migration 필요

### profiles.py avatar_url 응답: 없음
- `GET /users/{user_id}/profile` 응답 스키마 `ProfileResponse` → `UserInfo`에 avatar_url 미포함
- UserInfo 필드: id, real_name, nickname, discord_id
- avatar_url 필드 추가 시 UserInfo + 프로필 응답 모두 수정 필요

### MatchListPage 현재 구조: 단순 리스트 (달력 없음)
- `frontend/src/pages/MatchListPage.tsx` (171줄)
- 달력 UI 없음 — 단순 `space-y-4` 리스트로 MatchCard 나열
- 참가신청: registeredMatchIds Set으로 관리, 버튼 토글 (참가 신청 / 참가 취소)
- admin: "내전 생성" 다이얼로그 + "마감 및 팀 구성" 버튼
- 정렬: scheduled_at 오름차순
- 참가자 수 표시: `currentParticipants={0}` (하드코딩됨 — 실제 API에서 participant count 안 줌)
- match 목록 API (`GET /seasons/{season_id}/matches`): MatchResponse만 반환, participants 미포함

### ProfilePage 프사 UI: 없음 (이니셜 아바타만)
- `frontend/src/pages/ProfilePage.tsx` (214줄)
- `<Avatar nickname={profileUser.nickname} size="lg" />` 사용 — 이니셜 기반
- 프사 업로드 UI 전혀 없음
- Avatar 컴포넌트 수정 + 업로드 버튼 추가 필요

### LeaderboardPage 아바타: 없음
- `frontend/src/pages/LeaderboardPage.tsx` (117줄)
- 테이블에 순위/닉네임/본명/역할군/MMR만 표시
- 아바타 컬럼 없음
- Avatar 컴포넌트 import도 없음

### Avatar 컴포넌트: 있음 (ui/avatar.tsx) — 이미지 미지원
- `frontend/src/components/ui/avatar.tsx`
- props: nickname, size(sm/md/lg), className
- 이니셜 2글자 기반, bg-ow-orange-500 원형
- **이미지(src) prop 없음** — avatar_url 지원 위해 확장 필요

### EmptyState 컴포넌트: 없음
- `frontend/src/components/` 에 EmptyState.tsx 없음
- 현재 빈 상태는 인라인 `<p>` 또는 `<TableCell>` 텍스트로 처리

### heroes.py 업로드 패턴 (아바타 구현 참고):
- 경로: `backend/uploads/heroes/{hero_id}.{ext}`
- 허용 확장자: image/jpeg, image/png, image/webp
- 최대 크기: 5MB
- 파일명: `{hero_id}.{ext}`
- DB 저장: `/uploads/heroes/{filename}` (상대 경로)
- Static serving: FastAPI StaticFiles (main.py에서 /uploads 마운트)

### 최신 alembic revision ID: 없음
- `backend/alembic/versions/` 디렉토리 비어있음 (기존 migration 파일 없음)
- alembic env.py는 설정 완료 (Base.metadata 사용)
- 새 migration 생성 시 `alembic revision --autogenerate` 가능 (base = empty)

---

### S2 젠슨에게 전달할 정보
- User 모델에 avatar_url: Mapped[Optional[str]] 컬럼 추가 필요
- alembic versions 비어있음 → `alembic revision --autogenerate -m "add_avatar_url"` (base 없이 첫 migration)
- 업로드 패턴 참고: heroes.py의 `/heroes/{hero_id}/portrait` 엔드포인트
  - 허용타입: image/jpeg, image/png, image/webp
  - 최대 5MB
  - 저장경로: `uploads/avatars/{user_id}.{ext}`
  - DB 저장: `/uploads/avatars/{filename}`
- profiles.py UserInfo에 avatar_url 필드 추가
- GET /users/{user_id}/profile 응답에 avatar_url 포함

### S3 팀쿡에게 전달할 정보
- Avatar 컴포넌트 (`ui/avatar.tsx`): src prop 추가 필요 (이미지 있으면 img, 없으면 이니셜 fallback)
- EmptyState 컴포넌트: 현재 없음 — 신규 생성 필요
- LeaderboardPage: 현재 아바타 컬럼 없음, Avatar import도 없음
- 컴포넌트 목록: ui/ 12개 + domain 11개 (총 23개)

### S4 저커버그에게 전달할 정보
- MatchListPage 현재 코드:
  - 달력 없음, MatchCard 리스트, scheduled_at 오름차순
  - currentParticipants 하드코딩(0) — API에서 count 제공 안 함
  - Dialog로 내전 생성 (title + datetime-local)
- ProfilePage 현재 코드:
  - Avatar 이니셜만 표시, 프사 업로드 UI 없음
  - 구조: Header(아바타+닉네임+역할+랭크) → StatCards(4개) → 시즌별기록 → 최근경기 → 하이라이트
  - avatar_url 추가 시: Avatar에 src prop 전달 + 업로드 버튼 (isOwner일 때만)
- LeaderboardPage: 테이블에 아바타 컬럼 추가 필요
