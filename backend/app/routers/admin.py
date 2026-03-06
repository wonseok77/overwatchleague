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
from app.models.session import SessionRegistration
from app.models.user import User, PlayerProfile, PlayerPositionRank
from app.services.auth import require_admin, require_manager_or_admin
from app.services.discord import send_discord_webhook
from app.services.mmr import mmr_to_rank

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
    started_at: Optional[str] = None  # ISO date string, optional
    ended_at: Optional[str] = None  # ISO date string, optional


class AdminSeasonUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None  # "active" | "closed"
    started_at: Optional[str] = None  # ISO date string
    ended_at: Optional[str] = None  # ISO date string


class FinalizeResponse(BaseModel):
    message: str
    stats_created: int


class PositionRankInfo(BaseModel):
    position: str
    rank: str
    mmr: Optional[int] = None


class AdminMemberResponse(BaseModel):
    user_id: str
    nickname: str
    real_name: str
    email: str
    role: str
    avatar_url: Optional[str] = None
    main_role: Optional[str] = None
    current_rank: Optional[str] = None
    mmr: Optional[int] = None
    position_ranks: List[PositionRankInfo] = []

    class Config:
        from_attributes = True


class AdminMemberUpdate(BaseModel):
    role: Optional[str] = None
    current_rank: Optional[str] = None
    nickname: Optional[str] = None
    real_name: Optional[str] = None
    main_role: Optional[str] = None  # tank | dps | support
    main_heroes: Optional[List[str]] = None


class AdminPositionRankUpdate(BaseModel):
    position: str  # "tank" | "dps" | "support"
    mmr: int


class AdminPositionRanksUpdate(BaseModel):
    position_ranks: List[AdminPositionRankUpdate]


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
    position_ranks_data = [
        PositionRankInfo(
            position=pr.position,
            rank=pr.rank,
            mmr=pr.mmr,
        )
        for pr in (user.position_ranks if hasattr(user, 'position_ranks') and user.position_ranks else [])
        if pr.season_id is None  # 시즌 미지정 = 현재 전역 랭크
    ]
    return AdminMemberResponse(
        user_id=str(user.id),
        nickname=user.nickname,
        real_name=user.real_name,
        email=user.email,
        role=user.role,
        avatar_url=user.avatar_url,
        main_role=profile.main_role if profile else None,
        current_rank=profile.current_rank if profile else None,
        mmr=profile.mmr if profile else None,
        position_ranks=position_ranks_data,
    )


# --- Season Management ---

@router.get("/seasons", response_model=List[AdminSeasonResponse])
def list_seasons(
    db: Session = Depends(get_db),
    admin: User = Depends(require_manager_or_admin),
):
    seasons = db.query(Season).filter(Season.community_id == admin.community_id).all()
    return [_season_response(s) for s in seasons]


@router.post("/seasons", response_model=AdminSeasonResponse, status_code=status.HTTP_201_CREATED)
def create_season(
    req: AdminSeasonCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_manager_or_admin),
):
    season = Season(community_id=admin.community_id, name=req.name)
    if req.started_at:
        season.started_at = datetime.fromisoformat(req.started_at)
    if req.ended_at:
        season.ended_at = datetime.fromisoformat(req.ended_at)
    db.add(season)
    db.commit()
    db.refresh(season)
    return _season_response(season)


@router.patch("/seasons/{season_id}", response_model=AdminSeasonResponse)
def update_season(
    season_id: uuid.UUID,
    req: AdminSeasonUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_manager_or_admin),
):
    season = db.query(Season).filter(Season.id == season_id).first()
    if not season:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Season not found")
    if season.community_id != admin.community_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your community")
    if req.name:
        season.name = req.name
    if req.status:
        season.status = req.status
        if req.status == "closed" and not req.ended_at and not season.ended_at:
            season.ended_at = datetime.utcnow()
        if req.status == "active":
            season.ended_at = None
    if req.started_at:
        season.started_at = datetime.fromisoformat(req.started_at)
    if req.ended_at:
        season.ended_at = datetime.fromisoformat(req.ended_at)
    db.commit()
    db.refresh(season)
    return _season_response(season)


@router.delete("/seasons/{season_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_season(
    season_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_manager_or_admin),
):
    season = db.query(Season).filter(Season.id == season_id).first()
    if not season:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Season not found")
    if season.community_id != admin.community_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your community")

    # 관련 데이터 확인 - 매치가 있으면 삭제 불가
    match_count = db.query(Match).filter(Match.season_id == season_id).count()
    if match_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete season with {match_count} matches. Delete matches first."
        )

    # 세션도 확인
    from app.models.session import MatchSession
    session_count = db.query(MatchSession).filter(MatchSession.season_id == season_id).count()
    if session_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete season with {session_count} sessions. Delete sessions first."
        )

    db.delete(season)
    db.commit()


@router.post("/seasons/{season_id}/finalize", response_model=FinalizeResponse)
def finalize_season(
    season_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_manager_or_admin),
):
    season = db.query(Season).filter(Season.id == season_id).first()
    if not season:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Season not found")
    if season.community_id != admin.community_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your community")
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
        .options(joinedload(User.profile), joinedload(User.position_ranks))
        .filter(User.community_id == admin.community_id)
        .all()
    )
    # deduplicate due to joinedload producing cartesian product
    seen = set()
    unique_users = []
    for u in users:
        if u.id not in seen:
            seen.add(u.id)
            unique_users.append(u)
    return [_member_response(u) for u in unique_users]


@router.patch("/members/{user_id}", response_model=AdminMemberResponse)
def update_member(
    user_id: uuid.UUID,
    req: AdminMemberUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = (
        db.query(User)
        .options(joinedload(User.profile), joinedload(User.position_ranks))
        .filter(User.id == user_id)
        .first()
    )
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.community_id != admin.community_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your community")

    if req.role is not None:
        user.role = req.role

    if req.nickname is not None:
        user.nickname = req.nickname

    if req.real_name is not None:
        user.real_name = req.real_name

    if req.current_rank is not None:
        if not user.profile:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User has no player profile")
        user.profile.current_rank = req.current_rank

    if req.main_role is not None or req.main_heroes is not None:
        if not user.profile:
            user.profile = PlayerProfile(
                id=uuid.uuid4(),
                user_id=user.id,
            )
            db.add(user.profile)
        if req.main_role is not None:
            user.profile.main_role = req.main_role
        if req.main_heroes is not None:
            user.profile.main_heroes = req.main_heroes

    db.commit()
    db.refresh(user)
    return _member_response(user)


@router.delete("/members/{user_id}")
def delete_member(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.community_id != admin.community_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your community")
    if admin.id == user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete yourself")

    if user.profile:
        db.delete(user.profile)
    if user.position_ranks:
        for pr in user.position_ranks:
            db.delete(pr)
    db.query(SessionRegistration).filter(SessionRegistration.user_id == user_id).delete()
    db.delete(user)
    db.commit()

    return {"message": "Member deleted"}


# --- Admin MMR Edit ---

class AdminPositionRankUpdate(BaseModel):
    position: str  # "tank" | "dps" | "support"
    mmr: int


class AdminPositionRanksUpdate(BaseModel):
    position_ranks: List[AdminPositionRankUpdate]


@router.patch("/members/{user_id}/position-ranks", response_model=AdminMemberResponse)
def update_member_position_ranks(
    user_id: uuid.UUID,
    req: AdminPositionRanksUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = (
        db.query(User)
        .options(joinedload(User.profile), joinedload(User.position_ranks))
        .filter(User.id == user_id)
        .first()
    )
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.community_id != admin.community_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your community")

    for item in req.position_ranks:
        existing = db.query(PlayerPositionRank).filter(
            PlayerPositionRank.user_id == user_id,
            PlayerPositionRank.season_id.is_(None),
            PlayerPositionRank.position == item.position,
        ).first()
        rank_str = mmr_to_rank(item.mmr)
        if existing:
            existing.mmr = item.mmr
            existing.rank = rank_str
            existing.updated_at = datetime.utcnow()
        else:
            new_rank = PlayerPositionRank(
                id=uuid.uuid4(),
                user_id=user_id,
                season_id=None,
                position=item.position,
                rank=rank_str,
                mmr=item.mmr,
            )
            db.add(new_rank)

    db.commit()
    db.refresh(user)
    return _member_response(user)


# --- Admin MMR Edit ---

@router.patch("/members/{user_id}/position-ranks", response_model=AdminMemberResponse)
def update_member_position_ranks(
    user_id: uuid.UUID,
    req: AdminPositionRanksUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = (
        db.query(User)
        .options(joinedload(User.profile), joinedload(User.position_ranks))
        .filter(User.id == user_id)
        .first()
    )
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.community_id != admin.community_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your community")

    for item in req.position_ranks:
        existing = db.query(PlayerPositionRank).filter(
            PlayerPositionRank.user_id == user_id,
            PlayerPositionRank.season_id.is_(None),
            PlayerPositionRank.position == item.position,
        ).first()
        rank_str = mmr_to_rank(item.mmr)
        if existing:
            existing.mmr = item.mmr
            existing.rank = rank_str
            existing.updated_at = datetime.utcnow()
        else:
            new_rank = PlayerPositionRank(
                id=uuid.uuid4(),
                user_id=user_id,
                season_id=None,
                position=item.position,
                rank=rank_str,
                mmr=item.mmr,
            )
            db.add(new_rank)

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
