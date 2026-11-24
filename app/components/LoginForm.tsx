'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  AlertCircle,
  ArrowRight,
  ChevronDown,
  Eye,
  EyeOff,
  Globe,
  Lock,
  Mail,
  ShieldCheck,
} from 'lucide-react'

import type { User } from '@/app/types/app'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'
import { extractHostname } from '@/lib/format'
import { cn } from '@/lib/utils'

interface LoginFormProps {
  onSuccess: (user: User) => void
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [serverUrl, setServerUrl] = useState(
    process.env.NEXT_PUBLIC_SMARTERMAIL_URL || 'https://us1.workspace.org',
  )
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const activeHost = extractHostname(serverUrl)

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) {
      setError('Enter both your email address and password.')
      return
    }

    setError('')
    setSubmitting(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: email.trim(),
          password,
          serverUrl: serverUrl.trim(),
        }),
      })

      const data = await res.json()
      if (data.success && data.data) {
        onSuccess(data.data)
      } else {
        setError(
          data.message ||
            'Authentication failed. Check your credentials and try again.',
        )
      }
    } catch (err) {
      setError('Connection error. Unable to reach the authentication server.')
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="rounded-2xl border border-border bg-card shadow-(--login-shadow) ring-0 [--card-spacing:--spacing(6)]">
      <CardHeader className="gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary text-primary">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="size-5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 17l7.5-11L20 14l-5.5 3.5L11.5 11 4 17z" />
              <path d="M11.5 11l3 6.5" />
            </svg>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <CardTitle className="text-lg font-semibold tracking-tight">
              CraneMail Files
            </CardTitle>
            <CardDescription className="text-xs">
              Workspace file dispatch &amp; public link console
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {error && (
          <Alert
            variant="destructive"
            className="border-destructive/40 bg-destructive/10"
          >
            <AlertCircle />
            <AlertTitle>Authentication failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleLogin}>
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="email" className="text-xs">
                Email or Username
              </FieldLabel>
              <InputGroup className="h-10 bg-background">
                <InputGroupAddon>
                  <Mail />
                </InputGroupAddon>
                <InputGroupInput
                  id="email"
                  type="text"
                  autoComplete="username"
                  required
                  placeholder="name@yourdomain.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </InputGroup>
            </Field>

            <Field>
              <FieldLabel htmlFor="password" className="text-xs">
                Password
              </FieldLabel>
              <InputGroup className="h-10 bg-background">
                <InputGroupAddon>
                  <Lock />
                </InputGroupAddon>
                <InputGroupInput
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  placeholder="Enter workspace password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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

            <Collapsible
              open={showAdvanced}
              onOpenChange={setShowAdvanced}
              className="rounded-lg border border-border bg-background/60"
            >
              <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-xs transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="flex items-center gap-2 font-medium text-muted-foreground">
                  <Globe className="size-3.5" />
                  <span>Server Endpoint</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Badge
                    variant="secondary"
                    className="max-w-44 truncate font-mono text-[11px]"
                  >
                    {activeHost}
                  </Badge>
                  <ChevronDown
                    className={cn(
                      'size-3.5 text-muted-foreground transition-transform duration-200',
                      showAdvanced && 'rotate-180',
                    )}
                  />
                </span>
              </CollapsibleTrigger>

              <CollapsibleContent className="border-t border-border px-3 pt-2.5 pb-3">
                <Field>
                  <FieldLabel
                    htmlFor="server-url"
                    className="text-xs text-muted-foreground"
                  >
                    SmarterMail Base URL
                  </FieldLabel>
                  <Input
                    id="server-url"
                    type="url"
                    placeholder="https://us1.workspace.org"
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    className="h-9 bg-background font-mono text-xs"
                  />
                </Field>
              </CollapsibleContent>
            </Collapsible>

            <Button
              type="submit"
              size="lg"
              disabled={submitting}
              className="h-10 w-full"
            >
              {submitting ? (
                <>
                  <Spinner data-icon="inline-start" />
                  <span>Signing in…</span>
                </>
              ) : (
                <>
                  <span>Sign in to Workspace</span>
                  <ArrowRight data-icon="inline-end" />
                </>
              )}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>

      <CardFooter className="gap-3 border-border/80 bg-muted/30 py-3.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-primary">
          <ShieldCheck className="size-4" />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5 text-left">
          <span className="text-xs font-medium text-foreground/90">
            Encrypted server-side credentials
          </span>
          <span className="text-[11px] leading-snug text-muted-foreground">
            Your browser stores only an HttpOnly session cookie.
          </span>
        </div>
      </CardFooter>
    </Card>
  )
}
