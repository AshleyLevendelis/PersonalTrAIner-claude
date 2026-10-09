import { useState, useEffect, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Zap, RefreshCw, CheckCircle2, AlertTriangle, X, RotateCcw, Trash2 } from 'lucide-react'
import { subscribeSyncState, type SyncState } from '@/lib/set-log-store'
import {
  getAllFailedItems, retryFailedItem, discardFailedItem, subscribeAllQueues,
  QUEUE_LABEL, plainSyncError, type FailedItem,
} from '@/lib/queue-health'
import { STILL_ON_THIS_DEVICE } from '@/lib/coach-voice'

// ---------------------------------------------------------------------------
// THE COLOURS ARE THE THEME'S OWN — H20, 9 Oct 2026.
//
// Every surface here was written as a light/dark pair: `bg-red-50
// dark:bg-red-950/20`, `text-red-700 dark:text-red-400`. Nothing in this app
// ever adds the `dark` class (index.css says so: [data-theme] is the real
// axis), so the `dark:` half never applied and every theme got the light-mode
// half — a pale pink card under the theme's own muted lilac labels, which the
// tester called "close to unreadable".
//
// These are the tokens InsightBanner and the cardio notice already use, mixed
// over the page's own background so a badge floating over scrolling content
// stays a solid chip rather than a 9% tint you can read the page through.
// verify:sets-reconnect measures the contrast of the card's text on a real
// screen, in a dark theme and a light one.
// ---------------------------------------------------------------------------
const chip = (role: string) => ({
  background: `color-mix(in srgb, var(--${role}) 16%, var(--background))`,
  borderColor: `var(--${role}-border)`,
  color: `var(--${role}-text)`,
})

// ---------------------------------------------------------------------------
// Audit §3.5 — this used to read ONE of the five local-first queues.
//
// It subscribed to set-log-store and listed set-log-store's dead letters, so
// water, grocery items, cardio logs and meal events could each exhaust their
// retries and be dropped for good with no indicator anywhere in the app. The
// badge said "3 sets failed to sync" while a week of water was quietly gone.
//
// It now reads all five through queue-health, which is a reader over the
// stores rather than a second queue — each store still owns its own retry and
// discard. set-log-store's subscribeSyncState stays the primary signal
// because it is the only one carrying online/syncing/queued counts; the other
// four are subscribed for repaints so a water failure updates the badge
// without waiting for an unrelated set to be logged.
// ---------------------------------------------------------------------------

export function OfflineStatusIndicator() {
  const [state, setState] = useState<SyncState>({
    isOnline: true,
    isSyncing: false,
    queuedCount: 0,
    deadLetterCount: 0,
  })
  const [showSyncSuccess, setShowSyncSuccess] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [failedItems, setFailedItems] = useState<FailedItem[]>([])

  const refreshFailures = useCallback(() => setFailedItems(getAllFailedItems()), [])

  useEffect(() => {
    const unsubSync = subscribeSyncState((newState) => {
      setState(prev => {
        if (prev.queuedCount > 0 && newState.queuedCount === 0 && !newState.isSyncing && prev.isSyncing) {
          setShowSyncSuccess(true)
          setTimeout(() => setShowSyncSuccess(false), 3000)
        }
        return newState
      })
      refreshFailures()
    })
    const unsubOthers = subscribeAllQueues(refreshFailures)
    // The other four queues can already hold failures from a previous
    // session, and none of them fires on mount — without this read the badge
    // stays hidden until something unrelated happens.
    refreshFailures()
    return () => { unsubSync(); unsubOthers() }
  }, [refreshFailures])

  const handleRetry = (item: FailedItem) => {
    retryFailedItem(item)
    refreshFailures()
  }

  const handleDiscard = (item: FailedItem) => {
    discardFailedItem(item)
    refreshFailures()
  }

  const reviewPanel = reviewOpen && (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-20 px-4 bg-black/20" onClick={() => setReviewOpen(false)}>
      <Card className="w-full max-w-sm max-h-[70vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold flex items-center gap-1.5">
              <AlertTriangle className="size-3.5 text-[color:var(--role-warn-text)]" />
              Didn't save
            </span>
            <Button variant="ghost" size="icon" className="hit-slop-44 size-6" onClick={() => setReviewOpen(false)} aria-label="Close">
              <X className="size-3.5" />
            </Button>
          </div>
          {failedItems.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">Nothing pending — all clear.</p>
          ) : (
            <div className="space-y-2">
              {/* Said once for the whole list, because it is true of every
                  item on it whichever queue it came from. */}
              <p className="text-xs text-muted-foreground">{STILL_ON_THIS_DEVICE}</p>
              {failedItems.map(item => (
                <div
                  key={`${item.queue}:${item.clientId}`}
                  data-testid="didnt-save-item"
                  className="rounded-md border border-[color:var(--role-warn-border)] bg-[color:var(--role-warn-bg)] p-2 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-foreground truncate">{item.label}</span>
                    {item.date && <span className="text-[0.625rem] text-foreground/75 shrink-0">{item.date}</span>}
                  </div>
                  {/* Which queue it came from, because "500 ml" and "Chest Dips
                      · set 3" in one list need saying apart. */}
                  {/* Not `text-muted-foreground`: on this card's tint the theme's
                      muted lilac measured 4.5:1 exactly at 10px — legal, and
                      the very pairing the tester could not read. */}
                  <p className="text-[0.625rem] text-foreground/75">{QUEUE_LABEL[item.queue]}</p>
                  {/* IN WORDS. This line printed the failure as the browser
                      threw it — "TypeError: Failed to fetch". */}
                  <p className="text-[0.6875rem] text-[color:var(--role-warn-text)]" data-testid="didnt-save-reason">
                    {plainSyncError(item.errorMessage, { refused: item.refused })}
                  </p>
                  <div className="flex gap-3 pt-0.5">
                    <Button variant="outline" size="sm" className="hit-slop-44 h-6 text-[0.625rem] px-2 gap-1" onClick={() => handleRetry(item)}>
                      <RotateCcw className="size-2.5" />
                      Retry
                    </Button>
                    <Button variant="outline" size="sm" className="hit-slop-44 h-6 text-[0.625rem] px-2 gap-1 text-destructive hover:text-destructive" onClick={() => handleDiscard(item)}>
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
        <Card className="border-primary/40 shadow-lg" style={{ background: 'color-mix(in srgb, var(--primary) 14%, var(--background))' }}>
          <CardContent className="py-2.5 px-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary-text shrink-0" />
              <span className="text-sm font-medium text-foreground">
                All offline workout logs synced!
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Counted from every queue, not from set-log-store's own deadLetterCount —
  // that number is the reason four fifths of the failures were invisible.
  if (failedItems.length > 0) {
    return (
      <>
        <button onClick={() => setReviewOpen(true)} aria-label="Review things that didn't save">
          <Badge variant="secondary" data-testid="didnt-save-pill" className="gap-1.5 cursor-pointer" style={chip('role-warn')}>
            <AlertTriangle className="h-3 w-3" />
            <span>
              {failedItems.length} thing{failedItems.length !== 1 ? 's' : ''} didn't save — tap to review
            </span>
          </Badge>
        </button>
        {reviewPanel}
      </>
    )
  }

  if (state.isSyncing) {
    return (
      <Badge variant="secondary" className="gap-1.5 animate-pulse" style={chip('role-ai')}>
        <RefreshCw className="h-3 w-3 animate-spin" />
        <span>Syncing logs...</span>
      </Badge>
    )
  }

  if (!state.isOnline || state.queuedCount > 0) {
    return (
      <Badge variant="secondary" data-testid="saved-offline-badge" className="gap-1.5" style={chip('role-warn')}>
        <Zap className="h-3 w-3" />
        <span>
          Saved Offline{state.queuedCount > 0 && ` (${state.queuedCount} set${state.queuedCount !== 1 ? 's' : ''} queued)`}
        </span>
      </Badge>
    )
  }

  return null
}
