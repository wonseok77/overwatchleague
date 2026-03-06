"""OCR 서비스 및 엔드포인트 테스트"""

import uuid
from datetime import datetime
from unittest.mock import patch, MagicMock

import pytest

from app.models.match import Match, PlayerMatchStat


class TestExtractStatsFromImage:
    """ocr.extract_stats_from_image 유닛 테스트"""

    @patch("app.services.ocr.pytesseract")
    @patch("app.services.ocr.Image")
    def test_extract_stats_returns_dict(self, mock_image_mod, mock_tess):
        mock_img = MagicMock()
        mock_image_mod.open.return_value = mock_img
        mock_img.convert.return_value = mock_img

        mock_enhance_inst = MagicMock()
        mock_enhance_inst.enhance.return_value = mock_img

        with patch("app.services.ocr.ImageEnhance") as mock_enhance_mod:
            mock_enhance_mod.Contrast.return_value = mock_enhance_inst
            mock_enhance_mod.Sharpness.return_value = mock_enhance_inst

            mock_tess.image_to_string.return_value = "15 3 20 12500 8000"

            from app.services.ocr import extract_stats_from_image
            result = extract_stats_from_image("/fake/path.png")

        assert result["kills"] == 15
        assert result["deaths"] == 3
        assert result["assists"] == 20
        assert result["damage_dealt"] == 12500
        assert result["healing_done"] == 8000

    def test_extract_stats_file_not_found(self):
        from app.services.ocr import extract_stats_from_image
        result = extract_stats_from_image("/nonexistent/path.png")
        assert result == {}

    @patch("app.services.ocr.pytesseract")
    @patch("app.services.ocr.Image")
    def test_extract_stats_partial_numbers(self, mock_image_mod, mock_tess):
        mock_img = MagicMock()
        mock_image_mod.open.return_value = mock_img
        mock_img.convert.return_value = mock_img

        mock_enhance_inst = MagicMock()
        mock_enhance_inst.enhance.return_value = mock_img

        with patch("app.services.ocr.ImageEnhance") as mock_enhance_mod:
            mock_enhance_mod.Contrast.return_value = mock_enhance_inst
            mock_enhance_mod.Sharpness.return_value = mock_enhance_inst

            mock_tess.image_to_string.return_value = "10 5"

            from app.services.ocr import extract_stats_from_image
            result = extract_stats_from_image("/fake/path.png")

        assert result["kills"] == 10
        assert result["deaths"] == 5
        assert result["assists"] is None
        assert result["damage_dealt"] is None
        assert result["healing_done"] is None


class TestOcrEndpoint:
    """OCR 엔드포인트 통합 테스트"""

    def test_ocr_endpoint_no_screenshot(self, client, db, admin_token, admin_user, community, season):
        match = Match(
            id=uuid.uuid4(),
            community_id=community.id,
            season_id=season.id,
            title="OCR Test Match",
            scheduled_at=datetime(2026, 3, 15, 19, 0),
            status="completed",
        )
        db.add(match)
        stat = PlayerMatchStat(
            match_id=match.id,
            user_id=admin_user.id,
            screenshot_path=None,
        )
        db.add(stat)
        db.commit()

        resp = client.post(
            f"/matches/{match.id}/stats/{admin_user.id}/ocr",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 404

    def test_ocr_endpoint_no_stat_record(self, client, db, admin_token, community, season):
        match = Match(
            id=uuid.uuid4(),
            community_id=community.id,
            season_id=season.id,
            title="OCR Test Match 2",
            scheduled_at=datetime(2026, 3, 15, 19, 0),
            status="completed",
        )
        db.add(match)
        db.commit()

        resp = client.post(
            f"/matches/{match.id}/stats/{uuid.uuid4()}/ocr",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 404

    @patch("app.routers.matches.extract_stats_from_image")
    def test_ocr_endpoint_success(self, mock_ocr, client, db, admin_token, admin_user, community, season, tmp_path):
        match = Match(
            id=uuid.uuid4(),
            community_id=community.id,
            season_id=season.id,
            title="OCR Success Match",
            scheduled_at=datetime(2026, 3, 15, 19, 0),
            status="completed",
        )
        db.add(match)

        # Create a fake screenshot file
        fake_file = tmp_path / "screenshot.png"
        fake_file.write_text("fake")
        screenshot_rel = str(fake_file)

        stat = PlayerMatchStat(
            match_id=match.id,
            user_id=admin_user.id,
            screenshot_path=screenshot_rel,
        )
        db.add(stat)
        db.commit()

        mock_ocr.return_value = {
            "kills": 20,
            "deaths": 5,
            "assists": 15,
            "damage_dealt": 18000,
            "healing_done": 0,
        }

        # Patch os.path.isfile to return True for our fake path
        with patch("app.routers.matches.os.path.isfile", return_value=True):
            resp = client.post(
                f"/matches/{match.id}/stats/{admin_user.id}/ocr",
                headers={"Authorization": f"Bearer {admin_token}"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["kills"] == 20
        assert data["deaths"] == 5
        assert data["assists"] == 15
        assert data["damage_dealt"] == 18000
        assert data["healing_done"] == 0
        assert data["stat_source"] == "ocr"
