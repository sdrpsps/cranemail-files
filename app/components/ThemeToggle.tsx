'use client'

import { useSyncExternalStore } from 'react'
import { Moon, Sun, SunMoon } from 'lucide-react'
import { useTheme } from 'next-themes'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ThemeToggleProps {
  className?: string
}

const THEME_ORDER = ['system', 'light', 'dark'] as const
type ThemeMode = (typeof THEME_ORDER)[number]

const THEME_LABELS: Record<ThemeMode, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
}

const emptySubscribe = () => () => {}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme()
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  )

  const activeMode: ThemeMode =
    isClient && (theme === 'light' || theme === 'dark' || theme === 'system')
      ? theme
      : 'system'

  const nextMode =
    THEME_ORDER[(THEME_ORDER.indexOf(activeMode) + 1) % THEME_ORDER.length]

  const label = `Theme: ${THEME_LABELS[activeMode]} (switch to ${THEME_LABELS[nextMode]})`

  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      onClick={() => setTheme(nextMode)}
      className={cn('relative overflow-hidden', className)}
      aria-label={label}
      title={label}
    >
      <SunMoon
        className={cn(
          'size-3.5 transition-all duration-300 ease-out',
          activeMode === 'system'
            ? 'rotate-0 scale-100 opacity-100'
            : '-rotate-90 scale-0 opacity-0',
        )}
      />
      <Sun
        className={cn(
          'absolute size-3.5 transition-all duration-300 ease-out',
          activeMode === 'light'
            ? 'rotate-0 scale-100 opacity-100'
            : activeMode === 'dark'
              ? '-rotate-90 scale-0 opacity-0'
              : 'rotate-90 scale-0 opacity-0',
        )}
      />
      <Moon
        className={cn(
          'absolute size-3.5 transition-all duration-300 ease-out',
          activeMode === 'dark'
            ? 'rotate-0 scale-100 opacity-100'
            : 'rotate-90 scale-0 opacity-0',
        )}
      />
      <span className="sr-only">{label}</span>
    </Button>
  )
}
