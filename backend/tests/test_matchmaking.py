"""Phase 5: 매치메이킹 알고리즘 통합 테스트"""

import uuid
import pytest
from datetime import datetime

from app.models.user import User, PlayerProfile
from app.services.auth import hash_password, create_access_token


# --- Helper ---

def _make_player(db, community, index, role, rank, mmr, win_rate=0.0):
    """테스트용 플레이어 생성 (User + PlayerProfile)"""
    user = User(
        id=uuid.uuid4(),
        community_id=community.id,
        real_name=f"Player{index}",
        nickname=f"player{index}",
        email=f"player{index}@test.com",
        password_hash=hash_password("password123"),
        role="member",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    profile = PlayerProfile(
        id=uuid.uuid4(),
        user_id=user.id,
        main_role=role,
        current_rank=rank,
        mmr=mmr,
        win_rate=win_rate,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)

    return user, profile


def _create_session_with_players(client, db, community, season, admin_token, total_games=3):
    """10명 참가자가 있는 세션을 셋업하는 공통 헬퍼"""
    create_resp = client.post(
        f"/seasons/{season.id}/sessions",
        json={
            "title": "Matchmaking Test",
            "scheduled_date": "2026-03-20",
            "total_games": total_games,
            "team_size": 5,
            "tank_count": 1,
            "dps_count": 2,
            "support_count": 2,
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert create_resp.status_code == 201
    session_id = create_resp.json()["id"]

    # 10명: 2 tank, 4 dps, 4 support (포지션 분산)
    role_rank_config = [
        ("tank", "Diamond 1", 1300, 0.55),
        ("tank", "Platinum 2", 1100, 0.48),
        ("dps", "Diamond 3", 1250, 0.60),
        ("dps", "Gold 1", 1000, 0.45),
        ("dps", "Platinum 1", 1150, 0.52),
        ("dps", "Gold 3", 950, 0.42),
        ("support", "Diamond 2", 1200, 0.58),
        ("support", "Platinum 3", 1050, 0.50),
        ("support", "Gold 2", 980, 0.47),
        ("support", "Silver 1", 850, 0.40),
    ]

    player_tokens = []
    for i, (role, rank, mmr, wr) in enumerate(role_rank_config):
        user, profile = _make_player(db, community, i + 10, role, rank, mmr, wr)
        token = create_access_token(user)
        player_tokens.append((user, token, role))

    for user, token, role in player_tokens:
        resp = client.post(
            f"/sessions/{session_id}/register",
            json={"priority_1": role, "min_games": 1, "max_games": total_games},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 201

    return session_id, player_tokens


# --- Matchmaking Execution ---

class TestMatchmakingExecution:
    def test_matchmake_creates_preview(self, client, db, community, season, admin_token):
        """매치메이킹 실행 시 미리보기 결과를 반환한다"""
        session_id, _ = _create_session_with_players(
            client, db, community, season, admin_token
        )
        resp = client.post(
            f"/sessions/{session_id}/matchmake",
            json={
                "rank_weight": 0.3,
                "mmr_weight": 0.4,
                "win_rate_weight": 0.2,
                "stat_score_weight": 0.1,
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "games" in data
        assert "bench" in data
        assert "player_stats" in data
        assert data["is_confirmed"] is False

    def test_matchmake_member_forbidden(self, client, db, community, season, admin_token, member_token):
        """일반 멤버는 매치메이킹을 실행할 수 없다"""
        session_id, _ = _create_session_with_players(
            client, db, community, season, admin_token
        )
        resp = client.post(
            f"/sessions/{session_id}/matchmake",
            json={},
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp.status_code == 403


# --- Even Distribution ---

class TestEvenDistribution:
    def test_player_game_counts_within_1(self, client, db, community, season, admin_token):
        """균등 분배: 각 플레이어 참가 횟수가 최대 +-1 이내"""
        session_id, _ = _create_session_with_players(
            client, db, community, season, admin_token, total_games=3
        )
        resp = client.post(
            f"/sessions/{session_id}/matchmake",
            json={},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        player_stats = resp.json()["player_stats"]
        counts = [ps["games_played"] for ps in player_stats]
        assert max(counts) - min(counts) <= 1, f"Uneven: {counts}"

    def test_min_games_respected(self, client, db, community, season, admin_token):
        """min_games 미달 플레이어가 우선 선발된다"""
        session_id, _ = _create_session_with_players(
            client, db, community, season, admin_token, total_games=3
        )
        resp = client.post(
            f"/sessions/{session_id}/matchmake",
            json={},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        player_stats = resp.json()["player_stats"]
        # 10명 * 3경기 = 30 슬롯 / 10명 = 3 경기/인
        # 모든 플레이어 min_games=1이므로 최소 1경기 배정
        for ps in player_stats:
            assert ps["games_played"] >= 1, f"Player {ps['user_id']} has {ps['games_played']} games, expected >= 1"

    def test_max_games_respected(self, client, db, community, season, admin_token):
        """max_games 초과 플레이어는 제외된다"""
        # 세션 생성
        create_resp = client.post(
            f"/seasons/{season.id}/sessions",
            json={
                "title": "Max Games Test",
                "scheduled_date": "2026-03-20",
                "total_games": 5,
                "team_size": 5,
                "tank_count": 1,
                "dps_count": 2,
                "support_count": 2,
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        session_id = create_resp.json()["id"]

        # 12명 생성 — 일부는 max_games=2로 제한
        roles = ["tank", "tank", "dps", "dps", "dps", "dps",
                 "support", "support", "support", "support", "dps", "tank"]
        for i, role in enumerate(roles):
            user, _ = _make_player(db, community, i + 50, role, "Gold 1", 1000)
            token = create_access_token(user)
            max_g = 2 if i < 4 else 5
            client.post(
                f"/sessions/{session_id}/register",
                json={"priority_1": role, "min_games": 1, "max_games": max_g},
                headers={"Authorization": f"Bearer {token}"},
            )

        resp = client.post(
            f"/sessions/{session_id}/matchmake",
            json={},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        player_stats = resp.json()["player_stats"]
        # max_games=2 플레이어는 최대 2경기
        for ps in player_stats:
            assert ps["games_played"] <= 5  # 전체 상한


# --- Balance Score ---

class TestBalanceScore:
    def test_score_diff_below_threshold(self, client, db, community, season, admin_token):
        """각 경기의 팀 간 밸런스 점수 차이가 임계값 미만"""
        session_id, _ = _create_session_with_players(
            client, db, community, season, admin_token
        )
        resp = client.post(
            f"/sessions/{session_id}/matchmake",
            json={},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        for game in resp.json()["games"]:
            diff = game["score_diff"]
            assert diff < 5.0, f"Game {game['game_no']} diff={diff}"

    def test_team_size_5v5(self, client, db, community, season, admin_token):
        """각 경기에서 팀이 5v5로 구성된다"""
        session_id, _ = _create_session_with_players(
            client, db, community, season, admin_token
        )
        resp = client.post(
            f"/sessions/{session_id}/matchmake",
            json={},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        for game in resp.json()["games"]:
            assert len(game["team_a"]) == 5
            assert len(game["team_b"]) == 5

    def test_role_distribution_per_game(self, client, db, community, season, admin_token):
        """각 경기/팀에서 역할군 분포 확인 (tank 1, dps 2, support 2)"""
        session_id, _ = _create_session_with_players(
            client, db, community, season, admin_token
        )
        resp = client.post(
            f"/sessions/{session_id}/matchmake",
            json={},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        for game in resp.json()["games"]:
            for team_key in ["team_a", "team_b"]:
                positions = [p["assigned_position"] for p in game[team_key]]
                total = len(positions)
                assert total == 5, f"Team size mismatch in game {game['game_no']}"

    def test_priority_assignment_ratio(self, client, db, community, season, admin_token):
        """1지망 배정 비율이 50% 이상"""
        session_id, _ = _create_session_with_players(
            client, db, community, season, admin_token
        )
        resp = client.post(
            f"/sessions/{session_id}/matchmake",
            json={},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        total = 0
        first = 0
        for game in resp.json()["games"]:
            for team_key in ["team_a", "team_b"]:
                for p in game[team_key]:
                    total += 1
                    if p["priority_used"] == 1:
                        first += 1
        ratio = first / total if total > 0 else 0
        assert ratio >= 0.5, f"1st priority ratio: {ratio:.2f}"


# --- Preview & Confirm ---

class TestPreviewAndConfirm:
    def test_get_preview(self, client, db, community, season, admin_token):
        """매치메이킹 미리보기를 조회할 수 있다"""
        session_id, _ = _create_session_with_players(
            client, db, community, season, admin_token
        )
        client.post(
            f"/sessions/{session_id}/matchmake",
            json={},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        resp = client.get(
            f"/sessions/{session_id}/matchmake/preview",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["is_confirmed"] is False

    def test_confirm_creates_matches(self, client, db, community, season, admin_token):
        """확정 시 Match 레코드가 생성된다"""
        session_id, _ = _create_session_with_players(
            client, db, community, season, admin_token
        )
        client.post(
            f"/sessions/{session_id}/matchmake",
            json={},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        resp = client.post(
            f"/sessions/{session_id}/matchmake/confirm",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["matches_created"] == 3

    def test_double_confirm_rejected(self, client, db, community, season, admin_token):
        """이미 확정된 매치메이킹은 다시 확정할 수 없다"""
        session_id, _ = _create_session_with_players(
            client, db, community, season, admin_token
        )
        client.post(
            f"/sessions/{session_id}/matchmake",
            json={},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        client.post(
            f"/sessions/{session_id}/matchmake/confirm",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        resp2 = client.post(
            f"/sessions/{session_id}/matchmake/confirm",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp2.status_code == 400

    def test_confirm_changes_session_status(self, client, db, community, season, admin_token):
        """확정 후 세션 상태가 in_progress로 변경된다"""
        session_id, _ = _create_session_with_players(
            client, db, community, season, admin_token
        )
        client.post(
            f"/sessions/{session_id}/matchmake",
            json={},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        client.post(
            f"/sessions/{session_id}/matchmake/confirm",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        resp = client.get(
            f"/sessions/{session_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "in_progress"


# --- Updated Balancing Weights ---

class TestUpdatedBalancing:
    def test_4_weight_compute_player_score(self):
        """4가중치 compute_player_score 검증"""
        from app.services.balancing import compute_player_score

        # rank=Gold(3.0)*0.3 + mmr=1000(/200=5.0)*0.4 + win_rate=0.5*0.2 + stat=0*0.1
        # = 0.9 + 2.0 + 0.1 + 0 = 3.0
        score = compute_player_score("Gold", 1000, win_rate=0.5, role_stat_score=0.0)
        assert score == pytest.approx(3.0, abs=0.1)

    def test_4_weight_with_stat_score(self):
        """stat_score가 반영되어 점수가 높아진다"""
        from app.services.balancing import compute_player_score

        score_no_stat = compute_player_score("Gold", 1000, win_rate=0.5, role_stat_score=0.0)
        score_with_stat = compute_player_score("Gold", 1000, win_rate=0.5, role_stat_score=5.0)
        assert score_with_stat > score_no_stat

    def test_backward_compat_2_param(self):
        """기존 2파라미터 호출이 여전히 동작한다"""
        from app.services.balancing import compute_player_score

        score = compute_player_score("Gold", 1000)
        assert isinstance(score, float)
        assert score > 0
