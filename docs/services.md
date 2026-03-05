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
> Phase 5에서 `rank*0.3 + mmr/200*0.4 + win_rate*0.2 + stat*0.1` 가중치로 교체 예정

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

설정: `Community.discord_webhook_url` (Admin 페이지 Webhook 탭에서 관리)

---

## auth.py — 인증

- JWT HS256, 만료 7일
- bcrypt 해싱 (`bcrypt<4.1` 고정 — passlib 호환성 이슈)
- `get_current_user(token)`: Bearer 토큰 검증 → User 반환
- `require_admin(user)`: `user.role != "admin"`이면 403

---

## 주요 주의사항

- `main_heroes = req.main_heroes if req.main_heroes else None`: 빈 배열을 None으로 저장 (SQLite ARRAY 호환)
- Champion rank_score = 8 (Grandmaster=7과 구분됨)
- Avatar 업로드 경로: `/uploads/avatars/{user_id}.{ext}` (docker-compose volume 마운트 필요)
