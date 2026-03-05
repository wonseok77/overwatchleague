"""아바타 업로드 테스트: POST /users/{id}/avatar"""

import io
import uuid

from app.models.user import User
from app.services.auth import hash_password, create_access_token


def _create_user(db, community, email, role="member"):
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
    db.commit()
    db.refresh(user)
    return user, create_access_token(user)


class TestAvatarUpload:
    def test_upload_avatar_own(self, client, db, community):
        """본인 아바타 업로드 성공"""
        user, token = _create_user(db, community, "avatar@test.com")
        fake_img = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100)

        resp = client.post(
            f"/users/{user.id}/avatar",
            files={"file": ("photo.png", fake_img, "image/png")},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["avatar_url"].startswith("/uploads/avatars/")
        assert str(user.id) in data["avatar_url"]

    def test_upload_avatar_forbidden_other_user(self, client, db, community):
        """다른 사용자의 아바타 업로드 시 403"""
        user1, _ = _create_user(db, community, "user1@test.com")
        _, token2 = _create_user(db, community, "user2@test.com")
        fake_img = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100)

        resp = client.post(
            f"/users/{user1.id}/avatar",
            files={"file": ("photo.png", fake_img, "image/png")},
            headers={"Authorization": f"Bearer {token2}"},
        )
        assert resp.status_code == 403

    def test_upload_avatar_admin_can_upload_for_others(self, client, db, community):
        """admin은 다른 사용자 아바타 업로드 가능"""
        user, _ = _create_user(db, community, "target@test.com")
        admin, admin_token = _create_user(db, community, "adm@test.com", role="admin")
        fake_img = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100)

        resp = client.post(
            f"/users/{user.id}/avatar",
            files={"file": ("photo.png", fake_img, "image/png")},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200

    def test_upload_avatar_invalid_type(self, client, db, community):
        """허용되지 않는 파일 타입 거부"""
        user, token = _create_user(db, community, "badtype@test.com")
        fake_file = io.BytesIO(b"not an image")

        resp = client.post(
            f"/users/{user.id}/avatar",
            files={"file": ("doc.pdf", fake_file, "application/pdf")},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 400
        assert "JPG / PNG / WebP" in resp.json()["detail"]

    def test_profile_includes_avatar_url(self, client, db, community):
        """프로필 조회 시 avatar_url 포함"""
        user, token = _create_user(db, community, "profavatar@test.com")
        fake_img = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100)

        # Upload avatar
        client.post(
            f"/users/{user.id}/avatar",
            files={"file": ("photo.png", fake_img, "image/png")},
            headers={"Authorization": f"Bearer {token}"},
        )

        # Check profile
        resp = client.get(f"/users/{user.id}/profile")
        assert resp.status_code == 200
        data = resp.json()
        assert data["user"]["avatar_url"] is not None
        assert "/uploads/avatars/" in data["user"]["avatar_url"]
