from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.community import Community
from app.models.user import User, PlayerProfile
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, UserResponse
from app.services.auth import hash_password, verify_password, create_access_token, get_current_user

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
            current_rank=req.current_rank,
            main_heroes=req.main_heroes if req.main_heroes else None,
        )
        db.add(profile)

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
    )
