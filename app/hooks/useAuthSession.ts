'use client'

import { useCallback, useEffect, useState } from 'react'

import type { User } from '@/app/types/app'

const USER_CACHE_KEY = 'cranemail_user_cache_v1'
const FILES_CACHE_KEY = 'cranemail_files_cache_v1'

function readCachedUser(): User | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(USER_CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as User
  } catch {
    return null
  }
}

function writeCachedUser(user: User | null) {
  if (typeof window === 'undefined') return
  try {
    if (user) {
      window.sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify(user))
    } else {
      window.sessionStorage.removeItem(USER_CACHE_KEY)
      window.sessionStorage.removeItem(FILES_CACHE_KEY)
    }
  } catch {
    // Ignore storage errors (e.g. restricted private mode)
  }
}

export function useAuthSession() {
  const [user, setUserState] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const setUser = useCallback((nextUser: User | null) => {
    setUserState(nextUser)
    writeCachedUser(nextUser)
  }, [])

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' })
      if (res.status === 401) {
        setUser(null)
        return
      }
      if (!res.ok) {
        throw new Error(`Session check failed (${res.status})`)
      }
      const data = await res.json()
      if (data.success && data.data) {
        setUser(data.data)
      }
    } catch (err) {
      console.error('Auth verification error:', err)
    } finally {
      setLoading(false)
    }
  }, [setUser])

  useEffect(() => {
    const cached = readCachedUser()
    if (cached) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUserState(cached)
      setLoading(false)
    }
    void checkSession()
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
  }, [setUser])

  return {
    user,
    setUser,
    loading,
    checkSession,
    logout,
  }
}
