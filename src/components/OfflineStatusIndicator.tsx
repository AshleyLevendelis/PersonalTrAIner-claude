import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Zap, RefreshCw, CheckCircle2, AlertTriangle, X, RotateCcw, Trash2 } from 'lucide-react'
import {
  subscribeSyncState, getDeadLetterItems, retryDeadLetterItem, discardDeadLetterItem,
  type SyncState, type DeadLetterSummary,
} from '@/lib/set-log-store'

export function OfflineStatusIndicator() {
  const [state, setState] = useState<SyncState>({
    isOnline: true,
    isSyncing: false,
    queuedCount: 0,
    deadLetterCount: 0,
  })
  const [showSyncSuccess, setShowSyncSuccess] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [deadLetterItems, setDeadLetterItems] = useState<DeadLetterSummary[]>([])

  useEffect(() => {
    const unsub = subscribeSyncState((newState) => {
      setState(prev => {
        if (prev.queuedCount > 0 && newState.queuedCount === 0 && !newState.isSyncing && prev.isSyncing) {
          setShowSyncSuccess(true)
          setTimeout(() => setShowSyncSuccess(false), 3000)
        }
        return newState
      })
      setDeadLetterItems(getDeadLetterItems())
    })
    return unsub
  }, [])

  const handleRetry = (clientId: string) => {
    retryDeadLetterItem(clientId)
    setDeadLetterItems(getDeadLetterItems())
  }

  const handleDiscard = (clientId: string) => {
    discardDeadLetterItem(clientId)
    setDeadLetterItems(getDeadLetterItems())
  }

  const reviewPanel = reviewOpen && (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-20 px-4 bg-black/20" onClick={() => setReviewOpen(false)}>
      <Card className="w-full max-w-sm max-h-[70vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold flex items-center gap-1.5">
              <AlertTriangle className="size-3.5 text-red-500" />
              Sets that failed to sync
            </span>
            <Button variant="ghost" size="icon" className="hit-slop-44 size-6" onClick={() => setReviewOpen(false)}>
              <X className="size-3.5" />
            </Button>
          </div>
          {deadLetterItems.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">Nothing pending — all clear.</p>
          ) : (
            <div className="space-y-2">
              {deadLetterItems.map(item => (
                <div key={item.clientId} className="rounded-md border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20 p-2 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium truncate">
                      {item.exerciseName} — set {item.setNumber}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{item.date}</span>
                  </div>
                  {item.kind === 'upsert' && (
                    <p className="text-[10px] text-muted-foreground">
                      {item.weightKg}kg × {item.repsCompleted}
                    </p>
                  )}
                  <p className="text-[10px] text-red-700 dark:text-red-400">{item.errorMessage}</p>
                  <div className="flex gap-3 pt-0.5">
                    <Button variant="outline" size="sm" className="hit-slop-44 h-6 text-[10px] px-2 gap-1" onClick={() => handleRetry(item.clientId)}>
                      <RotateCcw className="size-2.5" />
                      Retry
                    </Button>
                    <Button variant="outline" size="sm" className="hit-slop-44 h-6 text-[10px] px-2 gap-1 text-destructive hover:text-destructive" onClick={() => handleDiscard(item.clientId)}>
                      <Trash2 className="size-2.5" />
                      Discard
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )

  if (showSyncSuccess) {
    return (
      <div className="fixed top-4 left-4 right-4 z-50 md:left-auto md:right-4 md:w-80 animate-in fade-in slide-in-from-top-2 duration-300">
        <Card className="border-green-300/50 bg-green-50/95 dark:bg-green-950/90 dark:border-green-700/30 backdrop-blur-sm shadow-lg">
          <CardContent className="py-2.5 px-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
              <span className="text-sm font-medium text-green-800 dark:text-green-200">
                All offline workout logs synced!
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (state.deadLetterCount > 0) {
    return (
      <>
        <button onClick={() => setReviewOpen(true)} aria-label="Review sets that failed to sync">
          <Badge
            variant="secondary"
            className="gap-1.5 bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800 cursor-pointer hover:bg-red-100 dark:hover:bg-red-950/70"
          >
            <AlertTriangle className="h-3 w-3" />
            <span>
              {state.deadLetterCount} set{state.deadLetterCount !== 1 ? 's' : ''} failed to sync — tap to review
            </span>
          </Badge>
        </button>
        {reviewPanel}
      </>
    )
  }

  if (state.isSyncing) {
    return (
      <Badge
        variant="secondary"
        className="gap-1.5 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800 animate-pulse"
      >
        <RefreshCw className="h-3 w-3 animate-spin" />
        <span>Syncing logs...</span>
      </Badge>
    )
  }

  if (!state.isOnline || state.queuedCount > 0) {
    return (
      <Badge
        variant="secondary"
        className="gap-1.5 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800"
      >
        <Zap className="h-3 w-3" />
        <span>
          Saved Offline{state.queuedCount > 0 && ` (${state.queuedCount} set${state.queuedCount !== 1 ? 's' : ''} queued)`}
        </span>
      </Badge>
    )
  }

  return null
}
