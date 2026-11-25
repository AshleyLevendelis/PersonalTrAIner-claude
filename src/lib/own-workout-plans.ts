/**
 * MY WORKOUTS (his request 25 Nov 2026, step 2 of "your own workout"; his ruling "Both"): "You should be able to create
 * your own workout ... 'Add squat, add bench press, add deadlift, rest, add an exercise' ... Have it all ready, and you
 * go to the gym and you just start." A saved workout is a list he built ahead, kept by name, started on any day, and
 * put on as many days as he likes, where it shows with a Start.
 *
 * THE PHONE FIRST, THE TABLE WHERE PHONES MEET. A gym with no signal is where this is used, so every change lands on the
 * phone at once and is sent to `own_workouts` when it can be; a read merges the two by id, the newer edit winning, and a
 * removal is a tombstone so another phone cannot copy it back. Before the migration is applied the table is missing,
 * and everything still works on the phone that made it.
 *
 * STARTING ONE is step 1's workout, pre-filled: each exercise's sets with its reps and weight in the boxes and his rest;
 * nothing is saved until he ticks a set, exactly as an empty workout.
 */
import { supabase } from './supabase'
import { getExerciseId } from './exercise-db'
import { type OwnWorkout, type OwnItem, type OwnLift, newOwnWorkout, nextOwnSetNumber } from './own-workout'

export interface PlanLift {
  kind: 'lift'
  key: string
  name: string
  exerciseId: string
  sets: number
  /** As he typed it: "8", "8-10", "AMRAP". The first whole number goes in the boxes. */
  reps: string
  /** Optional, kg as typed. */
  weight: string
  restSeconds: number
}

export interface PlanCardio {
  kind: 'cardio'
  key: string
  activity: string
  minutes: string
}

export type PlanItem = PlanLift | PlanCardio

export interface OwnPlan {
  id: string
  name: string
  items: PlanItem[]
  /** YYYY-MM-DD days it is put on. */
  onDates: string[]
  updatedAt: string
  deleted?: boolean
}

const PLAN_SETS_MIN = 1
const PLAN_SETS_MAX = 10

const KEY = (profileId: string) => `fitplan_own_plans_v1:${profileId}`

function readLocal(profileId: string): OwnPlan[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY(profileId)) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isPlan) : []
  } catch {
    return []
  }
}

function isPlan(p: unknown): p is OwnPlan {
  const o = p as OwnPlan
  return !!o && typeof o.id === 'string' && typeof o.name === 'string' && Array.isArray(o.items) && Array.isArray(o.onDates)
}

function writeLocal(profileId: string, plans: OwnPlan[]): boolean {
  try {
    localStorage.setItem(KEY(profileId), JSON.stringify(plans))
  } catch {
    return false
  }
  listeners.forEach(fn => fn())
  return true
}

const listeners = new Set<() => void>()
export function subscribeOwnPlans(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** His saved workouts, newest edit first, removed ones left out. */
export function ownPlans(profileId: string): OwnPlan[] {
  return readLocal(profileId).filter(p => !p.deleted).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function ownPlansOn(profileId: string, date: string): OwnPlan[] {
  return ownPlans(profileId).filter(p => p.onDates.includes(date))
}

let seq = 0
function newPlanKey(prefix: string): string {
  seq += 1
  return `${prefix}-${Date.now().toString(36)}-${seq}`
}

export function newOwnPlan(nowIso: string): OwnPlan {
  return { id: newPlanKey('plan'), name: '', items: [], onDates: [], updatedAt: nowIso }
}

/** CSCS, mine: 3 sets of 8-10 with 90 s rest is the middle of the road for a lift nobody has given numbers to yet. */
export function newPlanLift(name: string): PlanLift {
  return { kind: 'lift', key: newPlanKey('pl'), name, exerciseId: getExerciseId(name), sets: 3, reps: '8-10', weight: '', restSeconds: 90 }
}

export function newPlanCardio(activity = '', minutes = ''): PlanCardio {
  return { kind: 'cardio', key: newPlanKey('pc'), activity, minutes }
}

export function stepPlanSets(sets: number, dir: 1 | -1): number {
  return Math.max(PLAN_SETS_MIN, Math.min(PLAN_SETS_MAX, sets + dir))
}

/** "5 exercises · 15 sets · 1 cardio". */
export function planSummary(p: Pick<OwnPlan, 'items'>): string {
  const lifts = p.items.filter((i): i is PlanLift => i.kind === 'lift')
  const sets = lifts.reduce((n, l) => n + l.sets, 0)
  const cardio = p.items.length - lifts.length
  const parts = [
    lifts.length > 0 ? `${lifts.length} exercise${lifts.length === 1 ? '' : 's'}` : '',
    sets > 0 ? `${sets} set${sets === 1 ? '' : 's'}` : '',
    cardio > 0 ? `${cardio} cardio` : '',
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : 'Empty'
}

/** Why it cannot be saved yet, or null. A name and one thing in it; nothing else is required of him. */
export function planProblem(p: Pick<OwnPlan, 'name' | 'items'>): string | null {
  if (!p.name.trim()) return 'Give it a name.'
  if (p.items.length === 0) return 'Add an exercise or a cardio.'
  return null
}

/** Saves on the phone at once and sends it on. False when the phone would not keep it. */
export function saveOwnPlan(profileId: string, plan: OwnPlan, nowIso: string): boolean {
  const next = { ...plan, name: plan.name.trim(), updatedAt: nowIso }
  const ok = writeLocal(profileId, [...readLocal(profileId).filter(p => p.id !== plan.id), next])
  void pushPlan(profileId, next)
  return ok
}

/** Removed everywhere: a tombstone, so another phone's copy is taken off rather than sent back. */
export function deleteOwnPlan(profileId: string, id: string, nowIso: string): void {
  const found = readLocal(profileId).find(p => p.id === id)
  if (!found) return
  saveOwnPlan(profileId, { ...found, deleted: true }, nowIso)
}

/** On a day, or off it. The same save, so it reaches other phones too. */
export function setPlanOnDate(profileId: string, id: string, date: string, on: boolean, nowIso: string): void {
  const found = readLocal(profileId).find(p => p.id === id)
  if (!found) return
  const dates = on ? [...new Set([...found.onDates, date])].sort() : found.onDates.filter(d => d !== date)
  saveOwnPlan(profileId, { ...found, onDates: dates }, nowIso)
}

/** Where the saved workouts stand with the table: 'live' (sent and read), 'phone' (table not there yet), 'offline'. */
export type PlansSync = 'live' | 'phone' | 'offline'

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const code = String(error.code ?? '')
  return code === '42P01' || code === 'PGRST205' || /could not find the table|does not exist/i.test(String(error.message ?? ''))
}

async function pushPlan(profileId: string, plan: OwnPlan): Promise<PlansSync> {
  try {
    const { error } = await supabase.from('own_workouts').upsert({
      id: plan.id, user_id: profileId, name: plan.name || 'My workout', items: plan.items, on_dates: plan.onDates,
      deleted: !!plan.deleted, updated_at: plan.updatedAt,
    }, { onConflict: 'id' })
    if (!error) return 'live'
    return isMissingTable(error) ? 'phone' : 'offline'
  } catch {
    return 'offline'
  }
}

/**
 * THE TWO COPIES MET (pure): by id, the newer edit wins; a tombstone is kept so it goes on winning. Returns the merged
 * list and the ones the table is behind on, to send.
 */
export function mergePlans(local: OwnPlan[], remote: OwnPlan[]): { merged: OwnPlan[]; toSend: OwnPlan[] } {
  const byId = new Map<string, OwnPlan>()
  for (const r of remote) byId.set(r.id, r)
  const toSend: OwnPlan[] = []
  for (const l of local) {
    const r = byId.get(l.id)
    if (!r || l.updatedAt > r.updatedAt) {
      byId.set(l.id, l)
      toSend.push(l)
    }
  }
  return { merged: [...byId.values()], toSend }
}

/** Reads the table, merges it with the phone, sends what the table lacks. Never throws; says where things stand. */
export async function syncOwnPlans(profileId: string): Promise<PlansSync> {
  let rows: Array<Record<string, unknown>> | null = null
  try {
    const { data, error } = await supabase.from('own_workouts').select('*').eq('user_id', profileId)
    if (error) return isMissingTable(error) ? 'phone' : 'offline'
    rows = (data ?? []) as Array<Record<string, unknown>>
  } catch {
    return 'offline'
  }
  const remote: OwnPlan[] = rows.map(r => ({
    id: String(r.id), name: String(r.name ?? ''), items: Array.isArray(r.items) ? (r.items as PlanItem[]) : [],
    onDates: Array.isArray(r.on_dates) ? (r.on_dates as string[]).map(d => String(d).slice(0, 10)) : [],
    updatedAt: new Date(String(r.updated_at ?? 0)).toISOString(), deleted: !!r.deleted,
  }))
  const { merged, toSend } = mergePlans(readLocal(profileId), remote)
  writeLocal(profileId, merged)
  const sent = await Promise.all(toSend.map(p => pushPlan(profileId, p)))
  return sent.includes('offline') ? 'offline' : 'live'
}

/** The first whole number he typed ("8-10" -> "8"), or blank. */
function repsForBox(reps: string): string {
  const m = /\d+/.exec(reps)
  return m ? m[0] : ''
}

/**
 * A SAVED WORKOUT, STARTED: step 1's workout with each exercise's sets in place (his reps and weight in the boxes, his
 * rest), numbered after what is already on that date, and the plan's name. Nothing is logged until a set is ticked.
 */
export function workoutFromPlan(plan: OwnPlan, date: string, mode: OwnWorkout['mode'], nowIso: string, takenOnDate: (exerciseId: string) => number[]): OwnWorkout {
  const base = newOwnWorkout(date, mode, nowIso)
  const items: OwnItem[] = plan.items.map(i => {
    if (i.kind === 'cardio') {
      return { kind: 'cardio', key: newPlanKey('cardio'), activity: i.activity, minutes: i.minutes, distanceKm: '', effort: null, done: false }
    }
    const lift: OwnLift = { kind: 'lift', key: newPlanKey('lift'), name: i.name, exerciseId: i.exerciseId, restSeconds: i.restSeconds, sets: [] }
    for (let n = 0; n < Math.max(1, i.sets); n++) {
      lift.sets.push({ setNumber: nextOwnSetNumber(takenOnDate(i.exerciseId), lift), weight: i.weight, reps: repsForBox(i.reps), done: false })
    }
    return lift
  })
  return { ...base, name: plan.name, planId: plan.id, items }
}
