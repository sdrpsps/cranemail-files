'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import { AlertCircle, CheckCircle2, LoaderCircle, Send, X } from 'lucide-react'

import type { BindData } from '@/app/types/app'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

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
      <Card className="relative w-full max-w-md rounded-3xl border-zinc-800/85 bg-zinc-950 p-6 py-6 text-zinc-100 shadow-2xl">
        <Button
          onClick={onClose}
          variant="ghost"
          size="icon"
          className="absolute right-4 top-4 text-zinc-500 hover:text-zinc-300"
          aria-label="Close"
        >
          <X className="h-6 w-6" />
        </Button>

        {!bindData ? (
          <form onSubmit={handleGenerateBindLink} className="space-y-4">
            <div className="mb-4 border-b border-zinc-800/50 pb-2 text-center">
              <h3 className="text-xl font-bold text-white">Link Telegram Bot</h3>
              <p className="mt-1 text-xs text-zinc-400">Verify your credentials to generate a secure binding token</p>
            </div>

            {bindError && (
              <div className="flex items-start space-x-2 rounded-xl border border-red-900/40 bg-red-950/20 p-3 text-xs text-red-400">
                <AlertCircle className="mt-0.5 h-4.5 w-4.5 flex-shrink-0" />
                <span>{bindError}</span>
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-400" htmlFor="bind-password">
                Enter Cranemail Password
              </label>
              <Input
                id="bind-password"
                type="password"
                required
                placeholder="••••••••••••"
                value={bindPassword}
                onChange={(e) => setBindPassword(e.target.value)}
                className="h-11 rounded-xl border-zinc-800 bg-zinc-900/60 px-4 py-3 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-blue-500/80"
              />
            </div>

            <Button
              type="submit"
              disabled={bindLoading}
              className="mt-4 h-11 w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500"
            >
              {bindLoading ? (
                <>
                  <LoaderCircle className="h-4.5 w-4.5 animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <span>Generate Binding Token</span>
              )}
            </Button>
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
                className={buttonVariants({
                  variant: 'default',
                  size: 'lg',
                  className: 'h-11 w-full bg-[#2ea6da] text-white shadow-lg shadow-sky-500/10 hover:bg-[#2794c4]',
                })}
              >
                <Send className="h-5 w-5" />
                <span>Launch Telegram Bot</span>
              </a>

              <Button
                onClick={onRefreshStatus}
                variant="secondary"
                className="h-11 w-full border border-zinc-700/60 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>I Have Completed Binding</span>
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
