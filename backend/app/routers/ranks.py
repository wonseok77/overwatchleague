import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, PlayerPositionRank
from app.models.season import Season
from app.services.auth import get_current_user
from app.services.mmr import rank_to_mmr

router = APIRouter(tags=["ranks"])


class PositionRankCreate(BaseModel):
    position: str               # "tank" | "dps" | "support"
    rank: str                   # "Diamond 3"
    season_id: Optional[str] = None


class PositionRankResponse(BaseModel):
    id: str
    user_id: str
    season_id: Optional[str] = None
    position: str
    rank: str
    mmr: Optional[int] = None
    updated_at: Optional[str] = None

    class Config:
        from_attributes = True


def _rank_response(r: PlayerPositionRank) -> PositionRankResponse:
    return PositionRankResponse(
        id=str(r.id),
        user_id=str(r.user_id),
        season_id=str(r.season_id) if r.season_id else None,
        position=r.position,
        rank=r.rank,
        mmr=r.mmr,
        updated_at=r.updated_at.isoformat() if r.updated_at else None,
    )


@router.get("/users/{user_id}/ranks", response_model=List[PositionRankResponse])
def get_user_ranks(
    user_id: uuid.UUID,
    season_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(PlayerPositionRank).filter(PlayerPositionRank.user_id == user_id)
    if season_id:
        query = query.filter(PlayerPositionRank.season_id == uuid.UUID(season_id))
    ranks = query.all()
    return [_rank_response(r) for r in ranks]


@router.put("/users/{user_id}/ranks", response_model=List[PositionRankResponse])
def set_user_ranks(
    user_id: uuid.UUID,
    body: List[PositionRankCreate],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.id != user_id and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    results = []
    for item in body:
        sid = uuid.UUID(item.season_id) if item.season_id else None
        existing = db.query(PlayerPositionRank).filter(
            PlayerPositionRank.user_id == user_id,
            PlayerPositionRank.season_id == sid if sid else PlayerPositionRank.season_id.is_(None),
            PlayerPositionRank.position == item.position,
        ).first()
        if existing:
            existing.rank = item.rank
            existing.mmr = rank_to_mmr(item.rank)
            existing.updated_at = datetime.utcnow()
            db.flush()
            results.append(existing)
        else:
            new_rank = PlayerPositionRank(
                id=uuid.uuid4(),
                user_id=user_id,
                season_id=sid,
                position=item.position,
                rank=item.rank,
                mmr=rank_to_mmr(item.rank),
            )
            db.add(new_rank)
            db.flush()
            results.append(new_rank)

    db.commit()
    for r in results:
        db.refresh(r)
    return [_rank_response(r) for r in results]


@router.get("/users/{user_id}/ranks/current", response_model=List[PositionRankResponse])
def get_current_ranks(
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ranks = db.query(PlayerPositionRank).filter(
        PlayerPositionRank.user_id == user_id,
        PlayerPositionRank.season_id.is_(None),
    ).all()
    return [_rank_response(r) for r in ranks]


@router.get("/users/{user_id}/ranks/season/{season_id}", response_model=List[PositionRankResponse])
def get_season_ranks(
    user_id: uuid.UUID,
    season_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    season = db.query(Season).filter(Season.id == season_id).first()
    if not season:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Season not found")

    ranks = db.query(PlayerPositionRank).filter(
        PlayerPositionRank.user_id == user_id,
        PlayerPositionRank.season_id == season_id,
    ).all()
    return [_rank_response(r) for r in ranks]
