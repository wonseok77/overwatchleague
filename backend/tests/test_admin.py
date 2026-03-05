"""Phase 3 Admin API 통합 테스트"""

import uuid
from datetime import datetime

import pytest
from app.models.community import Community
from app.models.match import Match, MatchParticipant, PlayerMatchStat, SeasonStat
from app.models.season import Season
from app.models.user import User, PlayerProfile
from app.services.auth import hash_password, create_access_token


def _create_user(db, community, email, role="member", main_role="dps", mmr=1000):
    user = User(
        id=uuid.uuid4(),
        community_id=community.id,
        real_name=f"User {email.split('@')[0]}",
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
        current_rank="Gold 3",
        mmr=mmr,
    )
    db.add(profile)
    db.commit()
    db.refresh(user)
    return user, create_access_token(user)


class TestAdminSeasons:
    def test_list_seasons_admin(self, client, db, community, season, admin_token):
        resp = client.get(
            "/admin/seasons",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        assert data[0]["name"] == season.name

    def test_list_seasons_member_forbidden(self, client, db, community, season, member_token):
        resp = client.get(
            "/admin/seasons",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp.status_code == 403

    def test_list_seasons_no_auth(self, client, db, community, season):
        resp = client.get("/admin/seasons")
        assert resp.status_code == 403

    def test_create_season(self, client, db, community, admin_token):
        resp = client.post(
            "/admin/seasons",
            json={"name": "Season 2026-2"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Season 2026-2"
        assert data["status"] == "active"

    def test_create_season_member_forbidden(self, client, db, community, member_token):
        resp = client.post(
            "/admin/seasons",
            json={"name": "Hack Season"},
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp.status_code == 403

    def test_update_season_close(self, client, db, community, season, admin_token):
        resp = client.patch(
            f"/admin/seasons/{season.id}",
            json={"status": "closed"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "closed"

    def test_update_season_same_status_400(self, client, db, community, season, admin_token):
        resp = client.patch(
            f"/admin/seasons/{season.id}",
            json={"status": "active"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 400
        assert "already" in resp.json()["detail"].lower()

    def test_update_season_not_found(self, client, db, community, admin_token):
        resp = client.patch(
            f"/admin/seasons/{uuid.uuid4()}",
            json={"status": "closed"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 404

    def test_update_season_wrong_community(self, client, db, admin_token):
        other_community = Community(
            id=uuid.uuid4(), name="Other", slug="other-community"
        )
        db.add(other_community)
        db.flush()
        other_season = Season(
            id=uuid.uuid4(),
            community_id=other_community.id,
            name="Other Season",
            status="active",
        )
        db.add(other_season)
        db.commit()

        resp = client.patch(
            f"/admin/seasons/{other_season.id}",
            json={"status": "closed"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 403


class TestAdminFinalize:
    def _setup_completed_season(self, db, community, season):
        """Create a closed season with completed matches."""
        season.status = "closed"
        season.ended_at = datetime.utcnow()
        db.commit()

        users = []
        for i in range(4):
            user, _ = _create_user(
                db, community, f"finalize{i}@test.com", mmr=1000 + i * 100
            )
            users.append(user)

        # Create 2 completed matches
        for match_idx in range(2):
            match = Match(
                id=uuid.uuid4(),
                community_id=community.id,
                season_id=season.id,
                title=f"Match {match_idx + 1}",
                scheduled_at=datetime(2026, 3, 10, 19, 0),
                status="completed",
                result="team_a",
            )
            db.add(match)
            db.flush()

            for i, user in enumerate(users):
                team = "A" if i < 2 else "B"
                p = MatchParticipant(
                    match_id=match.id,
                    user_id=user.id,
                    status="registered",
                    team=team,
                )
                db.add(p)

        db.commit()
        return users

    def test_finalize_season(self, client, db, community, season, admin_token):
        self._setup_completed_season(db, community, season)

        resp = client.post(
            f"/admin/seasons/{season.id}/finalize",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["message"] == "Season finalized successfully"
        assert data["stats_created"] == 4

        # Verify SeasonStat records
        stats = db.query(SeasonStat).filter(SeasonStat.season_id == season.id).all()
        assert len(stats) == 4

        # Verify win/loss counts
        for stat in stats:
            assert stat.wins + stat.losses == 2
            assert stat.rank_position is not None

    def test_finalize_not_closed_400(self, client, db, community, season, admin_token):
        resp = client.post(
            f"/admin/seasons/{season.id}/finalize",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 400
        assert "closed" in resp.json()["detail"].lower()

    def test_finalize_idempotent(self, client, db, community, season, admin_token):
        self._setup_completed_season(db, community, season)

        # First finalize
        resp1 = client.post(
            f"/admin/seasons/{season.id}/finalize",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp1.status_code == 200

        # Second finalize (idempotent)
        resp2 = client.post(
            f"/admin/seasons/{season.id}/finalize",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp2.status_code == 200

        # Should still have same count
        stats = db.query(SeasonStat).filter(SeasonStat.season_id == season.id).all()
        assert len(stats) == 4

    def test_finalize_not_found(self, client, db, community, admin_token):
        resp = client.post(
            f"/admin/seasons/{uuid.uuid4()}/finalize",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 404

    def test_finalize_member_forbidden(self, client, db, community, season, member_token):
        resp = client.post(
            f"/admin/seasons/{season.id}/finalize",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp.status_code == 403


class TestAdminMembers:
    def test_list_members(self, client, db, community, admin_user, admin_token):
        resp = client.get(
            "/admin/members",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        nicknames = [m["nickname"] for m in data]
        assert admin_user.nickname in nicknames

    def test_list_members_member_forbidden(self, client, db, community, member_token):
        resp = client.get(
            "/admin/members",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp.status_code == 403

    def test_update_member_role(self, client, db, community, admin_token, member_user):
        resp = client.patch(
            f"/admin/members/{member_user.id}",
            json={"role": "admin"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["role"] == "admin"

    def test_update_member_rank(self, client, db, community, admin_token):
        user, _ = _create_user(db, community, "rankchange@test.com", mmr=1200)
        resp = client.patch(
            f"/admin/members/{user.id}",
            json={"current_rank": "Diamond 1"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["current_rank"] == "Diamond 1"

    def test_update_member_not_found(self, client, db, community, admin_token):
        resp = client.patch(
            f"/admin/members/{uuid.uuid4()}",
            json={"role": "admin"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 404

    def test_update_member_rank_no_profile(self, client, db, community, admin_token):
        """User without PlayerProfile cannot have rank updated."""
        user = User(
            id=uuid.uuid4(),
            community_id=community.id,
            real_name="No Prof",
            nickname="noprof",
            email="noprof@test.com",
            password_hash=hash_password("pass"),
            role="member",
        )
        db.add(user)
        db.commit()

        resp = client.patch(
            f"/admin/members/{user.id}",
            json={"current_rank": "Gold 1"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 400
        assert "profile" in resp.json()["detail"].lower()

    def test_update_member_wrong_community(self, client, db, admin_token):
        other_community = Community(
            id=uuid.uuid4(), name="Other2", slug="other-community-2"
        )
        db.add(other_community)
        db.flush()
        other_user = User(
            id=uuid.uuid4(),
            community_id=other_community.id,
            real_name="Other",
            nickname="other",
            email="other@test.com",
            password_hash=hash_password("pass"),
            role="member",
        )
        db.add(other_user)
        db.commit()

        resp = client.patch(
            f"/admin/members/{other_user.id}",
            json={"role": "admin"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 403


class TestAdminWebhook:
    def test_update_webhook_url(self, client, db, community, admin_token):
        resp = client.patch(
            "/admin/community/webhook",
            json={"webhook_url": "https://discord.com/api/webhooks/test/token"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["message"] == "Webhook URL updated"
        assert data["webhook_url"] == "https://discord.com/api/webhooks/test/token"

    def test_clear_webhook_url(self, client, db, community, admin_token):
        # Set first
        client.patch(
            "/admin/community/webhook",
            json={"webhook_url": "https://discord.com/api/webhooks/x/y"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        # Clear
        resp = client.patch(
            "/admin/community/webhook",
            json={"webhook_url": None},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["webhook_url"] is None

    def test_update_webhook_member_forbidden(self, client, db, community, member_token):
        resp = client.patch(
            "/admin/community/webhook",
            json={"webhook_url": "https://hack.com"},
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp.status_code == 403

    def test_test_webhook_no_url_400(self, client, db, community, admin_token):
        resp = client.post(
            "/admin/community/webhook/test",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 400
        assert "no webhook" in resp.json()["detail"].lower()

    def test_test_webhook_member_forbidden(self, client, db, community, member_token):
        resp = client.post(
            "/admin/community/webhook/test",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp.status_code == 403
