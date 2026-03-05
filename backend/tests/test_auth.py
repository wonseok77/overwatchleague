"""인증 API 통합 테스트"""

import pytest


class TestRegister:
    def test_register_success(self, client, community):
        resp = client.post("/auth/register", json={
            "email": "new@test.com",
            "password": "securepass",
            "real_name": "New User",
            "nickname": "newbie",
            "community_slug": community.slug,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_register_with_role(self, client, community):
        resp = client.post("/auth/register", json={
            "email": "tank@test.com",
            "password": "securepass",
            "real_name": "Tank Main",
            "nickname": "tankster",
            "community_slug": community.slug,
            "main_role": "tank",
            "current_rank": "Diamond 3",
        })
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_register_duplicate_email(self, client, community, member_user):
        resp = client.post("/auth/register", json={
            "email": member_user.email,
            "password": "securepass",
            "real_name": "Another",
            "nickname": "another",
            "community_slug": community.slug,
        })
        assert resp.status_code == 400
        assert "already registered" in resp.json()["detail"].lower()

    def test_register_invalid_community(self, client):
        resp = client.post("/auth/register", json={
            "email": "ghost@test.com",
            "password": "securepass",
            "real_name": "Ghost",
            "nickname": "ghost",
            "community_slug": "nonexistent",
        })
        assert resp.status_code == 404


class TestLogin:
    def test_login_success(self, client, member_user):
        resp = client.post("/auth/login", json={
            "email": "member@test.com",
            "password": "password123",
        })
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_login_wrong_password(self, client, member_user):
        resp = client.post("/auth/login", json={
            "email": "member@test.com",
            "password": "wrongpassword",
        })
        assert resp.status_code == 401

    def test_login_nonexistent_user(self, client):
        resp = client.post("/auth/login", json={
            "email": "nobody@test.com",
            "password": "password123",
        })
        assert resp.status_code == 401


class TestGetMe:
    def test_me_with_valid_token(self, client, member_user, member_token):
        resp = client.get("/auth/me", headers={"Authorization": f"Bearer {member_token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == member_user.email
        assert data["role"] == "member"

    def test_me_admin(self, client, admin_user, admin_token):
        resp = client.get("/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200
        assert resp.json()["role"] == "admin"

    def test_me_without_token(self, client):
        resp = client.get("/auth/me")
        assert resp.status_code == 403  # HTTPBearer returns 403 for missing auth

    def test_me_with_invalid_token(self, client):
        resp = client.get("/auth/me", headers={"Authorization": "Bearer invalid.token.here"})
        assert resp.status_code == 401


class TestAdminProtection:
    def test_member_cannot_create_match(self, client, season, member_token):
        resp = client.post(
            f"/seasons/{season.id}/matches",
            json={"title": "Hack Match", "scheduled_at": "2026-03-20T19:00:00"},
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp.status_code == 403

    def test_admin_can_create_match(self, client, season, admin_token):
        resp = client.post(
            f"/seasons/{season.id}/matches",
            json={"title": "Admin Match", "scheduled_at": "2026-03-20T19:00:00"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 201
