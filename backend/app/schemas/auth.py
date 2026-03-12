from typing import Optional, List
from pydantic import BaseModel, EmailStr


class PositionRankInput(BaseModel):
    position: str  # "tank" | "dps" | "support"
    rank: str


class RegisterRequest(BaseModel):
    email: str
    password: str
    real_name: str
    nickname: str
    community_slug: str
    main_role: Optional[str] = None
    main_heroes: Optional[List[str]] = None
    position_ranks: Optional[List[PositionRankInput]] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: str
    email: str
    real_name: str
    nickname: str
    role: str
    community_id: str
    avatar_url: Optional[str] = None

    class Config:
        from_attributes = True
