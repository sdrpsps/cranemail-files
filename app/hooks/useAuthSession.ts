'use client'

import { useCallback, useEffect, useState } from 'react'

import type { User } from '@/app/types/app'

export function useAuthSession() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me')
      const data = await res.json()
      if (data.success && data.data) {
        setUser(data.data)
      } else {
        setUser(null)
      }
    } catch (err) {
      console.error('Auth verification error:', err)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkSession()
  }, [checkSession])

  const logout = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setUser(null)
      }
    } catch (err) {
      console.error('Logout error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    user,
    setUser,
    loading,
    checkSession,
    logout,
  }
}
