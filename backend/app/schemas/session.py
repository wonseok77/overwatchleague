from typing import Optional, List
from pydantic import BaseModel


class SessionCreate(BaseModel):
    title: str
    scheduled_date: str          # "YYYY-MM-DD"
    scheduled_start: Optional[str] = None  # "HH:MM"
    total_games: int = 0
    team_size: int = 5
    tank_count: int = 1
    dps_count: int = 2
    support_count: int = 2


class SessionUpdate(BaseModel):
    title: Optional[str] = None
    scheduled_date: Optional[str] = None
    scheduled_start: Optional[str] = None
    total_games: Optional[int] = None
    team_size: Optional[int] = None
    tank_count: Optional[int] = None
    dps_count: Optional[int] = None
    support_count: Optional[int] = None
    status: Optional[str] = None


class SessionResponse(BaseModel):
    id: str
    community_id: str
    season_id: str
    title: str
    scheduled_date: str
    scheduled_start: Optional[str] = None
    total_games: int
    status: str
    team_size: int
    tank_count: int
    dps_count: int
    support_count: int
    discord_announced: bool
    created_at: Optional[str] = None
    registration_count: Optional[int] = None

    class Config:
        from_attributes = True


class SessionRegistrationCreate(BaseModel):
    priority_1: str              # "tank" | "dps" | "support"
    priority_2: Optional[str] = None
    priority_3: Optional[str] = None
    min_games: int = 1
    max_games: int = 999


class PositionRankInfo(BaseModel):
    position: str
    rank: str
    mmr: Optional[int] = None


class SessionRegistrationResponse(BaseModel):
    id: str
    session_id: str
    user_id: str
    priority_1: str
    priority_2: Optional[str] = None
    priority_3: Optional[str] = None
    min_games: int
    max_games: int
    status: str
    registered_at: Optional[str] = None
    nickname: Optional[str] = None
    position_ranks: List[PositionRankInfo] = []

    class Config:
        from_attributes = True
