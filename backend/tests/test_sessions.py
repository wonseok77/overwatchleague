"""Phase 5: 세션 CRUD + 신청 통합 테스트"""

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


# --- Session CRUD ---

class TestSessionCRUD:
    def test_create_session(self, client, admin_token, season):
        """운영자가 세션을 생성할 수 있다"""
        resp = client.post(
            f"/seasons/{season.id}/sessions",
            json={
                "title": "2026.03.15 정기 내전",
                "scheduled_date": "2026-03-15",
                "scheduled_start": "19:00",
                "total_games": 3,
                "team_size": 5,
                "tank_count": 1,
                "dps_count": 2,
                "support_count": 2,
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["title"] == "2026.03.15 정기 내전"
        assert data["total_games"] == 3
        assert data["status"] == "open"
        assert data["team_size"] == 5

    def test_member_cannot_create_session(self, client, member_token, season):
        """일반 멤버는 세션을 생성할 수 없다"""
        resp = client.post(
            f"/seasons/{season.id}/sessions",
            json={
                "title": "Test Session",
                "scheduled_date": "2026-03-15",
                "total_games": 3,
            },
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp.status_code == 403

    def test_list_sessions(self, client, admin_token, season):
        """시즌의 세션 목록을 조회할 수 있다"""
        client.post(
            f"/seasons/{season.id}/sessions",
            json={
                "title": "Session 1",
                "scheduled_date": "2026-03-15",
                "total_games": 2,
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        resp = client.get(
            f"/seasons/{season.id}/sessions",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1

    def test_get_session_detail(self, client, admin_token, season):
        """세션 상세 정보를 조회할 수 있다"""
        create_resp = client.post(
            f"/seasons/{season.id}/sessions",
            json={
                "title": "Detail Session",
                "scheduled_date": "2026-03-16",
                "total_games": 4,
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        session_id = create_resp.json()["id"]
        resp = client.get(
            f"/sessions/{session_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["title"] == "Detail Session"

    def test_update_session(self, client, admin_token, season):
        """세션 정보를 수정할 수 있다"""
        create_resp = client.post(
            f"/seasons/{season.id}/sessions",
            json={
                "title": "Original",
                "scheduled_date": "2026-03-17",
                "total_games": 2,
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        session_id = create_resp.json()["id"]
        resp = client.patch(
            f"/sessions/{session_id}",
            json={"title": "Updated", "total_games": 5},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["title"] == "Updated"
        assert resp.json()["total_games"] == 5

    def test_delete_open_session(self, client, admin_token, season):
        """open 상태 세션을 삭제할 수 있다"""
        create_resp = client.post(
            f"/seasons/{season.id}/sessions",
            json={
                "title": "To Delete",
                "scheduled_date": "2026-03-18",
                "total_games": 1,
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        session_id = create_resp.json()["id"]
        resp = client.delete(
            f"/sessions/{session_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        # 삭제 후 조회 시 404
        resp2 = client.get(
            f"/sessions/{session_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp2.status_code == 404

    def test_member_cannot_delete_session(self, client, admin_token, member_token, season):
        """일반 멤버는 세션을 삭제할 수 없다"""
        create_resp = client.post(
            f"/seasons/{season.id}/sessions",
            json={
                "title": "No Delete",
                "scheduled_date": "2026-03-19",
                "total_games": 1,
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        session_id = create_resp.json()["id"]
        resp = client.delete(
            f"/sessions/{session_id}",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp.status_code == 403


# --- Session Registration ---

class TestSessionRegistration:
    def test_register_for_session(self, client, member_token, admin_token, season):
        """멤버가 세션에 신청할 수 있다 (1/2/3지망 + min/max)"""
        create_resp = client.post(
            f"/seasons/{season.id}/sessions",
            json={
                "title": "Registration Test",
                "scheduled_date": "2026-03-15",
                "total_games": 3,
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        session_id = create_resp.json()["id"]
        resp = client.post(
            f"/sessions/{session_id}/register",
            json={
                "priority_1": "dps",
                "priority_2": "support",
                "min_games": 1,
                "max_games": 3,
            },
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["priority_1"] == "dps"
        assert data["priority_2"] == "support"
        assert data["status"] == "registered"

    def test_duplicate_registration_blocked(self, client, member_token, admin_token, season):
        """같은 세션에 중복 신청 불가"""
        create_resp = client.post(
            f"/seasons/{season.id}/sessions",
            json={
                "title": "Dup Test",
                "scheduled_date": "2026-03-15",
                "total_games": 2,
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        session_id = create_resp.json()["id"]
        payload = {"priority_1": "tank", "min_games": 1, "max_games": 2}
        client.post(
            f"/sessions/{session_id}/register",
            json=payload,
            headers={"Authorization": f"Bearer {member_token}"},
        )
        resp2 = client.post(
            f"/sessions/{session_id}/register",
            json=payload,
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp2.status_code == 400

    def test_cancel_registration(self, client, member_token, admin_token, season):
        """세션 신청을 취소할 수 있다"""
        create_resp = client.post(
            f"/seasons/{season.id}/sessions",
            json={
                "title": "Cancel Test",
                "scheduled_date": "2026-03-15",
                "total_games": 2,
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        session_id = create_resp.json()["id"]
        client.post(
            f"/sessions/{session_id}/register",
            json={"priority_1": "support", "min_games": 1, "max_games": 2},
            headers={"Authorization": f"Bearer {member_token}"},
        )
        resp = client.delete(
            f"/sessions/{session_id}/register",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp.status_code == 200

    def test_register_closed_session_rejected(self, client, member_token, admin_token, season):
        """닫힌 세션에 신청 불가"""
        create_resp = client.post(
            f"/seasons/{season.id}/sessions",
            json={
                "title": "Closed Session",
                "scheduled_date": "2026-03-15",
                "total_games": 2,
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        session_id = create_resp.json()["id"]
        client.patch(
            f"/sessions/{session_id}",
            json={"status": "closed"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        resp = client.post(
            f"/sessions/{session_id}/register",
            json={"priority_1": "tank", "min_games": 1, "max_games": 2},
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp.status_code == 400

    def test_list_registrations_admin_only(self, client, member_token, admin_token, season):
        """운영자만 신청자 목록을 조회할 수 있다"""
        create_resp = client.post(
            f"/seasons/{season.id}/sessions",
            json={
                "title": "List Reg Test",
                "scheduled_date": "2026-03-15",
                "total_games": 3,
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        session_id = create_resp.json()["id"]
        client.post(
            f"/sessions/{session_id}/register",
            json={"priority_1": "dps", "min_games": 1, "max_games": 3},
            headers={"Authorization": f"Bearer {member_token}"},
        )
        resp = client.get(
            f"/sessions/{session_id}/registrations",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    def test_admin_can_modify_registration(self, client, member_token, admin_token, member_user, season):
        """운영자가 신청 정보를 수정할 수 있다"""
        create_resp = client.post(
            f"/seasons/{season.id}/sessions",
            json={
                "title": "Mod Reg Test",
                "scheduled_date": "2026-03-15",
                "total_games": 3,
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        session_id = create_resp.json()["id"]
        client.post(
            f"/sessions/{session_id}/register",
            json={"priority_1": "dps", "min_games": 1, "max_games": 3},
            headers={"Authorization": f"Bearer {member_token}"},
        )
        resp = client.patch(
            f"/sessions/{session_id}/registrations/{member_user.id}",
            json={"priority_1": "tank", "min_games": 2, "max_games": 3},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["priority_1"] == "tank"
