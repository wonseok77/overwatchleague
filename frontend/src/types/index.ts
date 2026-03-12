export type UserRole = 'admin' | 'manager' | 'member'
export type MainRole = 'tank' | 'dps' | 'support'
export type SeasonStatus = 'active' | 'closed'
export type MatchStatus = 'open' | 'closed' | 'in_progress' | 'completed'
export type ParticipantStatus = 'registered' | 'waitlist' | 'cancelled' | 'confirmed'
export type Team = 'A' | 'B'
export type MatchResult = 'team_a' | 'team_b' | 'draw'

export interface Community {
  id: string
  name: string
  slug: string
  description: string | null
  discord_webhook_url: string | null
  created_at: string
}

export interface User {
  id: string
  community_id: string
  real_name: string
  nickname: string
  discord_id: string | null
  email: string
  role: UserRole
  avatar_url?: string | null
  created_at: string
}

export interface PlayerProfile {
  id: string
  user_id: string
  main_role: MainRole
  current_sr: number | null
  main_heroes: string[]
  mmr: number
}

export interface Season {
  id: string
  community_id: string
  name: string
  status: SeasonStatus
  started_at: string
  ended_at: string | null
}

export interface Match {
  id: string
  community_id: string
  season_id: string
  title: string
  scheduled_at: string
  status: MatchStatus
  map_name: string | null
  team_a_score: number | null
  team_b_score: number | null
  result: MatchResult | null
  discord_announced: boolean
  created_at: string
}

export interface MatchParticipant {
  id: string
  match_id: string
  user_id: string
  status: ParticipantStatus
  team: Team | null
  registered_at: string
}

export interface PlayerMatchStat {
  id: string
  match_id: string
  user_id: string
  heroes_played: string[]
  screenshot_path: string | null
  mmr_before: number
  mmr_after: number
  mmr_change: number
}

export interface Highlight {
  id: string
  match_id: string
  user_id: string | null
  title: string
  youtube_url: string
  registered_at: string
  match_title?: string | null
}

export interface SeasonStat {
  id: string
  season_id: string
  user_id: string
  wins: number
  losses: number
  win_rate: number
  final_mmr: number
  rank_position: number
}

// Session types (Phase 5)
export type SessionStatus = 'open' | 'closed' | 'in_progress' | 'completed'
export type PositionType = 'tank' | 'dps' | 'support'

export interface MatchSession {
  id: string
  community_id: string
  season_id: string
  title: string
  scheduled_date: string
  scheduled_start: string | null
  total_games: number
  status: SessionStatus
  team_size: number
  tank_count: number
  dps_count: number
  support_count: number
  discord_announced: boolean
  created_at: string | null
  registration_count?: number
}

export interface SessionRegistration {
  id: string
  session_id: string
  user_id: string
  priority_1: PositionType
  priority_2: PositionType | null
  priority_3: PositionType | null
  min_games: number
  max_games: number
  status: string
  registered_at: string | null
  nickname?: string | null
  position_ranks?: Array<{position: PositionType, rank: string, mmr: number | null}>
}

export interface MatchmakingPlayer {
  user_id: string
  nickname: string
  assigned_position: PositionType
  priority_used: number
  score: number
  mmr: number
  rank: string | null
}

export interface MatchmakingGame {
  game_no: number
  team_a: MatchmakingPlayer[]
  team_b: MatchmakingPlayer[]
  team_a_score: number
  team_b_score: number
  score_diff: number
  team_a_avg_mmr: number
  team_b_avg_mmr: number
  mmr_diff: number
}

export interface MatchmakingPlayerStat {
  user_id: string
  nickname: string
  games_played: number
  priority_1_count?: number
  priority_2_count?: number
  priority_3_count?: number
  forced_count?: number
}

export interface MatchmakingResult {
  id: string
  session_id?: string
  is_confirmed: boolean
  games: MatchmakingGame[]
  bench: Array<{ user_id: string; nickname: string; reason: string }>
  player_stats: MatchmakingPlayerStat[]
  generated_at?: string | null
}

export interface PositionRank {
  id: string
  user_id: string
  season_id: string | null
  position: PositionType
  rank: string
  mmr?: number
  updated_at: string | null
}

// API response types
export interface AuthResponse {
  access_token: string
  token_type: string
}

export interface BalanceResult {
  team_a: MatchParticipant[]
  team_b: MatchParticipant[]
  balance_reason: {
    team_a_score: number
    team_b_score: number
    score_diff: number
    role_distribution: {
      team_a: Record<MainRole, number>
      team_b: Record<MainRole, number>
    }
  }
}
