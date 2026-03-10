import { useAuth } from '@/contexts/AuthContext'
import { useState, useEffect } from 'react'
import apiClient from '@/api/client'

const DEFAULT_SLUG = 'ow-league'

export function useCommunityId(): string | null {
  const { user } = useAuth()
  const [communityId, setCommunityId] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      setCommunityId(user.community_id)
      return
    }
    apiClient.get(`/communities/${DEFAULT_SLUG}`)
      .then((res) => setCommunityId(res.data.id))
      .catch(() => {})
  }, [user])

  return communityId
}
