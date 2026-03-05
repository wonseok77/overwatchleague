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
}

export interface AdminSeasonUpdate {
  status: 'active' | 'closed'
}

export interface FinalizeResponse {
  message: string
  stats_created: number
}

// --- 멤버 관리 ---
export interface AdminMemberResponse {
  user_id: string
  nickname: string
  real_name: string
  email: string
  role: 'admin' | 'member'
  main_role: 'tank' | 'dps' | 'support' | null
  current_rank: string | null
  mmr: number | null
}

export interface AdminMemberUpdate {
  role?: 'admin' | 'member'
  current_rank?: string
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

// 멤버 관리
export async function getAdminMembers(): Promise<AdminMemberResponse[]> {
  const res = await apiClient.get('/admin/members')
  return res.data
}

export async function updateAdminMember(userId: string, data: AdminMemberUpdate): Promise<AdminMemberResponse> {
  const res = await apiClient.patch(`/admin/members/${userId}`, data)
  return res.data
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
