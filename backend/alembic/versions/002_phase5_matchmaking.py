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
    # All tables and columns already included in 000_initial_schema
    pass


def downgrade():
    pass
