"""MMR calculation service"""
from typing import Optional

# 기본 티어별 MMR 기준값
RANK_BASE_MMR = {
    "Bronze": 1000,
    "Silver": 1500,
    "Gold": 2000,
    "Platinum": 2500,
    "Diamond": 3000,
    "Master": 3500,
    "Grandmaster": 4000,
    "Champion": 4500,
}

# MMR 변동 상수
BASE_MMR_CHANGE = 25
MAX_STAT_BONUS = 10


def rank_to_mmr(rank_str: Optional[str]) -> int:
    """랭크 문자열을 MMR 값으로 변환.
    예: "Diamond 3" -> 3200, "Champion" -> 4500
    """
    if not rank_str:
        return 2000  # 기본값: Gold 5

    parts = rank_str.strip().split()
    base_rank = parts[0]
    base_mmr = RANK_BASE_MMR.get(base_rank, 2000)

    if base_rank == "Champion":
        return 4500

    if len(parts) > 1:
        try:
            tier = int(parts[1])  # 5=가장 낮음, 1=가장 높음
            return base_mmr + (5 - tier) * 100
        except ValueError:
            pass

    return base_mmr


def mmr_to_rank(mmr: int) -> str:
    """MMR 값을 랭크 문자열로 변환.
    예: 3200 -> "Diamond 3", 4500 -> "Champion"
    """
    if mmr >= 4500:
        return "Champion"

    tiers = [
        (4000, "Grandmaster"),
        (3500, "Master"),
        (3000, "Diamond"),
        (2500, "Platinum"),
        (2000, "Gold"),
        (1500, "Silver"),
        (1000, "Bronze"),
    ]

    for base, name in tiers:
        if mmr >= base:
            sub_tier = 5 - (mmr - base) // 100
            sub_tier = max(1, min(5, sub_tier))
            return f"{name} {sub_tier}"

    return "Bronze 5"


def calculate_mmr_change(
    winner: bool,
    stat_bonus: float = 0.0,
) -> int:
    """경기 결과에 따른 MMR 변동 계산.

    Args:
        winner: 승리 여부
        stat_bonus: 스탯 보너스 (-1.0 ~ 1.0 범위, 퍼포먼스 기반)

    Returns:
        MMR 변동값 (양수=증가, 음수=감소)
    """
    base = BASE_MMR_CHANGE if winner else -BASE_MMR_CHANGE
    bonus = int(stat_bonus * MAX_STAT_BONUS)
    return base + bonus
