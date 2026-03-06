import apiClient from './client'

export interface LeaderboardPositionRank {
  position: string
  rank: string
  mmr: number | null
}

export interface LeaderboardEntry {
  id: string
  nickname: string
  real_name: string
  avatar_url: string | null
  main_role: string | null
  main_heroes: string[] | null
  mmr: number | null
  position_ranks: LeaderboardPositionRank[]
}

export async function getLeaderboard(
  communityId: string,
  seasonId?: string,
): Promise<LeaderboardEntry[]> {
  const params = seasonId ? { season_id: seasonId } : undefined
  const res = await apiClient.get(`/communities/${communityId}/leaderboard`, { params })
  return res.data
}
