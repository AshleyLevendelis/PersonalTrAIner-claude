// ---------------------------------------------------------------------------
// TODAY'S SESSION FOR THE WATCH, AND THE SETS TICKED ON IT (27 Nov 2026; his vision: "On a weight workout see 'next
// exercise 3x10 bench press @100kg' then start rest from watch, start next set"; docs/plans/watch-app.md W3).
//
// WHAT THE WATCH SHOWS IS WHAT THE EXERCISE TAB SHOWS: the payload is built from the rows the tab draws (the same
// live row, with today's progressed weight), never from the plan alone, which can differ after a break or a progression.
//
// A SET TICKED ON THE WATCH IS SAVED BY THE TAB'S OWN TICK (TodayPanel presses it, as the "Log set 3" button does), so
// the weight, the checks, the rest and the record are the phone's. No weight is typed on the watch (decision 3). Sets
// wait here, on the phone, until the tab is open on that day; a set the tab cannot save in one tap (a weight still to
// be typed) waits and is said, never guessed.
// ---------------------------------------------------------------------------
import { splitLoadDisplay } from './load-prescription'

export interface WatchRow {
  id: string
  name: string
  sets: number
  reps: string
  /** The row's display weight ("~100kg", "~4kg per hand", "BW"), or null. */
  suggestedLoad: string | null | undefined
  addedLoadKg?: number | null
  restSeconds: number
  done: number
}

/** "100 kg", "4 kg per hand", "BW", "BW + 10 kg", or "" for none: the figure the row prints, without its "~". */
export function watchLoadText(row: Pick<WatchRow, 'suggestedLoad' | 'addedLoadKg'>): string {
  const raw = (row.suggestedLoad ?? '').trim()
  const parts = raw ? splitLoadDisplay(raw) : null
  if (parts) return `${parts.value} ${parts.unit}`.replace(/\s+/g, ' ').trim()
  if (/^(bw|bodyweight)$/i.test(raw)) return row.addedLoadKg ? `BW + ${row.addedLoadKg} kg` : 'BW'
  return raw.replace(/^~/, '')
}

/** The JSON the watch reads (android/wear TodayStore). Null when there is nothing to send. */
export function watchTodayPayload(p: { date: string; title: string; estimatedMax: number | null; rows: WatchRow[] }): string | null {
  if (p.rows.length === 0) return null
  return JSON.stringify({
    v: 1,
    date: p.date,
    title: p.title,
    estimatedMax: p.estimatedMax ?? 0,
    exercises: p.rows.map(r => ({
      id: r.id,
      name: r.name,
      sets: r.sets,
      reps: r.reps,
      load: watchLoadText(r),
      restSeconds: r.restSeconds,
      done: Math.min(r.done, r.sets),
    })),
  })
}

// ---------------------------------------------------------------------------
// The sets ticked on the watch, waiting for the Exercise tab.
// ---------------------------------------------------------------------------
export interface WatchSet { id: string; date: string; exerciseId: string; name: string; setNumber: number; at: number }

const KEY = 'fitplan_watch_sets'
const listeners = new Set<() => void>()

export function waitingWatchSets(): WatchSet[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as WatchSet[]
    return Array.isArray(raw) ? raw.filter(s => s && typeof s.id === 'string' && typeof s.name === 'string' && s.setNumber >= 1) : []
  } catch { return [] }
}

function write(sets: WatchSet[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(sets)) } catch { /* kept in memory for this open */ }
  for (const l of listeners) l()
}

/** A set from the watch, kept once (the watch may send it again). */
export function queueWatchSet(s: WatchSet): void {
  const all = waitingWatchSets()
  if (all.some(x => x.id === s.id || (x.date === s.date && x.exerciseId === s.exerciseId && x.setNumber === s.setNumber))) return
  write([...all, s].sort((a, b) => a.at - b.at))
}

/** Taken off once saved (or found already saved), or once its day has passed. */
export function dropWatchSets(ids: readonly string[]): void {
  if (ids.length === 0) return
  write(waitingWatchSets().filter(s => !ids.includes(s.id)))
}

export function subscribeWatchSets(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

/**
 * The tick a watch set presses on today's list: that exercise's row, the open tick named "Set N". "saved" when the
 * row already holds it, "typed" when its weight is still to be typed (the tick would refuse), "missing" when the row
 * is not on the list, and the row's own header to open it when it is closed (a closed row draws no ticks).
 */
export function tickForWatchSet(root: ParentNode, s: Pick<WatchSet, 'name' | 'setNumber'>): { tick: HTMLElement } | { opener: HTMLElement } | { state: 'saved' | 'typed' | 'missing' } {
  const rows = [...root.querySelectorAll<HTMLElement>('[data-exercise-name]')].filter(r => r.dataset.exerciseName === s.name)
  if (rows.length === 0) return { state: 'missing' }
  if (!rows.some(r => r.querySelector('[data-set-tick]'))) {
    const opener = rows[0].querySelector<HTMLElement>('[role="button"]')
    return opener ? { opener } : { state: 'missing' }
  }
  const label = `Set ${s.setNumber}`
  for (const row of rows) {
    const open = [...row.querySelectorAll<HTMLElement>('[data-set-tick="open"]')].find(t => t.dataset.nextSet === label)
    if (open) return open.dataset.nextWeight === '' ? { state: 'typed' } : { tick: open }
  }
  // No open tick of that name: saved already when a saved tick says "Set N" (its spoken label: "Set 2 saved").
  const named = new RegExp(`^Set ${s.setNumber}(?![,\\d])`)
  const saved = rows.some(row => [...row.querySelectorAll<HTMLElement>('[data-set-tick="saved"]')].some(t => named.test(t.getAttribute('aria-label') ?? '')))
  return { state: saved ? 'saved' : 'missing' }
}
