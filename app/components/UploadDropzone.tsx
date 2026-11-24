'use client'

import type { ChangeEvent, DragEvent } from 'react'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  UploadCloud,
  X,
} from 'lucide-react'

import type { UploadQueueItem } from '@/app/types/app'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatBytes, getPublicUrl } from '@/lib/format'
import { cn } from '@/lib/utils'

interface UploadDropzoneProps {
  serverUrl?: string
  uploading: boolean
  uploadError: string
  uploadQueue: UploadQueueItem[]
  isDragActive: boolean
  copiedKey: string | null
  onDrag: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void
  onCopyLink: (url: string, label?: string, key?: string) => void
  onClearQueue: () => void
}

export function UploadDropzone({
  serverUrl,
  uploading,
  uploadError,
  uploadQueue,
  isDragActive,
  copiedKey,
  onDrag,
  onDrop,
  onFileChange,
  onCopyLink,
  onClearQueue,
}: UploadDropzoneProps) {
  const hasClearableItems = uploadQueue.some((item) => item.status !== 'uploading')

  return (
    <Card className="rounded-2xl border border-border bg-card shadow-(--panel-shadow) ring-0">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Upload Files</CardTitle>
        <CardDescription className="text-[11px]">
          Saved to date folders with instant public URLs
        </CardDescription>
        <CardAction className="hidden sm:block">
          <Tooltip>
            <TooltipTrigger
              render={
                <Badge
                  variant="outline"
                  className="cursor-default font-mono text-[10px] text-muted-foreground"
                />
              }
            >
              ⌘V / Ctrl+V
            </TooltipTrigger>
            <TooltipContent>
              Paste clipboard images or files anywhere on the dashboard
            </TooltipContent>
          </Tooltip>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-3.5">
        <div
          onDragEnter={onDrag}
          onDragOver={onDrag}
          onDragLeave={onDrag}
          onDrop={onDrop}
          className={cn(
            'group relative flex min-h-[164px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-6 text-center transition-colors',
            isDragActive
              ? 'border-primary bg-primary/10'
              : 'border-input bg-background/70 hover:border-ring/50 hover:bg-background',
          )}
        >
          <input
            type="file"
            multiple
            id="web-file-input"
            aria-label="Choose files to upload"
            className="absolute inset-0 size-full cursor-pointer opacity-0"
            onChange={onFileChange}
          />

          <div
            className={cn(
              'mb-3 flex size-10 items-center justify-center rounded-xl border transition-colors',
              isDragActive
                ? 'border-primary/50 bg-primary/15 text-primary'
                : 'border-border bg-secondary text-muted-foreground group-hover:text-foreground',
            )}
          >
            {uploading ? (
              <Spinner className="size-5 text-primary" />
            ) : (
              <UploadCloud className="size-5" />
            )}
          </div>

          {isDragActive ? (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-primary">
                Release to upload to CraneMail
              </p>
              <p className="text-[11px] text-primary/80">
                Multiple files are queued automatically
              </p>
            </div>
          ) : uploading ? (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-foreground">
                Uploading to workspace…
              </p>
              <p className="text-[11px] text-muted-foreground">
                Drop or click to queue more files
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-foreground">
                Drop files here, or click to browse
              </p>
              <p className="text-[11px] text-muted-foreground">
                Multi-file upload &amp; clipboard paste supported
              </p>
            </div>
          )}
        </div>

        {uploadError && uploadQueue.length === 0 && (
          <Alert
            variant="destructive"
            className="border-destructive/40 bg-destructive/10"
          >
            <AlertCircle />
            <AlertTitle>Upload failed</AlertTitle>
            <AlertDescription className="text-xs">{uploadError}</AlertDescription>
          </Alert>
        )}

        {uploadQueue.length > 0 && (
          <>
            <Separator />
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground">
                  Upload Queue ({uploadQueue.length})
                </span>
                {hasClearableItems && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={onClearQueue}
                    className="text-muted-foreground"
                  >
                    <X data-icon="inline-start" />
                    <span>Clear</span>
                  </Button>
                )}
              </div>

              <ScrollArea className="max-h-56 pr-2">
                <ul className="flex flex-col gap-1.5">
                  {uploadQueue.map((item) => {
                    const resolvedUrl = item.publicLink
                      ? getPublicUrl(item.publicLink, serverUrl)
                      : ''
                    const copyKey = `queue-${item.id}`
                    const isCopied = copiedKey === copyKey

                    return (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background/70 px-2.5 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          {item.status === 'uploading' ? (
                            <Spinner className="size-3.5 shrink-0 text-primary" />
                          ) : item.status === 'done' ? (
                            <CheckCircle2 className="size-3.5 shrink-0 text-success" />
                          ) : (
                            <AlertCircle className="size-3.5 shrink-0 text-destructive" />
                          )}

                          <div className="min-w-0">
                            <p
                              className="truncate text-xs font-medium text-foreground"
                              title={item.fileName}
                            >
                              {item.fileName}
                            </p>
                            <p className="truncate text-[10px] tabular-nums text-muted-foreground">
                              {item.status === 'error'
                                ? item.error || 'Upload failed'
                                : `${formatBytes(item.size)} · ${
                                    item.status === 'uploading'
                                      ? 'Uploading…'
                                      : 'Ready'
                                  }`}
                            </p>
                          </div>
                        </div>

                        {item.status === 'done' && resolvedUrl && (
                          <Button
                            type="button"
                            size="xs"
                            variant={isCopied ? 'secondary' : 'outline'}
                            onClick={() =>
                              onCopyLink(
                                resolvedUrl,
                                'Direct link copied',
                                copyKey,
                              )
                            }
                            title="Copy public link"
                          >
                            {isCopied ? (
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
                                <span>Copy</span>
                              </>
                            )}
                          </Button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </ScrollArea>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
