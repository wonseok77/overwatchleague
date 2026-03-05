import apiClient from './client'

export interface Hero {
  id: string
  name: string
  role: 'tank' | 'dps' | 'support'
  portrait_url: string | null
  is_custom: boolean
  created_at: string
}

export async function getHeroes(): Promise<Hero[]> {
  const res = await apiClient.get('/heroes')
  return res.data
}

export async function createHero(data: { name: string; role: string; portrait_url?: string }): Promise<Hero> {
  const res = await apiClient.post('/heroes', data)
  return res.data
}

export async function updateHero(id: string, data: { name?: string; role?: string; portrait_url?: string }): Promise<Hero> {
  const res = await apiClient.put(`/heroes/${id}`, data)
  return res.data
}

export async function deleteHero(id: string): Promise<void> {
  await apiClient.delete(`/heroes/${id}`)
}

export async function uploadHeroPortrait(id: string, file: File): Promise<Hero> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await apiClient.post(`/heroes/${id}/portrait`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export async function seedHeroes(): Promise<{ seeded: number; message: string }> {
  const res = await apiClient.post('/heroes/seed')
  return res.data
}
