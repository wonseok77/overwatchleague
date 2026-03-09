"""add is_hidden to users

Revision ID: 006_add_is_hidden
Revises: 005_fix_heroes_schema
Create Date: 2026-03-09
"""
from alembic import op
import sqlalchemy as sa

revision = '006_add_is_hidden'
down_revision = '005_fix_heroes_schema'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column(
        'is_hidden', sa.Boolean(), nullable=False, server_default='false',
    ))


def downgrade():
    op.drop_column('users', 'is_hidden')
