# Phase 5 API 계약서: 매치메이킹 고도화

> 작성: pichai (시스템 아키텍트)
> 기준: SPEC.md "매치메이킹 시스템 (Phase 5)" 섹션
> OCR 관련 모델/API 제외 (다음 스코프)

---

## 공통 사항

- Python 3.9 호환: `Optional[str]` 사용 (`str | None` 불가)
- UUID 필드 응답에서 `str` 직렬화 (기존 패턴)
- 인증: `Authorization: Bearer {token}` + `get_current_user` / `require_admin`
- 에러: HTTPException (400/401/403/404)
- SAEnum name 인자 필수 (PostgreSQL enum 타입명)
- mapped_column + Mapped 타입 힌트 패턴

---

## 1. 신규 SQLAlchemy 모델

### 1.1 `MatchSession` (match_sessions)

파일: `backend/app/models/session.py` (신규)

```python
import uuid
from datetime import datetime, date, time
from typing import Optional, List

from sqlalchemy import String, Integer, Boolean, Date, Time, ForeignKey, DateTime, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
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
```

### 1.2 `SessionRegistration` (session_registrations)

파일: `backend/app/models/session.py` (같은 파일)

```python
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
```

**주의: `position_type` enum 재사용**
- priority_1이 enum을 최초 생성 → priority_2/3은 `create_type=False`
- `assigned_position` (MatchParticipant 확장)도 동일 enum 재사용

### 1.3 `MatchmakingResult` (matchmaking_results)

파일: `backend/app/models/session.py` (같은 파일)

```python
from sqlalchemy.dialects.postgresql import JSONB

class MatchmakingResult(Base):
    __tablename__ = "matchmaking_results"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("match_sessions.id"), nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    is_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    algorithm_version: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    summary_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    session: Mapped["MatchSession"] = relationship("MatchSession", back_populates="matchmaking_results")
```

### 1.4 `PlayerPositionRank` (player_position_ranks)

파일: `backend/app/models/user.py` (기존 파일에 추가)

```python
from sqlalchemy import UniqueConstraint

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
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

---

## 2. 기존 모델 확장 컬럼

### 2.1 `MatchParticipant` 확장

파일: `backend/app/models/match.py` (기존)

추가 컬럼:

```python
# match_participants 테이블에 추가
session_id: Mapped[Optional[uuid.UUID]] = mapped_column(
    UUID(as_uuid=True), ForeignKey("match_sessions.id"), nullable=True
)
assigned_position: Mapped[Optional[str]] = mapped_column(
    SAEnum("tank", "dps", "support", name="position_type", create_type=False), nullable=True
)
priority_used: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
session_game_no: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
```

**nullable=True**: 기존 Phase 1~4 레코드는 이 컬럼이 NULL (하위 호환)

### 2.2 `PlayerMatchStat` 확장

파일: `backend/app/models/match.py` (기존)

추가 컬럼:

```python
# player_match_stats 테이블에 추가
kills: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
deaths: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
assists: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
damage_dealt: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
healing_done: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
survivability_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
stat_source: Mapped[Optional[str]] = mapped_column(
    SAEnum("manual", "ocr", name="stat_source_type"), nullable=True
)
```

### 2.3 `PlayerProfile` 확장

파일: `backend/app/models/user.py` (기존)

추가 컬럼:

```python
# player_profiles 테이블에 추가
win_rate: Mapped[Optional[float]] = mapped_column(Float, default=0.0, nullable=True)
```

---

## 3. models/__init__.py 업데이트

```python
from app.models.community import Community
from app.models.user import User, PlayerProfile, PlayerPositionRank
from app.models.season import Season
from app.models.match import Match, MatchParticipant, PlayerMatchStat, Highlight, SeasonStat
from app.models.session import MatchSession, SessionRegistration, MatchmakingResult

__all__ = [
    "Community",
    "User",
    "PlayerProfile",
    "PlayerPositionRank",
    "Season",
    "Match",
    "MatchParticipant",
    "PlayerMatchStat",
    "Highlight",
    "SeasonStat",
    "MatchSession",
    "SessionRegistration",
    "MatchmakingResult",
]
```

---

## 4. Pydantic 스키마

파일: `backend/app/schemas/session.py` (신규)

### 4.1 세션 스키마

```python
from typing import Optional, List, Any
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
    status: Optional[str] = None   # "open" | "closed" | "in_progress" | "completed"


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
    registration_count: Optional[int] = None  # 응답 시 서버에서 계산하여 추가

    class Config:
        from_attributes = True
```

### 4.2 신청 스키마

```python
class SessionRegistrationCreate(BaseModel):
    priority_1: str              # "tank" | "dps" | "support"
    priority_2: Optional[str] = None
    priority_3: Optional[str] = None
    min_games: int = 1
    max_games: int = 999


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
    # 조인 필드 (신청자 목록 조회 시)
    nickname: Optional[str] = None
    current_rank: Optional[str] = None

    class Config:
        from_attributes = True
```

### 4.3 매치메이킹 스키마

```python
class MatchmakeRequest(BaseModel):
    """매치메이킹 실행 트리거. 가중치 오버라이드 가능."""
    rank_weight: float = 0.3
    mmr_weight: float = 0.4
    win_rate_weight: float = 0.2
    stat_score_weight: float = 0.1


class MatchmakePlayerResult(BaseModel):
    user_id: str
    nickname: str
    assigned_position: str
    priority_used: int
    balance_score: float
    assignment_reason: str


class MatchmakeGameResult(BaseModel):
    game_no: int
    team_a: List[MatchmakePlayerResult]
    team_b: List[MatchmakePlayerResult]
    balance_summary: dict  # {team_a_score, team_b_score, score_diff, role_distribution}


class MatchmakePreview(BaseModel):
    id: str                        # matchmaking_results.id
    session_id: str
    generated_at: Optional[str] = None
    is_confirmed: bool
    games: List[MatchmakeGameResult]
    waitlist: List[str]            # user_id 목록
    player_game_counts: dict       # {user_id: count}
    stats: dict                    # {avg_games_per_player, max/min, avg_priority_used, ...}
```

### 4.4 포지션 랭크 스키마

파일: `backend/app/schemas/user.py` (기존 파일에 추가)

```python
class PositionRankCreate(BaseModel):
    position: str               # "tank" | "dps" | "support"
    rank: str                   # "Diamond 3"
    season_id: Optional[str] = None  # None = 현재 공식 시즌


class PositionRankResponse(BaseModel):
    id: str
    user_id: str
    season_id: Optional[str] = None
    position: str
    rank: str
    updated_at: Optional[str] = None

    class Config:
        from_attributes = True
```

---

## 5. API 엔드포인트

### 5.1 세션 관리 (라우터: `backend/app/routers/sessions.py` 신규)

| 메서드 | 경로 | 권한 | Request | Response | 설명 |
|--------|------|------|---------|----------|------|
| GET | `/seasons/{season_id}/sessions` | member+ | - | `List[SessionResponse]` | 세션 목록 (달력 뷰) |
| POST | `/seasons/{season_id}/sessions` | admin | `SessionCreate` | `SessionResponse` (201) | 세션 생성 |
| GET | `/sessions/{session_id}` | member+ | - | `SessionResponse` + registrations | 세션 상세 |
| PATCH | `/sessions/{session_id}` | admin | `SessionUpdate` | `SessionResponse` | 세션 수정 |
| DELETE | `/sessions/{session_id}` | admin | - | `{"message": "Session deleted"}` | 세션 삭제 |

**로직 주의:**
- POST 시 `community_id`는 admin.community_id에서 자동 설정
- GET 목록은 `?month=YYYY-MM` 쿼리 파라미터로 월별 필터 지원
- DELETE는 status="open"일 때만 허용 (in_progress/completed 불가)

### 5.2 세션 신청 (같은 라우터)

| 메서드 | 경로 | 권한 | Request | Response | 설명 |
|--------|------|------|---------|----------|------|
| POST | `/sessions/{session_id}/register` | member+ | `SessionRegistrationCreate` | `SessionRegistrationResponse` (201) | 신청 |
| DELETE | `/sessions/{session_id}/register` | member+ | - | `{"message": "Registration cancelled"}` | 신청 취소 |
| GET | `/sessions/{session_id}/registrations` | admin | - | `List[SessionRegistrationResponse]` | 신청자 목록 |
| PATCH | `/sessions/{session_id}/registrations/{user_id}` | admin | `SessionRegistrationCreate` | `SessionRegistrationResponse` | 신청 수정 |

**로직 주의:**
- POST register: 중복 신청 방지 (user_id + session_id 유니크 체크)
- DELETE register: status="cancelled"로 소프트 삭제
- session.status == "open"일 때만 신청/취소 허용

### 5.3 매치메이킹 실행 (같은 라우터)

| 메서드 | 경로 | 권한 | Request | Response | 설명 |
|--------|------|------|---------|----------|------|
| POST | `/sessions/{session_id}/matchmake` | admin | `MatchmakeRequest` | `MatchmakePreview` | 매치메이킹 실행 |
| GET | `/sessions/{session_id}/matchmake/preview` | admin | - | `MatchmakePreview` | 최신 미리보기 |
| PATCH | `/sessions/{session_id}/matchmake/preview` | admin | 부분 수정 JSON | `MatchmakePreview` | 수동 조정 |
| POST | `/sessions/{session_id}/matchmake/confirm` | admin | - | `{"message": "...", "matches_created": N}` | 확정 → matches 생성 |

**로직 주의:**
- POST matchmake: session.status를 "closed"로 변경 후 실행 (신규 신청 차단)
- POST confirm: `matchmaking_results.is_confirmed = True` + Match N개 + MatchParticipant 일괄 생성
- confirm 시 session.status = "in_progress"로 변경

### 5.4 포지션 랭크 API (라우터: `backend/app/routers/ranks.py` 신규)

| 메서드 | 경로 | 권한 | Request | Response | 설명 |
|--------|------|------|---------|----------|------|
| GET | `/users/{user_id}/ranks` | member+ | `?season_id=` | `List[PositionRankResponse]` | 포지션별 랭크 목록 |
| PUT | `/users/{user_id}/ranks` | 본인 or admin | `List[PositionRankCreate]` | `List[PositionRankResponse]` | 포지션별 랭크 설정 |
| GET | `/users/{user_id}/ranks/current` | member+ | - | `List[PositionRankResponse]` | 현재 시즌 랭크 요약 |

**로직 주의:**
- PUT: upsert 패턴 (user_id + season_id + position UNIQUE 제약)
- 본인 체크: `current_user.id == user_id or current_user.role == "admin"`
- GET current: `season_id IS NULL` 또는 현재 active 시즌 기준 필터

---

## 6. Alembic Migration 전략

파일: `backend/alembic/versions/002_phase5_matchmaking.py`

하나의 마이그레이션 파일에 모든 변경 통합:

```python
"""Phase 5: matchmaking enhancement

Revision ID: 002_phase5_matchmaking
Revises: 001_add_avatar_url
Create Date: 2026-03-06
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = '002_phase5_matchmaking'
down_revision = '001_add_avatar_url'
branch_labels = None
depends_on = None


def upgrade():
    # 1. position_type enum 생성
    position_type = sa.Enum('tank', 'dps', 'support', name='position_type')
    position_type.create(op.get_bind(), checkfirst=True)

    # 2. session_status enum 생성
    session_status = sa.Enum('open', 'closed', 'in_progress', 'completed', name='session_status')
    session_status.create(op.get_bind(), checkfirst=True)

    # 3. registration_status enum 생성
    registration_status = sa.Enum('registered', 'waitlist', 'cancelled', name='registration_status')
    registration_status.create(op.get_bind(), checkfirst=True)

    # 4. stat_source_type enum 생성
    stat_source_type = sa.Enum('manual', 'ocr', name='stat_source_type')
    stat_source_type.create(op.get_bind(), checkfirst=True)

    # 5. match_sessions 테이블
    op.create_table(
        'match_sessions',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('community_id', UUID(as_uuid=True), sa.ForeignKey('communities.id'), nullable=False),
        sa.Column('season_id', UUID(as_uuid=True), sa.ForeignKey('seasons.id'), nullable=False),
        sa.Column('title', sa.String(100), nullable=False),
        sa.Column('scheduled_date', sa.Date, nullable=False),
        sa.Column('scheduled_start', sa.Time, nullable=True),
        sa.Column('total_games', sa.Integer, server_default='0'),
        sa.Column('status', session_status, server_default='open'),
        sa.Column('team_size', sa.Integer, server_default='5'),
        sa.Column('tank_count', sa.Integer, server_default='1'),
        sa.Column('dps_count', sa.Integer, server_default='2'),
        sa.Column('support_count', sa.Integer, server_default='2'),
        sa.Column('discord_announced', sa.Boolean, server_default='false'),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
    )

    # 6. session_registrations 테이블
    op.create_table(
        'session_registrations',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('session_id', UUID(as_uuid=True), sa.ForeignKey('match_sessions.id'), nullable=False),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('priority_1', position_type, nullable=False),
        sa.Column('priority_2', position_type, nullable=True),
        sa.Column('priority_3', position_type, nullable=True),
        sa.Column('min_games', sa.Integer, server_default='1'),
        sa.Column('max_games', sa.Integer, server_default='999'),
        sa.Column('status', registration_status, server_default='registered'),
        sa.Column('registered_at', sa.DateTime, server_default=sa.func.now()),
    )

    # 7. matchmaking_results 테이블
    op.create_table(
        'matchmaking_results',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('session_id', UUID(as_uuid=True), sa.ForeignKey('match_sessions.id'), nullable=False),
        sa.Column('generated_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('is_confirmed', sa.Boolean, server_default='false'),
        sa.Column('algorithm_version', sa.String(20), nullable=True),
        sa.Column('summary_json', JSONB, nullable=True),
    )

    # 8. player_position_ranks 테이블
    op.create_table(
        'player_position_ranks',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('season_id', UUID(as_uuid=True), sa.ForeignKey('seasons.id'), nullable=True),
        sa.Column('position', position_type, nullable=False),
        sa.Column('rank', sa.String(30), nullable=False),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now()),
        sa.UniqueConstraint('user_id', 'season_id', 'position', name='uq_user_season_position'),
    )

    # 9. match_participants 확장 컬럼
    op.add_column('match_participants', sa.Column('session_id', UUID(as_uuid=True), sa.ForeignKey('match_sessions.id'), nullable=True))
    op.add_column('match_participants', sa.Column('assigned_position', position_type, nullable=True))
    op.add_column('match_participants', sa.Column('priority_used', sa.Integer, nullable=True))
    op.add_column('match_participants', sa.Column('session_game_no', sa.Integer, nullable=True))

    # 10. player_match_stats 확장 컬럼
    op.add_column('player_match_stats', sa.Column('kills', sa.Integer, nullable=True))
    op.add_column('player_match_stats', sa.Column('deaths', sa.Integer, nullable=True))
    op.add_column('player_match_stats', sa.Column('assists', sa.Integer, nullable=True))
    op.add_column('player_match_stats', sa.Column('damage_dealt', sa.Integer, nullable=True))
    op.add_column('player_match_stats', sa.Column('healing_done', sa.Integer, nullable=True))
    op.add_column('player_match_stats', sa.Column('survivability_pct', sa.Float, nullable=True))
    op.add_column('player_match_stats', sa.Column('stat_source', stat_source_type, nullable=True))

    # 11. player_profiles 확장 컬럼
    op.add_column('player_profiles', sa.Column('win_rate', sa.Float, server_default='0.0', nullable=True))


def downgrade():
    # 11. player_profiles
    op.drop_column('player_profiles', 'win_rate')

    # 10. player_match_stats
    op.drop_column('player_match_stats', 'stat_source')
    op.drop_column('player_match_stats', 'survivability_pct')
    op.drop_column('player_match_stats', 'healing_done')
    op.drop_column('player_match_stats', 'damage_dealt')
    op.drop_column('player_match_stats', 'assists')
    op.drop_column('player_match_stats', 'deaths')
    op.drop_column('player_match_stats', 'kills')

    # 9. match_participants
    op.drop_column('match_participants', 'session_game_no')
    op.drop_column('match_participants', 'priority_used')
    op.drop_column('match_participants', 'assigned_position')
    op.drop_column('match_participants', 'session_id')

    # 8~5. 테이블 삭제
    op.drop_table('player_position_ranks')
    op.drop_table('matchmaking_results')
    op.drop_table('session_registrations')
    op.drop_table('match_sessions')

    # enum 삭제
    sa.Enum(name='stat_source_type').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='registration_status').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='session_status').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='position_type').drop(op.get_bind(), checkfirst=True)
```

---

## 7. 라우터 구조

### 신규 파일

| 파일 | prefix | tags |
|------|--------|------|
| `backend/app/routers/sessions.py` | (없음, 경로에 직접 지정) | `["sessions"]` |
| `backend/app/routers/ranks.py` | (없음) | `["ranks"]` |

### main.py 등록

```python
from app.routers import sessions, ranks
app.include_router(sessions.router)
app.include_router(ranks.router)
```

---

## 8. 설계 결정 (ADR)

### ADR-P5-1: 세션-매치 2계층 구조

**맥락**: 기존 Match는 개별 경기 단위. Phase 5는 "하루 내전(세션)" 개념 추가.

**결정**: MatchSession → Match 1:N 관계. 세션이 매치를 생성하는 상위 계층.

**대안**:
- Match에 session 관련 컬럼을 모두 넣기 → 스키마 오염, 기존 Match 호환성 훼손
- 별도 session 모델 분리 ← **채택**: 기존 Match 코드 영향 최소화

**결과**: 기존 Match CRUD는 그대로 동작. 세션 매치메이킹은 새 경로로 진입.

### ADR-P5-2: position_type enum 공유

**맥락**: tank/dps/support enum이 session_registrations.priority_*, match_participants.assigned_position, player_position_ranks.position에서 반복.

**결정**: PostgreSQL `position_type` enum 하나를 생성하고 `create_type=False`로 재사용.

**대안**:
- 각 컬럼마다 별도 enum → enum 폭발
- VARCHAR + CHECK constraint → 타입 안전성 부족

**결과**: enum 하나로 통일. 기존 `player_role` enum(player_profiles.main_role)과는 별개 (이름이 다름).

### ADR-P5-3: 미리보기 JSONB 저장

**맥락**: 매치메이킹 결과를 정규화 테이블로 저장 vs JSONB 스냅샷.

**결정**: `matchmaking_results.summary_json`에 전체 결과를 JSONB로 저장. confirm 시 정규화 테이블(Match, MatchParticipant)로 풀어 쓰기.

**결과**: 미리보기 수동 조정이 JSONB 내에서 자유롭게 가능. 확정 전까지 DB 스키마 제약 없음.

---

## 9. 주의사항

- `position_type` vs `player_role`: 기존 player_profiles.main_role은 `player_role` enum 사용. Phase 5 신규 컬럼은 `position_type` enum 사용. 값은 동일(tank/dps/support)하지만 PostgreSQL enum 이름이 다름.
- `session_id` nullable: match_participants.session_id는 nullable. Phase 1~4에서 생성된 기존 참가자 레코드는 NULL.
- Float import: PlayerMatchStat 확장 시 `from sqlalchemy import Float` 임포트 추가 필요.
- `win_rate` 위치: SPEC에서 `player_profiles.win_rate`으로 정의. 기존 모델에 없으므로 추가.
