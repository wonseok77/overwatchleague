"""add avatar_url to users

Revision ID: 001_add_avatar_url
Revises:
Create Date: 2026-03-05
"""
from alembic import op
import sqlalchemy as sa

revision = '001_add_avatar_url'
down_revision = '000_initial_schema'
branch_labels = None
depends_on = None


def upgrade():
    # avatar_url is already included in 000_initial_schema
    pass


def downgrade():
    pass
