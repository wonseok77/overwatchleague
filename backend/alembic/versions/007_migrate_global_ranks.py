"""migrate global ranks to active season

Revision ID: 007_migrate_global_ranks
Revises: 006_add_is_hidden
Create Date: 2026-03-09
"""
from alembic import op

revision = '007_migrate_global_ranks'
down_revision = '006_add_is_hidden'
branch_labels = None
depends_on = None


def upgrade():
    # 전역 랭크(season_id=NULL)를 활성 시즌으로 복사
    op.execute("""
        INSERT INTO player_position_ranks (id, user_id, season_id, position, rank, mmr, updated_at)
        SELECT
            gen_random_uuid(), ppr.user_id, s.id, ppr.position, ppr.rank, ppr.mmr, NOW()
        FROM player_position_ranks ppr
        JOIN users u ON u.id = ppr.user_id
        JOIN seasons s ON s.community_id = u.community_id AND s.status = 'active'
        WHERE ppr.season_id IS NULL
        AND NOT EXISTS (
            SELECT 1 FROM player_position_ranks existing
            WHERE existing.user_id = ppr.user_id
            AND existing.season_id = s.id
            AND existing.position = ppr.position
        )
    """)
    # 전역 랭크 삭제
    op.execute("DELETE FROM player_position_ranks WHERE season_id IS NULL")


def downgrade():
    # 되돌리기 불가 - 데이터 마이그레이션
    pass
