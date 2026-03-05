from typing import Optional
from pydantic import BaseModel


class SeasonCreate(BaseModel):
    name: str


class SeasonResponse(BaseModel):
    id: str
    community_id: str
    name: str
    status: str
    started_at: Optional[str] = None
    ended_at: Optional[str] = None

    class Config:
        from_attributes = True
