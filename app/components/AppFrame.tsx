import type { ReactNode } from 'react'

import { GitHubReferral } from '@/app/components/GitHubReferral'
import { ThemeToggle } from '@/app/components/ThemeToggle'

interface AppFrameProps {
  children: ReactNode
  width?: 'narrow' | 'wide'
}

export function AppFrame({ children, width = 'narrow' }: AppFrameProps) {
  if (width === 'wide') {
    return (
      <div className="relative isolate min-h-screen bg-background text-foreground antialiased">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(ellipse_75%_60%_at_50%_-15%,var(--ambient-glow),transparent)]"
        />
        <main className="min-h-screen w-full">{children}</main>
      </div>
    )
  }

  return (
    <div className="relative isolate min-h-screen bg-background px-4 pt-16 pb-10 text-foreground antialiased sm:px-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(ellipse_70%_55%_at_50%_-10%,var(--ambient-glow),transparent)]"
      />
      <aside className="fixed top-4 right-4 z-40 flex items-center gap-2 sm:top-5 sm:right-6">
        <ThemeToggle className="bg-card/90 shadow-sm backdrop-blur-md" />
        <GitHubReferral
          variant="inline"
          className="bg-card/90 shadow-sm backdrop-blur-md"
        />
      </aside>
      <main className="mx-auto flex min-h-[calc(100vh-6.5rem)] w-full max-w-[440px] items-center justify-center">
        <div className="w-full">{children}</div>
      </main>
    </div>
  )
}
