'use client'

import { useCallback, useEffect, useState } from 'react'

import type { ToastState, ToastType } from '@/app/types/app'

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null)

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    setToast({ message, type })
  }, [])

  useEffect(() => {
    if (!toast) return

    const timer = window.setTimeout(() => setToast(null), 3000)
    return () => window.clearTimeout(timer)
  }, [toast])

  return {
    toast,
    showToast,
  }
}
