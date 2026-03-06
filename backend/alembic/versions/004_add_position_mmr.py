"""add mmr to player_position_ranks

Revision ID: 004_add_position_mmr
Revises: 003_add_manager_role
Create Date: 2026-03-06
"""
from alembic import op
import sqlalchemy as sa

revision = '004_add_position_mmr'
down_revision = '003_add_manager_role'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('player_position_ranks', sa.Column('mmr', sa.Integer(), nullable=True))


def downgrade():
    op.drop_column('player_position_ranks', 'mmr')
