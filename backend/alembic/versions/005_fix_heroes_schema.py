"""fix heroes table schema to match Hero model

Revision ID: 005_fix_heroes_schema
Revises: 004_add_position_mmr
Create Date: 2026-03-06
"""
from alembic import op
import sqlalchemy as sa

revision = '005_fix_heroes_schema'
down_revision = '004_add_position_mmr'
branch_labels = None
depends_on = None


def upgrade():
    # image_url -> portrait_url
    op.alter_column('heroes', 'image_url', new_column_name='portrait_url')

    # Add is_custom column
    op.add_column('heroes', sa.Column(
        'is_custom', sa.Boolean(), nullable=False, server_default='false',
    ))

    # Add created_at column
    op.add_column('heroes', sa.Column(
        'created_at', sa.DateTime(), nullable=True, server_default=sa.text('now()'),
    ))

    # Drop key column (not in Hero model)
    op.drop_column('heroes', 'key')


def downgrade():
    # Restore key column
    op.add_column('heroes', sa.Column('key', sa.String(50), unique=True, nullable=True))

    # Drop created_at
    op.drop_column('heroes', 'created_at')

    # Drop is_custom
    op.drop_column('heroes', 'is_custom')

    # portrait_url -> image_url
    op.alter_column('heroes', 'portrait_url', new_column_name='image_url')
