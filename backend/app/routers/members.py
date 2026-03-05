import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.community import Community
from app.models.user import User, PlayerProfile
from app.schemas.user import MemberCreate, MemberUpdate, MemberResponse
from app.services.auth import hash_password, require_admin

router = APIRouter()


def _build_member_response(user: User) -> MemberResponse:
    profile = user.profile
    return MemberResponse(
        id=str(user.id),
        real_name=user.real_name,
        nickname=user.nickname,
        email=user.email,
        role=user.role,
        main_role=profile.main_role if profile else None,
        current_rank=profile.current_rank if profile else None,
        current_sr=profile.current_sr if profile else None,
        main_heroes=profile.main_heroes if profile else None,
        mmr=profile.mmr if profile else None,
    )


@router.get("/{community_id}/members", response_model=List[MemberResponse])
def list_members(community_id: uuid.UUID, db: Session = Depends(get_db)):
    users = db.query(User).filter(User.community_id == community_id).all()
    return [_build_member_response(u) for u in users]


@router.post("/{community_id}/members", response_model=MemberResponse, status_code=status.HTTP_201_CREATED)
def create_member(
    community_id: uuid.UUID,
    req: MemberCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    community = db.query(Community).filter(Community.id == community_id).first()
    if not community:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Community not found")

    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    user = User(
        community_id=community_id,
        real_name=req.real_name,
        nickname=req.nickname,
        email=req.email,
        password_hash=hash_password(req.password),
        role=req.role or "member",
    )
    db.add(user)
    db.flush()

    if req.main_role:
        profile = PlayerProfile(
            user_id=user.id,
            main_role=req.main_role,
            current_rank=req.current_rank,
            main_heroes=req.main_heroes,
        )
        db.add(profile)

    db.commit()
    db.refresh(user)
    return _build_member_response(user)


@router.put("/{community_id}/members/{user_id}", response_model=MemberResponse)
def update_member(
    community_id: uuid.UUID,
    user_id: uuid.UUID,
    req: MemberUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id, User.community_id == community_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    if req.nickname is not None:
        user.nickname = req.nickname
    if req.role is not None:
        user.role = req.role

    profile = user.profile
    if profile is None and req.main_role:
        profile = PlayerProfile(user_id=user.id, main_role=req.main_role)
        db.add(profile)

    if profile:
        if req.main_role is not None:
            profile.main_role = req.main_role
        if req.current_rank is not None:
            profile.current_rank = req.current_rank
        if req.current_sr is not None:
            profile.current_sr = req.current_sr
        if req.main_heroes is not None:
            profile.main_heroes = req.main_heroes

    db.commit()
    db.refresh(user)
    return _build_member_response(user)
