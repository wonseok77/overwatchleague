# 데이터 모델

## 현재 구현된 모델 (Phase 1~3 + Hotfix 1)

### 관계 다이어그램

```
communities
  └── users (community_id)
        └── player_profiles (user_id, UNIQUE)
  └── seasons (community_id)
        └── matches (season_id)
              ├── match_participants (match_id, user_id)
              ├── player_match_stats (match_id, user_id)
              └── highlights (match_id, user_id?)
        └── season_stats (season_id, user_id)
  └── heroes (독립 테이블, community 무관)
```

### `users`
- `avatar_url`: `/uploads/avatars/{user_id}.{ext}` — Hotfix 1 추가
- `role`: `admin` | `member` — 운영자 권한 분기

### `player_profiles`
- `mmr`: 내전 누적 MMR (기본 1000). 경기 결과 입력 시 `calculate_mmr_change()`로 갱신
- `main_heroes`: PostgreSQL ARRAY. SQLite 테스트 환경에서 TypeDecorator로 TEXT 변환 필요
- `current_rank`: 단일 메인 역할군 랭크. Phase 5에서 포지션별 랭크(`player_position_ranks`)로 확장 예정

### `matches`
- `status` 흐름: `open` → `closed` → `in_progress` → `completed`
- relationship `lazy="selectin"`: participants/stats/highlights N+1 방지

### `player_match_stats`
- Phase 5에서 kills/deaths/assists/damage_dealt/healing_done/stat_source 추가 예정

### `season_stats`
- `finalize` API 호출 시 생성 (멱등성: 기존 레코드 삭제 후 재생성)
- `rank_position`: 해당 시즌 MMR 기준 내림차순 순위

### `heroes`
- `portrait_url`: Blizzard CDN URL 또는 로컬 `/uploads/heroes/{id}.png`
- `is_custom=True`: 관리자가 직접 업로드한 이미지

## Phase 5 추가 모델

### 관계 확장 다이어그램

```
seasons
  └── match_sessions (season_id)
        ├── session_registrations (session_id, user_id)
        └── matchmaking_results (session_id)
              └── match_participants.session_id (확정 후 연결)

users
  └── player_position_ranks (user_id, season_id?)
```

### `match_sessions`

하루 단위 내전 세션. 여러 게임을 묶는 컨테이너 역할.

| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | UUID | PK |
| `community_id` | UUID | FK → communities |
| `season_id` | UUID | FK → seasons |
| `title` | str | 세션 제목 |
| `scheduled_date` | date | 예정 날짜 |
| `scheduled_start` | time? | 시작 시간 (HH:MM) |
| `total_games` | int | 진행할 총 게임 수 |
| `team_size` | int | 팀당 인원 (기본 5) |
| `tank_count` | int | 팀당 탱커 수 (기본 1) |
| `dps_count` | int | 팀당 딜러 수 (기본 2) |
| `support_count` | int | 팀당 힐러 수 (기본 2) |
| `status` | str | `open` → `closed` → `in_progress` → `completed` |
| `discord_announced` | bool | Discord 알림 전송 여부 |

### `session_registrations`

세션 참가 신청. 1/2/3지망 포지션과 참여 게임 수 범위를 저장.

| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | UUID | PK |
| `session_id` | UUID | FK → match_sessions |
| `user_id` | UUID | FK → users |
| `priority_1` | str | 1지망 포지션 (`tank`\|`dps`\|`support`) |
| `priority_2` | str? | 2지망 (선택) |
| `priority_3` | str? | 3지망 (선택) |
| `min_games` | int | 최소 참여 게임 수 (기본 1) |
| `max_games` | int | 최대 참여 게임 수 (기본 999) |
| `status` | str | `registered` \| `cancelled` |
| `registered_at` | datetime | 신청 시각 (매치메이킹 우선순위 정렬 기준) |

### `matchmaking_results`

매치메이킹 실행 결과 스냅샷. 확정 전까지 미리보기 용도로 사용.

| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | UUID | PK |
| `session_id` | UUID | FK → match_sessions |
| `is_confirmed` | bool | 확정 여부. True가 되면 Match 레코드가 생성된 상태 |
| `algorithm_version` | str | 알고리즘 버전 식별자 (현재 "v1.0") |
| `summary_json` | JSON | `run_matchmaking()` 반환값 전체 저장 |
| `generated_at` | datetime | 실행 시각 |

- 세션당 여러 번 실행 가능 (재실행 시 새 레코드 추가)
- confirm 시 `is_confirmed=False`인 가장 최신 레코드를 확정

### `player_position_ranks`

포지션별·시즌별 랭크 히스토리. `current_rank` (단일 랭크) 대신 포지션마다 별도 티어를 관리.

| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | UUID | PK |
| `user_id` | UUID | FK → users |
| `season_id` | UUID? | NULL이면 현재 시즌 외(공통) 랭크 |
| `position` | str | `tank` \| `dps` \| `support` |
| `rank` | str | "Diamond 3" 형식 |
| `updated_at` | datetime | 마지막 수정 시각 |

- (user_id, season_id, position) 조합이 사실상 Unique Key
- 매치메이킹에서 `position_ranks.get(assigned_position) or current_rank` 순서로 조회
