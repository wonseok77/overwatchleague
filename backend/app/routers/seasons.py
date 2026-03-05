import uuid
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.community import Community
from app.models.season import Season
from app.models.user import User
from app.schemas.season import SeasonCreate, SeasonResponse
from app.services.auth import require_admin

router = APIRouter()


def _season_response(s: Season) -> SeasonResponse:
    return SeasonResponse(
        id=str(s.id),
        community_id=str(s.community_id),
        name=s.name,
        status=s.status,
        started_at=s.started_at.isoformat() if s.started_at else None,
        ended_at=s.ended_at.isoformat() if s.ended_at else None,
    )


@router.get("/communities/{community_id}/seasons", response_model=List[SeasonResponse])
def list_seasons(community_id: uuid.UUID, db: Session = Depends(get_db)):
    seasons = db.query(Season).filter(Season.community_id == community_id).all()
    return [_season_response(s) for s in seasons]


@router.post("/communities/{community_id}/seasons", response_model=SeasonResponse, status_code=status.HTTP_201_CREATED)
def create_season(
    community_id: uuid.UUID,
    req: SeasonCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    community = db.query(Community).filter(Community.id == community_id).first()
    if not community:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Community not found")

    season = Season(community_id=community_id, name=req.name)
    db.add(season)
    db.commit()
    db.refresh(season)
    return _season_response(season)


@router.put("/seasons/{season_id}/close", response_model=SeasonResponse)
def close_season(
    season_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    season = db.query(Season).filter(Season.id == season_id).first()
    if not season:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Season not found")
    if season.status == "closed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Season already closed")

    season.status = "closed"
    season.ended_at = datetime.utcnow()
    db.commit()
    db.refresh(season)
    return _season_response(season)
