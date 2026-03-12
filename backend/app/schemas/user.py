from typing import Optional, List
from pydantic import BaseModel


class MemberCreate(BaseModel):
    real_name: str
    nickname: str
    email: str
    password: str
    main_role: Optional[str] = None
    main_heroes: Optional[List[str]] = None
    role: Optional[str] = "member"


class MemberUpdate(BaseModel):
    nickname: Optional[str] = None
    main_role: Optional[str] = None
    current_sr: Optional[int] = None
    main_heroes: Optional[List[str]] = None
    role: Optional[str] = None


class MemberResponse(BaseModel):
    id: str
    real_name: str
    nickname: str
    email: str
    role: str
    main_role: Optional[str] = None
    current_sr: Optional[int] = None
    main_heroes: Optional[List[str]] = None
    mmr: Optional[int] = None

    class Config:
        from_attributes = True
