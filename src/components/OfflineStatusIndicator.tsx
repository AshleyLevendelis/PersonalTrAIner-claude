import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Zap, RefreshCw, CheckCircle2 } from 'lucide-react'
import { subscribeSyncState, type SyncState } from '@/lib/offline-sync'

export function OfflineStatusIndicator() {
  const [state, setState] = useState<SyncState>({
    isOnline: true,
    isSyncing: false,
    queuedCount: 0,
  })
  const [showSyncSuccess, setShowSyncSuccess] = useState(false)
  const [prevQueued, setPrevQueued] = useState(0)

  useEffect(() => {
    const unsub = subscribeSyncState((newState) => {
      setState(prev => {
        if (prev.queuedCount > 0 && newState.queuedCount === 0 && !newState.isSyncing && prev.isSyncing) {
          setShowSyncSuccess(true)
          setTimeout(() => setShowSyncSuccess(false), 3000)
        }
        return newState
      })
    })
    return unsub
  }, [])

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
