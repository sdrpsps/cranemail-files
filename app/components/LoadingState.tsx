import { Card } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'

interface LoadingStateProps {
  label?: string
}

export function LoadingState({
  label = 'Checking workspace session…',
}: LoadingStateProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3.5 py-12">
      <Card className="size-11 items-center justify-center border border-border bg-card p-0 shadow-sm ring-0">
        <Spinner className="size-5 text-primary" />
      </Card>
      <p className="text-xs font-medium tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  )
}
