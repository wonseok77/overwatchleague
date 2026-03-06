"""initial schema - create all base tables

Revision ID: 000_initial_schema
Revises:
Create Date: 2026-03-05
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '000_initial_schema'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # communities
    op.create_table(
        'communities',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('slug', sa.String(50), unique=True, nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('discord_webhook_url', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=True),
    )

    # users
    op.create_table(
        'users',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('community_id', UUID(as_uuid=True), sa.ForeignKey('communities.id'), nullable=False),
        sa.Column('real_name', sa.String(50), nullable=False),
        sa.Column('nickname', sa.String(50), nullable=False),
        sa.Column('discord_id', sa.String(50), nullable=True),
        sa.Column('email', sa.String(200), unique=True, nullable=False),
        sa.Column('password_hash', sa.String(200), nullable=False),
        sa.Column('role', sa.Enum('admin', 'member', name='user_role'), nullable=True),
        sa.Column('avatar_url', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=True),
    )

    # seasons (before player_position_ranks, matches, match_sessions)
    op.create_table(
        'seasons',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('community_id', UUID(as_uuid=True), sa.ForeignKey('communities.id'), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('status', sa.Enum('active', 'closed', name='season_status'), nullable=True),
        sa.Column('started_at', sa.DateTime, nullable=True),
        sa.Column('ended_at', sa.DateTime, nullable=True),
    )

    # heroes
    op.create_table(
        'heroes',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(50), unique=True, nullable=False),
        sa.Column('role', sa.Enum('tank', 'dps', 'support', name='player_role', create_constraint=False), nullable=False),
        sa.Column('image_url', sa.String(500), nullable=True),
        sa.Column('key', sa.String(50), unique=True, nullable=True),
    )

    # player_profiles
    op.create_table(
        'player_profiles',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), unique=True, nullable=False),
        sa.Column('main_role', sa.Enum('tank', 'dps', 'support', name='player_role'), nullable=False),
        sa.Column('current_rank', sa.String(30), nullable=True),
        sa.Column('current_sr', sa.Integer, nullable=True),
        sa.Column('main_heroes', sa.ARRAY(sa.String(50)), nullable=True),
        sa.Column('mmr', sa.Integer, nullable=True),
        sa.Column('win_rate', sa.Float, nullable=True),
    )

    # player_position_ranks (after seasons)
    op.create_table(
        'player_position_ranks',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('season_id', UUID(as_uuid=True), sa.ForeignKey('seasons.id'), nullable=True),
        sa.Column('position', sa.Enum('tank', 'dps', 'support', name='position_type'), nullable=False),
        sa.Column('rank', sa.String(30), nullable=False),
        sa.Column('updated_at', sa.DateTime, nullable=True),
        sa.UniqueConstraint('user_id', 'season_id', 'position', name='uq_user_season_position'),
    )

    # matches (after seasons)
    op.create_table(
        'matches',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('community_id', UUID(as_uuid=True), sa.ForeignKey('communities.id'), nullable=False),
        sa.Column('season_id', UUID(as_uuid=True), sa.ForeignKey('seasons.id'), nullable=False),
        sa.Column('title', sa.String(100), nullable=False),
        sa.Column('scheduled_at', sa.DateTime, nullable=False),
        sa.Column('status', sa.Enum('open', 'closed', 'in_progress', 'completed', name='match_status'), nullable=True),
        sa.Column('map_name', sa.String(100), nullable=True),
        sa.Column('team_a_score', sa.Integer, nullable=True),
        sa.Column('team_b_score', sa.Integer, nullable=True),
        sa.Column('result', sa.Enum('team_a', 'team_b', 'draw', name='match_result'), nullable=True),
        sa.Column('discord_announced', sa.Boolean, nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=True),
    )

    # match_sessions (after seasons, before match_participants)
    op.create_table(
        'match_sessions',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('community_id', UUID(as_uuid=True), sa.ForeignKey('communities.id'), nullable=False),
        sa.Column('season_id', UUID(as_uuid=True), sa.ForeignKey('seasons.id'), nullable=False),
        sa.Column('title', sa.String(100), nullable=False),
        sa.Column('scheduled_date', sa.Date, nullable=False),
        sa.Column('scheduled_start', sa.Time, nullable=True),
        sa.Column('total_games', sa.Integer, nullable=True),
        sa.Column('status', sa.Enum('open', 'closed', 'in_progress', 'completed', name='session_status'), nullable=True),
        sa.Column('team_size', sa.Integer, nullable=True),
        sa.Column('tank_count', sa.Integer, nullable=True),
        sa.Column('dps_count', sa.Integer, nullable=True),
        sa.Column('support_count', sa.Integer, nullable=True),
        sa.Column('discord_announced', sa.Boolean, nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=True),
    )

    # match_participants (after matches, match_sessions)
    op.create_table(
        'match_participants',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('match_id', UUID(as_uuid=True), sa.ForeignKey('matches.id'), nullable=False),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('status', sa.Enum('registered', 'waitlist', 'cancelled', 'confirmed', name='participant_status'), nullable=True),
        sa.Column('team', sa.Enum('A', 'B', name='team_side'), nullable=True),
        sa.Column('registered_at', sa.DateTime, nullable=True),
        sa.Column('session_id', UUID(as_uuid=True), sa.ForeignKey('match_sessions.id'), nullable=True),
        sa.Column('assigned_position', sa.Enum('tank', 'dps', 'support', name='position_type', create_constraint=False), nullable=True),
        sa.Column('priority_used', sa.Integer, nullable=True),
        sa.Column('session_game_no', sa.Integer, nullable=True),
    )

    # player_match_stats
    op.create_table(
        'player_match_stats',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('match_id', UUID(as_uuid=True), sa.ForeignKey('matches.id'), nullable=False),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('heroes_played', sa.ARRAY(sa.String(50)), nullable=True),
        sa.Column('screenshot_path', sa.String(500), nullable=True),
        sa.Column('mmr_before', sa.Integer, nullable=True),
        sa.Column('mmr_after', sa.Integer, nullable=True),
        sa.Column('mmr_change', sa.Integer, nullable=True),
        sa.Column('kills', sa.Integer, nullable=True),
        sa.Column('deaths', sa.Integer, nullable=True),
        sa.Column('assists', sa.Integer, nullable=True),
        sa.Column('damage_dealt', sa.Integer, nullable=True),
        sa.Column('healing_done', sa.Integer, nullable=True),
        sa.Column('survivability_pct', sa.Float, nullable=True),
        sa.Column('stat_source', sa.Enum('manual', 'ocr', name='stat_source_type'), nullable=True),
    )

    # highlights
    op.create_table(
        'highlights',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('match_id', UUID(as_uuid=True), sa.ForeignKey('matches.id'), nullable=False),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('youtube_url', sa.String(500), nullable=False),
        sa.Column('registered_at', sa.DateTime, nullable=True),
    )

    # season_stats
    op.create_table(
        'season_stats',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('season_id', UUID(as_uuid=True), sa.ForeignKey('seasons.id'), nullable=False),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('wins', sa.Integer, nullable=True),
        sa.Column('losses', sa.Integer, nullable=True),
        sa.Column('win_rate', sa.Float, nullable=True),
        sa.Column('final_mmr', sa.Integer, nullable=True),
        sa.Column('rank_position', sa.Integer, nullable=True),
    )

    # session_registrations (after match_sessions)
    op.create_table(
        'session_registrations',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('session_id', UUID(as_uuid=True), sa.ForeignKey('match_sessions.id'), nullable=False),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('priority_1', sa.Enum('tank', 'dps', 'support', name='position_type', create_constraint=False), nullable=False),
        sa.Column('priority_2', sa.Enum('tank', 'dps', 'support', name='position_type', create_constraint=False), nullable=True),
        sa.Column('priority_3', sa.Enum('tank', 'dps', 'support', name='position_type', create_constraint=False), nullable=True),
        sa.Column('min_games', sa.Integer, nullable=True),
        sa.Column('max_games', sa.Integer, nullable=True),
        sa.Column('status', sa.Enum('registered', 'waitlist', 'cancelled', name='registration_status'), nullable=True),
        sa.Column('registered_at', sa.DateTime, nullable=True),
    )

    # matchmaking_results (after match_sessions)
    op.create_table(
        'matchmaking_results',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('session_id', UUID(as_uuid=True), sa.ForeignKey('match_sessions.id'), nullable=False),
        sa.Column('generated_at', sa.DateTime, nullable=True),
        sa.Column('is_confirmed', sa.Boolean, nullable=True),
        sa.Column('algorithm_version', sa.String(20), nullable=True),
        sa.Column('summary_json', sa.JSON, nullable=True),
    )


def downgrade():
    op.drop_table('matchmaking_results')
    op.drop_table('session_registrations')
    op.drop_table('season_stats')
    op.drop_table('highlights')
    op.drop_table('player_match_stats')
    op.drop_table('match_participants')
    op.drop_table('match_sessions')
    op.drop_table('matches')
    op.drop_table('player_position_ranks')
    op.drop_table('player_profiles')
    op.drop_table('heroes')
    op.drop_table('seasons')
    op.drop_table('users')
    op.drop_table('communities')
