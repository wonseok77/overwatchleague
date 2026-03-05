from typing import Optional
from pydantic import BaseModel


class CommunityCreate(BaseModel):
    name: str
    slug: str
    description: Optional[str] = None
    discord_webhook_url: Optional[str] = None


class CommunityResponse(BaseModel):
    id: str
    name: str
    slug: str
    description: Optional[str] = None
    discord_webhook_url: Optional[str] = None

    class Config:
        from_attributes = True
