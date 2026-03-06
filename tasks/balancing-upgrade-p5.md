# Phase 5 밸런싱 업그레이드 설계

> 작성: pichai (시스템 아키텍트)
> 대상 파일: `backend/app/services/balancing.py` (기존 수정)
> 참고: `tasks/matchmaking-algorithm-p5.md` (매치메이킹 알고리즘 설계)
> 테스트: `backend/tests/test_balancing.py` (기존 호환 유지)

---

## 1. 기존 `compute_player_score` 하위호환 확장

### 현재 시그니처

```python
def compute_player_score(rank_str: Optional[str], mmr: int) -> float:
    rank_score = parse_rank_score(rank_str)
    return rank_score * 0.4 + mmr * 0.006
```

### 변경 시그니처

```python
DEFAULT_WEIGHTS = {
    "rank": 0.3,
    "mmr": 0.4,
    "win_rate": 0.2,
    "stat_score": 0.1,
}


def compute_player_score(
    rank_str: Optional[str],
    mmr: int,
    win_rate: float = 0.0,
    role_stat_score: float = 0.0,
    weights: Optional[Dict[str, float]] = None,
) -> float:
    """
    플레이어 밸런싱 점수 계산.

    weights=None (기존 경로):
        rank_score * 0.4 + mmr * 0.006
        → 기존 테스트 100% 통과

    weights 지정 (신규 경로):
        rank_score * w_rank + mmr/200 * w_mmr + win_rate * w_win_rate + role_stat_score * w_stat

    스케일 비교 (신규 경로):
        rank_score:     1.0 ~ 8.0
        mmr/200:        0.0 ~ 10.0+ (1000→5.0)
        win_rate:       0.0 ~ 1.0
        role_stat_score: 0.0 ~ 10.0
    """
    rank_score = parse_rank_score(rank_str)

    if weights is None:
        # 기존 공식 유지 — 하위호환
        return rank_score * 0.4 + mmr * 0.006

    # 신규 4가중치 공식
    w = {**DEFAULT_WEIGHTS, **weights}  # 누락 키 기본값 보충
    return (
        rank_score * w["rank"]
        + (mmr / 200.0) * w["mmr"]
        + win_rate * w["win_rate"]
        + role_stat_score * w["stat_score"]
    )
```

### 하위호환 보장

| 호출 패턴 | 경로 | 결과 |
|-----------|------|------|
| `compute_player_score("Gold", 1000)` | 기존 | `3.0*0.4 + 1000*0.006 = 7.2` (불변) |
| `compute_player_score("Gold", 1000, win_rate=0.6)` | 기존 | `7.2` (win_rate 무시, weights=None) |
| `compute_player_score("Gold", 1000, 0.6, 3.5, DEFAULT_WEIGHTS)` | 신규 | `3.0*0.3 + 5.0*0.4 + 0.6*0.2 + 3.5*0.1 = 3.37` |

**핵심**: `weights=None`이면 기존 공식 실행. 기존 테스트는 weights 인자를 전달하지 않으므로 영향 없음.

---

## 2. `parse_rank_score` 유지

변경 없음. matchmaking.py에서 import하여 사용.

```python
# matchmaking.py에서:
from app.services.balancing import parse_rank_score, RANK_SCORES
```

---

## 3. 기존 `auto_balance_teams` 유지

**변경 없음.** 기존 Phase 1~4 경기 팀 구성에서 계속 사용.

`auto_balance_teams`는 내부적으로 `_team_score` → `compute_player_score`를 호출하는데, `weights` 인자를 전달하지 않으므로 기존 공식(`rank*0.4 + mmr*0.006`)이 그대로 적용.

```
기존 경로: matches.py 라우터 → auto_balance_teams() → _team_score() → compute_player_score(rank, mmr)
신규 경로: sessions.py 라우터 → run_matchmaking() → balance_teams() → compute_balance_score() → compute_player_score(rank, mmr, wr, stat, weights)
```

두 경로는 완전 독립.

---

## 4. 신규 `balance_with_weights` 함수

`matchmaking.py`에서 호출하는 팀 분배 함수. 기존 `auto_balance_teams`와 구조가 다르므로 **별도 함수**로 설계.

### 위치: `backend/app/services/balancing.py`에 추가

```python
def balance_with_weights(
    players: List[Dict[str, Any]],
    weights: Dict[str, float],
    team_size: int = 5,
) -> Dict[str, Any]:
    """
    4가중치 기반 팀 밸런싱.
    matchmaking.py의 balance_teams()에서 호출.

    Args:
        players: [{
            "user_id": str,
            "rank_str": Optional[str],    # 포지션 랭크 or current_rank
            "mmr": int,
            "win_rate": float,
            "role_stat_score": float,      # 포지션별 스탯 점수
            "assigned_position": str,
            "nickname": str,
            ...기타 필드 pass-through
        }]
        weights: {"rank": 0.3, "mmr": 0.4, "win_rate": 0.2, "stat_score": 0.1}
        team_size: 팀당 인원

    Returns:
        {
            "team_a": [player, ...],
            "team_b": [player, ...],
            "balance_reason": {
                "team_a_score": float,
                "team_b_score": float,
                "score_diff": float,
                "role_distribution": {"team_a": {...}, "team_b": {...}},
            },
        }
    """
    # 각 플레이어 점수 계산
    for p in players:
        p["balance_score"] = compute_player_score(
            rank_str=p.get("rank_str"),
            mmr=p.get("mmr", 1000),
            win_rate=p.get("win_rate", 0.0),
            role_stat_score=p.get("role_stat_score", 0.0),
            weights=weights,
        )

    total = len(players)

    # 팀 사이즈 결정
    if total < team_size * 2:
        team_size_a = total // 2
        team_size_b = total - team_size_a
    else:
        team_size_a = team_size
        team_size_b = team_size

    # 탐색 방식 결정
    if total <= _EXHAUSTIVE_THRESHOLD:
        team_a, team_b = _exhaustive_search(players, team_size_a, team_size_b)
    else:
        team_a, team_b = _greedy_snake_draft(players, team_size_a, team_size_b)

    score_a = sum(p["balance_score"] for p in team_a)
    score_b = sum(p["balance_score"] for p in team_b)

    return {
        "team_a": team_a,
        "team_b": team_b,
        "balance_reason": {
            "team_a_score": round(score_a, 1),
            "team_b_score": round(score_b, 1),
            "score_diff": round(abs(score_a - score_b), 1),
            "role_distribution": {
                "team_a": _position_distribution(team_a),
                "team_b": _position_distribution(team_b),
            },
        },
    }


_EXHAUSTIVE_THRESHOLD = 14  # C(14,7)=3432 — 충분히 빠름


def _exhaustive_search(
    players: List[Dict[str, Any]],
    size_a: int,
    size_b: int,
) -> tuple:
    """완전탐색: C(total, size_a) 조합 중 점수 차이 최소."""
    total = len(players)
    best_combo = None
    best_diff = float("inf")

    for combo in itertools.combinations(range(total), size_a):
        combo_set = set(combo)
        score_a = sum(players[i]["balance_score"] for i in combo)
        score_b = sum(players[i]["balance_score"] for i in range(total) if i not in combo_set)
        diff = abs(score_a - score_b)
        if diff < best_diff:
            best_diff = diff
            best_combo = combo

    combo_set = set(best_combo)
    team_a = [players[i] for i in best_combo]
    team_b = [players[i] for i in range(total) if i not in combo_set]
    if len(team_b) > size_b:
        team_b = team_b[:size_b]
    return team_a, team_b


def _greedy_snake_draft(
    players: List[Dict[str, Any]],
    size_a: int,
    size_b: int,
) -> tuple:
    """
    Greedy snake draft: 점수 높은 순 정렬 → 낮은 총점 팀에 배정.

    15명+ 시나리오에서 사용. C(20,10)=184,756도 1초 내 가능하지만
    안전 마진으로 14명 초과 시 greedy 사용.
    """
    sorted_players = sorted(players, key=lambda p: p["balance_score"], reverse=True)
    team_a = []
    team_b = []
    sum_a = 0.0
    sum_b = 0.0

    for p in sorted_players:
        if len(team_a) >= size_a:
            team_b.append(p)
            sum_b += p["balance_score"]
        elif len(team_b) >= size_b:
            team_a.append(p)
            sum_a += p["balance_score"]
        elif sum_a <= sum_b:
            team_a.append(p)
            sum_a += p["balance_score"]
        else:
            team_b.append(p)
            sum_b += p["balance_score"]

    return team_a, team_b


def _position_distribution(team: List[Dict[str, Any]]) -> Dict[str, int]:
    """assigned_position 기반 포지션 분포. (기존 _role_distribution은 main_role 기반)"""
    dist = {"tank": 0, "dps": 0, "support": 0}
    for p in team:
        pos = p.get("assigned_position", p.get("main_role", "dps"))
        if pos in dist:
            dist[pos] += 1
    return dist
```

### `_role_distribution` vs `_position_distribution`

| 함수 | 키 | 사용처 |
|------|-----|--------|
| `_role_distribution(team)` | `main_role` | `auto_balance_teams` (Phase 1~4) |
| `_position_distribution(team)` | `assigned_position` fallback `main_role` | `balance_with_weights` (Phase 5) |

기존 `_role_distribution`은 변경하지 않음.

---

## 5. `_EXHAUSTIVE_THRESHOLD` 결정 근거

| 인원 | 조합 수 | 예상 시간 |
|------|---------|-----------|
| 10명 | C(10,5) = 252 | <1ms |
| 12명 | C(12,6) = 924 | <5ms |
| 14명 | C(14,7) = 3,432 | <20ms |
| 16명 | C(16,8) = 12,870 | <80ms |
| 20명 | C(20,10) = 184,756 | ~500ms |

**결정: 14명**. 내전 특성상 경기당 10명(5v5)이 일반적. 간혹 6v6(12명), 7v7(14명)까지 가능.
14명까지 완전탐색이면 대부분 케이스 커버. 15명+ 는 greedy.

matchmaking-algorithm-p5.md에서는 `EXHAUSTIVE_THRESHOLD=10`으로 설계했으나, 실제 조합 수가 매우 작으므로 14로 상향. matchmaking.py 구현 시 이 값 참조.

---

## 6. `DEFAULT_WEIGHTS` export

```python
# balancing.py 상단에 추가
DEFAULT_WEIGHTS = {
    "rank": 0.3,
    "mmr": 0.4,
    "win_rate": 0.2,
    "stat_score": 0.1,
}
```

matchmaking.py와 라우터에서 import하여 기본값으로 사용:

```python
from app.services.balancing import DEFAULT_WEIGHTS, parse_rank_score, RANK_SCORES
```

---

## 7. 전체 변경 요약

### `backend/app/services/balancing.py` 변경 사항

| 항목 | 변경 유형 | 영향 |
|------|-----------|------|
| `RANK_SCORES` | 유지 | matchmaking.py에서 import |
| `ROLE_TARGET` | 유지 | 기존 코드에서 사용 |
| `DEFAULT_WEIGHTS` | 신규 추가 | 상단 상수 |
| `parse_rank_score()` | 유지 | matchmaking.py에서 import |
| `compute_player_score()` | 시그니처 확장 | 기존 호출 하위호환 |
| `_team_score()` | 유지 | auto_balance_teams 전용 |
| `_role_distribution()` | 유지 | auto_balance_teams 전용 |
| `auto_balance_teams()` | 유지 | Phase 1~4 전용 |
| `calculate_mmr_change()` | 유지 | 기존 코드 전용 |
| `balance_with_weights()` | 신규 추가 | Phase 5 매치메이킹 전용 |
| `_exhaustive_search()` | 신규 추가 | balance_with_weights 내부 |
| `_greedy_snake_draft()` | 신규 추가 | balance_with_weights 내부 |
| `_position_distribution()` | 신규 추가 | balance_with_weights 내부 |
| `_EXHAUSTIVE_THRESHOLD` | 신규 추가 | 14 (상수) |

### 기존 테스트 호환성

`test_balancing.py`에서 import하는 함수 목록:
- `parse_rank_score` — 변경 없음
- `compute_player_score` — 시그니처 확장이나 기존 호출 (`rank_str, mmr` 2인자)은 `weights=None` 경로로 동일 결과
- `auto_balance_teams` — 변경 없음
- `calculate_mmr_change` — 변경 없음
- `_team_score` — 변경 없음
- `_role_distribution` — 변경 없음

**기존 테스트 전체 PASS 보장.**

---

## 8. matchmaking.py에서의 호출 패턴

```python
# matchmaking.py 3단계에서:
from app.services.balancing import balance_with_weights, DEFAULT_WEIGHTS

def balance_teams(players, registrations, weights, team_size):
    """matchmaking-algorithm-p5.md의 balance_teams 구현."""
    reg_map = {r.user_id: r for r in registrations}

    # PlayerAssignment → dict 변환 (balance_with_weights 입력 형식)
    player_dicts = []
    for p in players:
        reg = reg_map[p.user_id]
        rank_str = reg.position_ranks.get(p.assigned_position) or reg.current_rank
        player_dicts.append({
            "user_id": p.user_id,
            "nickname": p.nickname,
            "assigned_position": p.assigned_position,
            "priority_used": p.priority_used,
            "rank_str": rank_str,
            "mmr": reg.mmr,
            "win_rate": reg.win_rate,
            "role_stat_score": get_role_stat_score(p.assigned_position, reg.avg_stats),
        })

    w = {
        "rank": weights.rank,
        "mmr": weights.mmr,
        "win_rate": weights.win_rate,
        "stat_score": weights.stat_score,
    }
    result = balance_with_weights(player_dicts, w, team_size)

    # dict → PlayerAssignment 역변환 + assignment_reason 생성
    # ... (생략, matchmaking-algorithm-p5.md 참조)

    return team_a_assignments, team_b_assignments, result["balance_reason"]
```

---

## 9. ADR

### ADR-P5-4: 밸런싱 함수 이원화

**맥락**: Phase 5 4가중치 밸런싱을 기존 `auto_balance_teams`에 통합할지, 별도 함수로 분리할지.

**결정**: `balance_with_weights` 별도 함수 추가. `auto_balance_teams` 변경 없음.

**대안**:
- `auto_balance_teams`에 weights 파라미터 추가 → 기존 호출 모두 수정 필요, 테스트 깨질 위험
- `compute_player_score`만 확장하고 `_team_score` → `auto_balance_teams` 경로 재사용 → `assigned_position`, `role_stat_score` 등 신규 필드를 기존 dict 구조에 끼워넣기 어려움

**결과**: 기존 코드 무변경. 신규 코드만 추가. 테스트 100% 호환. 두 경로가 독립적으로 발전 가능.

### ADR-P5-5: EXHAUSTIVE_THRESHOLD 14

**맥락**: 완전탐색 임계값.

**결정**: 14명. C(14,7)=3,432로 20ms 이내 완료.

**대안**:
- 10명 (matchmaking-algorithm-p5.md 초안) → 보수적이지만 12명 6v6 케이스에서 greedy 사용
- 20명 → C(20,10)=184,756, 500ms 수준. 가능하나 안전 마진 부족

**결과**: 14명은 5v5(10명), 6v6(12명), 7v7(14명)까지 완전탐색 커버. 실제 내전 대부분 커버.
