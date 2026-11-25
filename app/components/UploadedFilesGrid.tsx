'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  ExternalLink,
  FileArchive,
  FileCode2,
  FileText,
  FolderSync,
  FolderX,
  Image as ImageIcon,
  LayoutGrid,
  Link2,
  List,
  MoreHorizontal,
  RefreshCw,
  Search,
  Trash2,
  X,
  ZoomIn,
} from 'lucide-react'

import type {
  FileSourceFilter,
  FileViewMode,
  UploadedFile,
} from '@/app/types/app'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  formatBytes,
  formatTimestamp,
  getFileExtension,
  getPublicUrl,
  getThumbnailUrl,
  isImageFile,
  isTransformableImageFile,
} from '@/lib/format'
import { cn } from '@/lib/utils'

interface UploadedFilesGridProps {
  files: UploadedFile[]
  serverUrl?: string
  filesLoading: boolean
  filesError: string
  syncing: boolean
  cleaningFolders: boolean
  deletingIds: Set<string>
  copiedKey: string | null
  onRefreshFiles: () => Promise<void>
  onSyncWorkspace: () => void
  onCleanupEmptyFolders: () => Promise<void> | void
  onCopyLink: (url: string, label?: string, key?: string) => void
  onCopyText: (text: string, key?: string, label?: string) => void
  onDeleteFile: (id: string) => Promise<void> | void
}

const FILES_PER_PAGE = 12
const GRID_THUMBNAIL_WIDTH = 640
const GRID_THUMBNAIL_HEIGHT = 400
const LIST_THUMBNAIL_SIZE = 96
const PREVIEW_IMAGE_SIZE = 1280

function CopyOriginalLinkButton({
  file,
  publicUrl,
  copiedKey,
  onCopyLink,
  compact = false,
}: {
  file: UploadedFile
  publicUrl: string
  copiedKey: string | null
  onCopyLink: UploadedFilesGridProps['onCopyLink']
  compact?: boolean
}) {
  if (!file.shortUrl) return null
  const key = `original-${file.id}`
  const copied = copiedKey === key
  const button = (
    <Button
      type="button"
      size={compact ? 'icon-xs' : 'sm'}
      variant={compact ? 'ghost' : 'outline'}
      onClick={() => onCopyLink(publicUrl, 'Original link copied to clipboard', key)}
      aria-label={`Copy original link for ${file.fileName}`}
    >
      {copied ? (
        <Check data-icon={compact ? undefined : 'inline-start'} />
      ) : (
        <Link2 data-icon={compact ? undefined : 'inline-start'} />
      )}
      {!compact && <span>{copied ? 'Copied Original Link' : 'Copy Original Link'}</span>}
    </Button>
  )

  if (!compact) return button
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent>{copied ? 'Copied original link' : 'Copy original link'}</TooltipContent>
    </Tooltip>
  )
}

function normalizeSource(source: string): Exclude<FileSourceFilter, 'all'> {
  if (source === 'telegram') return 'telegram'
  if (source === 'workspace') return 'workspace'
  return 'web'
}

function getMarkdownSnippet(fileName: string, publicUrl: string): string {
  return isImageFile(fileName)
    ? `![${fileName}](${publicUrl})`
    : `[${fileName}](${publicUrl})`
}

function formatShortDate(isoString?: string): string {
  const formatted = formatTimestamp(isoString)
  if (formatted === '—') return '—'
  return formatted.slice(0, 10)
}

function FileTypeIcon({
  fileName,
  className = 'size-5 text-muted-foreground',
}: {
  fileName: string
  className?: string
}) {
  const ext = getFileExtension(fileName)
  if (isImageFile(fileName)) {
    return <ImageIcon className={className} />
  }
  if (['ZIP', 'RAR', '7Z', 'TAR', 'GZ'].includes(ext)) {
    return <FileArchive className={className} />
  }
  if (
    [
      'JSON',
      'TS',
      'TSX',
      'JS',
      'JSX',
      'MD',
      'CSV',
      'HTML',
      'CSS',
      'XML',
      'YAML',
      'YML',
    ].includes(ext)
  ) {
    return <FileCode2 className={className} />
  }
  return <FileText className={className} />
}

function SourceIndicator({ source }: { source: string }) {
  const kind = normalizeSource(source)

  if (kind === 'telegram') {
    return (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <span className="size-1.5 rounded-full bg-info" />
        <span>Bot</span>
      </span>
    )
  }

  if (kind === 'workspace') {
    return (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <span className="size-1.5 rounded-full bg-warning" />
        <span>Synced</span>
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <span className="size-1.5 rounded-full bg-primary" />
      <span>Web</span>
    </span>
  )
}

function FileThumbnail({
  fileId,
  fileName,
  fileSize,
  publicUrl,
  compact = false,
  onPreview,
}: {
  fileId: string
  fileName: string
  fileSize?: number
  publicUrl: string
  compact?: boolean
  onPreview?: () => void
}) {
  const [failedThumbnail, setFailedThumbnail] = useState(false)
  const [failedOriginal, setFailedOriginal] = useState(false)
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)
  const thumbnailUrl =
    fileId && isTransformableImageFile(fileName, fileSize)
      ? getThumbnailUrl(fileId, compact ? 'list' : 'grid')
      : ''
  const activeSrc = thumbnailUrl && !failedThumbnail ? thumbnailUrl : publicUrl
  const imageCandidate = isImageFile(fileName) && Boolean(activeSrc) && !failedOriginal
  const ext = getFileExtension(fileName)
  const isLoaded = loadedSrc === activeSrc

  if (imageCandidate) {
    if (compact) {
      return (
        <button
          type="button"
          onClick={onPreview}
          className="group/thumb relative size-9 shrink-0 overflow-hidden rounded-lg border border-border bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title={`Preview ${fileName}`}
        >
          <Image
            ref={(img) => {
              if (img && img.complete && img.naturalWidth > 0 && loadedSrc !== activeSrc) {
                setLoadedSrc(activeSrc)
              }
            }}
            src={activeSrc}
            alt={fileName}
            width={LIST_THUMBNAIL_SIZE}
            height={LIST_THUMBNAIL_SIZE}
            onLoad={() => setLoadedSrc(activeSrc)}
            onError={() => {
              if (activeSrc === thumbnailUrl) {
                setFailedThumbnail(true)
              } else {
                setFailedOriginal(true)
              }
            }}
            className={cn(
              'size-full object-cover transition-[transform,opacity] duration-200 ease-out will-change-transform group-hover/thumb:scale-105',
              isLoaded ? 'opacity-100' : 'opacity-0',
            )}
          />
          {!isLoaded && (
            <Skeleton
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 size-full rounded-none"
            />
          )}
        </button>
      )
    }

    return (
      <button
        type="button"
        onClick={onPreview}
        className="group/thumb relative block size-full cursor-zoom-in overflow-hidden bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        title={`Preview ${fileName}`}
      >
        <Image
          ref={(img) => {
            if (img && img.complete && img.naturalWidth > 0 && loadedSrc !== activeSrc) {
              setLoadedSrc(activeSrc)
            }
          }}
          src={activeSrc}
          alt={fileName}
          width={GRID_THUMBNAIL_WIDTH}
          height={GRID_THUMBNAIL_HEIGHT}
          onLoad={() => setLoadedSrc(activeSrc)}
          onError={() => {
            if (activeSrc === thumbnailUrl) {
              setFailedThumbnail(true)
            } else {
              setFailedOriginal(true)
            }
          }}
          className={cn(
            'size-full object-cover transition-[transform,opacity] duration-300 ease-out will-change-transform group-hover/thumb:scale-[1.03]',
            isLoaded ? 'opacity-100' : 'opacity-0',
          )}
        />
        {!isLoaded && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-muted/40"
          >
            <Skeleton className="absolute inset-0 size-full rounded-none" />
            <ImageIcon className="relative size-5 text-muted-foreground/50" />
          </div>
        )}
        <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/30 opacity-0 transition-opacity duration-150 group-hover/thumb:opacity-100">
          <Badge
            variant="secondary"
            className="border border-border bg-popover/95 text-popover-foreground shadow-sm"
          >
            <ZoomIn data-icon="inline-start" />
            <span>Preview</span>
          </Badge>
        </span>
      </button>
    )
  }

  if (compact) {
    return (
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary">
        <FileTypeIcon fileName={fileName} className="size-4 text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex size-full flex-col items-center justify-center gap-2 bg-background/70">
      <div className="flex size-11 items-center justify-center rounded-xl border border-border bg-secondary">
        <FileTypeIcon fileName={fileName} />
      </div>
      <Badge variant="secondary" className="font-mono text-[10px]">
        {ext}
      </Badge>
    </div>
  )
}

function ImagePreviewDialog({
  file,
  serverUrl,
  copiedKey,
  onClose,
  onCopyLink,
  onCopyText,
}: {
  file: UploadedFile | null
  serverUrl?: string
  copiedKey: string | null
  onClose: () => void
  onCopyLink: (url: string, label?: string, key?: string) => void
  onCopyText: (text: string, key?: string, label?: string) => void
}) {
  const [loadedOriginalId, setLoadedOriginalId] = useState<string | null>(null)
  const [failedOriginalId, setFailedOriginalId] = useState<string | null>(null)
  const [failedThumbId, setFailedThumbId] = useState<string | null>(null)

  const publicUrl = file ? getPublicUrl(file.publicLink, serverUrl) : ''
  const thumbnailUrl =
    file && isTransformableImageFile(file.fileName, file.size)
      ? getThumbnailUrl(file.id, 'grid')
      : ''
  const urlKey = file ? `lightbox-url-${file.id}` : ''
  const mdKey = file ? `lightbox-md-${file.id}` : ''
  const originalLoaded = Boolean(file && loadedOriginalId === file.id)
  const originalError = Boolean(file && failedOriginalId === file.id)
  const showThumbnailPlaceholder = Boolean(
    file && thumbnailUrl && !originalLoaded && failedThumbId !== file.id,
  )
  const showUnavailable = !publicUrl || originalError

  return (
    <Dialog
      open={Boolean(file)}
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
    >
      {file && (
        <DialogContent className="flex max-h-[92vh] w-fit min-w-[min(92vw,380px)] max-w-[92vw] flex-col gap-3 sm:max-w-[90vw]">
          <DialogHeader className="w-0 min-w-full pr-8">
            <DialogTitle className="truncate">{file.fileName}</DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
              <span>{formatBytes(file.size)}</span>
              <span>·</span>
              <span>{formatTimestamp(file.createdAt)}</span>
              <span>·</span>
              <SourceIndicator source={file.source} />
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-1 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
            {!showUnavailable ? (
              <div className="relative inline-flex items-center justify-center">
                {showThumbnailPlaceholder && (
                  <Image
                    key={`${file.id}-thumb`}
                    src={thumbnailUrl}
                    alt={file.fileName}
                    width={GRID_THUMBNAIL_WIDTH}
                    height={GRID_THUMBNAIL_HEIGHT}
                    onError={() => setFailedThumbId(file.id)}
                    className="block h-auto max-h-[72vh] w-auto max-w-[calc(90vw-2rem)] object-contain"
                  />
                )}
                <Image
                  key={file.id}
                  src={publicUrl}
                  alt={file.fileName}
                  width={PREVIEW_IMAGE_SIZE}
                  height={PREVIEW_IMAGE_SIZE}
                  onLoad={() => setLoadedOriginalId(file.id)}
                  onError={() => setFailedOriginalId(file.id)}
                  className={cn(
                    'object-contain transition-opacity duration-200',
                    showThumbnailPlaceholder && !originalLoaded
                      ? 'pointer-events-none absolute inset-0 size-full opacity-0'
                      : 'block h-auto max-h-[72vh] w-auto max-w-[calc(90vw-2rem)] opacity-100',
                  )}
                />
                {!originalLoaded && (
                  <Badge
                    variant="secondary"
                    className="pointer-events-none absolute right-2.5 bottom-2.5 border border-border bg-popover/95 text-[11px] text-popover-foreground shadow-sm"
                  >
                    <Spinner data-icon="inline-start" />
                    <span>Loading original…</span>
                  </Badge>
                )}
              </div>
            ) : (
              <Empty className="px-6 py-10">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ImageIcon />
                  </EmptyMedia>
                  <EmptyTitle>Preview unavailable</EmptyTitle>
                  <EmptyDescription>
                    This file could not be rendered inline in the browser.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>

          <DialogFooter className="flex-row flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() =>
                onCopyLink(
                  file.shortUrl || publicUrl,
                  file.shortUrl ? 'Link copied to clipboard' : 'Original link copied to clipboard',
                  urlKey,
                )
              }
            >
              {copiedKey === urlKey ? (
                <>
                  <Check data-icon="inline-start" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy data-icon="inline-start" />
                  <span>{file.shortUrl ? 'Copy Link' : 'Copy Original Link'}</span>
                </>
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                onCopyText(
                  getMarkdownSnippet(file.fileName, file.shortUrl || publicUrl),
                  mdKey,
                  'Markdown snippet copied',
                )
              }
            >
              {copiedKey === mdKey ? (
                <>
                  <Check data-icon="inline-start" className="text-success" />
                  <span>Copied MD</span>
                </>
              ) : (
                <>
                  <Code2 data-icon="inline-start" />
                  <span>Copy Markdown</span>
                </>
              )}
            </Button>

            <CopyOriginalLinkButton
              file={file}
              publicUrl={publicUrl}
              copiedKey={copiedKey}
              onCopyLink={onCopyLink}
            />

            <Button
              size="sm"
              variant="outline"
              render={
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
              nativeButton={false}
            >
              <ExternalLink data-icon="inline-start" />
              <span>Open</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}

export function UploadedFilesGrid({
  files,
  serverUrl,
  filesLoading,
  filesError,
  syncing,
  cleaningFolders,
  deletingIds,
  copiedKey,
  onRefreshFiles,
  onSyncWorkspace,
  onCleanupEmptyFolders,
  onCopyLink,
  onCopyText,
  onDeleteFile,
}: UploadedFilesGridProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState<FileSourceFilter>('all')
  const [viewMode, setViewMode] = useState<FileViewMode>('grid')
  const [currentPage, setCurrentPage] = useState(1)
  const [previewTarget, setPreviewTarget] = useState<UploadedFile | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<UploadedFile | null>(null)
  const [confirmCleanupOpen, setConfirmCleanupOpen] = useState(false)

  const totalSize = useMemo(
    () => files.reduce((sum, file) => sum + (Number(file.size) || 0), 0),
    [files],
  )

  const filteredFiles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return files.filter((file) => {
      if (sourceFilter !== 'all' && normalizeSource(file.source) !== sourceFilter) {
        return false
      }
      if (query && !file.fileName.toLowerCase().includes(query)) {
        return false
      }
      return true
    })
  }, [files, searchQuery, sourceFilter])

  const hasActiveFilters =
    searchQuery.trim().length > 0 || sourceFilter !== 'all'

  const pageCount = Math.max(1, Math.ceil(filteredFiles.length / FILES_PER_PAGE))
  const safeCurrentPage = Math.min(currentPage, pageCount)
  const pageStart = (safeCurrentPage - 1) * FILES_PER_PAGE
  const pageFiles = filteredFiles.slice(pageStart, pageStart + FILES_PER_PAGE)

  const isDeletingTarget = deleteTarget ? deletingIds.has(deleteTarget.id) : false

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    setCurrentPage(1)
  }

  const handleSourceChange = (next: FileSourceFilter) => {
    setSourceFilter(next)
    setCurrentPage(1)
  }

  const resetFilters = () => {
    setSearchQuery('')
    setSourceFilter('all')
    setCurrentPage(1)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    await onDeleteFile(deleteTarget.id)
    setDeleteTarget(null)
  }

  const confirmCleanupFolders = async () => {
    await onCleanupEmptyFolders()
    setConfirmCleanupOpen(false)
  }

  const summaryLabel = hasActiveFilters
    ? `${filteredFiles.length} of ${files.length} files · ${formatBytes(totalSize)}`
    : `${files.length} ${files.length === 1 ? 'file' : 'files'} · ${formatBytes(totalSize)}`

  return (
    <>
      <Card className="rounded-2xl border border-border bg-card shadow-(--panel-shadow) ring-0">
        <CardHeader className="flex flex-col items-stretch gap-3 border-b border-border pb-4">
          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-baseline gap-2.5">
              <CardTitle className="text-sm font-medium">File Library</CardTitle>
              <CardDescription className="font-mono text-xs tabular-nums">
                {summaryLabel}
              </CardDescription>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                type="button"
                onClick={onSyncWorkspace}
                disabled={syncing || filesLoading}
                variant="outline"
                size="sm"
                title="Scan CraneMail workspace folder for existing files"
              >
                {syncing ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <FolderSync data-icon="inline-start" className="text-warning" />
                )}
                <span>{syncing ? 'Syncing…' : 'Sync Workspace'}</span>
              </Button>

              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      onClick={onRefreshFiles}
                      disabled={filesLoading || syncing}
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Refresh library"
                    />
                  }
                >
                  {filesLoading && !syncing ? <Spinner /> : <RefreshCw />}
                </TooltipTrigger>
                <TooltipContent>Refresh library</TooltipContent>
              </Tooltip>

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      disabled={cleaningFolders || syncing}
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="More workspace actions"
                      title="More workspace actions"
                    />
                  }
                >
                  {cleaningFolders ? <Spinner /> : <MoreHorizontal />}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem
                    onClick={() => setConfirmCleanupOpen(true)}
                    disabled={cleaningFolders || syncing}
                  >
                    <FolderX />
                    <span>Clean Empty Folders</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex w-full flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <Tabs
              value={sourceFilter}
              onValueChange={(value) =>
                handleSourceChange(value as FileSourceFilter)
              }
            >
              <TabsList className="h-8 bg-background">
                <TabsTrigger value="all" className="px-2.5 text-xs">
                  All
                </TabsTrigger>
                <TabsTrigger value="web" className="px-2.5 text-xs">
                  Web
                </TabsTrigger>
                <TabsTrigger value="telegram" className="px-2.5 text-xs">
                  Telegram
                </TabsTrigger>
                <TabsTrigger value="workspace" className="px-2.5 text-xs">
                  Synced
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex items-center gap-2">
              <InputGroup className="w-full bg-background sm:w-56">
                <InputGroupAddon>
                  <Search />
                </InputGroupAddon>
                <InputGroupInput
                  type="search"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Search files…"
                  aria-label="Search files by filename"
                />
                {searchQuery && (
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      size="icon-xs"
                      onClick={() => handleSearchChange('')}
                      aria-label="Clear search"
                    >
                      <X />
                    </InputGroupButton>
                  </InputGroupAddon>
                )}
              </InputGroup>

              <ToggleGroup
                value={[viewMode]}
                onValueChange={(values) => {
                  const next = values[0] as FileViewMode | undefined
                  if (next) {
                    setViewMode(next)
                  }
                }}
                variant="outline"
                size="sm"
                spacing={0}
                aria-label="Toggle layout view"
                className="shrink-0 bg-background"
              >
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <ToggleGroupItem
                        value="grid"
                        aria-label="Grid view"
                      />
                    }
                  >
                    <LayoutGrid />
                  </TooltipTrigger>
                  <TooltipContent>Grid view</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger
                    render={
                      <ToggleGroupItem
                        value="list"
                        aria-label="List view"
                      />
                    }
                  >
                    <List />
                  </TooltipTrigger>
                  <TooltipContent>List view</TooltipContent>
                </Tooltip>
              </ToggleGroup>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {filesError && (
            <Alert
              variant="destructive"
              className="border-destructive/40 bg-destructive/10"
            >
              <AlertTriangle />
              <AlertTitle>Failed to load files</AlertTitle>
              <AlertDescription className="flex items-center justify-between gap-3">
                <span>{filesError}</span>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={onRefreshFiles}
                >
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {filesLoading && files.length === 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, idx) => (
                <Card key={idx} size="sm" className="bg-background/50 pt-0">
                  <Skeleton className="aspect-[16/10] w-full rounded-none" />
                  <CardContent className="flex flex-col gap-2 py-3">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : pageFiles.length > 0 ? (
            <>
              {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
                  {pageFiles.map((file) => {
                    const publicUrl = getPublicUrl(file.publicLink, serverUrl)
                    const urlKey = `url-${file.id}`
                    const mdKey = `md-${file.id}`
                    const isUrlCopied = copiedKey === urlKey
                    const isMdCopied = copiedKey === mdKey
                    const isDeleting = deletingIds.has(file.id)

                    return (
                      <Card
                        key={file.id}
                        size="sm"
                        className="min-w-0 gap-0 bg-secondary/40 pt-0 transition-colors hover:bg-secondary/70"
                      >
                        <div className="relative aspect-[16/10] w-full overflow-hidden border-b border-border bg-background">
                          <FileThumbnail
                            key={`${file.id}-${publicUrl}`}
                            fileId={file.id}
                            fileName={file.fileName}
                            fileSize={file.size}
                            publicUrl={publicUrl}
                            onPreview={() => setPreviewTarget(file)}
                          />
                        </div>

                        <CardContent className="flex flex-1 flex-col justify-between gap-3 py-3">
                          <div className="flex min-w-0 flex-col gap-1">
                            <h3
                              className="truncate text-xs font-medium text-foreground"
                              title={file.fileName}
                            >
                              {file.fileName}
                            </h3>
                            <div
                              className="flex items-center gap-1.5 truncate font-mono text-[11px] tabular-nums text-muted-foreground"
                              title={formatTimestamp(file.createdAt)}
                            >
                              <span>{formatBytes(file.size)}</span>
                              <span>·</span>
                              <span>{formatShortDate(file.createdAt)}</span>
                              <span>·</span>
                              <SourceIndicator source={file.source} />
                            </div>
                          </div>

                          <div className="flex items-center gap-1 pt-0.5">
                            <Button
                              type="button"
                              size="xs"
                              variant="secondary"
                              onClick={() =>
                                onCopyLink(
                                  file.shortUrl || publicUrl,
                                  file.shortUrl ? 'Link copied to clipboard' : 'Original link copied to clipboard',
                                  urlKey,
                                )
                              }
                              className="h-7 flex-1 text-xs"
                              title={file.shortUrl ? 'Copy link' : 'Copy original link'}
                            >
                              {isUrlCopied ? (
                                <>
                                  <Check
                                    data-icon="inline-start"
                                    className="text-success"
                                  />
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy data-icon="inline-start" />
                                  <span>{file.shortUrl ? 'Copy Link' : 'Copy Original Link'}</span>
                                </>
                              )}
                            </Button>

                            <CopyOriginalLinkButton
                              file={file}
                              publicUrl={publicUrl}
                              copiedKey={copiedKey}
                              onCopyLink={onCopyLink}
                              compact
                            />

                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <Button
                                    type="button"
                                    size="icon-xs"
                                    variant="ghost"
                                    onClick={() =>
                                      onCopyText(
                                        getMarkdownSnippet(
                                          file.fileName,
                                          file.shortUrl || publicUrl,
                                        ),
                                        mdKey,
                                        'Markdown snippet copied',
                                      )
                                    }
                                    className="size-7 text-muted-foreground hover:text-foreground"
                                    aria-label={`Copy Markdown for ${file.fileName}`}
                                  />
                                }
                              >
                                {isMdCopied ? (
                                  <Check className="text-success" />
                                ) : (
                                  <Code2 />
                                )}
                              </TooltipTrigger>
                              <TooltipContent>Copy Markdown</TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <a
                                    href={publicUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={cn(
                                      buttonVariants({
                                        variant: 'ghost',
                                        size: 'icon-xs',
                                      }),
                                      'size-7 text-muted-foreground hover:text-foreground',
                                    )}
                                    aria-label={`Open ${file.fileName} in new tab`}
                                  />
                                }
                              >
                                <ExternalLink />
                              </TooltipTrigger>
                              <TooltipContent>Open in new tab</TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <Button
                                    type="button"
                                    size="icon-xs"
                                    variant="ghost"
                                    onClick={() => setDeleteTarget(file)}
                                    disabled={isDeleting}
                                    className="size-7 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                                    aria-label={`Delete ${file.fileName}`}
                                  />
                                }
                              >
                                {isDeleting ? <Spinner /> : <Trash2 />}
                              </TooltipTrigger>
                              <TooltipContent>
                                Delete from workspace
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border bg-background/60">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="px-3 text-xs text-muted-foreground">
                          File
                        </TableHead>
                        <TableHead className="text-xs text-muted-foreground">
                          Source
                        </TableHead>
                        <TableHead className="text-right text-xs text-muted-foreground">
                          Size
                        </TableHead>
                        <TableHead className="hidden text-right text-xs text-muted-foreground md:table-cell">
                          Uploaded
                        </TableHead>
                        <TableHead className="px-3 text-right text-xs text-muted-foreground">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageFiles.map((file) => {
                        const publicUrl = getPublicUrl(file.publicLink, serverUrl)
                        const urlKey = `url-${file.id}`
                        const mdKey = `md-${file.id}`
                        const isUrlCopied = copiedKey === urlKey
                        const isMdCopied = copiedKey === mdKey
                        const isDeleting = deletingIds.has(file.id)

                        return (
                          <TableRow key={file.id}>
                            <TableCell className="max-w-[260px] px-3">
                              <div className="flex min-w-0 items-center gap-2.5">
                                <FileThumbnail
                                  key={`${file.id}-${publicUrl}`}
                                  fileId={file.id}
                                  fileName={file.fileName}
                                  fileSize={file.size}
                                  publicUrl={publicUrl}
                                  compact
                                  onPreview={() => setPreviewTarget(file)}
                                />
                                <div className="flex min-w-0 flex-col gap-0.5">
                                  <span
                                    className="truncate text-xs font-medium text-foreground"
                                    title={file.fileName}
                                  >
                                    {file.fileName}
                                  </span>
                                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground md:hidden">
                                    {formatTimestamp(file.createdAt)}
                                  </span>
                                </div>
                              </div>
                            </TableCell>

                            <TableCell className="text-xs">
                              <SourceIndicator source={file.source} />
                            </TableCell>

                            <TableCell className="text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                              {formatBytes(file.size)}
                            </TableCell>

                            <TableCell className="hidden text-right font-mono text-[11px] tabular-nums text-muted-foreground md:table-cell">
                              {formatTimestamp(file.createdAt)}
                            </TableCell>

                            <TableCell className="px-3 text-right">
                              <div className="inline-flex items-center gap-1">
                                <Button
                                  type="button"
                                  size="xs"
                                  variant="secondary"
                                  onClick={() =>
                                    onCopyLink(
                                      file.shortUrl || publicUrl,
                                      file.shortUrl ? 'Link copied to clipboard' : 'Original link copied to clipboard',
                                      urlKey,
                                    )
                                  }
                                  className="h-7 text-[11px]"
                                >
                                  {isUrlCopied ? (
                                    <>
                                      <Check
                                        data-icon="inline-start"
                                        className="text-success"
                                      />
                                      <span>Copied</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy data-icon="inline-start" />
                                      <span>{file.shortUrl ? 'Copy Link' : 'Copy Original Link'}</span>
                                    </>
                                  )}
                                </Button>

                                <CopyOriginalLinkButton
                                  file={file}
                                  publicUrl={publicUrl}
                                  copiedKey={copiedKey}
                                  onCopyLink={onCopyLink}
                                  compact
                                />

                                <Tooltip>
                                  <TooltipTrigger
                                    render={
                                      <Button
                                        type="button"
                                        size="icon-xs"
                                        variant="ghost"
                                        onClick={() =>
                                          onCopyText(
                                            getMarkdownSnippet(
                                              file.fileName,
                                              file.shortUrl || publicUrl,
                                            ),
                                            mdKey,
                                            'Markdown snippet copied',
                                          )
                                        }
                                        className="size-7 text-muted-foreground hover:text-foreground"
                                        aria-label={`Copy Markdown for ${file.fileName}`}
                                      />
                                    }
                                  >
                                    {isMdCopied ? (
                                      <Check className="text-success" />
                                    ) : (
                                      <Code2 />
                                    )}
                                  </TooltipTrigger>
                                  <TooltipContent>Copy Markdown</TooltipContent>
                                </Tooltip>

                                <Tooltip>
                                  <TooltipTrigger
                                    render={
                                      <a
                                        href={publicUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={cn(
                                          buttonVariants({
                                            variant: 'ghost',
                                            size: 'icon-xs',
                                          }),
                                          'size-7 text-muted-foreground hover:text-foreground',
                                        )}
                                        aria-label={`Open ${file.fileName} in new tab`}
                                      />
                                    }
                                  >
                                    <ExternalLink />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Open in new tab
                                  </TooltipContent>
                                </Tooltip>

                                <Tooltip>
                                  <TooltipTrigger
                                    render={
                                      <Button
                                        type="button"
                                        size="icon-xs"
                                        variant="ghost"
                                        onClick={() => setDeleteTarget(file)}
                                        disabled={isDeleting}
                                        className="size-7 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                                        aria-label={`Delete ${file.fileName}`}
                                      />
                                    }
                                  >
                                    {isDeleting ? <Spinner /> : <Trash2 />}
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Delete from workspace
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              {pageCount > 1 && (
                <div className="flex flex-col gap-3">
                  <Separator />
                  <div className="flex items-center justify-between gap-3">
                    <Button
                      type="button"
                      onClick={() =>
                        setCurrentPage((page) =>
                          Math.max(1, Math.min(page, pageCount) - 1),
                        )
                      }
                      disabled={safeCurrentPage <= 1}
                      variant="outline"
                      size="xs"
                      className="h-7"
                    >
                      <ChevronLeft data-icon="inline-start" />
                      <span>Previous</span>
                    </Button>

                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {pageStart + 1}–
                      {Math.min(pageStart + FILES_PER_PAGE, filteredFiles.length)}{' '}
                      of {filteredFiles.length} · Page {safeCurrentPage}/
                      {pageCount}
                    </span>

                    <Button
                      type="button"
                      onClick={() =>
                        setCurrentPage((page) =>
                          Math.min(pageCount, Math.min(page, pageCount) + 1),
                        )
                      }
                      disabled={safeCurrentPage >= pageCount}
                      variant="outline"
                      size="xs"
                      className="h-7"
                    >
                      <span>Next</span>
                      <ChevronRight data-icon="inline-end" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : files.length === 0 ? (
            <Empty className="border border-dashed border-border bg-background/50 py-14">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileText />
                </EmptyMedia>
                <EmptyTitle>No files in your library yet</EmptyTitle>
                <EmptyDescription>
                  Drop or paste a file in the upload panel, or sync existing files already stored in your CraneMail public folder.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onSyncWorkspace}
                  disabled={syncing || filesLoading}
                >
                  {syncing ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <FolderSync
                      data-icon="inline-start"
                      className="text-warning"
                    />
                  )}
                  <span>
                    {syncing
                      ? 'Syncing Workspace…'
                      : 'Sync Existing Workspace Files'}
                  </span>
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <Empty className="border border-dashed border-border bg-background/50 py-12">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Search />
                </EmptyMedia>
                <EmptyTitle>No matching files</EmptyTitle>
                <EmptyDescription>
                  Try another filename or clear the active filters.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={resetFilters}
                >
                  Reset Filters
                </Button>
              </EmptyContent>
            </Empty>
          )}
        </CardContent>
      </Card>

      <ImagePreviewDialog
        file={previewTarget}
        serverUrl={serverUrl}
        copiedKey={copiedKey}
        onClose={() => setPreviewTarget(null)}
        onCopyLink={onCopyLink}
        onCopyText={onCopyText}
      />

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !isDeletingTarget) {
            setDeleteTarget(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/15 text-destructive">
              <AlertTriangle />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete workspace file?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes{' '}
              <span className="font-medium text-foreground">
                {deleteTarget?.fileName}
              </span>{' '}
              from your CraneMail workspace and deletes its public link record. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingTarget}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isDeletingTarget}
              variant="destructive"
            >
              {isDeletingTarget ? (
                <>
                  <Spinner data-icon="inline-start" />
                  <span>Deleting…</span>
                </>
              ) : (
                <>
                  <Trash2 data-icon="inline-start" />
                  <span>Delete Permanently</span>
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmCleanupOpen}
        onOpenChange={(open) => {
          if (!open && !cleaningFolders) {
            setConfirmCleanupOpen(false)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-muted text-muted-foreground">
              <FolderX />
            </AlertDialogMedia>
            <AlertDialogTitle>Clean empty date folders?</AlertDialogTitle>
            <AlertDialogDescription>
              Scans your CraneMail public upload folder and removes empty YYYY/MM/DD date folders left behind after deleting files. Non-empty folders and other custom folders are never touched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cleaningFolders}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCleanupFolders}
              disabled={cleaningFolders}
            >
              {cleaningFolders ? (
                <>
                  <Spinner data-icon="inline-start" />
                  <span>Cleaning…</span>
                </>
              ) : (
                <>
                  <FolderX data-icon="inline-start" />
                  <span>Clean Empty Folders</span>
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
