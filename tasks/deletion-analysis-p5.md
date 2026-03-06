# Phase 5 삭제 분석 보고서 (Musk Step 2)

> 분석자: bezos
> 날짜: 2026-03-06
> 대상: Phase 5 매치메이킹 고도화

---

## 1. 변경이 필요한 파일 목록

### 수정 (기존 파일 확장)

| 파일 | 변경 유형 | 상세 |
|------|----------|------|
| `backend/app/models/user.py` | 컬럼 추가 | `PlayerProfile.win_rate: Float DEFAULT 0.0` 추가 |
| `backend/app/models/match.py` | 컬럼 추가 | `MatchParticipant`에 `session_id`, `assigned_position`, `priority_used`, `session_game_no` 4개 컬럼 추가 |
| `backend/app/models/match.py` | 컬럼 추가 | `PlayerMatchStat`에 `kills`, `deaths`, `assists`, `damage_dealt`, `healing_done`, `survivability_pct`, `stat_source` 7개 컬럼 추가 |
| `backend/app/models/__init__.py` | import 추가 | 신규 모델 5개 import + `__all__` 확장 |
| `backend/app/main.py` | 라우터 등록 | `sessions`, `matchmaking`, `position_ranks` 라우터 추가 (최소 2~3개) |
| `backend/app/services/balancing.py` | 공식 변경 | `compute_player_score` 4가중치로 변경 |
| `backend/app/routers/matches.py` | 호출부 수정 | `compute_player_score` 시그니처 변경에 따른 호출부 업데이트 |

### 신규 (새로 생성)

| 파일 | 설명 |
|------|------|
| `backend/app/models/session.py` | `MatchSession`, `SessionRegistration`, `MatchmakingResult` 모델 |
| `backend/app/models/ocr_config.py` | `OcrConfig` 모델 |
| `backend/app/models/position_rank.py` | `PlayerPositionRank` 모델 |
| `backend/app/routers/sessions.py` | 세션 CRUD + 신청 API |
| `backend/app/routers/matchmaking.py` | 매치메이킹 실행/미리보기/확정 API |
| `backend/app/routers/position_ranks.py` | 포지션별 랭크 API |
| `backend/app/services/matchmaking.py` | 3단계 매치메이킹 알고리즘 |
| `backend/app/schemas/session.py` | 세션 관련 Pydantic 스키마 |
| `backend/alembic/versions/002_phase5_matchmaking.py` | Phase 5 마이그레이션 |

---

## 2. 삭제 가능한 코드

### 즉시 삭제 가능
- **없음.** Phase 5는 기존 구조를 확장하는 것이지 대체하는 것이 아님. 기존 match 단위 플로우(등록/마감/밸런싱/결과입력)는 세션 없이도 독립적으로 동작해야 함.

### 삭제 검토 필요 (사티아 확인 필요)
- `balancing.py:33` — `compute_player_score(rank_str, mmr)` 현재 공식: `rank*0.4 + mmr*0.006`
  - Phase 5에서 4가중치 공식으로 **교체** 필요: `rank*0.3 + mmr/200*0.4 + win_rate*0.2 + stat*0.1`
  - 기존 2파라미터 시그니처가 `matches.py:349`에서 직접 호출됨 → 시그니처 변경 시 호출부도 동시 수정 필수
  - **리스크**: 기존 테스트 `TestComputePlayerScore` 3개 케이스가 기존 공식 기준으로 작성됨 → 테스트도 업데이트 필요

### 단순화 제안
- `balancing.py:38-48` — `_team_score`, `_role_distribution`은 현재 단순 합산용.
  Phase 5 매치메이킹 서비스에서 더 정교한 버전이 필요하므로, 기존 함수는 **유지하되** 신규 매치메이킹 서비스에서 별도 구현 권장 (기존 단일 경기 밸런싱과 세션 매치메이킹 로직 분리).

---

## 3. `auto_balance_teams` 함수 유지/교체 전략

### 유지 (권장)

**이유:**
1. `auto_balance_teams`는 **단일 경기 밸런싱** 용도로 `matches.py:261`의 `close-registration` 엔드포인트에서 사용 중
2. Phase 5의 세션 매치메이킹은 **다경기 순환 배정 + 경기별 밸런싱**이므로 로직이 근본적으로 다름
3. 기존 단일 경기 플로우를 폐기할 이유 없음 (세션 없이 단발성 내전도 가능해야 함)

### 전략
- `auto_balance_teams` → 기존 유지 (단일 경기 밸런싱)
- `services/matchmaking.py` 신규 → 세션 매치메이킹 전용 (3단계 알고리즘)
- 세션 매치메이킹의 3단계(팀 밸런싱)에서 `auto_balance_teams`를 **재사용하지 않음** — 포지션 기반 배정이 선행되므로 입력 형태가 다름
- `compute_player_score`는 **공유 함수**로 시그니처 확장 (win_rate, stat_score 파라미터 추가, 기본값으로 하위호환 유지)

### `compute_player_score` 변경안
```python
# Before
def compute_player_score(rank_str, mmr) -> float:
    return rank_score * 0.4 + mmr * 0.006

# After (하위호환 유지)
def compute_player_score(
    rank_str, mmr,
    win_rate: float = 0.0,
    role_stat_score: float = 0.0,
    weights: dict = None,
) -> float:
    w = weights or {"rank": 0.3, "mmr": 0.4, "win_rate": 0.2, "stat": 0.1}
    rank_score = parse_rank_score(rank_str)
    return (rank_score * w["rank"]
            + (mmr / 200) * w["mmr"]
            + win_rate * w["win_rate"]
            + role_stat_score * w["stat"])
```
- 기존 호출부(`matches.py:349`)에서 `win_rate`, `role_stat_score` 미전달 시 기본값 0으로 동작 → 기존 동작 변경됨 (가중치 비율 변경)
- **대안**: 기존 호출부도 win_rate를 전달하도록 수정하거나, 기존 공식을 legacy로 분리

---

## 4. 기존 테스트와의 호환성 이슈

### 영향 받는 테스트 파일

| 테스트 파일 | 영향 | 조치 |
|------------|------|------|
| `tests/test_balancing.py` | `compute_player_score` 공식 변경 시 3개 테스트 FAIL | 새 공식에 맞게 기대값 업데이트 |
| `tests/test_balancing.py:34` | `parse_rank_score("Champion")` → 현재 `7.0` 반환 (RANK_SCORES에 Champion=8 미반영) | **버그 발견**: RANK_SCORES에 Champion=8이지만 테스트 기대값이 7.0 → 테스트가 틀리거나 코드가 틀림 |
| `tests/test_matches.py` | `close-registration`에서 `compute_player_score` 호출 → 시그니처 변경 시 간접 영향 | 하위호환 유지 시 영향 없음 |
| `tests/test_admin.py` | 직접 영향 없음 | - |

### 버그: Champion rank_score 불일치
- `balancing.py:12` — `RANK_SCORES = {"Champion": 8}`
- `test_balancing.py:34` — `assert parse_rank_score("Champion") == 7.0`
- progress.txt에 "Champion rank_score = 8 (최근 수정됨)"으로 기록됨
- **결론**: 테스트가 구버전 기준이며 업데이트 필요. 올바른 기대값은 `8.0`

---

## 5. alembic migration 전략

### 현재 상태
- `001_add_avatar_url.py` (down_revision = None) — users 테이블에 avatar_url 추가

### 권장: 단일 마이그레이션 (002)

**이유:**
- Phase 5 변경사항이 모두 상호 의존적 (session_id FK → match_sessions 테이블 필요)
- 분할 시 중간 상태에서 FK 제약 위반 가능
- 개발 단계이므로 세밀한 롤백보다 단순성이 중요

### 002 마이그레이션 내용

```
002_phase5_matchmaking.py
├── CREATE TABLE match_sessions
├── CREATE TABLE session_registrations
├── CREATE TABLE matchmaking_results
├── CREATE TABLE ocr_configs
├── CREATE TABLE player_position_ranks
├── ALTER TABLE match_participants ADD session_id, assigned_position, priority_used, session_game_no
├── ALTER TABLE player_match_stats ADD kills, deaths, assists, damage_dealt, healing_done, survivability_pct, stat_source
└── ALTER TABLE player_profiles ADD win_rate
```

- `down_revision = '001_add_avatar_url'`
- 모든 신규 컬럼은 `nullable=True` (기존 레코드 호환)
- 신규 ENUM 타입: `position_type` (tank/dps/support), `stat_source_type` (manual/ocr), `session_status` (open/closed/in_progress/completed), `registration_status` (registered/waitlist/cancelled)
- 기존 `participant_status` ENUM에 변경 불필요 (confirmed 이미 존재)

### 분할이 필요한 경우 (대안)
만약 분할한다면:
- 002a: 신규 테이블 5개 생성
- 002b: 기존 테이블 ALTER (FK 참조 가능해진 후)
- 002c: player_profiles.win_rate 추가

---

## 6. 요약: Phase 5 변경 범위

| 카테고리 | 수량 |
|----------|------|
| 수정 파일 | 7개 |
| 신규 파일 | 9개 |
| 삭제 파일 | 0개 |
| 삭제 코드 | 0줄 (교체 대상 1함수) |
| 마이그레이션 | 1개 (002) |
| 테스트 업데이트 | 4+ 케이스 |

**핵심 결론**: Phase 5는 순수 확장 작업. 삭제할 것이 없다. `compute_player_score` 공식만 교체 필요하며, 하위호환을 위해 기본 파라미터로 처리 가능. Champion rank_score 테스트 버그 1건 발견.
