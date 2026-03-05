"""팀 밸런싱 알고리즘 단위 테스트"""

import pytest

from app.services.balancing import (
    parse_rank_score,
    compute_player_score,
    auto_balance_teams,
    calculate_mmr_change,
    _team_score,
    _role_distribution,
)


# --- parse_rank_score ---

class TestParseRankScore:
    def test_gold_base(self):
        assert parse_rank_score("Gold") == 3.0

    def test_diamond_3(self):
        assert parse_rank_score("Diamond 3") == pytest.approx(4.8)

    def test_diamond_1(self):
        assert parse_rank_score("Diamond 1") == pytest.approx(5.0)

    def test_bronze_5(self):
        assert parse_rank_score("Bronze 5") == pytest.approx(0.6)

    def test_grandmaster(self):
        assert parse_rank_score("Grandmaster") == 7.0

    def test_champion(self):
        assert parse_rank_score("Champion") == 7.0

    def test_none_returns_default(self):
        assert parse_rank_score(None) == 3.0

    def test_empty_string_returns_default(self):
        assert parse_rank_score("") == 3.0

    def test_unknown_rank_returns_default(self):
        assert parse_rank_score("UnknownRank") == 3.0

    def test_rank_with_invalid_tier(self):
        assert parse_rank_score("Gold abc") == 3.0


# --- compute_player_score ---

class TestComputePlayerScore:
    def test_gold_1000mmr(self):
        score = compute_player_score("Gold", 1000)
        # 3.0 * 0.4 + 1000 * 0.006 = 1.2 + 6.0 = 7.2
        assert score == pytest.approx(7.2)

    def test_diamond_1_1500mmr(self):
        score = compute_player_score("Diamond 1", 1500)
        # 5.0 * 0.4 + 1500 * 0.006 = 2.0 + 9.0 = 11.0
        assert score == pytest.approx(11.0)

    def test_none_rank_default_mmr(self):
        score = compute_player_score(None, 1000)
        # 3.0 * 0.4 + 1000 * 0.006 = 1.2 + 6.0 = 7.2
        assert score == pytest.approx(7.2)


# --- _role_distribution ---

class TestRoleDistribution:
    def test_standard_5v5(self):
        team = [
            {"main_role": "tank"},
            {"main_role": "dps"},
            {"main_role": "dps"},
            {"main_role": "support"},
            {"main_role": "support"},
        ]
        dist = _role_distribution(team)
        assert dist == {"tank": 1, "dps": 2, "support": 2}

    def test_missing_role_defaults_to_dps(self):
        team = [{"main_role": "tank"}, {"other_key": "value"}]
        dist = _role_distribution(team)
        assert dist == {"tank": 1, "dps": 1, "support": 0}


# --- auto_balance_teams ---

class TestAutoBalanceTeams:
    def _make_player(self, user_id, role, rank, mmr):
        return {
            "user_id": user_id,
            "main_role": role,
            "current_rank": rank,
            "mmr": mmr,
        }

    def test_standard_10_players(self):
        """10명 표준 케이스: 5v5로 분배, balance_reason 포함"""
        players = [
            self._make_player(f"p{i}", "dps", "Gold", 1000 + i * 50)
            for i in range(10)
        ]
        result = auto_balance_teams(players)

        assert len(result["team_a"]) == 5
        assert len(result["team_b"]) == 5
        assert "balance_reason" in result
        assert "team_a_score" in result["balance_reason"]
        assert "team_b_score" in result["balance_reason"]
        assert "score_diff" in result["balance_reason"]
        assert "role_distribution" in result["balance_reason"]

    def test_score_diff_minimized(self):
        """밸런싱 후 팀 점수 차이가 최소화되는지 확인"""
        players = [
            self._make_player("p0", "tank", "Diamond 1", 1500),
            self._make_player("p1", "dps", "Gold", 900),
            self._make_player("p2", "support", "Platinum", 1100),
            self._make_player("p3", "dps", "Silver", 800),
            self._make_player("p4", "support", "Gold", 1000),
            self._make_player("p5", "tank", "Gold", 1000),
            self._make_player("p6", "dps", "Diamond 3", 1300),
            self._make_player("p7", "support", "Gold", 950),
            self._make_player("p8", "dps", "Platinum", 1050),
            self._make_player("p9", "support", "Silver", 850),
        ]
        result = auto_balance_teams(players)
        diff = result["balance_reason"]["score_diff"]
        assert diff < 3.0  # 점수 차이가 합리적 범위 이내

    def test_fewer_than_10_players(self):
        """10명 미만 (6명 -> 3v3)"""
        players = [
            self._make_player(f"p{i}", "dps", "Gold", 1000)
            for i in range(6)
        ]
        result = auto_balance_teams(players)
        assert len(result["team_a"]) == 3
        assert len(result["team_b"]) == 3

    def test_odd_number_players(self):
        """홀수 인원 (7명 -> 3v4)"""
        players = [
            self._make_player(f"p{i}", "dps", "Gold", 1000)
            for i in range(7)
        ]
        result = auto_balance_teams(players)
        total = len(result["team_a"]) + len(result["team_b"])
        assert total == 7
        assert abs(len(result["team_a"]) - len(result["team_b"])) <= 1

    def test_minimum_2_players(self):
        """최소 인원 (2명 -> 1v1)"""
        players = [
            self._make_player("p0", "dps", "Gold", 1000),
            self._make_player("p1", "support", "Gold", 1000),
        ]
        result = auto_balance_teams(players)
        assert len(result["team_a"]) == 1
        assert len(result["team_b"]) == 1

    def test_all_same_mmr(self):
        """전원 동일 MMR -> 점수 차이 0에 근접"""
        players = [
            self._make_player(f"p{i}", "dps", "Gold", 1000)
            for i in range(10)
        ]
        result = auto_balance_teams(players)
        assert result["balance_reason"]["score_diff"] == pytest.approx(0.0, abs=0.1)

    def test_extreme_mmr_gap(self):
        """극단적 MMR 편차 (한 명만 2000, 나머지 800)"""
        players = [self._make_player("p0", "dps", "Grandmaster", 2000)]
        for i in range(1, 10):
            players.append(self._make_player(f"p{i}", "dps", "Silver", 800))
        result = auto_balance_teams(players)
        # 높은 MMR 플레이어가 한 팀에만 있으므로 차이가 존재하나 최소화됨
        assert result["balance_reason"]["score_diff"] < 10.0

    def test_no_tank_players(self):
        """탱커 0명 -> 알고리즘은 에러 없이 구성 완료"""
        players = [
            self._make_player(f"p{i}", "dps" if i < 6 else "support", "Gold", 1000)
            for i in range(10)
        ]
        result = auto_balance_teams(players)
        assert len(result["team_a"]) == 5
        assert len(result["team_b"]) == 5
        dist_a = result["balance_reason"]["role_distribution"]["team_a"]
        assert dist_a["tank"] == 0

    def test_balance_reason_structure(self):
        """balance_reason 출력 구조 검증"""
        players = [
            self._make_player(f"p{i}", ["tank", "dps", "dps", "support", "support"][i % 5], "Gold", 1000)
            for i in range(10)
        ]
        result = auto_balance_teams(players)
        reason = result["balance_reason"]
        assert isinstance(reason["team_a_score"], float)
        assert isinstance(reason["team_b_score"], float)
        assert isinstance(reason["score_diff"], float)
        for team_key in ("team_a", "team_b"):
            dist = reason["role_distribution"][team_key]
            assert "tank" in dist
            assert "dps" in dist
            assert "support" in dist


# --- calculate_mmr_change ---

class TestCalculateMmrChange:
    def test_win_equal_teams(self):
        """승리 + 동일 팀 점수 -> 기본 +20"""
        change = calculate_mmr_change(True, 50.0, 50.0)
        assert change == 20

    def test_loss_equal_teams(self):
        """패배 + 동일 팀 점수 -> 기본 -20"""
        change = calculate_mmr_change(False, 50.0, 50.0)
        assert change == -20

    def test_win_vs_stronger_opponent(self):
        """승리 + 상대가 더 강함 -> 보너스"""
        change = calculate_mmr_change(True, 40.0, 50.0)
        assert change > 20
        assert change <= 30

    def test_loss_vs_weaker_opponent(self):
        """패배 + 상대가 더 약함 -> 추가 페널티"""
        change = calculate_mmr_change(False, 50.0, 40.0)
        assert change < -20
        assert change >= -30

    def test_win_bonus_cap(self):
        """승리 보너스 상한 30"""
        change = calculate_mmr_change(True, 10.0, 100.0)
        assert change <= 30

    def test_loss_penalty_floor(self):
        """패배 페널티 하한 -30"""
        change = calculate_mmr_change(False, 100.0, 10.0)
        assert change >= -30

    def test_win_vs_weaker_no_bonus(self):
        """승리 + 상대가 약함 -> 기본 +20 (보너스 0)"""
        change = calculate_mmr_change(True, 60.0, 40.0)
        assert change == 20

    def test_loss_vs_stronger_no_extra_penalty(self):
        """패배 + 상대가 강함 -> 기본 -20 (추가 페널티 0)"""
        change = calculate_mmr_change(False, 40.0, 60.0)
        assert change == -20
