# 서비스 로직

## balancing.py — 팀 밸런싱

### `parse_rank_score(rank_str)`
랭크 문자열을 점수로 변환.
```
Bronze=1 ~ Grandmaster=7 ~ Champion=8
"Diamond 3" → 5.0 - (3-1)*0.1 = 4.8
```

### `compute_player_score(rank_str, mmr)`
```python
rank_score * 0.4 + mmr * 0.006
```
> Phase 5 이후 `matchmaking.compute_balance_score()`가 실제 밸런싱에서 이 함수를 대체. balancing.py의 `compute_player_score`는 레거시 단순 팀 구성(`auto_balance_teams`)에서만 사용.

### `auto_balance_teams(participants, team_size=5)`
`itertools.combinations`으로 모든 A팀 조합 완전 탐색. 참가자 ≤10명 권장 (그 이상이면 조합 폭발).
반환: `{team_a, team_b, balance_reason: {score_diff, role_distribution}}`

### `calculate_mmr_change(winner, team_score, opponent_score)`
```
승리: +20 ~ +30 (상대팀 점수 높을수록 보너스)
패배: -20 ~ -30 (우리팀 점수 높을수록 페널티)
```

---

## discord.py — Webhook 알림

`BackgroundTasks`로 비동기 실행 (sync 함수이므로 FastAPI 이벤트 루프 블로킹 방지).

| 함수 | 발송 시점 |
|------|----------|
| `send_match_scheduled` | 내전 일정 생성 시 |
| `send_match_result` | 경기 결과 입력 완료 시 |
| `send_matchmaking_confirmed` | 매치메이킹 확정 시 (게임별 팀 구성 임베드) |

설정: `Community.discord_webhook_url` (Admin 페이지 Webhook 탭에서 관리)

`send_matchmaking_confirmed` 호출 시점: `POST /sessions/{id}/matchmake/confirm` 완료 직후 `BackgroundTasks`로 비동기 실행. 게임 수만큼 필드를 생성해 팀 A/B 구성원 목록을 Discord에 전송.

---

## auth.py — 인증

- JWT HS256, 만료 7일
- bcrypt 해싱 (`bcrypt<4.1` 고정 — passlib 호환성 이슈)
- `get_current_user(token)`: Bearer 토큰 검증 → User 반환
- `require_admin(user)`: `user.role != "admin"`이면 403

---

---

## matchmaking.py — 3단계 매치메이킹 알고리즘 (Phase 5)

기존 `balancing.py`의 단순 완전탐색 대신, 포지션 지망·게임 수 제약·밸런스 점수를 통합 처리.

### 핵심 데이터클래스

| 클래스 | 역할 |
|--------|------|
| `RegistrationInput` | 신청자 1명의 지망 포지션, 게임 수 범위, MMR, 승률, 스탯 통계 보유 |
| `SessionConfig` | 세션 설정 (total_games, team_size, 포지션별 인원 수) |
| `BalanceWeights` | 밸런스 점수 4가지 가중치 (합이 1.0 권장) |
| `PlayerAssignment` | 단일 플레이어의 배정 결과 (포지션, 지망 순위, 밸런스 점수) |

### `run_matchmaking(session, registrations, weights)` — 진입점

게임 수만큼 루프를 돌며 3단계를 순차 실행:

**1단계: 선수 선발 (`_select_players_for_game`)**
- 1지망 → 2지망 → 3지망 → 강제 배정 순으로 포지션 슬롯 채우기
- 이미 `max_games`를 채운 플레이어는 제외
- `min_games` 미충족 플레이어 우선 선발 (fairness)

**2단계: 밸런스 점수 계산 (`compute_balance_score`)**
```
score = rank_score * rank_weight
      + (mmr / 200) * mmr_weight
      + win_rate * win_rate_weight
      + role_stat_score * stat_weight
```
- `rank_score`: 배정된 포지션의 `player_position_ranks` 우선, 없으면 `current_rank` 사용
- `role_stat_score`: 포지션별 상이한 스탯 중요도 (tank=생존율, dps=KDA+딜량, support=힐량+어시)

**3단계: 팀 분배**
- 참가자 ≤ 10명: `itertools.combinations` 완전탐색 (score_diff 최소화)
- 참가자 > 10명: 점수 내림차순 greedy 분배

**반환값:**
- `games[].team_a / team_b`: 배정된 플레이어 목록 (포지션·지망·점수·이유 포함)
- `waitlist`: 한 게임도 배정 못 받은 플레이어 user_id 목록
- `stats.avg_priority_used`: 평균 지망 순위 (1에 가까울수록 좋음)
- `errors`: 인원 부족, min_games 미충족 등 경고 메시지

---

## ocr.py — OCR 스탯 추출 (Phase 5c)

Tesseract OCR로 오버워치 스코어보드 스크린샷에서 스탯을 읽어 DB에 저장.

### `extract_stats_from_image(image_path)`

전처리: 그레이스케일 변환 → 대비 2배 강화 → 선명도 2배 강화 → Tesseract PSM 6 모드

반환: `{"kills": int|None, "deaths": int|None, "assists": int|None, "damage_dealt": int|None, "healing_done": int|None}`

**주의사항:**
- 이미지에서 숫자를 순서대로 추출하여 kills→deaths→assists→damage→healing 순으로 매핑. 스크린샷 레이아웃이 표준 오버워치 스코어보드와 다르면 매핑이 틀릴 수 있음.
- 추출 실패 시 빈 dict 반환 (예외 삼킴). 호출부에서 빈 dict 체크 후 422 처리.
- 서버에 `tesseract-ocr` 바이너리와 `Pillow`, `pytesseract` 패키지 설치 필요.

---

## 주요 주의사항

- `main_heroes = req.main_heroes if req.main_heroes else None`: 빈 배열을 None으로 저장 (SQLite ARRAY 호환)
- Champion rank_score = 8 (Grandmaster=7과 구분됨)
- Avatar 업로드 경로: `/uploads/avatars/{user_id}.{ext}` (docker-compose volume 마운트 필요)
