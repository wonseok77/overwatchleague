# API 엔드포인트

Base URL: `http://localhost:8000`
인증: `Authorization: Bearer {jwt_token}`

## 인증

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/auth/register` | 이메일 회원가입, JWT 반환 |
| POST | `/auth/login` | 로그인, JWT 반환 |
| GET | `/auth/me` | 내 정보 조회 |

**register body:**
```json
{
  "email", "password", "real_name", "nickname", "community_slug",
  "main_role?", "current_rank?", "main_heroes?: string[]"
}
```

## 커뮤니티 / 멤버

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/communities` | 커뮤니티 생성 |
| GET | `/communities/{slug}` | 정보 조회 |
| GET | `/communities/{id}/members` | 멤버 목록 |
| POST | `/communities/{id}/members` | 멤버 등록 |

## 시즌 / 경기

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/communities/{id}/seasons` | 시즌 목록 |
| POST | `/communities/{id}/seasons` | 시즌 생성 |
| GET | `/seasons/{id}/matches` | 경기 목록 |
| POST | `/seasons/{id}/matches` | 경기 생성 |
| GET | `/matches/{id}` | 경기 상세 (participants + stats + highlights) |
| POST | `/matches/{id}/register` | 참가 신청 |
| DELETE | `/matches/{id}/register` | 참가 취소 |
| POST | `/matches/{id}/close-registration` | 마감 + 팀 자동 구성 |
| PUT | `/matches/{id}/teams` | 팀 수동 조정 |
| POST | `/matches/{id}/result` | 결과 입력 + MMR 계산 + Discord 알림 |

## 프로필 / 스탯

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/users/{id}/profile` | 프로필 + 누적 스탯 + 최근 20경기 + 시즌별 |
| POST | `/users/{id}/avatar` | 아바타 업로드 (본인/admin, JPG/PNG/WebP, 5MB) |
| GET | `/communities/{id}/leaderboard` | MMR 파워랭킹 |

## 하이라이트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/matches/{id}/highlights` | 경기 하이라이트 |
| POST | `/matches/{id}/highlights` | 하이라이트 등록 (운영자) |
| DELETE | `/highlights/{id}` | 삭제 (운영자) |
| GET | `/communities/{id}/highlights` | 커뮤니티 전체 피드 |

## 영웅

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/heroes` | 전체 목록 (역할군→이름 순) |
| POST | `/heroes` | 추가 (admin) |
| PUT | `/heroes/{id}` | 수정 (admin) |
| DELETE | `/heroes/{id}` | 삭제 (admin) |
| POST | `/heroes/{id}/portrait` | 초상화 업로드 (admin) |
| POST | `/heroes/seed` | 기본 영웅 일괄 등록 (admin, 멱등성) |

## Admin (운영자 전용, `/admin` prefix)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/admin/seasons` | 시즌 목록 |
| POST | `/admin/seasons` | 시즌 생성 |
| PATCH | `/admin/seasons/{id}` | 상태 변경 (active/closed) |
| POST | `/admin/seasons/{id}/finalize` | 시즌 집계 (SeasonStat 생성) |
| GET | `/admin/members` | 멤버 목록 |
| PATCH | `/admin/members/{id}` | 멤버 정보 수정 (role, rank) |
| PATCH | `/admin/community/webhook` | Webhook URL 설정 |
| POST | `/admin/community/webhook/test` | Webhook 테스트 발송 |

## 세션 (내전 일정 관리)

| 메서드 | 경로 | 권한 | 설명 |
|--------|------|------|------|
| GET | `/seasons/{id}/sessions` | 로그인 | 세션 목록 (`?month=YYYY-MM` 필터) |
| POST | `/seasons/{id}/sessions` | admin | 세션 생성 |
| GET | `/sessions/{id}` | 로그인 | 세션 상세 |
| PATCH | `/sessions/{id}` | admin | 세션 수정 |
| DELETE | `/sessions/{id}` | admin | 세션 삭제 (`status=open` 인 경우만) |

**POST /seasons/{id}/sessions body:**
```json
{
  "title": "2월 3주차 내전",
  "scheduled_date": "2026-02-15",
  "scheduled_start": "19:30",
  "total_games": 3,
  "team_size": 5,
  "tank_count": 1,
  "dps_count": 2,
  "support_count": 2
}
```

## 세션 신청 / 취소

| 메서드 | 경로 | 권한 | 설명 |
|--------|------|------|------|
| POST | `/sessions/{id}/register` | 로그인 | 포지션 지망 신청 |
| DELETE | `/sessions/{id}/register` | 로그인 | 신청 취소 (`status=open` 인 경우만) |
| GET | `/sessions/{id}/registrations` | admin | 신청자 목록 (닉네임 + 현재 티어 포함) |
| PATCH | `/sessions/{id}/registrations/{user_id}` | admin | 신청 정보 수정 |

**POST /sessions/{id}/register body:**
```json
{
  "priority_1": "tank",
  "priority_2": "support",
  "priority_3": null,
  "min_games": 1,
  "max_games": 3
}
```
- `priority_1`: 필수. `tank` | `dps` | `support`
- `min_games` / `max_games`: 이 세션에서 뛰고 싶은 게임 수 범위 (기본값 1 / 999)

## 매치메이킹

| 메서드 | 경로 | 권한 | 설명 |
|--------|------|------|------|
| POST | `/sessions/{id}/matchmake` | admin | 매치메이킹 실행 (미리보기 생성, `status` → `closed`) |
| GET | `/sessions/{id}/matchmake/preview` | admin | 최신 매치메이킹 결과 조회 |
| POST | `/sessions/{id}/matchmake/confirm` | admin | 결과 확정 → Match 레코드 생성 + Discord 알림 |

**POST /sessions/{id}/matchmake body (모두 선택):**
```json
{
  "rank_weight": 0.3,
  "mmr_weight": 0.4,
  "win_rate_weight": 0.2,
  "stat_score_weight": 0.1
}
```
- 4개 가중치 합이 1.0이어야 유효한 결과를 얻을 수 있음 (합 검증은 프론트에서 수행)

**응답 예시:**
```json
{
  "session_id": "...",
  "games": [
    {
      "game_no": 1,
      "team_a": [{"user_id": "...", "nickname": "...", "assigned_position": "tank", "priority_used": 1, "balance_score": 3.42}],
      "team_b": [...],
      "balance_summary": {"team_a_score": 17.2, "team_b_score": 17.0, "score_diff": 0.2}
    }
  ],
  "waitlist": ["user_id_..."],
  "stats": {"avg_games_per_player": 2.0, "avg_priority_used": 1.2, "score_diff_avg": 0.3},
  "errors": []
}
```

## 포지션 랭크

| 메서드 | 경로 | 권한 | 설명 |
|--------|------|------|------|
| GET | `/users/{id}/ranks` | 로그인 | 포지션별 랭크 전체 조회 (`?season_id=` 필터) |
| PUT | `/users/{id}/ranks` | 본인/admin | 포지션 랭크 일괄 설정 (Upsert) |
| GET | `/users/{id}/ranks/current` | 로그인 | 현재 시즌 외(시즌 없음) 랭크만 조회 |

**PUT /users/{id}/ranks body:**
```json
[
  {"position": "tank", "rank": "Diamond 3"},
  {"position": "dps", "rank": "Platinum 1"},
  {"position": "support", "rank": "Diamond 1"}
]
```
- 같은 `position` + `season_id` 조합이 있으면 Update, 없으면 Insert

## OCR 스탯 추출

| 메서드 | 경로 | 권한 | 설명 |
|--------|------|------|------|
| POST | `/matches/{id}/stats/{user_id}/ocr` | admin | 저장된 스크린샷에서 스탯 자동 추출 + stat_source="ocr" 저장 |

- 대상 `PlayerMatchStat`에 `screenshot_path`가 없으면 422 반환
- 추출 성공 시 kills / deaths / assists / damage_dealt / healing_done 업데이트
- Tesseract OCR 엔진 사용 (서버에 설치 필요)
