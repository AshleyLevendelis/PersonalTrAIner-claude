// ---------------------------------------------------------------------------
// THE WATCH'S PART OF TODAY'S EXERCISE LIST (27 Nov 2026; his vision: "On a weight workout see 'next exercise 3x10
// bench press @100kg' then start rest from watch, start next set"; docs/plans/watch-app.md W3). Its own download, the
// phone app only.
//
// 1. Sends the watch today's session: the rows this list draws (TodayPanel builds them with today's weights).
// 2. Saves each set ticked on the watch with THIS LIST'S OWN TICK, one at a time and each pressed once, opening the
//    row first when it is closed (a closed row draws no ticks): the weight, the checks, the rest and the record are the
//    phone's. A set it cannot save in one tap is said here with Dismiss, never guessed.
// ---------------------------------------------------------------------------
import { useEffect, useRef, useState } from 'react'
import { watchTodayPayload, waitingWatchSets, subscribeWatchSets, dropWatchSets, tickForWatchSet, type WatchRow, type WatchSet } from '@/lib/watch-session'
import { estimatedMaxHeartRate } from '@/lib/heart-series'

type NeedYou = { set: WatchSet; why: 'typed' | 'missing' | 'refused' }

export default function WatchLink({ rows, listEl, today, logs, title, age, noZones }: {
  rows: WatchRow[]
  listEl: HTMLElement | null
  today: string
  /** Today's sets: a change is the moment to look again. */
  logs: unknown
  title: string
  age: number | null
  /** A health condition is ticked: the watch shows heart rate, never a zone (the phone's own rule). */
  noZones: boolean
}) {
  const payload = watchTodayPayload({ date: today, title, estimatedMax: noZones ? null : estimatedMaxHeartRate(age), rows })
  useEffect(() => {
    if (payload) void import('@/lib/watch-bridge').then(m => m.publishToday(payload)).catch(() => {})
  }, [payload])

  const [sets, setSets] = useState<WatchSet[]>(() => waitingWatchSets())
  useEffect(() => subscribeWatchSets(() => setSets(waitingWatchSets())), [])
  const pressed = useRef(new Set<string>())
  const opened = useRef(new Set<string>())
  // A press the tick did not take changes nothing watched here, so it looks again a moment later.
  const [recheck, setRecheck] = useState(0)
  const [needYou, setNeedYou] = useState<NeedYou[]>([])
  useEffect(() => {
    if (!listEl || sets.length === 0) { setNeedYou([]); return }
    dropWatchSets(sets.filter(x => x.date < today).map(x => x.id))
    const t = setTimeout(() => {
      const waiting: NeedYou[] = []
      const done: string[] = []
      let acted = false
      for (const w of sets.filter(x => x.date === today)) {
        const found = tickForWatchSet(listEl, w)
        if ('state' in found) {
          if (found.state === 'saved') done.push(w.id)
          else waiting.push({ set: w, why: found.state })
          continue
        }
        if ('opener' in found) {
          if (!acted && !opened.current.has(w.id)) { opened.current.add(w.id); found.opener.click(); acted = true; setTimeout(() => setRecheck(n => n + 1), 700) }
          else if (opened.current.has(w.id) && !acted) waiting.push({ set: w, why: 'refused' })
          continue
        }
        if (pressed.current.has(w.id)) { waiting.push({ set: w, why: 'refused' }); continue }
        if (!acted) { pressed.current.add(w.id); found.tick.click(); acted = true; setTimeout(() => setRecheck(n => n + 1), 1500) }
      }
      dropWatchSets(done)
      setNeedYou(waiting)
    }, 400)
    return () => clearTimeout(t)
  }, [listEl, sets, today, logs, recheck])

  if (needYou.length === 0) return null
  return (
    <div className="space-y-1 rounded-xl px-3 py-2 text-[0.8125rem] text-muted-foreground bg-[color:var(--surface-raised)]" data-testid="watch-sets-waiting" role="status">
      {needYou.map(({ set, why }) => (
        <div key={set.id} className="flex min-h-11 items-center justify-between gap-2" data-watch-set={`${set.name}:${set.setNumber}`}>
          <span className="min-w-0">
            From your watch: set {set.setNumber} of {set.name}{' '}
            {why === 'typed' ? 'needs its weight typed here.' : why === 'missing' ? 'isn’t on today’s list.' : 'didn’t save. Tap its tick to save it.'}
          </span>
          <button type="button" className="shrink-0 min-h-11 px-2 text-xs font-semibold text-primary-text" onClick={() => dropWatchSets([set.id])}>Dismiss</button>
        </div>
      ))}
    </div>
  )
}
