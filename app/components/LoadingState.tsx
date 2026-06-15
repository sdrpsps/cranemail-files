export function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center space-y-4 py-12">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-500/30 border-t-blue-500" />
      <p className="text-sm tracking-wide text-zinc-400">Syncing session...</p>
    </div>
  )
}
