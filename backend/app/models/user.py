import uuid
from datetime import datetime
from typing import Optional, List, TYPE_CHECKING

from sqlalchemy import String, Integer, Float, ForeignKey, DateTime, Enum as SAEnum, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    community_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("communities.id"), nullable=False)
    real_name: Mapped[str] = mapped_column(String(50), nullable=False)
    nickname: Mapped[str] = mapped_column(String(50), nullable=False)
    discord_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    email: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[str] = mapped_column(SAEnum("admin", "manager", "member", name="user_role"), default="member")
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    profile: Mapped[Optional["PlayerProfile"]] = relationship("PlayerProfile", back_populates="user", uselist=False)
    position_ranks: Mapped[List["PlayerPositionRank"]] = relationship("PlayerPositionRank", lazy="selectin")


class PlayerProfile(Base):
    __tablename__ = "player_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False)
    main_role: Mapped[str] = mapped_column(SAEnum("tank", "dps", "support", name="player_role"), nullable=False)
    current_rank: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    current_sr: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    main_heroes: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String(50)), nullable=True)
    mmr: Mapped[int] = mapped_column(Integer, default=1000)
    win_rate: Mapped[Optional[float]] = mapped_column(Float, default=0.0, nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="profile")


class PlayerPositionRank(Base):
    __tablename__ = "player_position_ranks"
    __table_args__ = (
        UniqueConstraint("user_id", "season_id", "position", name="uq_user_season_position"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    season_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("seasons.id"), nullable=True)
    position: Mapped[str] = mapped_column(
        SAEnum("tank", "dps", "support", name="position_type", create_type=False), nullable=False
    )
    rank: Mapped[str] = mapped_column(String(30), nullable=False)
    mmr: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
