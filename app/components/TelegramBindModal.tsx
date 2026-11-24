'use client'

import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Lock,
  Send,
} from 'lucide-react'

import type { BindData } from '@/app/types/app'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'

interface TelegramBindModalProps {
  open?: boolean
  onClose: () => void
  onRefreshStatus: () => Promise<void> | void
  onCopyText?: (text: string, key?: string, label?: string) => void
}

export function TelegramBindModal({
  open = true,
  onClose,
  onRefreshStatus,
  onCopyText,
}: TelegramBindModalProps) {
  const [bindPassword, setBindPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [bindLoading, setBindLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [bindError, setBindError] = useState('')
  const [bindData, setBindData] = useState<BindData | null>(null)
  const [copiedCommand, setCopiedCommand] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current)
      }
    }
  }, [])

  const handleGenerateBindLink = async (e: FormEvent) => {
    e.preventDefault()
    if (!bindPassword) {
      setBindError('Enter your CraneMail password to verify ownership.')
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
        setBindError(
          data.message ||
            'Verification failed. Check your password and try again.',
        )
      }
    } catch (err) {
      setBindError('Failed to reach the server. Please try again.')
      console.error(err)
    } finally {
      setBindLoading(false)
    }
  }

  const startCommand = bindData ? `/start ${bindData.token}` : ''

  const handleCopyCommand = async () => {
    if (!startCommand) return

    if (onCopyText) {
      onCopyText(startCommand, 'telegram-start-cmd', 'Bot command copied')
    } else if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(startCommand)
    }

    setCopiedCommand(true)
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current)
    }
    copyTimerRef.current = setTimeout(() => {
      setCopiedCommand(false)
    }, 2000)
  }

  const handleCompleteBinding = async () => {
    setRefreshing(true)
    try {
      await onRefreshStatus()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        {!bindData ? (
          <>
            <DialogHeader className="gap-2">
              <div className="flex size-9 items-center justify-center rounded-lg border border-info/25 bg-info/10 text-info">
                <Send className="size-4" />
              </div>
              <DialogTitle>Link Telegram Bot</DialogTitle>
              <DialogDescription>
                Verify your CraneMail password to create a 10-minute binding token for Telegram uploads.
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={handleGenerateBindLink}
              className="flex flex-col gap-4"
            >
              {bindError && (
                <Alert
                  variant="destructive"
                  className="border-destructive/40 bg-destructive/10"
                >
                  <AlertCircle />
                  <AlertTitle>Verification failed</AlertTitle>
                  <AlertDescription>{bindError}</AlertDescription>
                </Alert>
              )}

              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel htmlFor="bind-password" className="text-xs">
                    CraneMail Password
                  </FieldLabel>
                  <InputGroup className="h-10 bg-background">
                    <InputGroupAddon>
                      <Lock />
                    </InputGroupAddon>
                    <InputGroupInput
                      id="bind-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      placeholder="Enter your password"
                      value={bindPassword}
                      onChange={(e) => setBindPassword(e.target.value)}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        size="icon-xs"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff /> : <Eye />}
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                </Field>
              </FieldGroup>

              <Button
                type="submit"
                size="lg"
                disabled={bindLoading}
                className="h-10 w-full"
              >
                {bindLoading ? (
                  <>
                    <Spinner data-icon="inline-start" />
                    <span>Verifying…</span>
                  </>
                ) : (
                  <span>Generate Binding Link</span>
                )}
              </Button>
            </form>
          </>
        ) : (
          <>
            <DialogHeader className="gap-2">
              <div className="flex size-9 items-center justify-center rounded-lg border border-success/25 bg-success/10 text-success">
                <CheckCircle2 className="size-4" />
              </div>
              <DialogTitle>Binding Token Ready</DialogTitle>
              <DialogDescription>
                Complete linking in Telegram within 10 minutes.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              <ol className="flex flex-col gap-2.5 rounded-xl border border-border bg-background/70 p-3.5 text-xs text-muted-foreground">
                <li className="flex items-start gap-2.5">
                  <Badge
                    variant="secondary"
                    className="mt-0.5 size-5 shrink-0 justify-center p-0 font-mono text-[10px]"
                  >
                    1
                  </Badge>
                  <span>Open the bot link below to launch Telegram.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Badge
                    variant="secondary"
                    className="mt-0.5 size-5 shrink-0 justify-center p-0 font-mono text-[10px]"
                  >
                    2
                  </Badge>
                  <span>
                    Tap <strong className="font-medium text-foreground">Start</strong> in Telegram, or paste the command below directly into the bot chat.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Badge
                    variant="secondary"
                    className="mt-0.5 size-5 shrink-0 justify-center p-0 font-mono text-[10px]"
                  >
                    3
                  </Badge>
                  <span>
                    After the bot confirms binding, refresh your status below.
                  </span>
                </li>
              </ol>

              <Field>
                <FieldLabel
                  htmlFor="telegram-start-cmd"
                  className="text-xs text-muted-foreground"
                >
                  Manual Start Command
                </FieldLabel>
                <InputGroup className="h-9 bg-background">
                  <InputGroupInput
                    id="telegram-start-cmd"
                    readOnly
                    value={startCommand}
                    className="font-mono text-xs text-foreground"
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      size="xs"
                      onClick={handleCopyCommand}
                      aria-label="Copy start command"
                    >
                      {copiedCommand ? (
                        <>
                          <Check className="text-success" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy />
                          <span>Copy</span>
                        </>
                      )}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </Field>
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button
                size="lg"
                className="h-10 w-full bg-[#229ED9] text-white hover:bg-[#1E8EC3]"
                render={
                  <a
                    href={bindData.bindUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
                nativeButton={false}
              >
                <Send data-icon="inline-start" />
                <span>Open Telegram Bot</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={handleCompleteBinding}
                disabled={refreshing}
                className="h-10 w-full"
              >
                {refreshing ? (
                  <>
                    <Spinner data-icon="inline-start" />
                    <span>Checking status…</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 data-icon="inline-start" />
                    <span>I Have Completed Binding</span>
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
