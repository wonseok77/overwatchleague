import uuid
from datetime import datetime, date, time
from typing import Optional, List

from sqlalchemy import String, Integer, Boolean, Date, Time, ForeignKey, DateTime, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class MatchSession(Base):
    __tablename__ = "match_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    community_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("communities.id"), nullable=False)
    season_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("seasons.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    scheduled_date: Mapped[date] = mapped_column(Date, nullable=False)
    scheduled_start: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
    total_games: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(
        SAEnum("open", "closed", "in_progress", "completed", name="session_status"), default="open"
    )
    team_size: Mapped[int] = mapped_column(Integer, default=5)
    tank_count: Mapped[int] = mapped_column(Integer, default=1)
    dps_count: Mapped[int] = mapped_column(Integer, default=2)
    support_count: Mapped[int] = mapped_column(Integer, default=2)
    discord_announced: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    registrations: Mapped[List["SessionRegistration"]] = relationship(
        "SessionRegistration", back_populates="session", lazy="selectin"
    )
    matchmaking_results: Mapped[List["MatchmakingResult"]] = relationship(
        "MatchmakingResult", back_populates="session", lazy="selectin"
    )


class SessionRegistration(Base):
    __tablename__ = "session_registrations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("match_sessions.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    priority_1: Mapped[str] = mapped_column(
        SAEnum("tank", "dps", "support", name="position_type"), nullable=False
    )
    priority_2: Mapped[Optional[str]] = mapped_column(
        SAEnum("tank", "dps", "support", name="position_type", create_type=False), nullable=True
    )
    priority_3: Mapped[Optional[str]] = mapped_column(
        SAEnum("tank", "dps", "support", name="position_type", create_type=False), nullable=True
    )
    min_games: Mapped[int] = mapped_column(Integer, default=1)
    max_games: Mapped[int] = mapped_column(Integer, default=999)
    status: Mapped[str] = mapped_column(
        SAEnum("registered", "waitlist", "cancelled", name="registration_status"), default="registered"
    )
    registered_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["MatchSession"] = relationship("MatchSession", back_populates="registrations")


class MatchmakingResult(Base):
    __tablename__ = "matchmaking_results"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("match_sessions.id"), nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    is_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    algorithm_version: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    summary_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    session: Mapped["MatchSession"] = relationship("MatchSession", back_populates="matchmaking_results")
