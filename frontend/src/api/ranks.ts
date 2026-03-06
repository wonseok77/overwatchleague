import apiClient from './client'
import type { PositionRank } from '@/types'

export async function getUserRanks(userId: string, seasonId?: string): Promise<PositionRank[]> {
  const params = seasonId ? { season_id: seasonId } : undefined
  const res = await apiClient.get(`/users/${userId}/ranks`, { params })
  return res.data
}

export async function setUserRanks(userId: string, ranks: Array<{
  position: string
  rank: string
  season_id?: string | null
}>): Promise<PositionRank[]> {
  const res = await apiClient.put(`/users/${userId}/ranks`, ranks)
  return res.data
}

export async function getCurrentRanks(userId: string): Promise<PositionRank[]> {
  const res = await apiClient.get(`/users/${userId}/ranks/current`)
  return res.data
}

export async function getSeasonRanks(userId: string, seasonId: string): Promise<PositionRank[]> {
  const res = await apiClient.get(`/users/${userId}/ranks/season/${seasonId}`)
  return res.data
}
