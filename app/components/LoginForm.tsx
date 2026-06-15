'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import { AlertCircle, ArrowRight, ChevronRight, LoaderCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { User } from '@/app/types/app'

interface LoginFormProps {
  onSuccess: (user: User) => void
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [serverUrl, setServerUrl] = useState(process.env.NEXT_PUBLIC_SMARTERMAIL_URL || 'https://us1.workspace.org')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      setError('Please fill in both email and password.')
      return
    }

    setError('')
    setSubmitting(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: email,
          password,
          serverUrl: serverUrl.trim(),
        }),
      })

      const data = await res.json()
      if (data.success && data.data) {
        onSuccess(data.data)
      } else {
        setError(data.message || 'Authentication failed. Please check your credentials.')
      }
    } catch (err) {
      setError('Connection error. Could not reach the authentication server.')
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/40 p-8 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-2xl transition-all duration-500 md:p-10">
      <div className="mb-6 border-b border-zinc-800/60 pb-6 text-center">
        <h1 className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent">
          Cranemail Image Host
        </h1>
        <p className="mt-2 text-sm text-zinc-400">Sign in with SmarterMail to link cloud drive space</p>
      </div>

      {error && (
        <div className="mb-6 flex items-start space-x-2.5 rounded-xl border border-red-900/50 bg-red-950/30 p-3.5 text-sm text-red-400">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-5">
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-400" htmlFor="email">
            Email Address / Username
          </label>
          <Input
            id="email"
            type="text"
            required
            placeholder="e.g. user@yourdomain.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 rounded-xl border-zinc-800 bg-zinc-950/50 px-4 py-3 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-blue-500/80 focus-visible:ring-blue-500/20"
          />
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-400" htmlFor="password">
            Password
          </label>
          <Input
            id="password"
            type="password"
            required
            placeholder="••••••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-12 rounded-xl border-zinc-800 bg-zinc-950/50 px-4 py-3 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-blue-500/80 focus-visible:ring-blue-500/20"
          />
        </div>

        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="h-auto px-0 text-xs font-semibold text-zinc-500"
          >
            <ChevronRight className={`h-3.5 w-3.5 transform transition-transform duration-300 ${showAdvanced ? 'rotate-90' : ''}`} />
            <span>Advanced Settings</span>
          </Button>

          {showAdvanced && (
            <div className="mt-3 space-y-3 rounded-xl border border-zinc-800/40 bg-zinc-950/30 p-4">
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-zinc-500" htmlFor="server-url">
                  SmarterMail Server URL
                </label>
                <Input
                  id="server-url"
                  type="url"
                  placeholder="https://mail.crane.email"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  className="h-9 rounded-lg bg-zinc-950/70 px-3 py-2 font-mono text-blue-300"
                />
              </div>
            </div>
          )}
        </div>

        <Button
          type="submit"
          disabled={submitting}
          className="mt-6 h-11 w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/10 hover:from-blue-500 hover:to-indigo-500 hover:shadow-blue-500/25"
        >
          {submitting ? (
            <>
              <LoaderCircle className="h-5 w-5 animate-spin" />
              <span>Signing in...</span>
            </>
          ) : (
            <>
              <span>Verify Credentials</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </form>
    </div>
  )
}
