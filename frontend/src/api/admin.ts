import apiClient from './client'

// --- 시즌 관리 ---
export interface AdminSeasonResponse {
  id: string
  name: string
  status: 'active' | 'closed'
  started_at: string | null
  ended_at: string | null
}

export interface AdminSeasonCreate {
  name: string
  started_at?: string
  ended_at?: string
}

export interface AdminSeasonUpdate {
  name?: string
  status?: 'active' | 'closed'
  started_at?: string
  ended_at?: string
}

export interface FinalizeResponse {
  message: string
  stats_created: number
}

// --- 멤버 관리 ---
export interface PositionRankInfo {
  position: 'tank' | 'dps' | 'support'
  rank: string
  mmr: number | null
}

export interface AdminMemberResponse {
  user_id: string
  nickname: string
  real_name: string
  email: string
  role: 'admin' | 'manager' | 'member'
  avatar_url: string | null
  main_role: 'tank' | 'dps' | 'support' | null
  current_rank: string | null
  mmr: number | null
  position_ranks: PositionRankInfo[]
}

export interface AdminMemberUpdate {
  role?: 'admin' | 'manager' | 'member'
  current_rank?: string
  nickname?: string
  real_name?: string
  main_role?: 'tank' | 'dps' | 'support' | null
  main_heroes?: string[]
}

export interface AdminPositionRankUpdate {
  position: 'tank' | 'dps' | 'support'
  mmr: number
}

// --- Webhook ---
export interface WebhookUpdate {
  webhook_url: string | null
}

export interface WebhookResponse {
  message: string
  webhook_url: string | null
}

export interface WebhookTestResponse {
  message: string
}

// 시즌 관리
export async function getAdminSeasons(): Promise<AdminSeasonResponse[]> {
  const res = await apiClient.get('/admin/seasons')
  return res.data
}

export async function createAdminSeason(data: AdminSeasonCreate): Promise<AdminSeasonResponse> {
  const res = await apiClient.post('/admin/seasons', data)
  return res.data
}

export async function updateAdminSeason(id: string, data: AdminSeasonUpdate): Promise<AdminSeasonResponse> {
  const res = await apiClient.patch(`/admin/seasons/${id}`, data)
  return res.data
}

export async function finalizeAdminSeason(id: string): Promise<FinalizeResponse> {
  const res = await apiClient.post(`/admin/seasons/${id}/finalize`)
  return res.data
}

export async function deleteAdminSeason(id: string): Promise<void> {
  await apiClient.delete(`/admin/seasons/${id}`)
}

// 멤버 관리
export async function getAdminMembers(): Promise<AdminMemberResponse[]> {
  const res = await apiClient.get('/admin/members')
  return res.data
}

export async function updateAdminMember(userId: string, data: AdminMemberUpdate): Promise<AdminMemberResponse> {
  const res = await apiClient.patch(`/admin/members/${userId}`, data)
  return res.data
}

export async function updateAdminMemberMMR(userId: string, positionRanks: AdminPositionRankUpdate[]): Promise<AdminMemberResponse> {
  const res = await apiClient.patch(`/admin/members/${userId}/position-ranks`, { position_ranks: positionRanks })
  return res.data
}

export async function deleteAdminMember(userId: string): Promise<void> {
  await apiClient.delete(`/admin/members/${userId}`)
}

// Webhook
export async function updateWebhook(data: WebhookUpdate): Promise<WebhookResponse> {
  const res = await apiClient.patch('/admin/community/webhook', data)
  return res.data
}

export async function testWebhook(): Promise<WebhookTestResponse> {
  const res = await apiClient.post('/admin/community/webhook/test')
  return res.data
}
