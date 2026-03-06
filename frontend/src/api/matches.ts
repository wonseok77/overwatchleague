import apiClient from './client'
import type { Match, MatchParticipant, BalanceResult, Highlight } from '@/types'

export async function getMatches(seasonId: string): Promise<Match[]> {
  const res = await apiClient.get(`/seasons/${seasonId}/matches`)
  return res.data
}

export async function createMatch(seasonId: string, data: { title: string; scheduled_at: string }): Promise<Match> {
  const res = await apiClient.post(`/seasons/${seasonId}/matches`, data)
  return res.data
}

export async function registerForMatch(matchId: string): Promise<MatchParticipant> {
  const res = await apiClient.post(`/matches/${matchId}/register`)
  return res.data
}

export async function cancelRegistration(matchId: string): Promise<void> {
  await apiClient.delete(`/matches/${matchId}/register`)
}

export async function closeRegistration(matchId: string): Promise<BalanceResult> {
  const res = await apiClient.post(`/matches/${matchId}/close-registration`)
  return res.data
}

export async function updateTeams(matchId: string, teams: { user_id: string; team: string }[]): Promise<MatchParticipant[]> {
  const res = await apiClient.put(`/matches/${matchId}/teams`, teams)
  return res.data
}

export async function updateMatchStatus(matchId: string, status: string): Promise<Match> {
  const res = await apiClient.patch(`/matches/${matchId}/status`, { status })
  return res.data
}

export async function submitResult(matchId: string, data: {
  map_name?: string
  team_a_score: number
  team_b_score: number
  result: string
}): Promise<Match> {
  const res = await apiClient.post(`/matches/${matchId}/result`, data)
  return res.data
}

export interface MatchDetailParticipant {
  id: string
  user_id: string
  nickname: string
  status: string
  team: string | null
  main_role: string | null
  current_rank: string | null
  mmr: number | null
  heroes_played: string[] | null
  screenshot_path: string | null
  mmr_before: number | null
  mmr_after: number | null
  mmr_change: number | null
}

export interface MatchDetailHighlight {
  id: string
  title: string
  youtube_url: string
  user_id: string | null
  registered_at: string
}

export interface MatchDetail extends Match {
  participants: MatchDetailParticipant[]
  highlights: MatchDetailHighlight[]
}

export async function getMatch(id: string): Promise<MatchDetail> {
  const res = await apiClient.get(`/matches/${id}`)
  return res.data
}

export async function submitMatchStats(matchId: string, userId: string, formData: FormData) {
  const res = await apiClient.post(`/matches/${matchId}/stats/${userId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export async function getMatchHighlights(matchId: string): Promise<Highlight[]> {
  const res = await apiClient.get(`/matches/${matchId}/highlights`)
  return res.data
}

export async function createHighlight(matchId: string, data: { title: string; youtube_url: string; user_id?: string }): Promise<Highlight> {
  const res = await apiClient.post(`/matches/${matchId}/highlights`, data)
  return res.data
}

export async function deleteHighlight(id: string): Promise<void> {
  await apiClient.delete(`/highlights/${id}`)
}

export async function getCommunityHighlights(communityId: string, params?: { limit?: number; offset?: number }): Promise<Highlight[]> {
  const res = await apiClient.get(`/communities/${communityId}/highlights`, { params })
  return res.data
}

export interface PlayerMatchStat {
  user_id: string
  heroes_played: string[] | null
  screenshot_path: string | null
  mmr_before: number | null
  mmr_after: number | null
  mmr_change: number | null
}

export async function triggerOcr(matchId: string, userId: string): Promise<PlayerMatchStat> {
  const res = await apiClient.post(`/matches/${matchId}/stats/${userId}/ocr`)
  return res.data
}
