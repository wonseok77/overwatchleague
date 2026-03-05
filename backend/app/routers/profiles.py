import os
import uuid
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
    current_rank: Optional[str] = None
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


class ProfileResponse(BaseModel):
    user: UserInfo
    player_profile: Optional[PlayerProfileInfo] = None
    stats: StatsInfo
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
            current_rank=profile.current_rank,
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
        recent_matches=recent_matches,
        season_stats=season_stats,
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
