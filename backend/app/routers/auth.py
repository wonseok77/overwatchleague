import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.community import Community
from app.models.season import Season
from app.models.user import User, PlayerProfile, PlayerPositionRank
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, UserResponse
from app.services.auth import hash_password, verify_password, create_access_token, get_current_user
from app.services.mmr import rank_to_mmr

router = APIRouter()


@router.post("/register", response_model=TokenResponse)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    community = db.query(Community).filter(Community.slug == req.community_slug).first()
    if not community:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Community not found")

    user = User(
        community_id=community.id,
        real_name=req.real_name,
        nickname=req.nickname,
        email=req.email,
        password_hash=hash_password(req.password),
        role="member",
    )
    db.add(user)
    db.flush()

    if req.main_role:
        profile = PlayerProfile(
            user_id=user.id,
            main_role=req.main_role,
            main_heroes=req.main_heroes if req.main_heroes else None,
        )
        db.add(profile)

    # 포지션 랭크 저장
    if req.position_ranks:
        active_season = db.query(Season).filter(
            Season.community_id == community.id, Season.status == "active"
        ).first()
        for pr in req.position_ranks:
            mmr = rank_to_mmr(pr.rank)
            new_rank = PlayerPositionRank(
                id=uuid.uuid4(),
                user_id=user.id,
                season_id=active_season.id if active_season else None,
                position=pr.position,
                rank=pr.rank,
                mmr=mmr,
            )
            db.add(new_rank)

    db.commit()
    db.refresh(user)

    token = create_access_token(user)
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_access_token(user)
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        real_name=current_user.real_name,
        nickname=current_user.nickname,
        role=current_user.role,
        community_id=str(current_user.community_id),
        avatar_url=current_user.avatar_url,
    )
