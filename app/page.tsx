'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

import { AppFrame } from '@/app/components/AppFrame'
import { LoadingState } from '@/app/components/LoadingState'
import { LoginForm } from '@/app/components/LoginForm'
import { useAuthSession } from '@/app/hooks/useAuthSession'

export default function Home() {
  const router = useRouter()
  const { user, setUser, loading } = useAuthSession()

  useEffect(() => {
    if (!loading && user) {
      router.replace('/upload')
    }
  }, [loading, router, user])

  return (
    <AppFrame>
      {loading || user ? (
        <LoadingState />
      ) : (
        <LoginForm
          onSuccess={(nextUser) => {
            setUser(nextUser)
            router.replace('/upload')
          }}
        />
      )}
    </AppFrame>
  )
}
