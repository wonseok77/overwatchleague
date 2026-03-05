import itertools
from typing import List, Dict, Any, Optional

RANK_SCORES = {
    "Bronze": 1,
    "Silver": 2,
    "Gold": 3,
    "Platinum": 4,
    "Diamond": 5,
    "Master": 6,
    "Grandmaster": 7,
    "Champion": 8,
}

ROLE_TARGET = {"tank": 1, "dps": 2, "support": 2}


def parse_rank_score(rank_str: Optional[str]) -> float:
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


def compute_player_score(rank_str: Optional[str], mmr: int) -> float:
    rank_score = parse_rank_score(rank_str)
    return rank_score * 0.4 + mmr * 0.006


def _team_score(team: List[Dict[str, Any]]) -> float:
    return sum(compute_player_score(p.get("current_rank"), p.get("mmr", 1000)) for p in team)


def _role_distribution(team: List[Dict[str, Any]]) -> Dict[str, int]:
    dist = {"tank": 0, "dps": 0, "support": 0}
    for p in team:
        role = p.get("main_role", "dps")
        if role in dist:
            dist[role] += 1
    return dist


def auto_balance_teams(participants: List[Dict[str, Any]], team_size: int = 5) -> Dict[str, Any]:
    total = len(participants)
    if total < team_size * 2:
        half = total // 2
        team_size_a = half
        team_size_b = total - half
    else:
        team_size_a = team_size
        team_size_b = team_size

    best_team_a = None
    best_score_diff = float("inf")

    for combo in itertools.combinations(range(total), team_size_a):
        team_a = [participants[i] for i in combo]
        team_b = [participants[i] for i in range(total) if i not in combo]
        if len(team_b) != team_size_b:
            team_b = team_b[:team_size_b]

        score_a = _team_score(team_a)
        score_b = _team_score(team_b)
        diff = abs(score_a - score_b)

        if diff < best_score_diff:
            best_score_diff = diff
            best_team_a = combo

    team_a = [participants[i] for i in best_team_a]
    team_b = [participants[i] for i in range(total) if i not in best_team_a]
    if len(team_b) > team_size_b:
        team_b = team_b[:team_size_b]

    score_a = _team_score(team_a)
    score_b = _team_score(team_b)

    return {
        "team_a": team_a,
        "team_b": team_b,
        "balance_reason": {
            "team_a_score": round(score_a, 1),
            "team_b_score": round(score_b, 1),
            "score_diff": round(abs(score_a - score_b), 1),
            "role_distribution": {
                "team_a": _role_distribution(team_a),
                "team_b": _role_distribution(team_b),
            },
        },
    }


def calculate_mmr_change(winner: bool, team_score: float, opponent_score: float) -> int:
    if winner:
        bonus = max(0, (opponent_score - team_score)) * 2
        return min(30, int(20 + bonus))
    else:
        penalty = max(0, (team_score - opponent_score)) * 2
        return max(-30, int(-20 - penalty))
