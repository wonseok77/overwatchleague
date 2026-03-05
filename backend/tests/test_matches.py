"""참가 신청/취소/대기자 승격 플로우 테스트"""

import uuid
import pytest
from app.models.user import User, PlayerProfile
from app.models.match import MatchParticipant
from app.services.auth import hash_password, create_access_token


def _create_user_with_token(db, community, email, role="member", main_role="dps", mmr=1000):
    user = User(
        id=uuid.uuid4(),
        community_id=community.id,
        real_name=f"User {email}",
        nickname=email.split("@")[0],
        email=email,
        password_hash=hash_password("pass"),
        role=role,
    )
    db.add(user)
    db.flush()
    profile = PlayerProfile(
        id=uuid.uuid4(),
        user_id=user.id,
        main_role=main_role,
        current_rank="Gold",
        mmr=mmr,
    )
    db.add(profile)
    db.commit()
    db.refresh(user)
    return user, create_access_token(user)


class TestMatchRegistration:
    def test_register_for_match(self, client, db, community, open_match, member_token):
        resp = client.post(
            f"/matches/{open_match.id}/register",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["status"] == "registered"
        assert data["match_id"] == str(open_match.id)

    def test_duplicate_registration_blocked(self, client, db, community, open_match, member_token):
        client.post(
            f"/matches/{open_match.id}/register",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        resp = client.post(
            f"/matches/{open_match.id}/register",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp.status_code == 400
        assert "already registered" in resp.json()["detail"].lower()

    def test_register_closed_match_rejected(self, client, db, community, open_match, member_token, admin_token):
        # 먼저 match를 close
        client.post(
            f"/matches/{open_match.id}/close-registration",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        resp = client.post(
            f"/matches/{open_match.id}/register",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp.status_code == 400

    def test_cancel_registration(self, client, db, community, open_match, member_token):
        client.post(
            f"/matches/{open_match.id}/register",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        resp = client.delete(
            f"/matches/{open_match.id}/register",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp.status_code == 204

    def test_cancel_nonexistent_registration(self, client, db, community, open_match, member_token):
        resp = client.delete(
            f"/matches/{open_match.id}/register",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp.status_code == 404


class TestWaitlistPromotion:
    def test_waitlist_when_full(self, client, db, community, open_match):
        """10명 등록 후 11번째는 대기자"""
        tokens = []
        for i in range(11):
            user, token = _create_user_with_token(
                db, community, f"player{i}@test.com", mmr=1000 + i * 10
            )
            tokens.append(token)

        # 처음 10명 등록 -> registered
        for i in range(10):
            resp = client.post(
                f"/matches/{open_match.id}/register",
                headers={"Authorization": f"Bearer {tokens[i]}"},
            )
            assert resp.status_code == 201
            assert resp.json()["status"] == "registered"

        # 11번째 -> waitlist
        resp = client.post(
            f"/matches/{open_match.id}/register",
            headers={"Authorization": f"Bearer {tokens[10]}"},
        )
        assert resp.status_code == 201
        assert resp.json()["status"] == "waitlist"

    def test_waitlist_promoted_on_cancel(self, client, db, community, open_match):
        """등록자 취소 시 대기자가 자동 승격"""
        tokens = []
        for i in range(11):
            user, token = _create_user_with_token(
                db, community, f"promo{i}@test.com", mmr=1000
            )
            tokens.append(token)

        # 10명 등록
        for i in range(10):
            client.post(
                f"/matches/{open_match.id}/register",
                headers={"Authorization": f"Bearer {tokens[i]}"},
            )

        # 11번째 대기
        resp = client.post(
            f"/matches/{open_match.id}/register",
            headers={"Authorization": f"Bearer {tokens[10]}"},
        )
        waitlist_id = resp.json()["id"]
        assert resp.json()["status"] == "waitlist"

        # 첫 번째 등록자 취소
        client.delete(
            f"/matches/{open_match.id}/register",
            headers={"Authorization": f"Bearer {tokens[0]}"},
        )

        # 대기자가 registered로 승격되었는지 확인
        participant = db.query(MatchParticipant).filter(
            MatchParticipant.id == uuid.UUID(waitlist_id)
        ).first()
        assert participant.status == "registered"


class TestCloseRegistrationAndTeamBalancing:
    def test_close_registration_creates_teams(self, client, db, community, open_match, admin_token):
        """참가 마감 시 팀 자동 구성"""
        tokens = []
        for i in range(10):
            roles = ["tank", "dps", "dps", "support", "support"]
            user, token = _create_user_with_token(
                db, community, f"team{i}@test.com",
                main_role=roles[i % 5],
                mmr=900 + i * 50,
            )
            tokens.append(token)

        # 10명 등록
        for token in tokens:
            client.post(
                f"/matches/{open_match.id}/register",
                headers={"Authorization": f"Bearer {token}"},
            )

        # 참가 마감
        resp = client.post(
            f"/matches/{open_match.id}/close-registration",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "closed"
        assert "balance_result" in data
        assert "team_a_score" in data["balance_result"]

        # DB에서 팀 배정 확인
        participants = db.query(MatchParticipant).filter(
            MatchParticipant.match_id == open_match.id,
            MatchParticipant.status == "registered",
        ).all()
        team_a = [p for p in participants if p.team == "A"]
        team_b = [p for p in participants if p.team == "B"]
        assert len(team_a) == 5
        assert len(team_b) == 5

    def test_close_already_closed_match(self, client, db, community, open_match, admin_token):
        """이미 마감된 경기 재마감 시도 -> 400"""
        client.post(
            f"/matches/{open_match.id}/close-registration",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        resp = client.post(
            f"/matches/{open_match.id}/close-registration",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 400

    def test_member_cannot_close_registration(self, client, db, community, open_match, member_token):
        """member는 참가 마감 불가"""
        resp = client.post(
            f"/matches/{open_match.id}/close-registration",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp.status_code == 403
