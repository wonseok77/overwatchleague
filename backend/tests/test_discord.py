"""Discord Webhook 서비스 유닛 테스트 (동기 래퍼)"""

import asyncio
from unittest.mock import AsyncMock, patch

from app.services.discord import (
    send_discord_webhook,
    send_team_composition,
    send_match_scheduled,
    send_match_result,
)


def _run(coro):
    """asyncio 헬퍼: pytest-asyncio 없이 async 함수 실행"""
    return asyncio.get_event_loop().run_until_complete(coro)


class TestSendDiscordWebhook:
    def test_sends_embed_to_webhook(self):
        embed = {"title": "Test", "color": 0xFFFFFF}
        with patch("app.services.discord.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            _run(send_discord_webhook("https://discord.com/api/webhooks/1/abc", embed))

            mock_client.post.assert_called_once_with(
                "https://discord.com/api/webhooks/1/abc",
                json={"embeds": [embed]},
            )


class TestSendTeamComposition:
    def test_builds_correct_embed(self):
        with patch("app.services.discord.send_discord_webhook", new_callable=AsyncMock) as mock_send:
            _run(send_team_composition(
                webhook_url="https://discord.com/api/webhooks/1/abc",
                match_title="Match 1",
                team_a_names=["Alice", "Bob"],
                team_b_names=["Charlie", "Dave"],
                balance_result={"team_a_score": 100.0, "team_b_score": 98.0, "score_diff": 2.0},
            ))

            mock_send.assert_called_once()
            embed = mock_send.call_args[0][1]
            assert "Team Composition" in embed["title"]
            assert embed["color"] == 0xF99E1A
            assert len(embed["fields"]) == 3


class TestSendMatchScheduled:
    def test_builds_correct_embed(self):
        with patch("app.services.discord.send_discord_webhook", new_callable=AsyncMock) as mock_send:
            _run(send_match_scheduled(
                webhook_url="https://discord.com/api/webhooks/1/abc",
                match_title="Week 3 Match",
                scheduled_at="2026-03-15T19:00:00",
                community_name="Test Community",
            ))

            mock_send.assert_called_once()
            embed = mock_send.call_args[0][1]
            assert embed["title"] == "Match Scheduled"
            assert "Week 3 Match" in embed["description"]
            assert embed["color"] == 0xF99E1A


class TestSendMatchResult:
    def test_builds_correct_embed(self):
        with patch("app.services.discord.send_discord_webhook", new_callable=AsyncMock) as mock_send:
            _run(send_match_result(
                webhook_url="https://discord.com/api/webhooks/1/abc",
                match_title="Final Match",
                winner="A Team",
                map_name="King's Row",
            ))

            mock_send.assert_called_once()
            embed = mock_send.call_args[0][1]
            assert embed["title"] == "Match Result"
            assert "Final Match" in embed["description"]
            assert "A Team" in embed["description"]
            assert "King's Row" in embed["description"]
            assert embed["color"] == 0x4ADE80
