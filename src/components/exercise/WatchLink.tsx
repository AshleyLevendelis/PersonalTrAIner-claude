// ---------------------------------------------------------------------------
// THE WATCH'S PART OF TODAY'S EXERCISE LIST (27 Nov 2026; his vision: "On a weight workout see 'next exercise 3x10
// bench press @100kg' then start rest from watch, start next set"; docs/plans/watch-app.md W3). Its own download, the
// phone app only.
//
// 1. Sends the watch today's session: the rows this list draws (TodayPanel builds them with today's weights).
// 2. Saves each set ticked on the watch with THIS LIST'S OWN TICK, one at a time and each pressed once, opening the
//    row first when it is closed (a closed row draws no ticks): the weight, the checks, the rest and the record are the
//    phone's. A set it cannot save in one tap is said here with Dismiss, never guessed.
// 3. (27 Nov 2026, his "Adjust reps and weight") a set done differently on the watch fills the row's own boxes with
//    his reps and weight first, and is pressed only once the tick reads his numbers back; an "Undo set N" on the watch
//    deletes that set with the receipt's own delete (asked twice, as the list asks).
// ---------------------------------------------------------------------------
import { useEffect, useRef, useState } from 'react'
import { watchTodayPayload, waitingWatchSets, subscribeWatchSets, dropWatchSets, tickForWatchSet, watchSetNeedsFill, deleteForWatchUndo, type WatchRow, type WatchSet, type WatchDay } from '@/lib/watch-session'
import { estimatedMaxHeartRate } from '@/lib/heart-series'

type NeedYou = { set: WatchSet; why: 'typed' | 'missing' | 'refused' | 'undo' }

/** Types a value into one of the list's boxes as a person would, so the row's own state takes it. */
function typeInto(id: string | undefined, value: string): boolean {
  const el = id ? document.getElementById(id) as HTMLInputElement | null : null
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  if (!el || !setter) return false
  setter.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return true
}

export default function WatchLink({ rows, days, listEl, today, logs, title, age, noZones }: {
  rows: WatchRow[]
  /** The sessions of the days ahead (the strip's), so the watch has them with the phone in the locker. */
  days?: readonly WatchDay[]
  listEl: HTMLElement | null
  today: string
  /** Today's sets: a change is the moment to look again. */
  logs: unknown
  title: string
  age: number | null
  /** A health condition is ticked: the watch shows heart rate, never a zone (the phone's own rule). */
  noZones: boolean
}) {
  const payload = watchTodayPayload({ date: today, title, estimatedMax: noZones ? null : estimatedMaxHeartRate(age), rows, days })
  useEffect(() => {
    if (payload) void import('@/lib/watch-bridge').then(m => m.publishToday(payload)).catch(() => {})
  }, [payload])

  const [sets, setSets] = useState<WatchSet[]>(() => waitingWatchSets())
  useEffect(() => subscribeWatchSets(() => setSets(waitingWatchSets())), [])
  const pressed = useRef(new Set<string>())
  const opened = useRef(new Set<string>())
  const filled = useRef(new Set<string>())
  const deletes = useRef(new Map<string, number>())
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
      const todays = sets.filter(x => x.date === today)
      for (const w of todays) {
        // AN UNDO: the receipt's delete, pressed twice (delete, then confirm); done once no saved set of that number is left.
        if (w.undo) {
          if (done.includes(w.id)) continue
          const del = deleteForWatchUndo(listEl, w)
          const found = tickForWatchSet(listEl, w)
          if (!del) {
            if ('opener' in found && !acted && !opened.current.has(w.id)) { opened.current.add(w.id); found.opener.click(); acted = true; setTimeout(() => setRecheck(n => n + 1), 700) }
            else if (!('state' in found && found.state === 'saved')) done.push(w.id)
            else waiting.push({ set: w, why: 'undo' })
            continue
          }
          const tries = deletes.current.get(w.id) ?? 0
          if (tries >= 3) { waiting.push({ set: w, why: 'undo' }); continue }
          if (!acted) { deletes.current.set(w.id, tries + 1); del.click(); acted = true; setTimeout(() => setRecheck(n => n + 1), 700) }
          continue
        }
        if (done.includes(w.id)) continue
        const sameAs = (u: WatchSet) => u.exerciseId === w.exerciseId && u.setNumber === w.setNumber
        // UNDONE ON THE WATCH BEFORE IT REACHED THE LIST: never pressed, so the set and its undo simply go together.
        // Pressed already: it is (or is being) saved, so this set is done and the undo deletes it from the list.
        const undoneLater = todays.find(u => u.undo && u.at >= w.at && sameAs(u))
        if (undoneLater) {
          if (pressed.current.has(w.id)) done.push(w.id)
          else done.push(w.id, undoneLater.id)
          continue
        }
        // A set logged again after an undo waits until the undo has taken the old one off.
        if (todays.some(u => u.undo && u.at <= w.at && sameAs(u))) continue
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
        // His numbers into the row's boxes first; pressed only once the tick reads them back.
        const need = watchSetNeedsFill(found.tick, w)
        if (need) {
          if (filled.current.has(w.id)) { waiting.push({ set: w, why: 'refused' }); continue }
          if (!acted) {
            filled.current.add(w.id)
            if (need.reps != null) typeInto(found.tick.dataset.nextRepsBox, need.reps)
            if (need.kg != null) typeInto(found.tick.dataset.nextWeightBox, need.kg)
            acted = true; setTimeout(() => setRecheck(n => n + 1), 400)
          }
          continue
        }
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
            {why === 'undo'
              ? <>Undone on your watch: set {set.setNumber} of {set.name}. Delete it here.</>
              : <>From your watch: set {set.setNumber} of {set.name}{' '}
                {why === 'typed' ? 'needs its weight typed here.' : why === 'missing' ? 'isn’t on today’s list.' : 'didn’t save. Tap its tick to save it.'}</>}
          </span>
          <button type="button" className="shrink-0 min-h-11 px-2 text-xs font-semibold text-primary-text" onClick={() => dropWatchSets([set.id])}>Dismiss</button>
        </div>
      ))}
    </div>
  )
}
