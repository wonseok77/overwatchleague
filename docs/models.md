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

## Phase 5에서 추가될 모델

| 모델 | 용도 |
|------|------|
| `match_sessions` | 하루 단위 내전 세션 (total_games, 포지션 구성) |
| `session_registrations` | 1/2/3지망 포지션 + min/max_games 신청 |
| `matchmaking_results` | 매치메이킹 미리보기 스냅샷 |
| `ocr_configs` | Claude Vision / Tesseract 엔진 설정 |
| `player_position_ranks` | 포지션별·시즌별 티어 히스토리 |
