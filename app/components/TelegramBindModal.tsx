'use client'

import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { AlertCircle, ArrowLeft, CheckCircle2, Copy, ExternalLink, Send, Trash2 } from 'lucide-react'
import type { BindData, TelegramBotConfig } from '@/app/types/app'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'

async function fetchBots(): Promise<TelegramBotConfig[]> {
  const response = await fetch('/api/telegram/bots', { cache: 'no-store' })
  const result = await response.json()
  if (!response.ok || !result.success) throw new Error(result.message || 'Could not load bots.')
  return result.data
}

interface TelegramBindModalProps {
  open?: boolean
  onClose: () => void
  onRefreshStatus: () => Promise<void> | void
  onCopyText?: (text: string, key?: string, label?: string) => void
}

export function TelegramBindModal({ open = true, onClose, onRefreshStatus, onCopyText }: TelegramBindModalProps) {
  const [bots, setBots] = useState<TelegramBotConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [selected, setSelected] = useState<TelegramBotConfig | null>(null)
  const [bindData, setBindData] = useState<BindData | null>(null)

  const loadBots = useCallback(async () => {
    const nextBots = await fetchBots()
    setBots(nextBots)
    return nextBots
  }, [])

  useEffect(() => {
    if (!open) return
    let active = true
    void fetchBots().then((nextBots) => {
      if (active) setBots(nextBots)
    }).catch(() => {
      if (active) setError('Could not load bots. Close this window and try again.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [open])

  const run = async (operation: () => Promise<void>) => {
    setBusy(true)
    setError('')
    setNotice('')
    try { await operation() }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not reach the server. Try again.') }
    finally { setBusy(false) }
  }

  const addBot = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      const response = await fetch('/api/telegram/bots', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || 'Could not connect bot.')
      setToken('')
      const nextBots = await loadBots()
      setSelected(nextBots.find((bot) => bot.id === result.data.id) || null)
      setNotice('Bot connected. Verify your CraneMail password to link this account.')
    })
  }

  const generateLink = (event: FormEvent) => {
    event.preventDefault()
    if (!selected) return
    void run(async () => {
      const response = await fetch('/api/auth/telegram/bind-token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, botId: selected.id }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || 'Verification failed.')
      setPassword('')
      setBindData(result.data)
    })
  }

  const disconnect = (bot: TelegramBotConfig) => void run(async () => {
    const response = await fetch(`/api/telegram/bots/${encodeURIComponent(bot.id)}`, { method: 'DELETE' })
    const result = await response.json()
    if (!response.ok || !result.success) throw new Error(result.message || 'Could not disconnect bot.')
    await loadBots()
    await onRefreshStatus()
    setNotice(`@${bot.username} disconnected from this CraneMail account.`)
  })

  const checkBinding = () => void run(async () => {
    const nextBots = await loadBots()
    const bot = nextBots.find((item) => item.id === selected?.id)
    if (!bot?.telegramUserIds.length) throw new Error('Not linked yet. Open the bot and send the start command, then check again.')
    await onRefreshStatus()
    setBindData(null)
    setSelected(null)
    setNotice('Account linked. Use /accounts in Telegram to choose your upload account.')
  })

  const resetStep = () => {
    setSelected(null)
    setBindData(null)
    setPassword('')
    setError('')
    setNotice('')
  }

  const copyCommand = () => void run(async () => {
    if (!bindData) return
    const command = `/start ${bindData.token}`
    if (onCopyText) onCopyText(command, 'telegram-start-cmd', 'Bot command copied')
    else await navigator.clipboard.writeText(command)
    setNotice('Start command copied.')
  })

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose() }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{selected ? `Link @${selected.username}` : 'Telegram Bots'}</DialogTitle>
          <DialogDescription>
            {selected
              ? 'Link this CraneMail account without removing other accounts connected to the bot.'
              : 'Connect a bot using its BotFather token. Each bot can link multiple CraneMail accounts; use /accounts in Telegram to switch.'}
          </DialogDescription>
        </DialogHeader>

        {error && <Alert variant="destructive"><AlertCircle /><AlertTitle>Could not complete action</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        {notice && <Alert><CheckCircle2 /><AlertTitle>{notice}</AlertTitle></Alert>}

        {selected ? (
          <div className="flex flex-col gap-4">
            <Button variant="ghost" size="sm" className="self-start" disabled={busy} onClick={resetStep}>
              <ArrowLeft data-icon="inline-start" />All bots
            </Button>
            {bindData ? (
              <>
                <p className="text-sm text-muted-foreground">Open the bot and press Start, or paste this command into its private chat. The link expires in 10 minutes.</p>
                <Field>
                  <FieldLabel htmlFor="telegram-start-cmd">Start command</FieldLabel>
                  <InputGroup>
                    <InputGroupInput id="telegram-start-cmd" readOnly value={`/start ${bindData.token}`} />
                  </InputGroup>
                </Field>
                <Button variant="outline" onClick={copyCommand} disabled={busy}><Copy data-icon="inline-start" />Copy command</Button>
                <Button render={<a href={bindData.bindUrl} target="_blank" rel="noopener noreferrer" />} nativeButton={false}>
                  <ExternalLink data-icon="inline-start" />Open Telegram Bot
                </Button>
                <Button variant="outline" onClick={checkBinding} disabled={busy}>
                  {busy ? <Spinner data-icon="inline-start" /> : <CheckCircle2 data-icon="inline-start" />}Check binding status
                </Button>
              </>
            ) : (
              <form onSubmit={generateLink} className="flex flex-col gap-4">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="bind-password">CraneMail password</FieldLabel>
                    <InputGroup>
                      <InputGroupInput id="bind-password" type="password" autoComplete="current-password" required value={password} disabled={busy} onChange={(event) => setPassword(event.target.value)} />
                    </InputGroup>
                    <FieldDescription>Verify account ownership to create a binding link that expires in 10 minutes.</FieldDescription>
                  </Field>
                </FieldGroup>
                <Button type="submit" disabled={busy || !password}>
                  {busy && <Spinner data-icon="inline-start" />}Generate binding link
                </Button>
              </form>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {loading ? <div className="flex items-center gap-2"><Spinner />Loading bots…</div> : (
              <div className="flex flex-col gap-3">
                {bots.map((bot) => (
                  <div key={bot.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="truncate text-sm font-medium">@{bot.username}</span>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={bot.telegramUserIds.length ? 'default' : 'secondary'}>{bot.telegramUserIds.length ? 'Linked' : 'Not linked'}</Badge>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => { setSelected(bot); setError(''); setNotice('') }}>
                        <Send data-icon="inline-start" />{bot.telegramUserIds.length ? 'Link again' : 'Link account'}
                      </Button>
                      <Button variant="ghost" size="icon-sm" disabled={busy} onClick={() => disconnect(bot)} aria-label={`Disconnect @${bot.username} from this account`}><Trash2 /></Button>
                    </div>
                  </div>
                ))}
                {!bots.length && <p className="text-sm text-muted-foreground">No bots connected yet. Add your first bot below.</p>}
              </div>
            )}
            <Separator />
            <form onSubmit={addBot} className="flex flex-col gap-4">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="telegram-bot-token">Connect a bot</FieldLabel>
                  <InputGroup>
                    <InputGroupAddon><Send /></InputGroupAddon>
                    <InputGroupInput id="telegram-bot-token" type="password" autoComplete="off" spellCheck={false} placeholder="Paste your BotFather token" required disabled={busy} value={token} onChange={(event) => setToken(event.target.value)} />
                  </InputGroup>
                  <FieldDescription>The token is stored encrypted. Connecting registers this site as the bot’s webhook and replaces its previous webhook. To use the same bot with another CraneMail account, sign in to that account and add the same token.</FieldDescription>
                </Field>
              </FieldGroup>
              <Button type="submit" disabled={busy || !token.trim()}>
                {busy ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" />}Connect bot
              </Button>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
