import type { ToastState } from '@/app/types/app'

interface ToastNotificationProps {
  toast: ToastState | null
}

export function ToastNotification({ toast }: ToastNotificationProps) {
  if (!toast) return null

  const tone =
    toast.type === 'error'
      ? 'bg-red-950/80 border-red-900/60 text-red-300'
      : toast.type === 'info'
        ? 'bg-blue-950/80 border-blue-900/60 text-blue-300'
        : 'bg-emerald-950/80 border-emerald-900/60 text-emerald-300'

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex max-w-[calc(100vw-3rem)] items-center space-x-2.5 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-md transition-all duration-300 ${tone}`}
    >
      {toast.type === 'error' ? (
        <svg className="h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      ) : (
        <svg className="h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      )}
      <span className="text-sm font-medium">{toast.message}</span>
    </div>
  )
}
