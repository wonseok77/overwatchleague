import uuid
from datetime import datetime
from typing import Optional, List

from sqlalchemy import String, Integer, Float, Boolean, ForeignKey, DateTime, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Match(Base):
    __tablename__ = "matches"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    community_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("communities.id"), nullable=False)
    season_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("seasons.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[str] = mapped_column(
        SAEnum("open", "closed", "in_progress", "completed", name="match_status"), default="open"
    )
    map_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    team_a_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    team_b_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    result: Mapped[Optional[str]] = mapped_column(
        SAEnum("team_a", "team_b", "draw", name="match_result"), nullable=True
    )
    discord_announced: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    participants: Mapped[List["MatchParticipant"]] = relationship("MatchParticipant", back_populates="match", lazy="selectin")
    stats: Mapped[List["PlayerMatchStat"]] = relationship("PlayerMatchStat", back_populates="match", lazy="selectin")
    highlights: Mapped[List["Highlight"]] = relationship("Highlight", back_populates="match", lazy="selectin")


class MatchParticipant(Base):
    __tablename__ = "match_participants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    match_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("matches.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    status: Mapped[str] = mapped_column(
        SAEnum("registered", "waitlist", "cancelled", "confirmed", name="participant_status"), default="registered"
    )
    team: Mapped[Optional[str]] = mapped_column(SAEnum("A", "B", name="team_side"), nullable=True)
    registered_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    session_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("match_sessions.id"), nullable=True
    )
    assigned_position: Mapped[Optional[str]] = mapped_column(
        SAEnum("tank", "dps", "support", name="position_type", create_type=False), nullable=True
    )
    priority_used: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    session_game_no: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    match: Mapped["Match"] = relationship("Match", back_populates="participants")


class PlayerMatchStat(Base):
    __tablename__ = "player_match_stats"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    match_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("matches.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    heroes_played: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String(50)), nullable=True)
    screenshot_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    mmr_before: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    mmr_after: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    mmr_change: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    kills: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    deaths: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    assists: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    damage_dealt: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    healing_done: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    damage_mitigated: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    survivability_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    stat_source: Mapped[Optional[str]] = mapped_column(
        SAEnum("manual", "ocr", name="stat_source_type"), nullable=True
    )

    match: Mapped["Match"] = relationship("Match", back_populates="stats")


class Highlight(Base):
    __tablename__ = "highlights"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    match_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("matches.id"), nullable=False)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    youtube_url: Mapped[str] = mapped_column(String(500), nullable=False)
    registered_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    match: Mapped["Match"] = relationship("Match", back_populates="highlights")


class SeasonStat(Base):
    __tablename__ = "season_stats"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    season_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("seasons.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    wins: Mapped[int] = mapped_column(Integer, default=0)
    losses: Mapped[int] = mapped_column(Integer, default=0)
    win_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    final_mmr: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    rank_position: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
