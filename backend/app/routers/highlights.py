import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.match import Match, Highlight
from app.models.user import User
from app.services.auth import get_current_user, require_admin

router = APIRouter()


class HighlightCreate(BaseModel):
    title: str
    youtube_url: str
    user_id: Optional[str] = None


class HighlightResponse(BaseModel):
    id: str
    match_id: str
    user_id: Optional[str] = None
    title: str
    youtube_url: str
    registered_at: str
    match_title: Optional[str] = None

    class Config:
        from_attributes = True


def _highlight_response(h: Highlight) -> HighlightResponse:
    return HighlightResponse(
        id=str(h.id),
        match_id=str(h.match_id),
        user_id=str(h.user_id) if h.user_id else None,
        title=h.title,
        youtube_url=h.youtube_url,
        registered_at=h.registered_at.isoformat(),
        match_title=h.match.title if h.match else None,
    )


@router.get("/communities/{community_id}/highlights", response_model=List[HighlightResponse])
def list_community_highlights(
    community_id: uuid.UUID,
    limit: int = 20,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    highlights = (
        db.query(Highlight)
        .join(Match, Highlight.match_id == Match.id)
        .options(joinedload(Highlight.match))
        .filter(Match.community_id == community_id)
        .order_by(Highlight.registered_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [_highlight_response(h) for h in highlights]


@router.get("/matches/{match_id}/highlights", response_model=List[HighlightResponse])
def list_match_highlights(match_id: uuid.UUID, db: Session = Depends(get_db)):
    highlights = (
        db.query(Highlight)
        .filter(Highlight.match_id == match_id)
        .order_by(Highlight.registered_at.desc())
        .all()
    )
    return [_highlight_response(h) for h in highlights]


@router.post("/matches/{match_id}/highlights", response_model=HighlightResponse, status_code=status.HTTP_201_CREATED)
def create_highlight(
    match_id: uuid.UUID,
    req: HighlightCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")

    highlight = Highlight(
        match_id=match_id,
        user_id=uuid.UUID(req.user_id) if req.user_id else None,
        title=req.title,
        youtube_url=req.youtube_url,
    )
    db.add(highlight)
    db.commit()
    db.refresh(highlight)
    return _highlight_response(highlight)


@router.delete("/highlights/{highlight_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_highlight(
    highlight_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    highlight = db.query(Highlight).filter(Highlight.id == highlight_id).first()
    if not highlight:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Highlight not found")
    db.delete(highlight)
    db.commit()
