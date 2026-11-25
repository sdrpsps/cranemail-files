'use client'

import { useEffect, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  LogOut,
  RefreshCw,
  Send,
  User as UserIcon,
} from 'lucide-react'

import { BrandMark } from '@/app/components/BrandMark'
import { GitHubReferral } from '@/app/components/GitHubReferral'
import { TelegramBindModal } from '@/app/components/TelegramBindModal'
import { ThemeToggle } from '@/app/components/ThemeToggle'
import { UploadDropzone } from '@/app/components/UploadDropzone'
import { UploadedFilesGrid } from '@/app/components/UploadedFilesGrid'
import type { UploadQueueItem, UploadedFile, User } from '@/app/types/app'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { TooltipProvider } from '@/components/ui/tooltip'
import { extractHostname } from '@/lib/format'

interface UploadDashboardProps {
  user: User
  files: UploadedFile[]
  filesLoading: boolean
  filesError: string
  uploading: boolean
  uploadError: string
  uploadQueue: UploadQueueItem[]
  isDragActive: boolean
  syncing: boolean
  cleaningFolders: boolean
  deletingIds: Set<string>
  copiedKey: string | null
  onLogout: () => void
  onRefreshSession: () => Promise<void>
  onRefreshFiles: () => Promise<void>
  onSyncWorkspace: () => void
  onCleanupEmptyFolders: () => Promise<void> | void
  onCopyLink: (url: string, label?: string, key?: string) => void
  onCopyText: (text: string, key?: string, label?: string) => void
  onDeleteFile: (id: string) => Promise<void> | void
  onDrag: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void
  onClearQueue: () => void
  onPasteFiles: (e: ClipboardEvent) => Promise<void>
}

export function UploadDashboard({
  user,
  files,
  filesLoading,
  filesError,
  uploading,
  uploadError,
  uploadQueue,
  isDragActive,
  syncing,
  cleaningFolders,
  deletingIds,
  copiedKey,
  onLogout,
  onRefreshSession,
  onRefreshFiles,
  onSyncWorkspace,
  onCleanupEmptyFolders,
  onCopyLink,
  onCopyText,
  onDeleteFile,
  onDrag,
  onDrop,
  onFileChange,
  onClearQueue,
  onPasteFiles,
}: UploadDashboardProps) {
  const [showBindModal, setShowBindModal] = useState(false)

  useEffect(() => {
    if (showBindModal) return

    const listener = (e: ClipboardEvent) => {
      void onPasteFiles(e)
    }

    window.addEventListener('paste', listener)
    return () => window.removeEventListener('paste', listener)
  }, [onPasteFiles, showBindModal])

  const refreshBindStatus = async () => {
    await onRefreshSession()
  }

  const hostName = extractHostname(user.serverUrl)

  return (
    <TooltipProvider>
      <div className="min-h-screen">
        <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <BrandMark />

              <span className="truncate text-sm font-semibold tracking-tight text-foreground">
                CraneMail Files
              </span>

              <Badge
                variant="outline"
                className="hidden gap-1.5 font-mono text-[11px] text-muted-foreground sm:inline-flex"
                title={user.serverUrl}
              >
                <span className="size-1.5 rounded-full bg-success" />
                <span className="max-w-44 truncate">{hostName}</span>
              </Badge>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowBindModal(true)}
              >
                <span
                  className={`size-1.5 rounded-full ${
                    user.isTelegramBound ? 'bg-success' : 'bg-warning'
                  }`}
                />
                <span className="hidden sm:inline">
                  {user.isTelegramBound ? 'Telegram Linked' : 'Link Telegram'}
                </span>
                <span className="sm:hidden">Bot</span>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="outline"
                      size="sm"
                      className="max-w-52"
                      aria-label="Account menu"
                    />
                  }
                >
                  <UserIcon data-icon="inline-start" />
                  <span className="hidden truncate md:inline">
                    {user.emailAddress}
                  </span>
                  <ChevronDown data-icon="inline-end" />
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="flex flex-col gap-0.5 py-1.5">
                      <span className="truncate text-xs font-medium text-foreground">
                        {user.emailAddress}
                      </span>
                      <span className="truncate font-mono text-[11px] font-normal text-muted-foreground">
                        {hostName}
                      </span>
                    </DropdownMenuLabel>
                  </DropdownMenuGroup>

                  <DropdownMenuSeparator />

                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => setShowBindModal(true)}>
                      <Send />
                      <span>
                        {user.isTelegramBound
                          ? 'Manage Telegram Bots'
                          : 'Connect Telegram Bot'}
                      </span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void onRefreshFiles()}>
                      <RefreshCw />
                      <span>Refresh Library</span>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>

                  <DropdownMenuSeparator />

                  <DropdownMenuGroup>
                    <DropdownMenuItem variant="destructive" onClick={onLogout}>
                      <LogOut />
                      <span>Sign Out</span>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <ThemeToggle />

              <GitHubReferral variant="inline" className="hidden sm:inline-flex" />

              <Button
                type="button"
                onClick={onLogout}
                variant="outline"
                size="sm"
                className="hidden sm:inline-flex"
              >
                <LogOut data-icon="inline-start" />
                <span>Sign Out</span>
              </Button>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-4 pt-6 pb-12 sm:px-6">
          <div className="grid items-start gap-5 lg:grid-cols-[340px_1fr]">
            <aside className="flex flex-col gap-4 lg:sticky lg:top-20">
              <UploadDropzone
                serverUrl={user.serverUrl}
                uploading={uploading}
                uploadError={uploadError}
                uploadQueue={uploadQueue}
                isDragActive={isDragActive}
                copiedKey={copiedKey}
                onDrag={onDrag}
                onDrop={onDrop}
                onFileChange={onFileChange}
                onCopyLink={onCopyLink}
                onClearQueue={onClearQueue}
              />

              <Card className="rounded-2xl border border-border bg-card shadow-(--panel-shadow) ring-0">
                <CardHeader>
                  <CardTitle className="text-sm font-medium">
                    Telegram Bot Upload
                  </CardTitle>
                  <CardDescription className="text-xs leading-relaxed">
                    Connect your own bots. Link multiple CraneMail accounts to one bot and switch with /accounts.
                  </CardDescription>
                  <CardAction>
                    <div className="flex size-8 items-center justify-center rounded-lg border border-info/20 bg-info/10 text-info">
                      <Send className="size-3.5" />
                    </div>
                  </CardAction>
                </CardHeader>

                <CardContent className="flex flex-col gap-3">
                  <Separator />

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Account</span>
                    <span className="max-w-48 truncate font-mono text-[11px] text-foreground/90">
                      {user.emailAddress}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Status</span>
                    {user.isTelegramBound ? (
                      <Badge
                        variant="outline"
                        className="border-success/30 bg-success/10 text-success"
                      >
                        <CheckCircle2 data-icon="inline-start" />
                        <span>Linked</span>
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-warning/30 bg-warning/10 text-warning"
                      >
                        <AlertTriangle data-icon="inline-start" />
                        <span>Unlinked</span>
                      </Badge>
                    )}
                  </div>

                  <Button
                    type="button"
                    onClick={() => setShowBindModal(true)}
                    variant={user.isTelegramBound ? 'outline' : 'default'}
                    className="h-9 w-full text-xs"
                  >
                    <Send data-icon="inline-start" />
                    <span>
                      {user.isTelegramBound
                        ? 'Manage Telegram Bots'
                        : 'Connect Telegram Bot'}
                    </span>
                  </Button>
                </CardContent>
              </Card>
            </aside>

            <UploadedFilesGrid
              files={files}
              serverUrl={user.serverUrl}
              filesLoading={filesLoading}
              filesError={filesError}
              syncing={syncing}
              cleaningFolders={cleaningFolders}
              deletingIds={deletingIds}
              copiedKey={copiedKey}
              onRefreshFiles={onRefreshFiles}
              onSyncWorkspace={onSyncWorkspace}
              onCleanupEmptyFolders={onCleanupEmptyFolders}
              onCopyLink={onCopyLink}
              onCopyText={onCopyText}
              onDeleteFile={onDeleteFile}
            />
          </div>
        </div>
      </div>

      {showBindModal && (
        <TelegramBindModal
          onClose={() => setShowBindModal(false)}
          onRefreshStatus={refreshBindStatus}
          onCopyText={onCopyText}
        />
      )}
    </TooltipProvider>
  )
}
