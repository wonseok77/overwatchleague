"""Phase 2 테스트: 스크린샷 업로드, 프로필 집계, 하이라이트 CRUD"""

import io
import json
import uuid
from datetime import datetime

import pytest
from app.models.user import User, PlayerProfile
from app.models.match import Match, MatchParticipant, PlayerMatchStat, Highlight
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
        current_rank="Gold",
        mmr=mmr,
    )
    db.add(profile)
    db.commit()
    db.refresh(user)
    return user, create_access_token(user)


def _completed_match(db, community, season):
    m = Match(
        id=uuid.uuid4(),
        community_id=community.id,
        season_id=season.id,
        title="Completed Match",
        scheduled_at=datetime(2026, 3, 10, 19, 0),
        status="completed",
        map_name="King's Row",
        team_a_score=1,
        team_b_score=0,
        result="team_a",
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


class TestScreenshotUpload:
    def test_upload_screenshot_creates_stat(self, client, db, community, season, admin_user, admin_token):
        user, token = _create_user(db, community, "player@test.com")
        match = _completed_match(db, community, season)

        fake_image = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100)

        resp = client.post(
            f"/matches/{match.id}/stats/{user.id}",
            files={"screenshot": ("score.png", fake_image, "image/png")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["screenshot_path"] is not None
        assert f"/uploads/screenshots/{match.id}/" in data["screenshot_path"]
        assert data["user_id"] == str(user.id)

    @pytest.mark.skip(reason="ARRAY type not supported in SQLite test DB")
    def test_upload_heroes_played(self, client, db, community, season, admin_user, admin_token):
        user, token = _create_user(db, community, "hero@test.com")
        match = _completed_match(db, community, season)

        resp = client.post(
            f"/matches/{match.id}/stats/{user.id}",
            data={"heroes_played": json.dumps(["Tracer", "Genji"])},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["heroes_played"] == ["Tracer", "Genji"]

    @pytest.mark.skip(reason="ARRAY type not supported in SQLite test DB")
    def test_upload_updates_existing_stat(self, client, db, community, season, admin_user, admin_token):
        user, token = _create_user(db, community, "update@test.com")
        match = _completed_match(db, community, season)

        # Create existing stat via result submission path
        stat = PlayerMatchStat(
            match_id=match.id,
            user_id=user.id,
            mmr_before=1000,
            mmr_after=1025,
            mmr_change=25,
        )
        db.add(stat)
        db.commit()

        resp = client.post(
            f"/matches/{match.id}/stats/{user.id}",
            data={"heroes_played": json.dumps(["Ana", "Mercy"])},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["heroes_played"] == ["Ana", "Mercy"]

        # Should not create duplicate
        count = db.query(PlayerMatchStat).filter(
            PlayerMatchStat.match_id == match.id,
            PlayerMatchStat.user_id == user.id,
        ).count()
        assert count == 1

    def test_upload_nonexistent_match_404(self, client, db, community, season, admin_user, admin_token):
        user, _ = _create_user(db, community, "noone@test.com")
        fake_id = uuid.uuid4()
        resp = client.post(
            f"/matches/{fake_id}/stats/{user.id}",
            data={"heroes_played": json.dumps(["Reinhardt"])},
        )
        assert resp.status_code == 404

    def test_upload_nonexistent_user_404(self, client, db, community, season, admin_user, admin_token):
        match = _completed_match(db, community, season)
        fake_id = uuid.uuid4()
        resp = client.post(
            f"/matches/{match.id}/stats/{fake_id}",
            data={"heroes_played": json.dumps(["Reinhardt"])},
        )
        assert resp.status_code == 404


class TestProfileAggregation:
    def _setup_match_with_stats(self, db, community, season, user, team, result):
        """Helper: create a completed match with participant and stat."""
        m = Match(
            id=uuid.uuid4(),
            community_id=community.id,
            season_id=season.id,
            title=f"Match {uuid.uuid4().hex[:6]}",
            scheduled_at=datetime(2026, 3, 10, 19, 0),
            status="completed",
            result=result,
        )
        db.add(m)
        db.flush()

        p = MatchParticipant(
            match_id=m.id,
            user_id=user.id,
            status="registered",
            team=team,
        )
        db.add(p)
        db.flush()

        stat = PlayerMatchStat(
            match_id=m.id,
            user_id=user.id,
            mmr_before=1000,
            mmr_after=1025 if (team == "A" and result == "team_a") or (team == "B" and result == "team_b") else 975,
            mmr_change=25 if (team == "A" and result == "team_a") or (team == "B" and result == "team_b") else -25,
        )
        db.add(stat)
        db.commit()
        return m

    def test_profile_returns_user_info(self, client, db, community, season):
        user, _ = _create_user(db, community, "profile@test.com", main_role="tank", mmr=1200)
        resp = client.get(f"/users/{user.id}/profile")
        assert resp.status_code == 200
        data = resp.json()
        assert data["user"]["nickname"] == "profile"
        assert data["player_profile"]["main_role"] == "tank"
        assert data["player_profile"]["mmr"] == 1200

    def test_profile_calculates_wins_losses(self, client, db, community, season):
        user, _ = _create_user(db, community, "winloss@test.com")

        # 2 wins (team A wins)
        self._setup_match_with_stats(db, community, season, user, "A", "team_a")
        self._setup_match_with_stats(db, community, season, user, "A", "team_a")
        # 1 loss (team A loses)
        self._setup_match_with_stats(db, community, season, user, "A", "team_b")

        resp = client.get(f"/users/{user.id}/profile")
        assert resp.status_code == 200
        data = resp.json()
        assert data["stats"]["wins"] == 2
        assert data["stats"]["losses"] == 1
        assert data["stats"]["total_matches"] == 3
        assert data["stats"]["win_rate"] == pytest.approx(66.7, abs=0.1)

    def test_profile_draw_not_counted(self, client, db, community, season):
        user, _ = _create_user(db, community, "draw@test.com")
        self._setup_match_with_stats(db, community, season, user, "A", "draw")

        resp = client.get(f"/users/{user.id}/profile")
        data = resp.json()
        assert data["stats"]["total_matches"] == 0
        assert data["stats"]["wins"] == 0
        assert data["stats"]["losses"] == 0

    def test_profile_returns_recent_matches(self, client, db, community, season):
        user, _ = _create_user(db, community, "recent@test.com")
        self._setup_match_with_stats(db, community, season, user, "A", "team_a")

        resp = client.get(f"/users/{user.id}/profile")
        data = resp.json()
        assert len(data["recent_matches"]) == 1
        assert data["recent_matches"][0]["team"] == "A"
        assert data["recent_matches"][0]["result"] == "team_a"

    def test_profile_nonexistent_user_404(self, client, db, community, season):
        resp = client.get(f"/users/{uuid.uuid4()}/profile")
        assert resp.status_code == 404

    def test_profile_no_player_profile(self, client, db, community, season):
        """User without PlayerProfile should still work."""
        user = User(
            id=uuid.uuid4(),
            community_id=community.id,
            real_name="No Profile",
            nickname="noprofile",
            email="noprofile@test.com",
            password_hash=hash_password("pass"),
            role="member",
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        resp = client.get(f"/users/{user.id}/profile")
        assert resp.status_code == 200
        data = resp.json()
        assert data["player_profile"] is None
        assert data["stats"]["total_matches"] == 0


class TestHighlightsCRUD:
    def test_create_highlight(self, client, db, community, season, admin_token):
        match = _completed_match(db, community, season)
        resp = client.post(
            f"/matches/{match.id}/highlights",
            json={"title": "Epic Play", "youtube_url": "https://youtu.be/abc123"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["title"] == "Epic Play"
        assert data["youtube_url"] == "https://youtu.be/abc123"
        assert data["match_id"] == str(match.id)
        assert data["user_id"] is None

    def test_create_highlight_with_user(self, client, db, community, season, admin_token):
        user, _ = _create_user(db, community, "player@test.com")
        match = _completed_match(db, community, season)
        resp = client.post(
            f"/matches/{match.id}/highlights",
            json={
                "title": "Player's Highlight",
                "youtube_url": "https://youtu.be/xyz789",
                "user_id": str(user.id),
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 201
        assert resp.json()["user_id"] == str(user.id)

    def test_list_match_highlights(self, client, db, community, season, admin_token):
        match = _completed_match(db, community, season)

        # Create 2 highlights
        client.post(
            f"/matches/{match.id}/highlights",
            json={"title": "Highlight 1", "youtube_url": "https://youtu.be/1"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        client.post(
            f"/matches/{match.id}/highlights",
            json={"title": "Highlight 2", "youtube_url": "https://youtu.be/2"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        resp = client.get(f"/matches/{match.id}/highlights")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2

    def test_list_community_highlights(self, client, db, community, season, admin_token):
        match = _completed_match(db, community, season)
        client.post(
            f"/matches/{match.id}/highlights",
            json={"title": "Community HL", "youtube_url": "https://youtu.be/c1"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        resp = client.get(f"/communities/{community.id}/highlights")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        assert data[0]["title"] == "Community HL"

    def test_delete_highlight(self, client, db, community, season, admin_token):
        match = _completed_match(db, community, season)
        create_resp = client.post(
            f"/matches/{match.id}/highlights",
            json={"title": "To Delete", "youtube_url": "https://youtu.be/del"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        hl_id = create_resp.json()["id"]

        resp = client.delete(
            f"/highlights/{hl_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 204

        # Verify deleted
        remaining = db.query(Highlight).filter(Highlight.id == uuid.UUID(hl_id)).first()
        assert remaining is None

    def test_delete_nonexistent_highlight_404(self, client, db, community, season, admin_token):
        resp = client.delete(
            f"/highlights/{uuid.uuid4()}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 404

    def test_member_cannot_create_highlight(self, client, db, community, season, member_token):
        match = _completed_match(db, community, season)
        resp = client.post(
            f"/matches/{match.id}/highlights",
            json={"title": "Nope", "youtube_url": "https://youtu.be/no"},
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp.status_code == 403

    def test_member_cannot_delete_highlight(self, client, db, community, season, admin_token, member_token):
        match = _completed_match(db, community, season)
        create_resp = client.post(
            f"/matches/{match.id}/highlights",
            json={"title": "Protected", "youtube_url": "https://youtu.be/prot"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        hl_id = create_resp.json()["id"]

        resp = client.delete(
            f"/highlights/{hl_id}",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp.status_code == 403

    def test_create_highlight_nonexistent_match_404(self, client, db, community, season, admin_token):
        resp = client.post(
            f"/matches/{uuid.uuid4()}/highlights",
            json={"title": "Nope", "youtube_url": "https://youtu.be/nope"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 404


class TestMatchDetail:
    def test_get_match_detail(self, client, db, community, season, admin_user, admin_token):
        user, _ = _create_user(db, community, "detail@test.com")
        match = _completed_match(db, community, season)

        # Add participant
        p = MatchParticipant(
            match_id=match.id,
            user_id=user.id,
            status="registered",
            team="A",
        )
        db.add(p)
        db.flush()

        # Add stat
        stat = PlayerMatchStat(
            match_id=match.id,
            user_id=user.id,
            heroes_played=None,
            mmr_before=1000,
            mmr_after=1025,
            mmr_change=25,
        )
        db.add(stat)

        # Add highlight
        hl = Highlight(
            match_id=match.id,
            title="Test HL",
            youtube_url="https://youtu.be/test",
        )
        db.add(hl)
        db.commit()

        resp = client.get(f"/matches/{match.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Completed Match"
        assert data["status"] == "completed"
        assert len(data["participants"]) == 1
        assert data["participants"][0]["nickname"] == "detail"
        assert data["participants"][0]["mmr_change"] == 25
        assert len(data["highlights"]) == 1
        assert data["highlights"][0]["title"] == "Test HL"

    def test_get_match_detail_nonexistent_404(self, client, db, community, season):
        resp = client.get(f"/matches/{uuid.uuid4()}")
        assert resp.status_code == 404
