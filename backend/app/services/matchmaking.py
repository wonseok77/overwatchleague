"""Phase 5: 3단계 매치메이킹 알고리즘"""
import itertools
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime

from app.services.balancing import parse_rank_score, RANK_SCORES


def rank_to_estimated_mmr(rank_str: Optional[str]) -> Optional[int]:
    """랭크 문자열에서 MMR을 추정한다.

    Bronze=200, Silver=400, Gold=600, Platinum=800, Diamond=1000,
    Master=1200, Grandmaster=1400, Champion=1600.
    서브티어 반영: 티어 N → base - (N-1)*20  (예: Diamond 2 → 1000 - 20 = 980)
    """
    if not rank_str:
        return None
    parts = rank_str.strip().split()
    base_rank = parts[0]
    base_val = RANK_SCORES.get(base_rank)
    if base_val is None:
        return None
    estimated = base_val * 200
    if len(parts) > 1:
        try:
            tier = int(parts[1])
            estimated -= (tier - 1) * 20
        except ValueError:
            pass
    return estimated


@dataclass
class RegistrationInput:
    user_id: str
    nickname: str
    priority_1: str
    priority_2: Optional[str] = None
    priority_3: Optional[str] = None
    min_games: int = 1
    max_games: int = 999
    registered_at: datetime = field(default_factory=datetime.utcnow)
    current_rank: Optional[str] = None
    mmr: int = 1000
    win_rate: float = 0.0
    position_ranks: Dict[str, dict] = field(default_factory=dict)
    avg_stats: Dict[str, Optional[float]] = field(default_factory=dict)


@dataclass
class SessionConfig:
    session_id: str
    total_games: int
    team_size: int = 5
    tank_count: int = 1
    dps_count: int = 2
    support_count: int = 2


@dataclass
class BalanceWeights:
    rank: float = 0.3
    mmr: float = 0.4
    win_rate: float = 0.2
    stat_score: float = 0.1


@dataclass
class PlayerAssignment:
    user_id: str
    nickname: str
    assigned_position: str
    priority_used: int
    balance_score: float = 0.0
    assignment_reason: str = ""
    team: str = ""


EXHAUSTIVE_THRESHOLD = 10


def _sort_key(
    reg: RegistrationInput,
    session_games: Dict[str, int],
    priority_counts: Optional[Dict[str, Dict[int, int]]] = None,
    priority_level: int = 1,
) -> Tuple:
    games_played = session_games.get(reg.user_id, 0)
    min_unmet = 0 if games_played < reg.min_games else 1
    # 해당 priority_level로 배정된 횟수 (많을수록 뒤로)
    prio_count = 0
    if priority_counts:
        prio_count = priority_counts.get(reg.user_id, {}).get(priority_level, 0)
    return (min_unmet, prio_count, games_played, reg.registered_at)


def _find_registration(regs: List[RegistrationInput], user_id: str) -> RegistrationInput:
    for r in regs:
        if r.user_id == user_id:
            return r
    raise ValueError(f"Registration not found: {user_id}")


def _pick_by_priority(
    registrations: List[RegistrationInput],
    session_games: Dict[str, int],
    already_selected: set,
    target_position: str,
    count: int,
    priority_counts: Optional[Dict[str, Dict[int, int]]] = None,
) -> List[Tuple[str, int]]:
    result: List[Tuple[str, int]] = []
    remaining = count

    def eligible(reg: RegistrationInput) -> bool:
        if reg.user_id in already_selected:
            return False
        if session_games.get(reg.user_id, 0) >= reg.max_games:
            return False
        if reg.user_id in {r[0] for r in result}:
            return False
        return True

    for priority_level, attr in [(1, "priority_1"), (2, "priority_2"), (3, "priority_3")]:
        if remaining <= 0:
            break
        candidates = [
            r for r in registrations
            if eligible(r) and getattr(r, attr) == target_position
        ]
        candidates.sort(key=lambda r: _sort_key(r, session_games, priority_counts, priority_level))
        pick_count = min(remaining, len(candidates))
        for i in range(pick_count):
            result.append((candidates[i].user_id, priority_level))
            already_selected.add(candidates[i].user_id)
        remaining -= pick_count

    if remaining > 0:
        fallback = [r for r in registrations if eligible(r)]
        fallback.sort(key=lambda r: _sort_key(r, session_games, priority_counts, 0))
        pick_count = min(remaining, len(fallback))
        for i in range(pick_count):
            result.append((fallback[i].user_id, 0))
            already_selected.add(fallback[i].user_id)
        remaining -= pick_count

    return result


def _optimize_tank_selection(
    selected: List[PlayerAssignment],
    registrations: List[RegistrationInput],
    session_games: Dict[str, int],
    selected_ids: set,
) -> List[PlayerAssignment]:
    """선발된 탱커 조합의 MMR 격차를 최소화하기 위해 미선발 탱커 후보와 스왑"""
    tanks = [p for p in selected if p.assigned_position == "tank"]
    if len(tanks) < 2:
        return selected

    # 현재 탱커 MMR 격차
    tank_mmrs = [_get_position_mmr("tank", _find_registration(registrations, t.user_id)) for t in tanks]
    current_spread = max(tank_mmrs) - min(tank_mmrs)

    # 미선발 탱커 후보 (1~3지망에 tank이 있고, max_games 미달, 미선발)
    unselected_tank_candidates = []
    for r in registrations:
        if r.user_id in selected_ids:
            continue
        if session_games.get(r.user_id, 0) >= r.max_games:
            continue
        if r.priority_1 == "tank" or r.priority_2 == "tank" or r.priority_3 == "tank":
            unselected_tank_candidates.append(r)

    if not unselected_tank_candidates:
        return selected

    # 각 (선발탱커, 미선발후보) 조합으로 스왑했을 때의 격차 계산
    best_swap = None
    best_spread = current_spread

    for sel_tank in tanks:
        other_tank_mmrs = [m for t, m in zip(tanks, tank_mmrs) if t is not sel_tank]

        for cand in unselected_tank_candidates:
            cand_mmr = _get_position_mmr("tank", cand)
            new_mmrs = other_tank_mmrs + [cand_mmr]
            new_spread = max(new_mmrs) - min(new_mmrs)
            if new_spread < best_spread:
                best_spread = new_spread
                best_swap = (sel_tank, cand)

    if best_swap is None:
        return selected

    old_tank, new_cand = best_swap
    priority_used = 0
    if new_cand.priority_1 == "tank":
        priority_used = 1
    elif new_cand.priority_2 == "tank":
        priority_used = 2
    elif new_cand.priority_3 == "tank":
        priority_used = 3

    new_assignment = PlayerAssignment(
        user_id=new_cand.user_id,
        nickname=new_cand.nickname,
        assigned_position="tank",
        priority_used=priority_used,
    )

    # selected_ids 갱신
    selected_ids.discard(old_tank.user_id)
    selected_ids.add(new_cand.user_id)

    result = [p for p in selected if p is not old_tank]
    result.append(new_assignment)
    return result


def _select_players_for_game(
    registrations: List[RegistrationInput],
    session_games: Dict[str, int],
    session_config: SessionConfig,
    priority_counts: Optional[Dict[str, Dict[int, int]]] = None,
) -> List[PlayerAssignment]:
    selected: List[PlayerAssignment] = []
    selected_ids: set = set()

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
            priority_counts=priority_counts,
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

    # 탱커 MMR 격차 최적화
    selected = _optimize_tank_selection(selected, registrations, session_games, selected_ids)

    return selected


def get_rank_score(
    assigned_position: str,
    position_ranks: Dict[str, dict],
    current_rank: Optional[str],
) -> float:
    pos_info = position_ranks.get(assigned_position)
    rank_str = pos_info.get("rank") if pos_info else None
    rank_str = rank_str or current_rank
    return parse_rank_score(rank_str)


def get_role_stat_score(assigned_position: str, avg_stats: Dict[str, Optional[float]]) -> float:
    kills = avg_stats.get("kills") or 0
    deaths = avg_stats.get("deaths") or 0
    assists = avg_stats.get("assists") or 0
    damage = avg_stats.get("damage_dealt") or 0
    healing = avg_stats.get("healing_done") or 0
    survivability = avg_stats.get("survivability_pct") or 0

    if kills == 0 and deaths == 0 and damage == 0 and healing == 0:
        return 0.0

    if assigned_position == "tank":
        score = (survivability * 5.0) + (damage / 1000.0)
        return min(10.0, score)
    elif assigned_position == "dps":
        kda = (kills + assists) / max(deaths, 1)
        score = kda + (damage / 2000.0)
        return min(10.0, score)
    elif assigned_position == "support":
        score = (healing / 2000.0) + (assists / 5.0)
        return min(10.0, score)
    return 0.0


def _get_position_mmr(
    assigned_position: str,
    reg: RegistrationInput,
) -> int:
    """배정된 포지션의 MMR을 결정한다.

    우선순위:
    1. 포지션별 MMR (position_ranks[pos]["mmr"])
    2. 포지션별 rank에서 추정 (rank_to_estimated_mmr)
    3. 기존 reg.mmr (프로필 전체 MMR)
    """
    pos_info = reg.position_ranks.get(assigned_position)
    if pos_info:
        if pos_info.get("mmr") is not None:
            return pos_info["mmr"]
        rank_str = pos_info.get("rank")
        estimated = rank_to_estimated_mmr(rank_str)
        if estimated is not None:
            return estimated
    return reg.mmr


def compute_balance_score(
    assignment: PlayerAssignment,
    reg: RegistrationInput,
    weights: BalanceWeights,
) -> float:
    return float(_get_position_mmr(assignment.assigned_position, reg))


def _count_positions(team: List[PlayerAssignment]) -> Dict[str, int]:
    counts = {"tank": 0, "dps": 0, "support": 0}
    for p in team:
        if p.assigned_position in counts:
            counts[p.assigned_position] += 1
    return counts


def _is_valid_team_composition(
    team: List[PlayerAssignment],
    tank_count: int = 1,
    dps_count: int = 2,
    support_count: int = 2,
) -> bool:
    counts = _count_positions(team)
    return (
        counts["tank"] == tank_count
        and counts["dps"] == dps_count
        and counts["support"] == support_count
    )


def _build_reason(p: PlayerAssignment, reg: RegistrationInput) -> str:
    pos_label = {"tank": "탱커", "dps": "딜러", "support": "서포터"}
    pos_name = pos_label.get(p.assigned_position, p.assigned_position)

    if p.priority_used == 0:
        priority_str = "강제 배정"
    else:
        priority_str = f"{p.priority_used}지망({pos_name}) 배정"

    pos_info = reg.position_ranks.get(p.assigned_position)
    rank_str = (pos_info.get("rank") if pos_info else None) or reg.current_rank or "Unranked"
    rank_score = parse_rank_score(rank_str)
    position_mmr = _get_position_mmr(p.assigned_position, reg)

    return (
        f"{priority_str} | "
        f"{rank_str} ({rank_score:.1f}) | "
        f"MMR {position_mmr} (포지션) | "
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


def _exhaustive_balance(
    players: List[PlayerAssignment],
    team_size: int,
    tank_count: int = 1,
    dps_count: int = 2,
    support_count: int = 2,
) -> Tuple[List[PlayerAssignment], List[PlayerAssignment]]:
    total = len(players)
    best_combo = None
    best_key = (float("inf"), float("inf"))  # (탱커MMR차이, 전체점수차이)

    for combo in itertools.combinations(range(total), team_size):
        team_a_candidates = [players[i] for i in combo]
        if not _is_valid_team_composition(team_a_candidates, tank_count, dps_count, support_count):
            continue

        team_a_indices = set(combo)
        team_b_candidates = [players[i] for i in range(total) if i not in team_a_indices]

        # 탱커 MMR 차이 계산
        tank_mmr_a = sum(p.balance_score for p in team_a_candidates if p.assigned_position == "tank")
        tank_mmr_b = sum(p.balance_score for p in team_b_candidates if p.assigned_position == "tank")
        tank_diff = abs(tank_mmr_a - tank_mmr_b)

        # 전체 점수 차이
        score_a = sum(players[i].balance_score for i in combo)
        score_b = sum(players[i].balance_score for i in range(total) if i not in team_a_indices)
        total_diff = abs(score_a - score_b)

        key = (tank_diff, total_diff)
        if key < best_key:
            best_key = key
            best_combo = combo

    # 포지션 유효 조합이 없는 경우 (fallback: 점수만 비교)
    if best_combo is None:
        best_diff = float("inf")
        for combo in itertools.combinations(range(total), team_size):
            team_a_indices = set(combo)
            score_a = sum(players[i].balance_score for i in combo)
            score_b = sum(players[i].balance_score for i in range(total) if i not in team_a_indices)
            diff = abs(score_a - score_b)
            if diff < best_diff:
                best_diff = diff
                best_combo = combo

    team_a = [players[i] for i in best_combo]
    team_b = [players[i] for i in range(total) if i not in set(best_combo)]
    return team_a, team_b


def _greedy_balance(
    players: List[PlayerAssignment],
    team_size: int,
    tank_count: int = 1,
    dps_count: int = 2,
    support_count: int = 2,
) -> Tuple[List[PlayerAssignment], List[PlayerAssignment]]:
    required = {"tank": tank_count, "dps": dps_count, "support": support_count}
    slots_a = dict(required)
    slots_b = dict(required)

    # 탱커를 먼저 MMR 순 정렬 후 교차 배정
    tanks = sorted(
        [p for p in players if p.assigned_position == "tank"],
        key=lambda p: p.balance_score, reverse=True,
    )
    others = sorted(
        [p for p in players if p.assigned_position != "tank"],
        key=lambda p: p.balance_score, reverse=True,
    )

    team_a: List[PlayerAssignment] = []
    team_b: List[PlayerAssignment] = []
    score_a = 0.0
    score_b = 0.0

    # 탱커 교차 배정: 높은 MMR부터 번갈아가며 배정
    for p in tanks:
        if slots_a.get("tank", 0) <= 0:
            team_b.append(p); score_b += p.balance_score; slots_b["tank"] -= 1
        elif slots_b.get("tank", 0) <= 0:
            team_a.append(p); score_a += p.balance_score; slots_a["tank"] -= 1
        elif score_a <= score_b:
            team_a.append(p); score_a += p.balance_score; slots_a["tank"] -= 1
        else:
            team_b.append(p); score_b += p.balance_score; slots_b["tank"] -= 1

    # 나머지 포지션은 전체 점수 균형으로 배정
    for p in others:
        pos = p.assigned_position
        can_a = slots_a.get(pos, 0) > 0 and len(team_a) < team_size
        can_b = slots_b.get(pos, 0) > 0 and len(team_b) < team_size

        if can_a and can_b:
            if score_a <= score_b:
                team_a.append(p); score_a += p.balance_score; slots_a[pos] -= 1
            else:
                team_b.append(p); score_b += p.balance_score; slots_b[pos] -= 1
        elif can_a:
            team_a.append(p); score_a += p.balance_score; slots_a[pos] -= 1
        elif can_b:
            team_b.append(p); score_b += p.balance_score; slots_b[pos] -= 1
        else:
            # fallback: 빈 자리에 넣기
            if len(team_a) < team_size:
                team_a.append(p); score_a += p.balance_score
            else:
                team_b.append(p); score_b += p.balance_score

    return team_a, team_b


def balance_teams(
    players: List[PlayerAssignment],
    registrations: List[RegistrationInput],
    weights: BalanceWeights,
    team_size: int,
    tank_count: int = 1,
    dps_count: int = 2,
    support_count: int = 2,
) -> Tuple[List[PlayerAssignment], List[PlayerAssignment], Dict[str, Any]]:
    reg_map = {r.user_id: r for r in registrations}

    for p in players:
        reg = reg_map[p.user_id]
        p.balance_score = compute_balance_score(p, reg, weights)

    total = len(players)

    if total <= EXHAUSTIVE_THRESHOLD:
        team_a, team_b = _exhaustive_balance(players, team_size, tank_count, dps_count, support_count)
    else:
        team_a, team_b = _greedy_balance(players, team_size, tank_count, dps_count, support_count)

    for p in team_a:
        p.team = "A"
    for p in team_b:
        p.team = "B"

    for p in team_a + team_b:
        reg = reg_map[p.user_id]
        p.assignment_reason = _build_reason(p, reg)

    score_a = sum(p.balance_score for p in team_a)
    score_b = sum(p.balance_score for p in team_b)

    # 팀별 평균 MMR 계산
    team_a_mmrs = [_get_position_mmr(p.assigned_position, reg_map[p.user_id]) for p in team_a]
    team_b_mmrs = [_get_position_mmr(p.assigned_position, reg_map[p.user_id]) for p in team_b]
    team_a_avg_mmr = round(sum(team_a_mmrs) / len(team_a_mmrs)) if team_a_mmrs else 0
    team_b_avg_mmr = round(sum(team_b_mmrs) / len(team_b_mmrs)) if team_b_mmrs else 0

    # 탱커 MMR 차이 계산
    tank_mmr_a = sum(_get_position_mmr(p.assigned_position, reg_map[p.user_id])
                     for p in team_a if p.assigned_position == "tank")
    tank_mmr_b = sum(_get_position_mmr(p.assigned_position, reg_map[p.user_id])
                     for p in team_b if p.assigned_position == "tank")

    summary = {
        "team_a_score": round(score_a, 1),
        "team_b_score": round(score_b, 1),
        "score_diff": round(abs(score_a - score_b), 1),
        "team_a_avg_mmr": team_a_avg_mmr,
        "team_b_avg_mmr": team_b_avg_mmr,
        "mmr_diff": abs(team_a_avg_mmr - team_b_avg_mmr),
        "tank_mmr_diff": abs(tank_mmr_a - tank_mmr_b),
        "role_distribution": {
            "team_a": _count_positions(team_a),
            "team_b": _count_positions(team_b),
        },
    }

    return team_a, team_b, summary


def _validate_inputs(
    session: SessionConfig,
    registrations: List[RegistrationInput],
) -> List[str]:
    errors = []
    slots_per_game = session.team_size * 2

    if len(registrations) < slots_per_game:
        errors.append(
            f"신청자 {len(registrations)}명 < 경기당 필요 인원 {slots_per_game}명. "
            f"일부 경기는 인원 부족으로 생성되지 않을 수 있음."
        )

    max_total_slots = sum(r.max_games for r in registrations)
    needed_total_slots = session.total_games * slots_per_game
    if needed_total_slots > max_total_slots:
        errors.append(
            f"총 필요 슬롯 {needed_total_slots} > 가용 슬롯 합계 {max_total_slots}. "
            f"일부 플레이어가 max_games를 초과하여 배정될 수 없음."
        )

    for pos, count_per_team in [
        ("tank", session.tank_count),
        ("dps", session.dps_count),
        ("support", session.support_count),
    ]:
        pos_candidates = [
            r for r in registrations
            if r.priority_1 == pos or r.priority_2 == pos or r.priority_3 == pos
        ]
        needed = count_per_team * 2
        if len(pos_candidates) < needed:
            errors.append(
                f"{pos} 지망자 {len(pos_candidates)}명 < 필요 {needed}명. "
                f"일부 플레이어가 비선호 포지션에 강제 배정될 수 있음."
            )

    return errors


def run_matchmaking(
    session: SessionConfig,
    registrations: List[RegistrationInput],
    weights: BalanceWeights = BalanceWeights(),
) -> Dict[str, Any]:
    errors: List[str] = []
    session_games: Dict[str, int] = {r.user_id: 0 for r in registrations}
    priority_counts: Dict[str, Dict[int, int]] = {
        r.user_id: {1: 0, 2: 0, 3: 0, 0: 0} for r in registrations
    }
    games: List[Dict[str, Any]] = []
    all_priority_used: List[int] = []

    slots_per_game = session.team_size * 2

    errors.extend(_validate_inputs(session, registrations))

    for game_no in range(1, session.total_games + 1):
        selected = _select_players_for_game(
            registrations=registrations,
            session_games=session_games,
            session_config=session,
            priority_counts=priority_counts,
        )

        if len(selected) < slots_per_game:
            errors.append(
                f"Game {game_no}: {slots_per_game}명 필요하나 {len(selected)}명만 선발 가능"
            )
            if len(selected) < 2:
                continue

        # Update session_games and priority_counts for selected players
        for p in selected:
            session_games[p.user_id] = session_games.get(p.user_id, 0) + 1
            if p.user_id in priority_counts:
                priority_counts[p.user_id][p.priority_used] += 1

        all_priority_used.extend(p.priority_used for p in selected if p.priority_used > 0)

        actual_team_size = len(selected) // 2
        team_a, team_b, summary = balance_teams(
            players=selected,
            registrations=registrations,
            weights=weights,
            team_size=actual_team_size,
            tank_count=session.tank_count,
            dps_count=session.dps_count,
            support_count=session.support_count,
        )

        game_result = {
            "game_no": game_no,
            "team_a": [_assignment_to_dict(p) for p in team_a],
            "team_b": [_assignment_to_dict(p) for p in team_b],
            "balance_summary": summary,
        }
        games.append(game_result)

    waitlist = [r.user_id for r in registrations if session_games.get(r.user_id, 0) == 0]

    for r in registrations:
        played = session_games.get(r.user_id, 0)
        if played > 0 and played < r.min_games:
            errors.append(
                f"{r.nickname}: min_games={r.min_games}이나 {played}경기만 배정"
            )

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
        "priority_counts": priority_counts,
        "stats": stats,
        "errors": errors,
    }
