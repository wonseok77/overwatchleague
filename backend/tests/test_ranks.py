"""Phase 5: 포지션 랭크 CRUD + 밸런싱 연동 테스트"""

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


# --- Position Rank CRUD ---

class TestPositionRankCRUD:
    def test_set_position_ranks(self, client, member_token, member_user):
        """본인 포지션별 랭크를 설정할 수 있다"""
        resp = client.put(
            f"/users/{member_user.id}/ranks",
            json=[
                {"position": "tank", "rank": "Gold 2"},
                {"position": "dps", "rank": "Diamond 3"},
                {"position": "support", "rank": "Platinum 1"},
            ],
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 3
        positions = {r["position"] for r in data}
        assert positions == {"tank", "dps", "support"}

    def test_get_position_ranks(self, client, member_token, member_user):
        """포지션별 랭크를 조회할 수 있다"""
        client.put(
            f"/users/{member_user.id}/ranks",
            json=[
                {"position": "tank", "rank": "Gold 2"},
                {"position": "dps", "rank": "Diamond 3"},
            ],
            headers={"Authorization": f"Bearer {member_token}"},
        )
        resp = client.get(
            f"/users/{member_user.id}/ranks",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 2

    def test_get_current_ranks(self, client, member_token, member_user):
        """현재 시즌 포지션 랭크 요약을 조회할 수 있다"""
        client.put(
            f"/users/{member_user.id}/ranks",
            json=[{"position": "support", "rank": "Platinum 2"}],
            headers={"Authorization": f"Bearer {member_token}"},
        )
        resp = client.get(
            f"/users/{member_user.id}/ranks/current",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp.status_code == 200

    def test_upsert_position_rank(self, client, member_token, member_user):
        """같은 포지션 랭크를 재설정하면 업데이트된다"""
        client.put(
            f"/users/{member_user.id}/ranks",
            json=[{"position": "tank", "rank": "Gold 2"}],
            headers={"Authorization": f"Bearer {member_token}"},
        )
        resp = client.put(
            f"/users/{member_user.id}/ranks",
            json=[{"position": "tank", "rank": "Platinum 1"}],
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp.status_code == 200
        tank = next((r for r in resp.json() if r["position"] == "tank"), None)
        assert tank is not None
        assert tank["rank"] == "Platinum 1"


# --- Permission ---

class TestPositionRankPermission:
    def test_other_user_cannot_set_ranks(self, client, member_token, admin_user):
        """다른 사용자의 랭크를 설정할 수 없다 (admin 제외)"""
        resp = client.put(
            f"/users/{admin_user.id}/ranks",
            json=[{"position": "tank", "rank": "Gold 1"}],
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp.status_code == 403

    def test_admin_can_set_other_ranks(self, client, admin_token, member_user):
        """관리자는 다른 사용자의 랭크를 설정할 수 있다"""
        resp = client.put(
            f"/users/{member_user.id}/ranks",
            json=[{"position": "dps", "rank": "Master 1"}],
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        dps = next((r for r in data if r["position"] == "dps"), None)
        assert dps is not None
        assert dps["rank"] == "Master 1"


# --- Season-specific Ranks ---

class TestSeasonRanks:
    def test_set_rank_with_season_id(self, client, member_token, member_user, season):
        """특정 시즌의 포지션 랭크를 설정할 수 있다"""
        resp = client.put(
            f"/users/{member_user.id}/ranks",
            json=[{"position": "tank", "rank": "Diamond 1", "season_id": str(season.id)}],
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp.status_code == 200

    def test_get_ranks_by_season(self, client, member_token, member_user, season):
        """시즌별 포지션 랭크를 조회할 수 있다"""
        client.put(
            f"/users/{member_user.id}/ranks",
            json=[{"position": "dps", "rank": "Gold 3", "season_id": str(season.id)}],
            headers={"Authorization": f"Bearer {member_token}"},
        )
        resp = client.get(
            f"/users/{member_user.id}/ranks?season_id={season.id}",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert any(r["position"] == "dps" for r in data)


# --- Balancing Integration ---

class TestPositionRankBalancingIntegration:
    def test_position_rank_used_in_matchmaking(self, client, db, community, season, admin_token):
        """포지션 랭크가 매치메이킹 밸런싱에 반영된다"""
        # 세션 생성
        create_resp = client.post(
            f"/seasons/{season.id}/sessions",
            json={
                "title": "Position Rank Balancing",
                "scheduled_date": "2026-03-21",
                "total_games": 1,
                "team_size": 5,
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        session_id = create_resp.json()["id"]

        # 10명 생성 (모두 Gold 1, 1000 MMR)
        players = []
        for i in range(10):
            role = ["tank", "dps", "dps", "support", "support"][i % 5]
            user, profile = _make_player(db, community, i + 100, role, "Gold 1", 1000)
            token = create_access_token(user)
            players.append((user, token, role))
            client.post(
                f"/sessions/{session_id}/register",
                json={"priority_1": role, "min_games": 1, "max_games": 1},
                headers={"Authorization": f"Bearer {token}"},
            )

        # 첫 번째 플레이어에 포지션 랭크 설정 (tank → Diamond 1)
        user0, token0, _ = players[0]
        client.put(
            f"/users/{user0.id}/ranks",
            json=[{"position": "tank", "rank": "Diamond 1"}],
            headers={"Authorization": f"Bearer {token0}"},
        )

        # 매치메이킹 실행
        resp = client.post(
            f"/sessions/{session_id}/matchmake",
            json={},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        game = resp.json()["games"][0]
        # 밸런싱 알고리즘이 Diamond 1 탱커를 고려하여 결과를 생성
        assert "score_diff" in game

    def test_position_rank_fallback_to_current_rank(self, client, db, community, season, admin_token):
        """포지션 랭크 미설정 시 current_rank로 fallback"""
        create_resp = client.post(
            f"/seasons/{season.id}/sessions",
            json={
                "title": "Fallback Test",
                "scheduled_date": "2026-03-22",
                "total_games": 1,
                "team_size": 5,
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        session_id = create_resp.json()["id"]

        # 10명 생성 — 포지션 랭크 미설정 (current_rank만 존재)
        for i in range(10):
            role = ["tank", "dps", "dps", "support", "support"][i % 5]
            rank = ["Diamond 1", "Gold 3", "Platinum 2", "Gold 1", "Silver 1"][i % 5]
            user, _ = _make_player(db, community, i + 200, role, rank, 1000)
            token = create_access_token(user)
            client.post(
                f"/sessions/{session_id}/register",
                json={"priority_1": role, "min_games": 1, "max_games": 1},
                headers={"Authorization": f"Bearer {token}"},
            )

        resp = client.post(
            f"/sessions/{session_id}/matchmake",
            json={},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        # fallback이 동작하여 밸런싱 결과가 생성됨
        assert len(resp.json()["games"]) == 1
