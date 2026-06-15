'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'

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
          <svg className="mt-0.5 h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-5">
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-400" htmlFor="email">
            Email Address / Username
          </label>
          <input
            id="email"
            type="text"
            required
            placeholder="e.g. user@yourdomain.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3 text-zinc-100 placeholder-zinc-600 transition-all duration-300 focus:border-blue-500/80 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
          />
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-400" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            placeholder="••••••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3 text-zinc-100 placeholder-zinc-600 transition-all duration-300 focus:border-blue-500/80 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
          />
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center space-x-1.5 text-xs font-semibold text-zinc-500 transition-colors hover:text-zinc-300 focus:outline-none"
          >
            <svg
              className={`h-3.5 w-3.5 transform transition-transform duration-300 ${showAdvanced ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span>Advanced Settings</span>
          </button>

          {showAdvanced && (
            <div className="mt-3 space-y-3 rounded-xl border border-zinc-800/40 bg-zinc-950/30 p-4">
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-zinc-500" htmlFor="server-url">
                  SmarterMail Server URL
                </label>
                <input
                  id="server-url"
                  type="url"
                  placeholder="https://mail.crane.email"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800/80 bg-zinc-950/70 px-3 py-2 font-mono text-sm text-blue-300 transition-all focus:border-blue-500/80 focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 flex w-full cursor-pointer items-center justify-center space-x-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-3.5 font-medium text-white shadow-lg shadow-blue-500/10 transition-all duration-300 hover:from-blue-500 hover:to-indigo-500 hover:shadow-blue-500/25 active:scale-[0.98] disabled:cursor-not-allowed disabled:from-blue-700/50 disabled:to-indigo-700/50 disabled:shadow-none"
        >
          {submitting ? (
            <>
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              <span>Signing in...</span>
            </>
          ) : (
            <>
              <span>Verify Credentials</span>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </>
          )}
        </button>
      </form>
    </div>
  )
}
