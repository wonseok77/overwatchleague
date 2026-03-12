import apiClient from './client'
import type { MainRole, Team, MatchResult } from '@/types'

export interface ProfileResponse {
  user: {
    id: string
    real_name: string
    nickname: string
    discord_id: string | null
    avatar_url: string | null
  }
  player_profile: {
    main_role: MainRole
    mmr: number
    main_heroes: string[] | null
  } | null
  stats: {
    total_matches: number
    wins: number
    losses: number
    win_rate: number
  }
  recent_matches: {
    match_id: string
    title: string
    map_name: string | null
    scheduled_at: string | null
    team: Team | null
    result: MatchResult | null
    mmr_before: number | null
    mmr_after: number | null
    mmr_change: number | null
    heroes_played: string[] | null
  }[]
  combat_stats: {
    games_with_stats: number
    kd_ratio: number
    kda_ratio: number
    avg_kills: number
    avg_deaths: number
    avg_damage_dealt: number
    avg_healing_done: number
    avg_damage_mitigated: number
  } | null
  hero_stats: {
    hero_name: string
    matches: number
    wins: number
    losses: number
    win_rate: number
    avg_kills: number
    avg_deaths: number
    avg_assists: number
    avg_damage_dealt: number
    avg_healing_done: number
    avg_damage_mitigated: number
    kd_ratio: number
  }[]
  season_stats: {
    season_id: string
    season_name: string
    wins: number
    losses: number
    win_rate: number | null
    final_mmr: number | null
    rank_position: number | null
  }[]
}

export async function getUserProfile(userId: string): Promise<ProfileResponse> {
  const res = await apiClient.get(`/users/${userId}/profile`)
  return res.data
}

export interface MemberResponse {
  id: string
  real_name: string
  nickname: string
  email: string
  role: string
  main_role: string | null
  current_sr: number | null
  main_heroes: string[] | null
  mmr: number | null
  avatar_url?: string | null
}

export async function getMembers(communityId: string): Promise<MemberResponse[]> {
  const res = await apiClient.get(`/communities/${communityId}/members`)
  return res.data
}

export async function createMember(communityId: string, data: {
  real_name: string
  nickname: string
  email: string
  password: string
  main_role?: string
  main_heroes?: string[]
}): Promise<MemberResponse> {
  const res = await apiClient.post(`/communities/${communityId}/members`, data)
  return res.data
}

export interface ProfileUpdatePayload {
  nickname?: string
  main_role?: string
  main_heroes?: string[]
}

export async function updateProfile(userId: string, data: ProfileUpdatePayload): Promise<{
  nickname?: string
  main_role: string
  main_heroes: string[]
  mmr: number
}> {
  const res = await apiClient.patch(`/users/${userId}/profile`, data)
  return res.data
}

export async function uploadAvatar(userId: string, file: File): Promise<{ avatar_url: string }> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await apiClient.post(`/users/${userId}/avatar`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}
