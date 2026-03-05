from typing import Optional, List
from pydantic import BaseModel, EmailStr


class RegisterRequest(BaseModel):
    email: str
    password: str
    real_name: str
    nickname: str
    community_slug: str
    main_role: Optional[str] = None
    current_rank: Optional[str] = None
    main_heroes: Optional[List[str]] = None


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

    class Config:
        from_attributes = True
