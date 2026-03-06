"""테스트용 공통 fixture: SQLite in-memory DB + FastAPI TestClient"""

import uuid
import pytest
from sqlalchemy import create_engine, event, Text, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.dialects.postgresql import ARRAY, UUID, JSONB

from app.database import Base, get_db
from app.main import app
from app.models.community import Community
from app.models.user import User, PlayerProfile
from app.models.season import Season
from app.models.match import Match, MatchParticipant
from app.services.auth import hash_password, create_access_token

# SQLite에서 PostgreSQL 전용 타입을 대체
from sqlalchemy.dialects import sqlite as sqlite_dialect

# SQLite에서 ARRAY/JSONB 컬럼을 Text로 컴파일
from sqlalchemy.ext.compiler import compiles

@compiles(ARRAY, "sqlite")
def _compile_array_sqlite(type_, compiler, **kw):
    return "TEXT"

@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(type_, compiler, **kw):
    return "TEXT"

# SQLite in-memory + StaticPool (단일 연결 재사용으로 격리 문제 해결)
SQLALCHEMY_TEST_URL = "sqlite://"
engine = create_engine(
    SQLALCHEMY_TEST_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def setup_db():
    """각 테스트마다 DB 초기화"""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db(setup_db):
    session = TestSessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture
def override_get_db(db):
    def _override():
        try:
            yield db
        finally:
            pass
    app.dependency_overrides[get_db] = _override
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def client(override_get_db):
    from fastapi.testclient import TestClient
    with TestClient(app) as c:
        yield c


@pytest.fixture
def community(db):
    c = Community(
        id=uuid.uuid4(),
        name="Test Community",
        slug="test-community",
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@pytest.fixture
def admin_user(db, community):
    user = User(
        id=uuid.uuid4(),
        community_id=community.id,
        real_name="Admin",
        nickname="admin_nick",
        email="admin@test.com",
        password_hash=hash_password("password123"),
        role="admin",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def member_user(db, community):
    user = User(
        id=uuid.uuid4(),
        community_id=community.id,
        real_name="Member",
        nickname="member_nick",
        email="member@test.com",
        password_hash=hash_password("password123"),
        role="member",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def admin_token(admin_user):
    return create_access_token(admin_user)


@pytest.fixture
def member_token(member_user):
    return create_access_token(member_user)


@pytest.fixture
def season(db, community):
    s = Season(
        id=uuid.uuid4(),
        community_id=community.id,
        name="2026 Season 1",
        status="active",
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@pytest.fixture
def open_match(db, community, season):
    from datetime import datetime
    m = Match(
        id=uuid.uuid4(),
        community_id=community.id,
        season_id=season.id,
        title="Test Match",
        scheduled_at=datetime(2026, 3, 15, 19, 0),
        status="open",
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return m
