from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.community import Community
from app.models.user import User
from app.schemas.community import CommunityCreate, CommunityResponse
from app.services.auth import require_admin

router = APIRouter()


@router.post("", response_model=CommunityResponse, status_code=status.HTTP_201_CREATED)
def create_community(req: CommunityCreate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    if db.query(Community).filter(Community.slug == req.slug).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Slug already exists")

    community = Community(
        name=req.name,
        slug=req.slug,
        description=req.description,
        discord_webhook_url=req.discord_webhook_url,
    )
    db.add(community)
    db.commit()
    db.refresh(community)
    return CommunityResponse(
        id=str(community.id),
        name=community.name,
        slug=community.slug,
        description=community.description,
        discord_webhook_url=community.discord_webhook_url,
    )


@router.get("/{slug}", response_model=CommunityResponse)
def get_community(slug: str, db: Session = Depends(get_db)):
    community = db.query(Community).filter(Community.slug == slug).first()
    if not community:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Community not found")
    return CommunityResponse(
        id=str(community.id),
        name=community.name,
        slug=community.slug,
        description=community.description,
        discord_webhook_url=community.discord_webhook_url,
    )
