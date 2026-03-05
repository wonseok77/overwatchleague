import apiClient from './client'
import type { Season } from '@/types'

export async function getSeasons(communityId: string): Promise<Season[]> {
  const res = await apiClient.get(`/communities/${communityId}/seasons`)
  return res.data
}

export async function createSeason(communityId: string, data: { name: string }): Promise<Season> {
  const res = await apiClient.post(`/communities/${communityId}/seasons`, data)
  return res.data
}

export async function closeSeason(seasonId: string): Promise<Season> {
  const res = await apiClient.put(`/seasons/${seasonId}/close`)
  return res.data
}
