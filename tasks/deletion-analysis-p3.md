## Phase 3 삭제 분석 보고서

### 코드베이스 현황 (Phase 3 시작 전)

- **seasons.py admin 엔드포인트**: 있음
  - `POST /communities/{community_id}/seasons` (require_admin) - 시즌 생성
  - `PUT /seasons/{season_id}/close` (require_admin) - 시즌 종료
  - `GET /communities/{community_id}/seasons` - 공개 (목록 조회)

- **members.py admin 엔드포인트**: 있음
  - `POST /{community_id}/members` (require_admin) - 멤버 생성
  - `PUT /{community_id}/members/{user_id}` (require_admin) - 멤버 수정
  - `GET /{community_id}/members` - 공개 (목록 조회)

- **discord.py 현재 함수**:
  - `send_discord_webhook(webhook_url, embed)` - 범용 webhook 전송
  - `send_team_composition(webhook_url, match_title, team_a_names, team_b_names, balance_result)` - 팀 편성 알림
  - 누락: 경기 결과 알림, 시즌 집계 알림 (Phase 3에서 추가 필요)

- **community.webhook_url**: 있음 (`discord_webhook_url: String(500), nullable=True`)

- **season_stats 모델**: 있음 (`SeasonStat` in match.py:80-91)
  - 필드: season_id, user_id, wins, losses, win_rate, final_mmr, rank_position
  - profiles.py에서 이미 조회 사용 중 (ProfilePage 시즌 기록)
  - 집계 로직(populate)은 아직 없음 - Phase 3 S4에서 구현 필요

- **AdminPage 현재 탭**: 영웅 관리만 (탭 구조 없음, 단일 페이지)

- **admin.ts API 모듈**: 없음 (프론트엔드에 별도 admin API 모듈 미존재)
  - 현재 API 모듈: client.ts, auth.ts, leaderboard.ts, seasons.ts, matches.ts, members.ts, heroes.ts

### 즉시 삭제 가능

- 없음. 기존 코드는 모두 사용 중이며 Phase 3에서 확장할 기반이 됨.

### 단순화 제안

- **AdminPage 구조**: 현재 영웅 관리만 있는 단일 페이지 -> 탭 컴포넌트로 분리하여 시즌/멤버/Webhook 탭 추가 시 각 탭을 별도 컴포넌트로 추출 권장
- **discord.py**: async 함수인데 호출부(matches.py)가 sync FastAPI -> Phase 3에서 webhook 함수 추가 시 호출 방식 통일 필요 (BackgroundTasks 사용 등)

### Phase 3 구현 시 주의사항

- **seasons.py**: admin 엔드포인트 이미 존재. AdminPage에서 호출하는 프론트 연동만 필요. 시즌 삭제 엔드포인트는 없으므로 필요 시 추가.
- **members.py**: admin CRUD 이미 완비. 프론트엔드 탭 UI + API 모듈 연결이 핵심.
- **SeasonStat 모델**: 이미 존재하나 데이터 채우는 집계 서비스가 없음. `close_season` 시 자동 집계 로직 연결이 Phase 3 핵심.
- **discord_webhook_url**: Community 모델에 이미 있으므로 Webhook 설정 UI는 이 필드를 PATCH하면 됨. 별도 모델 불필요.
- **프론트 API**: seasons.ts, members.ts 이미 존재. admin 전용 모듈보다 기존 모듈에 admin 함수 추가가 단순.
