import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.community import Community
from app.models.match import Match, MatchParticipant, PlayerMatchStat, SeasonStat
from app.models.season import Season
from app.models.user import User, PlayerProfile
from app.services.auth import require_admin
from app.services.discord import send_discord_webhook

import httpx

router = APIRouter(prefix="/admin", tags=["admin"])


# --- Schemas ---

class AdminSeasonResponse(BaseModel):
    id: str
    name: str
    status: str
    started_at: Optional[str] = None
    ended_at: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class AdminSeasonCreate(BaseModel):
    name: str
    description: Optional[str] = None


class AdminSeasonUpdate(BaseModel):
    status: str  # "active" | "closed"


class FinalizeResponse(BaseModel):
    message: str
    stats_created: int


class AdminMemberResponse(BaseModel):
    user_id: str
    nickname: str
    real_name: str
    email: str
    role: str
    main_role: Optional[str] = None
    current_rank: Optional[str] = None
    mmr: Optional[int] = None

    class Config:
        from_attributes = True


class AdminMemberUpdate(BaseModel):
    role: Optional[str] = None
    current_rank: Optional[str] = None


class WebhookUpdate(BaseModel):
    webhook_url: Optional[str] = None


class WebhookResponse(BaseModel):
    message: str
    webhook_url: Optional[str] = None


class WebhookTestResponse(BaseModel):
    message: str


# --- Helpers ---

def _season_response(s: Season) -> AdminSeasonResponse:
    return AdminSeasonResponse(
        id=str(s.id),
        name=s.name,
        status=s.status,
        started_at=s.started_at.isoformat() if s.started_at else None,
        ended_at=s.ended_at.isoformat() if s.ended_at else None,
        created_at=s.started_at.isoformat() if s.started_at else None,
    )


def _member_response(user: User) -> AdminMemberResponse:
    profile = user.profile
    return AdminMemberResponse(
        user_id=str(user.id),
        nickname=user.nickname,
        real_name=user.real_name,
        email=user.email,
        role=user.role,
        main_role=profile.main_role if profile else None,
        current_rank=profile.current_rank if profile else None,
        mmr=profile.mmr if profile else None,
    )


# --- Season Management ---

@router.get("/seasons", response_model=List[AdminSeasonResponse])
def list_seasons(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    seasons = db.query(Season).filter(Season.community_id == admin.community_id).all()
    return [_season_response(s) for s in seasons]


@router.post("/seasons", response_model=AdminSeasonResponse, status_code=status.HTTP_201_CREATED)
def create_season(
    req: AdminSeasonCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    season = Season(community_id=admin.community_id, name=req.name)
    db.add(season)
    db.commit()
    db.refresh(season)
    return _season_response(season)


@router.patch("/seasons/{season_id}", response_model=AdminSeasonResponse)
def update_season(
    season_id: uuid.UUID,
    req: AdminSeasonUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    season = db.query(Season).filter(Season.id == season_id).first()
    if not season:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Season not found")
    if season.community_id != admin.community_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your community")
    if season.status == req.status:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Season already has this status")

    season.status = req.status
    if req.status == "closed":
        season.ended_at = datetime.utcnow()
    db.commit()
    db.refresh(season)
    return _season_response(season)


@router.post("/seasons/{season_id}/finalize", response_model=FinalizeResponse)
def finalize_season(
    season_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    season = db.query(Season).filter(Season.id == season_id).first()
    if not season:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Season not found")
    if season.community_id != admin.community_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your community")
    if season.status != "closed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Season must be closed before finalizing")

    # S4: Aggregation logic
    matches = (
        db.query(Match)
        .filter(Match.season_id == season_id, Match.status == "completed")
        .all()
    )

    # Collect per-user win/loss from match results + participants
    user_stats = {}  # user_id -> {"wins": int, "losses": int}
    for match in matches:
        if not match.result or match.result == "draw":
            continue
        winning_team = "A" if match.result == "team_a" else "B"
        for p in match.participants:
            if p.status != "registered" or p.team is None:
                continue
            uid = p.user_id
            if uid not in user_stats:
                user_stats[uid] = {"wins": 0, "losses": 0}
            if p.team == winning_team:
                user_stats[uid]["wins"] += 1
            else:
                user_stats[uid]["losses"] += 1

    # Delete existing stats for idempotency
    db.query(SeasonStat).filter(SeasonStat.season_id == season_id).delete()

    # Get MMR for ranking
    user_ids = list(user_stats.keys())
    profiles = {}
    if user_ids:
        profile_rows = db.query(PlayerProfile).filter(PlayerProfile.user_id.in_(user_ids)).all()
        profiles = {p.user_id: p for p in profile_rows}

    # Sort by MMR desc for rank_position
    ranked_users = sorted(
        user_ids,
        key=lambda uid: profiles[uid].mmr if uid in profiles else 0,
        reverse=True,
    )

    stats_created = 0
    for rank_pos, uid in enumerate(ranked_users, start=1):
        s = user_stats[uid]
        total = s["wins"] + s["losses"]
        win_rate = (s["wins"] / total * 100) if total > 0 else 0.0
        profile = profiles.get(uid)

        stat = SeasonStat(
            season_id=season_id,
            user_id=uid,
            wins=s["wins"],
            losses=s["losses"],
            win_rate=round(win_rate, 2),
            final_mmr=profile.mmr if profile else None,
            rank_position=rank_pos,
        )
        db.add(stat)
        stats_created += 1

    db.commit()

    return FinalizeResponse(
        message="Season finalized successfully",
        stats_created=stats_created,
    )


# --- Member Management ---

@router.get("/members", response_model=List[AdminMemberResponse])
def list_members(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    users = (
        db.query(User)
        .options(joinedload(User.profile))
        .filter(User.community_id == admin.community_id)
        .all()
    )
    return [_member_response(u) for u in users]


@router.patch("/members/{user_id}", response_model=AdminMemberResponse)
def update_member(
    user_id: uuid.UUID,
    req: AdminMemberUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = (
        db.query(User)
        .options(joinedload(User.profile))
        .filter(User.id == user_id)
        .first()
    )
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.community_id != admin.community_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your community")

    if req.role is not None:
        user.role = req.role

    if req.current_rank is not None:
        if not user.profile:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User has no player profile")
        user.profile.current_rank = req.current_rank

    db.commit()
    db.refresh(user)
    return _member_response(user)


# --- Webhook ---

@router.patch("/community/webhook", response_model=WebhookResponse)
def update_webhook(
    req: WebhookUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    community = db.query(Community).filter(Community.id == admin.community_id).first()
    if not community:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Community not found")

    community.discord_webhook_url = req.webhook_url
    db.commit()
    db.refresh(community)

    return WebhookResponse(
        message="Webhook URL updated",
        webhook_url=community.discord_webhook_url,
    )


@router.post("/community/webhook/test", response_model=WebhookTestResponse)
def test_webhook(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    community = db.query(Community).filter(Community.id == admin.community_id).first()
    if not community:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Community not found")
    if not community.discord_webhook_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No webhook URL configured",
        )

    embed = {
        "title": "Webhook Test",
        "description": f"This is a test message from {community.name}.",
        "color": 0xF99E1A,
    }

    try:
        with httpx.Client() as client:
            resp = client.post(
                community.discord_webhook_url,
                json={"embeds": [embed]},
                timeout=10.0,
            )
            resp.raise_for_status()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to send test webhook",
        )

    return WebhookTestResponse(message="Test message sent successfully")
