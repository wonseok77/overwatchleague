"""add avatar_url to users

Revision ID: 001_add_avatar_url
Revises:
Create Date: 2026-03-05
"""
from alembic import op
import sqlalchemy as sa

revision = '001_add_avatar_url'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('avatar_url', sa.String(500), nullable=True))


def downgrade():
    op.drop_column('users', 'avatar_url')
