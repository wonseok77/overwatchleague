"""add manager role

Revision ID: 003_add_manager_role
Revises: 002_phase5_matchmaking
Create Date: 2026-03-06
"""
from alembic import op

revision = '003_add_manager_role'
down_revision = '002_phase5_matchmaking'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TYPE user_role ADD VALUE 'manager'")


def downgrade():
    # PostgreSQL doesn't support removing enum values easily
    # Would need to recreate the type
    pass
