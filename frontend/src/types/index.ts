export type UserRole = 'admin' | 'member'
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
  created_at: string
}

export interface PlayerProfile {
  id: string
  user_id: string
  main_role: MainRole
  current_rank: string | null
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
