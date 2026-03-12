import apiClient from './client'
import type { AuthResponse, User } from '@/types'

export async function register(data: {
  email: string
  password: string
  real_name: string
  nickname: string
  community_slug: string
  main_role?: string
  main_heroes?: string[]
  position_ranks?: { position: string; rank: string }[]
}): Promise<AuthResponse> {
  const res = await apiClient.post('/auth/register', data)
  return res.data
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await apiClient.post('/auth/login', { email, password })
  return res.data
}

export async function getMe(): Promise<User> {
  const res = await apiClient.get('/auth/me')
  return res.data
}
