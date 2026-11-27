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
import type { WatchCardio } from './planned-rounds'
import { tracksSteps } from './cardio-kinds'

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
  /** The implement's notch in kg (plateStepKg): what one − / + on the watch moves the weight by. */
  stepKg?: number
}

/** The planned weight as a number for the watch's − / + ("~100kg" is 100), or null when there is none to change (BW). */
function watchKg(row: Pick<WatchRow, 'suggestedLoad'>): number | null {
  const parts = splitLoadDisplay((row.suggestedLoad ?? '').trim())
  const n = parts ? Number(parts.value) : NaN
  return Number.isFinite(n) ? n : null
}

/** "100 kg", "4 kg per hand", "BW", "BW + 10 kg", or "" for none: the figure the row prints, without its "~". */
export function watchLoadText(row: Pick<WatchRow, 'suggestedLoad' | 'addedLoadKg'>): string {
  const raw = (row.suggestedLoad ?? '').trim()
  const parts = raw ? splitLoadDisplay(raw) : null
  if (parts) return `${parts.value} ${parts.unit}`.replace(/\s+/g, ' ').trim()
  if (/^(bw|bodyweight)$/i.test(raw)) return row.addedLoadKg ? `BW + ${row.addedLoadKg} kg` : 'BW'
  return raw.replace(/^~/, '')
}

/** A day ahead, as the strip holds it: its date, its session's name and its rows at the plan's own weights. */
export interface WatchDay { date: string; title: string; rows: WatchRow[]; cardio?: WatchCardio | null }

/** The cardio as the watch reads it, with whether it is on foot (steps and distance, the phone's own rule). */
const watchCardio = (c: WatchCardio | null | undefined) => (c ? { ...c, onFoot: tracksSteps(c.activity) } : undefined)

const watchExercise = (r: WatchRow, done: number) => ({
  id: r.id,
  name: r.name,
  sets: r.sets,
  reps: r.reps,
  load: watchLoadText(r),
  restSeconds: r.restSeconds,
  done: Math.min(done, r.sets),
  // His ruling 27 Nov 2026, "Adjust reps and weight": the watch steps the weight from here, a notch at a time.
  kg: watchKg(r),
  step: r.stepKg ?? 2.5,
})

/**
 * The JSON the watch reads (android/wear TodayStore). Null when there is nothing to send.
 *
 * THE WEEK AHEAD RIDES WITH TODAY (27 Nov 2026, the gym-floor review): the watch had a session only once Exercise was
 * opened that very day, so a phone left in the locker meant an empty watch. Every open now also sends the coming days'
 * sessions at the plan's own weights; the watch picks today's by its date. Today's own entry keeps today's exact
 * weights, and the watch sends a reps or weight number only where he changed it, so a number from days ago never
 * overrides the phone's own on the set it saves.
 */
export function watchTodayPayload(p: { date: string; title: string; estimatedMax: number | null; rows: WatchRow[]; cardio?: WatchCardio | null; days?: readonly WatchDay[] }): string | null {
  const ahead = (p.days ?? []).filter(d => d.date > p.date && (d.rows.length > 0 || !!d.cardio))
  if (p.rows.length === 0 && !p.cardio && ahead.length === 0) return null
  return JSON.stringify({
    v: 1,
    date: p.date,
    title: p.title,
    estimatedMax: p.estimatedMax ?? 0,
    exercises: p.rows.map(r => watchExercise(r, r.done)),
    // A PLANNED CARDIO SESSION (27 Nov 2026): the watch runs its rounds or minutes and logs it under this exact name.
    ...(p.cardio ? { cardio: watchCardio(p.cardio) } : {}),
    ...(ahead.length ? { days: ahead.map(d => ({ date: d.date, title: d.title, exercises: d.rows.map(r => watchExercise(r, 0)), ...(d.cardio ? { cardio: watchCardio(d.cardio) } : {}) })) } : {}),
  })
}

// ---------------------------------------------------------------------------
// The sets ticked on the watch, waiting for the Exercise tab.
// ---------------------------------------------------------------------------
export interface WatchSet {
  id: string; date: string; exerciseId: string; name: string; setNumber: number; at: number
  /** What he did, from the watch (his "Adjust reps and weight"); absent from a watch before 27 Nov 2026. */
  reps?: number
  kg?: number
  /** "Undo set N" on the watch: the set comes off the queue, or off today's list if the phone already saved it. */
  undo?: boolean
}

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

const sameSet = (a: WatchSet, b: WatchSet) => a.date === b.date && a.exerciseId === b.exerciseId && a.setNumber === b.setNumber

/**
 * A set from the watch, kept once (the watch may send it again). An UNDO is kept behind the set it undoes, whether or
 * not that set is still here: only the Exercise tab knows whether it already pressed the set's tick (WatchLink drops
 * an unpressed pair, and deletes a pressed one from the list). Taking the pair off here was a race: a set saved a
 * moment ago is still in this queue until its save is confirmed.
 */
export function queueWatchSet(s: WatchSet): void {
  const all = waitingWatchSets()
  if (all.some(x => x.id === s.id)) return
  // An undo is only ever a repeat by its id (above): the same set number can be logged and undone twice in a session.
  if (s.undo) { write([...all, s].sort((a, b) => a.at - b.at)); return }
  // The same set again after an undo (logged, undone, logged again) waits behind the undo: the old one comes off the
  // list first, then this one is saved with its own numbers.
  if (all.some(x => !x.undo && sameSet(x, s) && !all.some(u => u.undo && sameSet(u, s) && u.at >= x.at))) return
  write([...all, s].sort((a, b) => a.at - b.at))
}

/**
 * The boxes a watch set must fill before its tick is pressed, so the phone saves what he did (his "Adjust reps and
 * weight"): null when the tick already holds his numbers. A bodyweight tick ("BW") takes no weight.
 */
export function watchSetNeedsFill(tick: HTMLElement, s: Pick<WatchSet, 'reps' | 'kg'>): { reps?: string; kg?: string } | null {
  const want: { reps?: string; kg?: string } = {}
  if (s.reps != null && Number(tick.dataset.nextReps) !== s.reps) want.reps = String(s.reps)
  if (s.kg != null && tick.dataset.nextWeight !== 'BW' && Number(tick.dataset.nextWeight) !== s.kg) want.kg = String(s.kg)
  return want.reps != null || want.kg != null ? want : null
}

/**
 * The receipt's delete for an undone set: "Delete set N", then "Confirm delete set N" (the list asks twice). Null when
 * the list holds no saved set of that number (nothing left to undo).
 */
export function deleteForWatchUndo(root: ParentNode, s: Pick<WatchSet, 'name' | 'setNumber'>): HTMLElement | null {
  const rows = [...root.querySelectorAll<HTMLElement>('[data-exercise-name]')].filter(r => r.dataset.exerciseName === s.name)
  for (const row of rows) {
    const buttons = [...row.querySelectorAll<HTMLElement>('button[aria-label]')]
    const confirm = buttons.find(b => b.getAttribute('aria-label') === `Confirm delete set ${s.setNumber}`)
    if (confirm) return confirm
    const del = buttons.find(b => b.getAttribute('aria-label') === `Delete set ${s.setNumber}`)
    if (del) return del
  }
  return null
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
export function tickForWatchSet(root: ParentNode, s: Pick<WatchSet, 'name' | 'setNumber' | 'kg'>): { tick: HTMLElement } | { opener: HTMLElement } | { state: 'saved' | 'typed' | 'missing' } {
  const rows = [...root.querySelectorAll<HTMLElement>('[data-exercise-name]')].filter(r => r.dataset.exerciseName === s.name)
  if (rows.length === 0) return { state: 'missing' }
  if (!rows.some(r => r.querySelector('[data-set-tick]'))) {
    const opener = rows[0].querySelector<HTMLElement>('[role="button"]')
    return opener ? { opener } : { state: 'missing' }
  }
  const label = `Set ${s.setNumber}`
  for (const row of rows) {
    const open = [...row.querySelectorAll<HTMLElement>('[data-set-tick="open"]')].find(t => t.dataset.nextSet === label)
    // A weight still to be typed is typed from the watch's number when it sent one; with none, it waits for him.
    if (open) return open.dataset.nextWeight === '' && s.kg == null ? { state: 'typed' } : { tick: open }
  }
  // No open tick of that name: saved already when a saved tick says "Set N" (its spoken label: "Set 2 saved").
  const named = new RegExp(`^Set ${s.setNumber}(?![,\\d])`)
  const saved = rows.some(row => [...row.querySelectorAll<HTMLElement>('[data-set-tick="saved"]')].some(t => named.test(t.getAttribute('aria-label') ?? '')))
  return { state: saved ? 'saved' : 'missing' }
}
