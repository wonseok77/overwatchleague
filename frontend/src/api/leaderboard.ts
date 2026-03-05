import apiClient from './client'
import type { MemberResponse } from './members'

export async function getLeaderboard(communityId: string): Promise<MemberResponse[]> {
  const res = await apiClient.get(`/communities/${communityId}/leaderboard`)
  return res.data
}
