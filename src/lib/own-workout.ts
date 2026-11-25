/**
 * YOUR OWN WORKOUT (his request 25 Nov 2026): "on a blank day, on an empty day, you should just be able to start
 * exercising ... If you did an exercise machine, add it. If you did some cardio, add it. Put in the reps, put in the
 * time. After each set, because it's your own workout, you could put in your own rest ... Likewise, you can log it after
 * you've done it ... on a blank day, or even on a day that you've trained once."
 *
 * A WORKOUT OF ITS OWN, NOT SETS BOLTED ONTO THE PLAN'S (his words the same day: "The I also did button just adds sets
 * to the existing workout though rather than a separate workout"). It has a name, a start, a finish and its own list
 * of exercises. Its sets are ordinary sets in the ordinary table, so history, personal bests and the weight the plan
 * prescribes next time for that lift all read them (CSCS, mine: a set lifted is evidence of what the lift can do,
 * whichever screen logged it). Its set numbers run on after any already on that date for that exercise, so it can never
 * write over the plan's sets.
 *
 * STEP 1 KEEPS THE WORKOUT'S NAME AND LIST ON THE PHONE; THE SETS AND CARDIO ARE IN THE DATABASE. A second phone sees
 * the sets in history but not the grouping. Step 2 ("My workouts", with saving ahead) moves the record to the database.
 */
import type { EffortKey } from './cardio-effort'

export interface OwnSet {
  setNumber: number
  weight: string
  reps: string
  /** Saved to the database (live) or written by Save (after). */
  done: boolean
}

export interface OwnLift {
  kind: 'lift'
  key: string
  name: string
  exerciseId: string
  /** Seconds he rests after a set of this one: his to change, kept for the next set. */
  restSeconds: number
  sets: OwnSet[]
}

export interface OwnCardio {
  kind: 'cardio'
  key: string
  activity: string
  minutes: string
  distanceKm: string
  effort: EffortKey | null
  done: boolean
  /** The cardio log's id on this phone, so a live tick can be taken back within the store's Undo window. */
  clientId?: string
}

export type OwnItem = OwnLift | OwnCardio

export interface OwnWorkout {
  id: string
  /** YYYY-MM-DD, the day it was done. */
  date: string
  name: string
  /** live: started today, sets saved as they are ticked. after: told after the fact, written on Save. */
  mode: 'live' | 'after'
  startedAtIso: string
  finishedAtIso: string | null
  items: OwnItem[]
}

/** The rests a lifter actually picks, 30 s to 5 min. CSCS, mine: 90 s is the default, a middle rest for most lifts. */
const OWN_REST_STEPS = [30, 45, 60, 75, 90, 120, 150, 180, 240, 300] as const
export const OWN_DEFAULT_REST = 90

const OWN_DEFAULT_NAME = 'My workout'

const KEY = (profileId: string) => `fitplan_own_workouts_v1:${profileId}`
/** Enough for months of extra workouts; the sets themselves are in the database whatever this keeps. */
const KEEP = 120

function readAll(profileId: string): OwnWorkout[] {
  try {
    const raw = localStorage.getItem(KEY(profileId))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(isOwnWorkout) : []
  } catch {
    return []
  }
}

function isOwnWorkout(w: unknown): w is OwnWorkout {
  const o = w as OwnWorkout
  return !!o && typeof o.id === 'string' && typeof o.date === 'string' && Array.isArray(o.items)
}

const listeners = new Set<() => void>()
export function subscribeOwnWorkouts(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function loadOwnWorkouts(profileId: string): OwnWorkout[] {
  return readAll(profileId)
}

export function ownWorkoutsOn(profileId: string, date: string): OwnWorkout[] {
  return readAll(profileId).filter(w => w.date === date)
}

/** Saves (adds or replaces by id). Returns false when the phone would not keep it, so the screen can say so. */
export function saveOwnWorkout(profileId: string, workout: OwnWorkout): boolean {
  const rest = readAll(profileId).filter(w => w.id !== workout.id)
  const next = [...rest, workout].sort((a, b) => a.startedAtIso.localeCompare(b.startedAtIso)).slice(-KEEP)
  try {
    localStorage.setItem(KEY(profileId), JSON.stringify(next))
  } catch {
    return false
  }
  listeners.forEach(fn => fn())
  return true
}

/** Takes a workout off the list. Only ever offered for one with nothing saved in it (see `hasAnythingSaved`). */
export function removeOwnWorkout(profileId: string, id: string): void {
  try {
    localStorage.setItem(KEY(profileId), JSON.stringify(readAll(profileId).filter(w => w.id !== id)))
  } catch { /* nothing to undo */ }
  listeners.forEach(fn => fn())
}

let seq = 0
function ownKey(prefix: string): string {
  seq += 1
  return `${prefix}-${Date.now().toString(36)}-${seq}`
}

export function newOwnWorkout(date: string, mode: OwnWorkout['mode'], nowIso: string): OwnWorkout {
  return { id: ownKey('own'), date, name: OWN_DEFAULT_NAME, mode, startedAtIso: nowIso, finishedAtIso: null, items: [] }
}

/**
 * THE NEXT SET NUMBER FOR A LIFT ON THAT DATE: one past the highest already used, by the plan, an earlier workout or
 * this one. Sets are keyed by date, exercise and number, so starting again at 1 would write over the plan's set 1.
 */
export function nextOwnSetNumber(takenOnDate: readonly number[], lift: Pick<OwnLift, 'sets'>): number {
  const all = [...takenOnDate, ...lift.sets.map(s => s.setNumber)]
  return (all.length > 0 ? Math.max(...all) : 0) + 1
}

/** A new lift with one empty set, numbered after what is on that date already. */
export function newOwnLift(name: string, exerciseId: string, takenOnDate: readonly number[]): OwnLift {
  const lift: OwnLift = { kind: 'lift', key: ownKey('lift'), name, exerciseId, restSeconds: OWN_DEFAULT_REST, sets: [] }
  return { ...lift, sets: [{ setNumber: nextOwnSetNumber(takenOnDate, lift), weight: '', reps: '', done: false }] }
}

/** Another set, filled with the last one's numbers so a straight set is one tap. */
export function withAnotherSet(lift: OwnLift, takenOnDate: readonly number[]): OwnLift {
  const last = lift.sets[lift.sets.length - 1]
  return { ...lift, sets: [...lift.sets, { setNumber: nextOwnSetNumber(takenOnDate, lift), weight: last?.weight ?? '', reps: last?.reps ?? '', done: false }] }
}

export function newOwnCardio(activity = '', minutes = ''): OwnCardio {
  return { kind: 'cardio', key: ownKey('cardio'), activity, minutes, distanceKm: '', effort: null, done: false }
}

/** "62.5" -> 62.5; a blank weight is bodyweight (0). Null when the text is not a number he could have meant. */
export function readWeight(text: string): number | null {
  const t = text.trim().replace(',', '.')
  if (t === '') return 0
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function readReps(text: string): number | null {
  const n = Number(text.trim())
  return Number.isInteger(n) && n > 0 && n <= 200 ? n : null
}

/** A set that can be saved: reps he typed, a weight that reads (blank is bodyweight). */
export function setIsSavable(s: Pick<OwnSet, 'weight' | 'reps'>): boolean {
  return readReps(s.reps) != null && readWeight(s.weight) != null
}

export function cardioIsSavable(c: OwnCardio): boolean {
  const m = Number(c.minutes.trim())
  return c.activity.trim().length > 0 && Number.isFinite(m) && m > 0 && m <= 600 && c.effort != null
}

export function hasAnythingSaved(w: OwnWorkout): boolean {
  return w.items.some(i => (i.kind === 'lift' ? i.sets.some(s => s.done) : i.done))
}

/** "3 exercises · 9 sets · 1 cardio": what the day's card says about it. Counts what was saved, never what was typed. */
export function ownWorkoutSummary(w: OwnWorkout): string {
  const lifts = w.items.filter((i): i is OwnLift => i.kind === 'lift' && i.sets.some(s => s.done))
  const sets = lifts.reduce((n, l) => n + l.sets.filter(s => s.done).length, 0)
  const cardio = w.items.filter(i => i.kind === 'cardio' && i.done).length
  const parts = [
    lifts.length > 0 ? `${lifts.length} exercise${lifts.length === 1 ? '' : 's'}` : '',
    sets > 0 ? `${sets} set${sets === 1 ? '' : 's'}` : '',
    cardio > 0 ? `${cardio} cardio` : '',
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : 'Nothing logged yet'
}

/** The rest one step up or down the list, held at its ends. */
export function stepOwnRest(seconds: number, dir: 1 | -1): number {
  const steps = OWN_REST_STEPS as readonly number[]
  const at = steps.findIndex(s => s >= seconds)
  const i = at < 0 ? steps.length - 1 : at
  if (dir === 1) return steps[Math.min(steps.length - 1, steps[i] > seconds ? i : i + 1)]
  return steps[Math.max(0, i - 1)]
}

/** "1:30", "45s", "2 min". */
export function restWords(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  return seconds % 60 === 0 ? `${seconds / 60} min` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
