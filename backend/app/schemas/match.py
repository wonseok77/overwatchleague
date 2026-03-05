from typing import Optional
from pydantic import BaseModel


class MatchCreate(BaseModel):
    title: str
    scheduled_at: str


class MatchResponse(BaseModel):
    id: str
    community_id: str
    season_id: str
    title: str
    scheduled_at: Optional[str] = None
    status: str
    map_name: Optional[str] = None
    team_a_score: Optional[int] = None
    team_b_score: Optional[int] = None
    result: Optional[str] = None

    class Config:
        from_attributes = True


class ParticipantResponse(BaseModel):
    id: str
    match_id: str
    user_id: str
    status: str
    team: Optional[str] = None

    class Config:
        from_attributes = True
