from typing import Dict, Any, List, Optional

import httpx


async def send_discord_webhook(webhook_url: str, embed: Dict[str, Any]) -> None:
    async with httpx.AsyncClient() as client:
        await client.post(webhook_url, json={"embeds": [embed]})


async def send_team_composition(
    webhook_url: str,
    match_title: str,
    team_a_names: List[str],
    team_b_names: List[str],
    balance_result: Dict[str, Any],
) -> None:
    embed = {
        "title": f"Team Composition: {match_title}",
        "color": 0xF99E1A,
        "fields": [
            {"name": "A Team", "value": "\n".join(team_a_names) or "TBD", "inline": True},
            {"name": "B Team", "value": "\n".join(team_b_names) or "TBD", "inline": True},
            {
                "name": "Balance Score",
                "value": f"A: {balance_result['team_a_score']:.1f} vs B: {balance_result['team_b_score']:.1f} (diff: {balance_result['score_diff']:.1f})",
                "inline": False,
            },
        ],
    }
    await send_discord_webhook(webhook_url, embed)


async def send_match_scheduled(
    webhook_url: str,
    match_title: str,
    scheduled_at: str,
    community_name: str,
) -> None:
    embed = {
        "title": "Match Scheduled",
        "description": f"**{match_title}**\nDate: {scheduled_at}",
        "color": 0xF99E1A,
    }
    await send_discord_webhook(webhook_url, embed)


async def send_match_result(
    webhook_url: str,
    match_title: str,
    winner: str,
    map_name: str,
) -> None:
    embed = {
        "title": "Match Result",
        "description": f"**{match_title}**\nWinner: {winner}\nMap: {map_name}",
        "color": 0x4ADE80,
    }
    await send_discord_webhook(webhook_url, embed)


async def send_matchmaking_confirmed(
    webhook_url: str,
    session_title: str,
    games: List[Dict[str, Any]],
) -> None:
    fields = []
    for game in games:
        game_no = game.get("game_no", "?")
        team_a = game.get("team_a", [])
        team_b = game.get("team_b", [])
        score_diff = game.get("score_diff", 0)

        pos_label = {"tank": "T", "dps": "D", "support": "S"}
        a_names = "\n".join(
            f"`{pos_label.get(p.get('assigned_position', ''), '?')}` {p.get('nickname', '?')}"
            for p in team_a
        )
        b_names = "\n".join(
            f"`{pos_label.get(p.get('assigned_position', ''), '?')}` {p.get('nickname', '?')}"
            for p in team_b
        )

        fields.append({"name": f"Game {game_no} — Team A", "value": a_names or "TBD", "inline": True})
        fields.append({"name": f"Game {game_no} — Team B", "value": b_names or "TBD", "inline": True})
        fields.append({"name": "Balance", "value": f"Score diff: {score_diff:.2f}", "inline": False})

    embed = {
        "title": f"Matchmaking Confirmed: {session_title}",
        "color": 0xF99E1A,
        "fields": fields[:25],
    }
    await send_discord_webhook(webhook_url, embed)
