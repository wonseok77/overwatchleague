import os
import uuid
from collections import defaultdict
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models.user import User, PlayerProfile
from app.models.match import Match, MatchParticipant, PlayerMatchStat, SeasonStat
from app.models.season import Season
from app.services.auth import get_current_user

router = APIRouter()

AVATAR_UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "uploads", "avatars"
)


class UserInfo(BaseModel):
    id: str
    real_name: str
    nickname: str
    discord_id: Optional[str] = None
    avatar_url: Optional[str] = None


class PlayerProfileInfo(BaseModel):
    main_role: str
    mmr: int
    main_heroes: Optional[List[str]] = None


class StatsInfo(BaseModel):
    total_matches: int
    wins: int
    losses: int
    win_rate: float


class RecentMatchInfo(BaseModel):
    match_id: str
    title: str
    map_name: Optional[str] = None
    scheduled_at: Optional[str] = None
    team: Optional[str] = None
    result: Optional[str] = None
    mmr_before: Optional[int] = None
    mmr_after: Optional[int] = None
    mmr_change: Optional[int] = None
    heroes_played: Optional[List[str]] = None


class SeasonStatInfo(BaseModel):
    season_id: str
    season_name: str
    wins: int
    losses: int
    win_rate: Optional[float] = None
    final_mmr: Optional[int] = None
    rank_position: Optional[int] = None


class CombatStatsInfo(BaseModel):
    games_with_stats: int
    kd_ratio: float
    kda_ratio: float
    avg_kills: float
    avg_deaths: float
    avg_damage_dealt: float
    avg_healing_done: float
    avg_damage_mitigated: float


class HeroStatInfo(BaseModel):
    hero_name: str
    matches: int
    wins: int
    losses: int
    win_rate: float
    avg_kills: float
    avg_deaths: float
    avg_assists: float
    avg_damage_dealt: float
    avg_healing_done: float
    avg_damage_mitigated: float
    kd_ratio: float


class ProfileResponse(BaseModel):
    user: UserInfo
    player_profile: Optional[PlayerProfileInfo] = None
    stats: StatsInfo
    combat_stats: Optional[CombatStatsInfo] = None
    hero_stats: List[HeroStatInfo]
    recent_matches: List[RecentMatchInfo]
    season_stats: List[SeasonStatInfo]


@router.get("/users/{user_id}/profile", response_model=ProfileResponse)
def get_user_profile(user_id: uuid.UUID, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    profile = db.query(PlayerProfile).filter(PlayerProfile.user_id == user_id).first()

    # Calculate wins/losses from PlayerMatchStat + Match result
    stats_rows = (
        db.query(PlayerMatchStat, MatchParticipant.team, Match.result)
        .join(Match, PlayerMatchStat.match_id == Match.id)
        .join(
            MatchParticipant,
            (MatchParticipant.match_id == PlayerMatchStat.match_id)
            & (MatchParticipant.user_id == PlayerMatchStat.user_id),
        )
        .filter(PlayerMatchStat.user_id == user_id, Match.status == "completed")
        .all()
    )

    wins = 0
    losses = 0
    for _stat, team, result in stats_rows:
        if result == "draw":
            continue
        if (team == "A" and result == "team_a") or (team == "B" and result == "team_b"):
            wins += 1
        else:
            losses += 1

    total_matches = wins + losses
    win_rate = round(wins / total_matches * 100, 1) if total_matches > 0 else 0.0

    # Combat stats aggregation
    total_kills = total_deaths = total_assists = 0
    total_damage = total_healing = total_mitigated = 0
    kill_games = damage_games = healing_games = mitigated_games = 0

    for _stat, _team, _result in stats_rows:
        if _stat.kills is not None:
            total_kills += _stat.kills
            kill_games += 1
        if _stat.deaths is not None:
            total_deaths += _stat.deaths
        if _stat.assists is not None:
            total_assists += _stat.assists
        if _stat.damage_dealt is not None:
            total_damage += _stat.damage_dealt
            damage_games += 1
        if _stat.healing_done is not None:
            total_healing += _stat.healing_done
            healing_games += 1
        if _stat.damage_mitigated is not None:
            total_mitigated += _stat.damage_mitigated
            mitigated_games += 1

    combat_stats = None
    if kill_games > 0:
        combat_stats = CombatStatsInfo(
            games_with_stats=kill_games,
            kd_ratio=round(total_kills / max(1, total_deaths), 2),
            kda_ratio=round((total_kills + total_assists) / max(1, total_deaths), 2),
            avg_kills=round(total_kills / kill_games, 1),
            avg_deaths=round(total_deaths / max(1, kill_games), 1),
            avg_damage_dealt=round(total_damage / max(1, damage_games)),
            avg_healing_done=round(total_healing / max(1, healing_games)),
            avg_damage_mitigated=round(total_mitigated / max(1, mitigated_games)),
        )

    # Hero stats aggregation
    hero_agg: dict = defaultdict(lambda: {
        "matches": 0, "wins": 0, "losses": 0,
        "kills": 0, "deaths": 0, "assists": 0,
        "damage": 0, "healing": 0, "mitigated": 0,
    })
    for _stat, team, result in stats_rows:
        if not _stat.heroes_played:
            continue
        is_win = (team == "A" and result == "team_a") or (team == "B" and result == "team_b")
        for hero in _stat.heroes_played[:1]:
            h = hero_agg[hero]
            h["matches"] += 1
            if result != "draw":
                if is_win:
                    h["wins"] += 1
                else:
                    h["losses"] += 1
            if _stat.kills is not None:
                h["kills"] += _stat.kills
            if _stat.deaths is not None:
                h["deaths"] += _stat.deaths
            if _stat.assists is not None:
                h["assists"] += _stat.assists
            if _stat.damage_dealt is not None:
                h["damage"] += _stat.damage_dealt
            if _stat.healing_done is not None:
                h["healing"] += _stat.healing_done
            if _stat.damage_mitigated is not None:
                h["mitigated"] += _stat.damage_mitigated

    hero_stats = []
    for hero_name, h in hero_agg.items():
        m = h["matches"]
        hero_stats.append(HeroStatInfo(
            hero_name=hero_name,
            matches=m,
            wins=h["wins"],
            losses=h["losses"],
            win_rate=round(h["wins"] / max(1, h["wins"] + h["losses"]) * 100, 1),
            avg_kills=round(h["kills"] / m, 1),
            avg_deaths=round(h["deaths"] / m, 1),
            avg_assists=round(h["assists"] / m, 1),
            avg_damage_dealt=round(h["damage"] / m),
            avg_healing_done=round(h["healing"] / m),
            avg_damage_mitigated=round(h["mitigated"] / m),
            kd_ratio=round(h["kills"] / max(1, h["deaths"]), 2),
        ))
    hero_stats.sort(key=lambda x: x.matches, reverse=True)

    # Recent 20 matches
    recent_rows = (
        db.query(PlayerMatchStat, MatchParticipant.team, Match)
        .join(Match, PlayerMatchStat.match_id == Match.id)
        .join(
            MatchParticipant,
            (MatchParticipant.match_id == PlayerMatchStat.match_id)
            & (MatchParticipant.user_id == PlayerMatchStat.user_id),
        )
        .filter(PlayerMatchStat.user_id == user_id)
        .order_by(Match.scheduled_at.desc())
        .limit(20)
        .all()
    )

    recent_matches = []
    for stat, team, match in recent_rows:
        recent_matches.append(
            RecentMatchInfo(
                match_id=str(match.id),
                title=match.title,
                map_name=match.map_name,
                scheduled_at=match.scheduled_at.isoformat() if match.scheduled_at else None,
                team=team,
                result=match.result,
                mmr_before=stat.mmr_before,
                mmr_after=stat.mmr_after,
                mmr_change=stat.mmr_change,
                heroes_played=stat.heroes_played,
            )
        )

    # Season stats
    season_stat_rows = (
        db.query(SeasonStat, Season.name)
        .join(Season, SeasonStat.season_id == Season.id)
        .filter(SeasonStat.user_id == user_id)
        .all()
    )

    season_stats = []
    for ss, season_name in season_stat_rows:
        season_stats.append(
            SeasonStatInfo(
                season_id=str(ss.season_id),
                season_name=season_name,
                wins=ss.wins,
                losses=ss.losses,
                win_rate=ss.win_rate,
                final_mmr=ss.final_mmr,
                rank_position=ss.rank_position,
            )
        )

    return ProfileResponse(
        user=UserInfo(
            id=str(user.id),
            real_name=user.real_name,
            nickname=user.nickname,
            discord_id=user.discord_id,
            avatar_url=user.avatar_url,
        ),
        player_profile=PlayerProfileInfo(
            main_role=profile.main_role,
            mmr=profile.mmr,
            main_heroes=profile.main_heroes,
        )
        if profile
        else None,
        stats=StatsInfo(
            total_matches=total_matches,
            wins=wins,
            losses=losses,
            win_rate=win_rate,
        ),
        combat_stats=combat_stats,
        hero_stats=hero_stats,
        recent_matches=recent_matches,
        season_stats=season_stats,
    )


class ProfileUpdate(BaseModel):
    nickname: Optional[str] = None
    main_role: Optional[str] = None  # "tank" | "dps" | "support"
    main_heroes: Optional[List[str]] = None


class ProfileUpdateResponse(BaseModel):
    nickname: Optional[str] = None
    main_role: Optional[str] = None
    main_heroes: Optional[List[str]] = None
    mmr: Optional[int] = None


@router.patch("/users/{user_id}/profile", response_model=ProfileUpdateResponse)
def update_user_profile(
    user_id: uuid.UUID,
    req: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.id != user_id and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    profile = db.query(PlayerProfile).filter(PlayerProfile.user_id == user_id).first()
    if not profile:
        profile = PlayerProfile(
            id=uuid.uuid4(),
            user_id=user_id,
            main_role=req.main_role or "dps",
            mmr=1000,
        )
        db.add(profile)

    if req.nickname is not None:
        user.nickname = req.nickname

    if req.main_role is not None:
        profile.main_role = req.main_role
    if req.main_heroes is not None:
        profile.main_heroes = req.main_heroes

    db.commit()
    db.refresh(profile)
    db.refresh(user)

    return ProfileUpdateResponse(
        nickname=user.nickname,
        main_role=profile.main_role,
        main_heroes=profile.main_heroes,
        mmr=profile.mmr,
    )


class AvatarResponse(BaseModel):
    avatar_url: str


@router.post("/users/{user_id}/avatar", response_model=AvatarResponse)
def upload_avatar(
    user_id: uuid.UUID,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.id != user_id and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

    allowed = {"image/jpeg", "image/png", "image/webp"}
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="JPG / PNG / WebP only")

    content = file.file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")

    os.makedirs(AVATAR_UPLOAD_DIR, exist_ok=True)
    ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "png"
    filename = f"{user_id}.{ext}"
    filepath = os.path.join(AVATAR_UPLOAD_DIR, filename)

    with open(filepath, "wb") as f:
        f.write(content)

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.avatar_url = f"/uploads/avatars/{filename}"
    db.commit()
    db.refresh(user)
    return AvatarResponse(avatar_url=user.avatar_url)
