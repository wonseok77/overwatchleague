"""add damage_mitigated column to player_match_stats

Revision ID: 008_add_damage_mitigated
Revises: 007_migrate_global_ranks
Create Date: 2026-03-11
"""
from alembic import op
import sqlalchemy as sa

revision = '008_add_damage_mitigated'
down_revision = '007_migrate_global_ranks'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('player_match_stats', sa.Column('damage_mitigated', sa.Integer(), nullable=True))


def downgrade():
    op.drop_column('player_match_stats', 'damage_mitigated')
