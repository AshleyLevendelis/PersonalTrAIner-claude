// ---------------------------------------------------------------------------
// SETS FROM THE WATCH, WAITING (27 Nov 2026, the gym-floor review): a set logged on the watch is saved by the Exercise
// list's own tick, so it waits on the phone until Exercise is open. Back from the gym he opens the app on Home and the
// sets sat there unsaid. Home now says so, with one tap to the list that saves them. Phone app only; draws nothing
// with nothing waiting. Its own download, like the watch's part of Exercise.
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react'
import { Watch } from 'lucide-react'
import { waitingWatchSets, subscribeWatchSets } from '@/lib/watch-session'
import { tabHash } from '@/lib/app-route'

/** "3 sets from your watch are waiting", or null with none for today (an undo is not a set). */
function waitingLine(count: number): string | null {
  if (count <= 0) return null
  return count === 1 ? '1 set from your watch is waiting' : `${count} sets from your watch are waiting`
}

export default function WatchSetsWaiting({ today }: { today: string }) {
  const read = () => waitingWatchSets().filter(s => s.date === today && !s.undo).length
  const [count, setCount] = useState(read)
  useEffect(() => { setCount(read()); return subscribeWatchSets(() => setCount(read())) }, [today]) // eslint-disable-line react-hooks/exhaustive-deps
  const line = waitingLine(count)
  if (!line) return null
  return (
    <div className="flex min-h-11 items-center justify-between gap-2 rounded-xl px-3 py-2 bg-[color:var(--surface-raised)]" data-testid="watch-sets-home" role="status">
      <span className="flex min-w-0 items-center gap-2 text-[0.8125rem]">
        <Watch className="size-4 shrink-0 text-primary-text" aria-hidden />
        <span className="min-w-0">{line}</span>
      </span>
      <button type="button" className="hit-slop-44 shrink-0 min-h-11 px-2 text-xs font-semibold text-primary-text" onClick={() => { location.hash = tabHash('exercise') }}>
        Save them
      </button>
    </div>
  )
}
