# Phase 5 매치메이킹 알고리즘 상세 설계

> 작성: pichai (시스템 아키텍트)
> 구현 파일: `backend/app/services/matchmaking.py` (신규)
> 기존 참고: `backend/app/services/balancing.py` (Phase 1~4 밸런싱)

---

## 1. 함수 시그니처

```python
# backend/app/services/matchmaking.py

from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime
import itertools
import math


# --- 입력 데이터 구조 ---

@dataclass
class RegistrationInput:
    """세션 신청자 1명의 정보. DB 조인 결과를 이 구조체로 변환."""
    user_id: str
    nickname: str
    priority_1: str                    # "tank" | "dps" | "support"
    priority_2: Optional[str] = None
    priority_3: Optional[str] = None
    min_games: int = 1
    max_games: int = 999
    registered_at: datetime = field(default_factory=datetime.utcnow)
    # 밸런싱용 데이터 (DB에서 조인)
    current_rank: Optional[str] = None  # player_profiles.current_rank (fallback)
    mmr: int = 1000                     # player_profiles.mmr
    win_rate: float = 0.0               # player_profiles.win_rate
    # 포지션별 랭크 (player_position_ranks에서 조회)
    position_ranks: Dict[str, str] = field(default_factory=dict)
    # ex: {"tank": "Gold 2", "dps": "Diamond 3", "support": "Platinum 1"}
    # 최근 스탯 평균 (player_match_stats에서 집계)
    avg_stats: Dict[str, Optional[float]] = field(default_factory=dict)
    # ex: {"kills": 15.2, "deaths": 5.1, "assists": 10.3,
    #       "damage_dealt": 8500, "healing_done": 9200, "survivability_pct": 0.72}


@dataclass
class SessionConfig:
    """세션 설정. MatchSession 모델에서 추출."""
    session_id: str
    total_games: int
    team_size: int = 5
    tank_count: int = 1
    dps_count: int = 2
    support_count: int = 2


@dataclass
class BalanceWeights:
    """밸런싱 가중치. 합계 1.0이어야 함."""
    rank: float = 0.3
    mmr: float = 0.4
    win_rate: float = 0.2
    stat_score: float = 0.1


# --- 내부 상태 구조 ---

@dataclass
class PlayerAssignment:
    """경기 1개에서 플레이어 1명의 배정 결과."""
    user_id: str
    nickname: str
    assigned_position: str          # "tank" | "dps" | "support"
    priority_used: int              # 1, 2, 3
    balance_score: float = 0.0
    assignment_reason: str = ""
    team: str = ""                  # "A" | "B" (3단계에서 채움)


@dataclass
class GameResult:
    """경기 1개의 매치메이킹 결과."""
    game_no: int
    players: List[PlayerAssignment] = field(default_factory=list)
    team_a: List[PlayerAssignment] = field(default_factory=list)
    team_b: List[PlayerAssignment] = field(default_factory=list)
    balance_summary: Dict[str, Any] = field(default_factory=dict)


# --- 메인 함수 ---

def run_matchmaking(
    session: SessionConfig,
    registrations: List[RegistrationInput],
    weights: BalanceWeights = BalanceWeights(),
) -> Dict[str, Any]:
    """
    매치메이킹 실행. MatchmakePreview 형식의 dict 반환.

    Returns:
        {
            "session_id": str,
            "games": [GameResult as dict, ...],
            "waitlist": [user_id, ...],
            "player_game_counts": {user_id: int, ...},
            "stats": { ... },
            "errors": [str, ...]   # 엣지 케이스 경고
        }
    """
```

---

## 2. 1단계: 균등 분배 정렬

핵심 원리: 매 경기 선발 시 `session_games` 카운터가 낮은 플레이어 우선.

```python
def _select_players_for_game(
    registrations: List[RegistrationInput],
    session_games: Dict[str, int],       # {user_id: 출전 횟수}
    already_selected: set,                # 이번 경기에 이미 선택된 user_id
    slots_per_team: int,                  # team_size (양팀 합계 = slots_per_team * 2)
    session_config: SessionConfig,
) -> List[PlayerAssignment]:
    """
    경기 1개에 필요한 플레이어 (team_size * 2명)를 선발.
    포지션 슬롯별로 순차 배정.

    Returns: 선발된 PlayerAssignment 목록 (팀 미배정)
    """
    selected: List[PlayerAssignment] = []
    selected_ids: set = set()

    # 양팀 합산 포지션 슬롯
    # ex: 5v5 기본 → tank 2명, dps 4명, support 4명 (양팀 합계 10명)
    position_slots = [
        ("tank", session_config.tank_count * 2),
        ("dps", session_config.dps_count * 2),
        ("support", session_config.support_count * 2),
    ]

    for position, count in position_slots:
        filled = _pick_by_priority(
            registrations=registrations,
            session_games=session_games,
            already_selected=selected_ids,
            target_position=position,
            count=count,
        )
        for player_id, priority_used in filled:
            reg = _find_registration(registrations, player_id)
            assignment = PlayerAssignment(
                user_id=player_id,
                nickname=reg.nickname,
                assigned_position=position,
                priority_used=priority_used,
            )
            selected.append(assignment)
            selected_ids.add(player_id)

    return selected
```

### 정렬 키 함수

```python
def _sort_key(
    reg: RegistrationInput,
    session_games: Dict[str, int],
) -> Tuple:
    """
    후보 정렬 키. 오름차순 정렬 시:
    1. min_games 미달 우선 (0=미달, 1=충족)
    2. session_games 적은 순
    3. 신청 시각 빠른 순
    """
    games_played = session_games.get(reg.user_id, 0)
    min_unmet = 0 if games_played < reg.min_games else 1
    return (min_unmet, games_played, reg.registered_at)
```

---

## 3. 2단계: 포지션 배정 (`pick_by_priority`)

```python
def _pick_by_priority(
    registrations: List[RegistrationInput],
    session_games: Dict[str, int],
    already_selected: set,
    target_position: str,              # "tank" | "dps" | "support"
    count: int,                        # 이 포지션에 필요한 인원
) -> List[Tuple[str, int]]:
    """
    주어진 포지션 슬롯에 플레이어를 배정.

    로직:
    1. 1지망이 target_position인 후보를 정렬 → 상위 count명 선발
    2. 부족하면 2지망 후보에서 추가
    3. 부족하면 3지망 후보에서 추가
    4. 그래도 부족하면 지망 무관 후보에서 추가 (강제 배정)

    Returns: [(user_id, priority_used), ...]
    """
    result: List[Tuple[str, int]] = []
    remaining = count

    # max_games 초과 또는 이미 선택된 플레이어 필터
    def eligible(reg: RegistrationInput) -> bool:
        if reg.user_id in already_selected:
            return False
        if session_games.get(reg.user_id, 0) >= reg.max_games:
            return False
        if reg.user_id in {r[0] for r in result}:
            return False
        return True

    # 1지망 → 2지망 → 3지망 순
    for priority_level, attr in [(1, "priority_1"), (2, "priority_2"), (3, "priority_3")]:
        if remaining <= 0:
            break

        candidates = [
            r for r in registrations
            if eligible(r) and getattr(r, attr) == target_position
        ]
        candidates.sort(key=lambda r: _sort_key(r, session_games))

        pick_count = min(remaining, len(candidates))
        for i in range(pick_count):
            result.append((candidates[i].user_id, priority_level))
            session_games[candidates[i].user_id] = session_games.get(candidates[i].user_id, 0) + 1
        remaining -= pick_count

    # 4. 강제 배정 (아무 지망에도 해당 포지션이 없지만 슬롯을 채워야 할 때)
    if remaining > 0:
        fallback = [
            r for r in registrations
            if eligible(r)
        ]
        fallback.sort(key=lambda r: _sort_key(r, session_games))

        pick_count = min(remaining, len(fallback))
        for i in range(pick_count):
            result.append((fallback[i].user_id, 0))  # priority_used=0 → 강제 배정
            session_games[fallback[i].user_id] = session_games.get(fallback[i].user_id, 0) + 1
        remaining -= pick_count

    return result
```

### `pick_by_priority` 핵심 설계 결정

| 상황 | 처리 |
|------|------|
| 1지망 후보 충분 | 1지망만으로 슬롯 채움, priority_used=1 |
| 1지망 부족 | 2지망 → 3지망 순으로 보충 |
| 3지망까지도 부족 | 지망 무관 강제 배정, priority_used=0 |
| session_games 동점 | registered_at 빠른 순 우선 |
| min_games 미달 | 최우선 선발 (sort_key의 첫 번째 키) |
| max_games 도달 | 후보에서 완전 제외 |

### 중요: session_games 업데이트 위치

`_pick_by_priority` 내부에서 `session_games[user_id] += 1`을 즉시 수행. 같은 경기의 다음 포지션 슬롯 배정 시 이미 선택된 플레이어가 중복 선택되지 않도록 `already_selected`와 `eligible()` 체크를 병행.

단, **`_pick_by_priority` 호출 시점에는 아직 실제 배정이 아닌 "이번 경기 참여" 카운트**이므로, 실패(슬롯 부족) 시 롤백이 필요하지 않음 — 부분 선발도 유효한 결과로 처리.

---

## 4. 3단계: 팀 밸런싱

### 4.1 `get_rank_score` (포지션 랭크 우선)

```python
# 기존 balancing.py의 RANK_SCORES 재사용
RANK_SCORES = {
    "Bronze": 1.0, "Silver": 2.0, "Gold": 3.0, "Platinum": 4.0,
    "Diamond": 5.0, "Master": 6.0, "Grandmaster": 7.0, "Champion": 8.0,
}

def get_rank_score(
    assigned_position: str,
    position_ranks: Dict[str, str],    # {"tank": "Diamond 3", ...}
    current_rank: Optional[str],       # fallback
) -> float:
    """
    랭크 점수 계산. 포지션별 랭크 우선, 없으면 current_rank fallback.

    변환 규칙:
      "Diamond 3" → 5.0 - (3-1)*0.1 = 4.8
      "Diamond 1" → 5.0 - (1-1)*0.1 = 5.0
      "Champion"  → 8.0 (세부 단계 없음)
      None        → 3.0 (Gold 기본값)
    """
    rank_str = position_ranks.get(assigned_position) or current_rank
    return parse_rank_score(rank_str)


def parse_rank_score(rank_str: Optional[str]) -> float:
    """기존 balancing.py의 parse_rank_score 로직 동일. 재사용 또는 import."""
    if not rank_str:
        return 3.0  # default to Gold
    parts = rank_str.strip().split()
    base_rank = parts[0]
    base_score = RANK_SCORES.get(base_rank, 3.0)
    if len(parts) > 1:
        try:
            tier = int(parts[1])
            base_score -= (tier - 1) * 0.1
        except ValueError:
            pass
    return base_score
```

**구현 노트**: `parse_rank_score`를 `balancing.py`에서 import할지, `matchmaking.py`에 복사할지는 젠슨 판단. 추천: `balancing.py`에서 import하여 단일 소스 유지.

### 4.2 `get_role_stat_score` (포지션별 스탯 점수)

```python
def get_role_stat_score(
    assigned_position: str,
    avg_stats: Dict[str, Optional[float]],
) -> float:
    """
    배정된 포지션에 따라 스탯 기반 점수 계산.
    경기 이력 없으면 0.0 반환.

    스케일: 대략 0.0 ~ 10.0 범위
    """
    kills = avg_stats.get("kills") or 0
    deaths = avg_stats.get("deaths") or 0
    assists = avg_stats.get("assists") or 0
    damage = avg_stats.get("damage_dealt") or 0
    healing = avg_stats.get("healing_done") or 0
    survivability = avg_stats.get("survivability_pct") or 0

    # 경기 이력 없음 (모든 스탯이 0 또는 None)
    if kills == 0 and deaths == 0 and damage == 0 and healing == 0:
        return 0.0

    if assigned_position == "tank":
        # 생존률 (0~1 범위, *5 → 0~5) + 딜량/1000 (0~5 수준)
        score = (survivability * 5.0) + (damage / 1000.0)
        return min(10.0, score)

    elif assigned_position == "dps":
        # KDA: (kills + assists) / max(deaths, 1) → 보통 2~6
        kda = (kills + assists) / max(deaths, 1)
        # 딜량/1000: 보통 5~15 → /2 → 2.5~7.5
        score = kda + (damage / 2000.0)
        return min(10.0, score)

    elif assigned_position == "support":
        # 힐량/1000: 보통 5~15 → /2 → 2.5~7.5
        # 어시스트/5: 보통 10~25 → 2~5
        score = (healing / 2000.0) + (assists / 5.0)
        return min(10.0, score)

    return 0.0
```

### 4.3 `compute_balance_score` (통합 점수)

```python
def compute_balance_score(
    assignment: PlayerAssignment,
    reg: RegistrationInput,
    weights: BalanceWeights,
) -> float:
    """
    밸런싱 점수 계산.

    balance_score = (rank_score * w_rank)
                  + (mmr/200 * w_mmr)
                  + (win_rate * w_win_rate)
                  + (role_stat_score * w_stat)

    스케일 비교:
      rank_score:     1.0 ~ 8.0
      mmr/200:        0.0 ~ 10.0+ (1000→5.0, 2000→10.0)
      win_rate:       0.0 ~ 1.0
      role_stat_score: 0.0 ~ 10.0
    """
    rank_score = get_rank_score(
        assignment.assigned_position,
        reg.position_ranks,
        reg.current_rank,
    )
    mmr_normalized = reg.mmr / 200.0
    role_stat = get_role_stat_score(assignment.assigned_position, reg.avg_stats)

    score = (
        rank_score * weights.rank
        + mmr_normalized * weights.mmr
        + reg.win_rate * weights.win_rate
        + role_stat * weights.stat_score
    )
    return round(score, 2)
```

### 4.4 `balance_teams` (팀 분배)

```python
# 임계값: 이 인원 이하면 완전탐색, 초과면 greedy
EXHAUSTIVE_THRESHOLD = 10


def balance_teams(
    players: List[PlayerAssignment],
    registrations: List[RegistrationInput],
    weights: BalanceWeights,
    team_size: int,
) -> Tuple[List[PlayerAssignment], List[PlayerAssignment], Dict[str, Any]]:
    """
    선발된 players (team_size*2명)를 A/B 팀으로 분배.

    전략:
    - len(players) <= EXHAUSTIVE_THRESHOLD: itertools.combinations 완전탐색
    - len(players) > EXHAUSTIVE_THRESHOLD: greedy 포지션 매칭

    Returns: (team_a, team_b, balance_summary)
    """
    reg_map = {r.user_id: r for r in registrations}

    # 각 플레이어의 balance_score 계산
    for p in players:
        reg = reg_map[p.user_id]
        p.balance_score = compute_balance_score(p, reg, weights)

    total = len(players)

    if total <= EXHAUSTIVE_THRESHOLD:
        team_a, team_b = _exhaustive_balance(players, team_size)
    else:
        team_a, team_b = _greedy_balance(players, team_size)

    # 팀 표시
    for p in team_a:
        p.team = "A"
    for p in team_b:
        p.team = "B"

    # assignment_reason 생성
    for p in team_a + team_b:
        reg = reg_map[p.user_id]
        p.assignment_reason = _build_reason(p, reg)

    # balance_summary
    score_a = sum(p.balance_score for p in team_a)
    score_b = sum(p.balance_score for p in team_b)
    summary = {
        "team_a_score": round(score_a, 1),
        "team_b_score": round(score_b, 1),
        "score_diff": round(abs(score_a - score_b), 1),
        "role_distribution": {
            "team_a": _count_positions(team_a),
            "team_b": _count_positions(team_b),
        },
    }

    return team_a, team_b, summary


def _exhaustive_balance(
    players: List[PlayerAssignment],
    team_size: int,
) -> Tuple[List[PlayerAssignment], List[PlayerAssignment]]:
    """
    완전탐색: 모든 A팀 조합을 시도하여 점수 차이 최소화.
    C(2*team_size, team_size) 조합 탐색.

    10명: C(10,5) = 252 → 즉시 완료
    """
    total = len(players)
    best_combo = None
    best_diff = float("inf")

    for combo in itertools.combinations(range(total), team_size):
        team_a_indices = set(combo)
        score_a = sum(players[i].balance_score for i in combo)
        score_b = sum(players[i].balance_score for i in range(total) if i not in team_a_indices)
        diff = abs(score_a - score_b)
        if diff < best_diff:
            best_diff = diff
            best_combo = combo

    team_a_indices = set(best_combo)
    team_a = [players[i] for i in best_combo]
    team_b = [players[i] for i in range(total) if i not in team_a_indices]
    return team_a, team_b


def _greedy_balance(
    players: List[PlayerAssignment],
    team_size: int,
) -> Tuple[List[PlayerAssignment], List[PlayerAssignment]]:
    """
    Greedy 밸런싱: 점수 높은 순으로 정렬 → 번갈아 배정 (snake draft).

    12명 이상: 완전탐색 C(12,6)=924도 가능하지만,
    14명: C(14,7)=3432, 16명: C(16,8)=12870 → 여전히 가능.
    20명+: C(20,10)=184,756 → 느려질 수 있음.

    실무적으로 내전 참가자 20명 이하가 대부분이므로,
    EXHAUSTIVE_THRESHOLD=10은 보수적. 필요시 14~16으로 올려도 됨.
    """
    sorted_players = sorted(players, key=lambda p: p.balance_score, reverse=True)
    team_a: List[PlayerAssignment] = []
    team_b: List[PlayerAssignment] = []
    score_a = 0.0
    score_b = 0.0

    for p in sorted_players:
        # 팀 사이즈 제한 체크
        if len(team_a) >= team_size:
            team_b.append(p)
            score_b += p.balance_score
        elif len(team_b) >= team_size:
            team_a.append(p)
            score_a += p.balance_score
        # 점수 낮은 팀에 배정
        elif score_a <= score_b:
            team_a.append(p)
            score_a += p.balance_score
        else:
            team_b.append(p)
            score_b += p.balance_score

    return team_a, team_b
```

---

## 5. 메인 루프: `run_matchmaking`

```python
def run_matchmaking(
    session: SessionConfig,
    registrations: List[RegistrationInput],
    weights: BalanceWeights = BalanceWeights(),
) -> Dict[str, Any]:
    """전체 매치메이킹 실행."""

    errors: List[str] = []
    session_games: Dict[str, int] = {r.user_id: 0 for r in registrations}
    games: List[Dict[str, Any]] = []
    all_priority_used: List[int] = []

    slots_per_game = session.team_size * 2  # 양팀 합산

    # 사전 검증
    errors.extend(_validate_inputs(session, registrations))

    for game_no in range(1, session.total_games + 1):
        # 1~2단계: 플레이어 선발 + 포지션 배정
        selected = _select_players_for_game(
            registrations=registrations,
            session_games=session_games,
            already_selected=set(),
            slots_per_team=session.team_size,
            session_config=session,
        )

        if len(selected) < slots_per_game:
            errors.append(
                f"Game {game_no}: {slots_per_game}명 필요하나 {len(selected)}명만 선발 가능"
            )
            if len(selected) < 2:
                continue  # 최소 2명 미만이면 경기 생성 불가

        # priority_used 수집
        all_priority_used.extend(p.priority_used for p in selected if p.priority_used > 0)

        # 3단계: 팀 밸런싱
        actual_team_size = len(selected) // 2
        team_a, team_b, summary = balance_teams(
            players=selected,
            registrations=registrations,
            weights=weights,
            team_size=actual_team_size,
        )

        game_result = {
            "game_no": game_no,
            "team_a": [_assignment_to_dict(p) for p in team_a],
            "team_b": [_assignment_to_dict(p) for p in team_b],
            "balance_summary": summary,
        }
        games.append(game_result)

    # Waitlist: 한 경기도 배정받지 못한 플레이어
    waitlist = [r.user_id for r in registrations if session_games.get(r.user_id, 0) == 0]

    # min_games 미달 경고
    for r in registrations:
        played = session_games.get(r.user_id, 0)
        if played > 0 and played < r.min_games:
            errors.append(
                f"{r.nickname}: min_games={r.min_games}이나 {played}경기만 배정"
            )

    # 통계
    game_counts = list(session_games.values())
    played_counts = [c for c in game_counts if c > 0]
    stats = {
        "avg_games_per_player": round(sum(played_counts) / max(len(played_counts), 1), 1),
        "max_games_played": max(played_counts) if played_counts else 0,
        "min_games_played": min(played_counts) if played_counts else 0,
        "avg_priority_used": round(
            sum(all_priority_used) / max(len(all_priority_used), 1), 1
        ),
        "waitlist_count": len(waitlist),
        "score_diff_avg": round(
            sum(g["balance_summary"]["score_diff"] for g in games) / max(len(games), 1), 1
        ),
    }

    return {
        "session_id": session.session_id,
        "games": games,
        "waitlist": waitlist,
        "player_game_counts": {uid: cnt for uid, cnt in session_games.items()},
        "stats": stats,
        "errors": errors,
    }
```

---

## 6. 유틸리티 함수

```python
def _find_registration(regs: List[RegistrationInput], user_id: str) -> RegistrationInput:
    for r in regs:
        if r.user_id == user_id:
            return r
    raise ValueError(f"Registration not found: {user_id}")


def _count_positions(team: List[PlayerAssignment]) -> Dict[str, int]:
    counts = {"tank": 0, "dps": 0, "support": 0}
    for p in team:
        if p.assigned_position in counts:
            counts[p.assigned_position] += 1
    return counts


def _build_reason(p: PlayerAssignment, reg: RegistrationInput) -> str:
    """배정 이유 문자열 생성."""
    pos_label = {"tank": "탱커", "dps": "딜러", "support": "서포터"}
    pos_name = pos_label.get(p.assigned_position, p.assigned_position)

    if p.priority_used == 0:
        priority_str = "강제 배정"
    else:
        priority_str = f"{p.priority_used}지망({pos_name}) 배정"

    rank_str = reg.position_ranks.get(p.assigned_position) or reg.current_rank or "Unranked"
    rank_score = parse_rank_score(rank_str)

    return (
        f"{priority_str} | "
        f"{rank_str} ({rank_score:.1f}) | "
        f"MMR {reg.mmr} | "
        f"승률 {reg.win_rate * 100:.0f}%"
    )


def _assignment_to_dict(p: PlayerAssignment) -> Dict[str, Any]:
    return {
        "user_id": p.user_id,
        "nickname": p.nickname,
        "assigned_position": p.assigned_position,
        "priority_used": p.priority_used,
        "balance_score": p.balance_score,
        "assignment_reason": p.assignment_reason,
    }
```

---

## 7. 엣지 케이스 처리

### 7.1 신청자 부족

```python
def _validate_inputs(
    session: SessionConfig,
    registrations: List[RegistrationInput],
) -> List[str]:
    """사전 검증. 경고 메시지 목록 반환 (실행은 중단하지 않음)."""
    errors = []
    slots_per_game = session.team_size * 2
    active_regs = [r for r in registrations if True]  # status 필터는 라우터에서 처리

    # 최소 인원 체크
    if len(active_regs) < slots_per_game:
        errors.append(
            f"신청자 {len(active_regs)}명 < 경기당 필요 인원 {slots_per_game}명. "
            f"일부 경기는 인원 부족으로 생성되지 않을 수 있음."
        )

    # 이상적 경기 수 대비 과다 설정 체크
    max_total_slots = sum(r.max_games for r in active_regs)
    needed_total_slots = session.total_games * slots_per_game
    if needed_total_slots > max_total_slots:
        errors.append(
            f"총 필요 슬롯 {needed_total_slots} > 가용 슬롯 합계 {max_total_slots}. "
            f"일부 플레이어가 max_games를 초과하여 배정될 수 없음."
        )

    # 포지션별 부족 체크
    for pos, count_per_team in [
        ("tank", session.tank_count),
        ("dps", session.dps_count),
        ("support", session.support_count),
    ]:
        # 해당 포지션을 1/2/3지망 중 하나라도 선택한 인원
        pos_candidates = [
            r for r in active_regs
            if r.priority_1 == pos or r.priority_2 == pos or r.priority_3 == pos
        ]
        needed = count_per_team * 2  # 양팀
        if len(pos_candidates) < needed:
            errors.append(
                f"{pos} 지망자 {len(pos_candidates)}명 < 필요 {needed}명. "
                f"일부 플레이어가 비선호 포지션에 강제 배정될 수 있음."
            )

    return errors
```

### 7.2 포지션 슬롯 못 채울 때

`_pick_by_priority`의 4단계(강제 배정)에서 처리:
- 지망과 무관하게 남은 후보 중 session_games 적은 순으로 배정
- `priority_used = 0`으로 마킹 → 프론트에서 "강제 배정" 뱃지 표시
- 그래도 인원이 부족하면 해당 슬롯은 빈 채로 진행 (경기 참여 인원 < team_size*2)

### 7.3 min_games 보장 불가

- `total_games`가 적거나 신청자가 많으면 min_games 보장이 수학적으로 불가능할 수 있음
- 정렬 키에서 min_games 미달자를 최우선으로 선발하지만, 포지션 제약으로 선발 불가 시 발생
- `run_matchmaking` 결과의 `errors` 배열에 경고 추가
- 프론트엔드에서 미리보기 화면에 경고 배너로 표시

### 7.4 동일 사용자 같은 경기 중복 배정 방지

- `already_selected` set과 `eligible()` 함수의 이중 체크
- `_pick_by_priority` 내부 `result` 목록에서도 user_id 중복 체크

---

## 8. 성능 분석

| 시나리오 | 참가자 | 경기 수 | 조합 수 | 예상 시간 |
|----------|--------|---------|---------|-----------|
| 소규모 | 10명 | 3경기 | C(10,5)=252 x3 | <10ms |
| 중규모 | 15명 | 5경기 | C(10,5)=252 x5 | <50ms |
| 대규모 | 20명 | 8경기 | C(10,5)=252 x8 | <100ms |
| 초대규모 | 30명 | 10경기 | greedy x10 | <50ms |

**참고**: 완전탐색은 **경기당 선발된 10명**에 대해서만 수행. 전체 30명이 아닌, 매 경기 선발된 `team_size*2`명에 대한 조합만 탐색. `EXHAUSTIVE_THRESHOLD=10`은 `team_size*2`와 비교.

---

## 9. 라우터에서의 호출 패턴

```python
# backend/app/routers/sessions.py 에서

@router.post("/sessions/{session_id}/matchmake")
async def matchmake(
    session_id: str,
    req: MatchmakeRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    # 1. 세션 조회 + 상태 검증
    session = await get_session_or_404(db, session_id, admin.community_id)
    if session.status not in ("open", "closed"):
        raise HTTPException(400, "매치메이킹은 open 또는 closed 상태에서만 가능")

    # 2. 신청자 목록 조회 (status=registered만)
    registrations_db = await get_active_registrations(db, session_id)

    # 3. DB → RegistrationInput 변환 (profile, position_ranks, avg_stats 조인)
    reg_inputs = await build_registration_inputs(db, registrations_db)

    # 4. 매치메이킹 실행
    config = SessionConfig(
        session_id=str(session.id),
        total_games=session.total_games,
        team_size=session.team_size,
        tank_count=session.tank_count,
        dps_count=session.dps_count,
        support_count=session.support_count,
    )
    weights = BalanceWeights(
        rank=req.rank_weight,
        mmr=req.mmr_weight,
        win_rate=req.win_rate_weight,
        stat_score=req.stat_score_weight,
    )
    result = run_matchmaking(config, reg_inputs, weights)

    # 5. MatchmakingResult에 저장 (is_confirmed=False)
    mm_result = MatchmakingResult(
        session_id=session.id,
        is_confirmed=False,
        algorithm_version="v1.0",
        summary_json=result,
    )
    db.add(mm_result)

    # 6. 세션 상태 변경
    session.status = "closed"
    await db.commit()

    # 7. MatchmakePreview 반환
    return {**result, "id": str(mm_result.id), "is_confirmed": False}
```

### `build_registration_inputs` 쿼리 전략

```python
async def build_registration_inputs(
    db: AsyncSession,
    registrations: List[SessionRegistration],
) -> List[RegistrationInput]:
    """
    DB 조인으로 RegistrationInput 구조체 생성.

    필요한 조인:
    1. users (nickname)
    2. player_profiles (current_rank, mmr, win_rate)
    3. player_position_ranks (포지션별 랭크, 현재 시즌)
    4. player_match_stats (최근 N경기 평균 스탯)

    쿼리 최적화:
    - 신청자 user_id 목록으로 IN 쿼리 (N+1 방지)
    - position_ranks: WHERE season_id IS NULL (현재 공식 랭크) 우선
    - avg_stats: 최근 10경기 평균 (부족하면 전체 평균)
    """
    # 구현은 S5에서. 여기는 인터페이스만 정의.
    pass
```

---

## 10. `balancing.py`와의 관계

| 항목 | balancing.py (Phase 1~4) | matchmaking.py (Phase 5) |
|------|--------------------------|--------------------------|
| 단위 | 경기 1개 | 세션 전체 (N경기) |
| 입력 | participants dict 리스트 | RegistrationInput dataclass |
| 포지션 배정 | 없음 (main_role 기반 분포만 확인) | 1/2/3지망 기반 명시적 배정 |
| 밸런싱 점수 | rank*0.4 + mmr*0.006 | rank*w + mmr/200*w + win_rate*w + stat*w |
| 탐색 방식 | 참가자 전체 조합 | 경기당 선발 인원(10명) 조합 |
| 팀 분배 | 완전탐색 only | 완전탐색 + greedy fallback |

**공존**: 기존 `auto_balance_teams()`는 Phase 1~4 경로에서 계속 사용. Phase 5 세션 경로에서는 `run_matchmaking()` 사용. 두 코드는 독립적으로 유지.

**공유 가능**: `parse_rank_score()`, `RANK_SCORES` dict는 양쪽에서 사용. `balancing.py`에서 import 추천.
