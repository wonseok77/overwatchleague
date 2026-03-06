import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.community import Community
from app.models.user import User, PlayerProfile, PlayerPositionRank
from app.schemas.user import MemberCreate, MemberUpdate, MemberResponse
from app.services.auth import hash_password, require_admin, get_current_user

router = APIRouter()


# --- Leaderboard ---

class LeaderboardPositionRank(BaseModel):
    position: str
    rank: str
    mmr: Optional[int] = None


class LeaderboardEntry(BaseModel):
    id: str
    nickname: str
    real_name: str
    avatar_url: Optional[str] = None
    main_role: Optional[str] = None
    main_heroes: Optional[List[str]] = None
    mmr: Optional[int] = None
    position_ranks: List[LeaderboardPositionRank] = []


@router.get("/{community_id}/leaderboard", response_model=List[LeaderboardEntry])
def get_leaderboard(
    community_id: uuid.UUID,
    season_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    users = (
        db.query(User)
        .options(joinedload(User.profile), joinedload(User.position_ranks))
        .filter(User.community_id == community_id)
        .all()
    )

    result = []
    seen = set()
    for user in users:
        if user.id in seen:
            continue
        seen.add(user.id)

        if season_id:
            sid = uuid.UUID(season_id)
            pos_ranks = [pr for pr in (user.position_ranks or []) if pr.season_id == sid]
        else:
            # "전체" 선택: 모든 시즌 랭크 중 포지션별 최고 MMR 선택
            best_by_pos: dict = {}
            for pr in (user.position_ranks or []):
                existing = best_by_pos.get(pr.position)
                if existing is None or (pr.mmr or 0) > (existing.mmr or 0):
                    best_by_pos[pr.position] = pr
            pos_ranks = list(best_by_pos.values())

        profile = user.profile
        # 가장 높은 포지션 MMR을 대표 MMR로 사용
        max_mmr = max((pr.mmr for pr in pos_ranks if pr.mmr is not None), default=None)
        if max_mmr is None and profile:
            max_mmr = profile.mmr

        result.append(LeaderboardEntry(
            id=str(user.id),
            nickname=user.nickname,
            real_name=user.real_name,
            avatar_url=user.avatar_url,
            main_role=profile.main_role if profile else None,
            main_heroes=profile.main_heroes if profile else None,
            mmr=max_mmr,
            position_ranks=[
                LeaderboardPositionRank(position=pr.position, rank=pr.rank, mmr=pr.mmr)
                for pr in pos_ranks
            ],
        ))

    result.sort(key=lambda x: x.mmr or 0, reverse=True)
    return result


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
