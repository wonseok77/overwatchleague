import apiClient from './client'
import type { MatchSession, SessionRegistration, MatchmakingResult } from '@/types'

// --- Session CRUD ---

export async function getSessions(seasonId: string, month?: string): Promise<MatchSession[]> {
  const params = month ? { month } : undefined
  const res = await apiClient.get(`/seasons/${seasonId}/sessions`, { params })
  return res.data
}

export async function getSession(sessionId: string): Promise<MatchSession> {
  const res = await apiClient.get(`/sessions/${sessionId}`)
  return res.data
}

export async function createSession(seasonId: string, data: {
  title: string
  scheduled_date: string
  scheduled_start?: string
  total_games: number
  team_size?: number
  tank_count?: number
  dps_count?: number
  support_count?: number
}): Promise<MatchSession> {
  const res = await apiClient.post(`/seasons/${seasonId}/sessions`, data)
  return res.data
}

export async function updateSession(sessionId: string, data: Record<string, unknown>): Promise<MatchSession> {
  const res = await apiClient.patch(`/sessions/${sessionId}`, data)
  return res.data
}

export async function deleteSession(sessionId: string): Promise<void> {
  await apiClient.delete(`/sessions/${sessionId}`)
}

// --- Registration ---

export async function registerForSession(sessionId: string, data: {
  priority_1: string
  priority_2?: string | null
  priority_3?: string | null
  min_games?: number
  max_games?: number
}): Promise<SessionRegistration> {
  const res = await apiClient.post(`/sessions/${sessionId}/register`, data)
  return res.data
}

export async function updateMyRegistration(sessionId: string, data: {
  priority_1: string
  priority_2?: string | null
  priority_3?: string | null
  min_games?: number
  max_games?: number
}): Promise<SessionRegistration> {
  const res = await apiClient.patch(`/sessions/${sessionId}/register`, data)
  return res.data
}

export async function cancelSessionRegistration(sessionId: string): Promise<void> {
  await apiClient.delete(`/sessions/${sessionId}/register`)
}

export async function getRegistrations(sessionId: string): Promise<SessionRegistration[]> {
  const res = await apiClient.get(`/sessions/${sessionId}/registrations`)
  return res.data
}

export async function updateRegistration(sessionId: string, userId: string, data: {
  priority_1: string
  priority_2?: string | null
  priority_3?: string | null
  min_games?: number
  max_games?: number
}): Promise<SessionRegistration> {
  const res = await apiClient.patch(`/sessions/${sessionId}/registrations/${userId}`, data)
  return res.data
}

export async function adminRegisterMember(sessionId: string, data: {
  user_id: string
  priority_1: string
  priority_2?: string | null
  priority_3?: string | null
  min_games?: number
  max_games?: number
}): Promise<SessionRegistration> {
  const res = await apiClient.post(`/sessions/${sessionId}/register-member`, data)
  return res.data
}

// --- Matchmaking ---

export async function runMatchmaking(sessionId: string, weights?: {
  rank_weight?: number
  mmr_weight?: number
  win_rate_weight?: number
  stat_score_weight?: number
}): Promise<MatchmakingResult> {
  const res = await apiClient.post(`/sessions/${sessionId}/matchmake`, weights ?? {})
  return res.data
}

export async function getMatchmakingPreview(sessionId: string): Promise<MatchmakingResult> {
  const res = await apiClient.get(`/sessions/${sessionId}/matchmake/preview`)
  return res.data
}

export async function confirmMatchmaking(sessionId: string): Promise<{ message: string; matches_created: number; match_ids: string[] }> {
  const res = await apiClient.post(`/sessions/${sessionId}/matchmake/confirm`)
  return res.data
}

export interface SessionMatch {
  id: string
  title: string
  status: string
  map_name: string | null
  result: string | null
  team_a_score: number | null
  team_b_score: number | null
  scheduled_at: string | null
}

export async function getSessionMatches(sessionId: string): Promise<SessionMatch[]> {
  const res = await apiClient.get(`/sessions/${sessionId}/matches`)
  return res.data
}
