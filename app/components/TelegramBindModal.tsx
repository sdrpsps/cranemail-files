'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'

import type { BindData } from '@/app/types/app'

interface TelegramBindModalProps {
  onClose: () => void
  onRefreshStatus: () => void
}

export function TelegramBindModal({ onClose, onRefreshStatus }: TelegramBindModalProps) {
  const [bindPassword, setBindPassword] = useState('')
  const [bindLoading, setBindLoading] = useState(false)
  const [bindError, setBindError] = useState('')
  const [bindData, setBindData] = useState<BindData | null>(null)

  const handleGenerateBindLink = async (e: FormEvent) => {
    e.preventDefault()
    if (!bindPassword) {
      setBindError('Please enter your password to confirm linking.')
      return
    }

    setBindError('')
    setBindLoading(true)

    try {
      const res = await fetch('/api/auth/telegram/bind-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: bindPassword }),
      })
      const data = await res.json()

      if (data.success && data.data) {
        setBindData(data.data)
      } else {
        setBindError(data.message || 'Verification failed. Password may be incorrect.')
      }
    } catch (err) {
      setBindError('Failed to connect to server. Please try again.')
      console.error(err)
    } finally {
      setBindLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-3xl border border-zinc-800/85 bg-zinc-950 p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-zinc-500 transition-colors hover:text-zinc-300 focus:outline-none"
          aria-label="Close"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {!bindData ? (
          <form onSubmit={handleGenerateBindLink} className="space-y-4">
            <div className="mb-4 border-b border-zinc-800/50 pb-2 text-center">
              <h3 className="text-xl font-bold text-white">Link Telegram Bot</h3>
              <p className="mt-1 text-xs text-zinc-400">Verify your credentials to generate a secure binding token</p>
            </div>

            {bindError && (
              <div className="flex items-start space-x-2 rounded-xl border border-red-900/40 bg-red-950/20 p-3 text-xs text-red-400">
                <svg className="mt-0.5 h-4.5 w-4.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>{bindError}</span>
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-400" htmlFor="bind-password">
                Enter Cranemail Password
              </label>
              <input
                id="bind-password"
                type="password"
                required
                placeholder="••••••••••••"
                value={bindPassword}
                onChange={(e) => setBindPassword(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 transition-all focus:border-blue-500/80 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={bindLoading}
              className="mt-4 flex w-full cursor-pointer items-center justify-center space-x-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-3 text-sm font-medium text-white transition-all active:scale-[0.98]"
            >
              {bindLoading ? (
                <>
                  <span className="h-4.5 w-4.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  <span>Verifying...</span>
                </>
              ) : (
                <span>Generate Binding Token</span>
              )}
            </button>
          </form>
        ) : (
          <div className="space-y-5 text-center">
            <div className="border-b border-zinc-800/50 pb-2">
              <h3 className="text-xl font-bold text-white">Temporary Token Generated</h3>
              <p className="mt-1 text-xs text-zinc-400">Follow the instructions to complete binding</p>
            </div>

            <div className="space-y-2 rounded-xl border border-zinc-800/50 bg-zinc-900/60 p-4 text-left text-xs leading-relaxed">
              <p className="mb-1 font-semibold text-zinc-300">How to Link:</p>
              <div className="flex items-start space-x-2">
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-600/30 font-bold text-blue-400">
                  1
                </span>
                <span className="text-zinc-400">Click the button below to launch Telegram and open the Bot.</span>
              </div>
              <div className="flex items-start space-x-2">
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-600/30 font-bold text-blue-400">
                  2
                </span>
                <span className="text-zinc-400">Click <b>&quot;Start&quot;</b> or send the generated command starting with `/start`.</span>
              </div>
              <div className="flex items-start space-x-2">
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-600/30 font-bold text-blue-400">
                  3
                </span>
                <span className="text-zinc-400">Once the Bot confirms success, click the button below to refresh.</span>
              </div>
            </div>

            <div className="space-y-3">
              <a
                href={bindData.bindUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full cursor-pointer items-center justify-center space-x-2 rounded-xl bg-[#2ea6da] py-3 text-sm font-medium text-white shadow-lg shadow-sky-500/10 transition-all hover:bg-[#2794c4] active:scale-[0.98]"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.11.02-1.93 1.23-5.46 3.62-.51.35-.98.53-1.39.52-.46-.01-1.33-.26-1.98-.48-.8-.27-1.43-.42-1.37-.89.03-.25.38-.51 1.03-.78 4.04-1.76 6.74-2.92 8.1-3.48 3.85-1.6 4.64-1.88 5.17-1.89.11 0 .37.03.54.17.14.12.18.28.2.45-.02.07-.02.16-.03.22z" />
                </svg>
                <span>Launch Telegram Bot</span>
              </a>

              <button
                onClick={onRefreshStatus}
                className="flex w-full cursor-pointer items-center justify-center space-x-2 rounded-xl border border-zinc-700/60 bg-zinc-800 py-3 text-sm font-medium text-zinc-200 transition-all hover:bg-zinc-700 active:scale-[0.98]"
              >
                <span>I Have Completed Binding</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
