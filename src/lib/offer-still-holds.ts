// ---------------------------------------------------------------------------
// AN OFFER IS CHECKED AGAINST THE DAY AT THE TAP, AND AN UNDO AGAINST THE PLAN (27-29 Oct 2026, her "fix them").
//
// Found by the workout-scenario testing (BACKLOG, 27 Oct). Two holes, one shape: the coach's card was built from the
// day as it stood when she asked, and nothing looked again.
//
//   1. AT THE TAP. Offered "take Friday off", she then moved Monday's session onto Friday on the screen, or logged
//      Friday's sets, and tapped Apply: the card wrote what it had said ten minutes earlier over what the day was now.
//      claimPendingAction always had a slot for this check; the chat passed `async () => true`. Now the day is read
//      again (its moves, its flags, its logged sets) and the plan's slot is looked at again, and a card that no
//      longer describes the day turns "stale": "This changed since I proposed it — ask me again if you still want
//      it." The card's existing words; nothing is written.
//   2. AT UNDO. Undo puts the plan back as it was before the card, whole weeks of it. After a LATER change to the same
//      weeks, that wiped the later change: the newer card still said "Swapped" over a plan that no longer had it. Now
//      the weeks the card wrote are fingerprinted when it lands, and Undo goes ahead only while they still read the
//      same. Her 30 Sep rule for the meal day-swap's Undo, applied to the plan: put back only what is still as it
//      was left, else say so and touch nothing. A moved session or an activity swap is undone only while the day
//      still holds what that card wrote (a later move of the same session rewrites its record).
//
// Pure apart from the two reads the day check needs, so a gate can ask it with a fake database.
// ---------------------------------------------------------------------------
import type { MesocycleWeek, WorkoutDay } from './types'
import { addDays, resolveMoveTarget, sessionForDate } from './session-move'
import { dayHasSession } from './day-verbs'
import { getSessionMovesInRange, getWeeklyDashboard } from './daily-tracking'
import { supabase } from './supabase'

/** A plan week as text that reads the same however it was built (in memory or read back), keys in order. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

/** One short fingerprint per week number: what a week holds, not where it came from. */
export function fingerprintWeeks(weeks: MesocycleWeek[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const w of weeks) {
    const text = canonical(w.days)
    let h = 2166136261
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) }
    out[String(w.week_number)] = (h >>> 0).toString(36) + ':' + text.length
  }
  return out
}

/**
 * The weeks an Undo of this card writes back, from what the card did: one week for a today-only change, every week
 * for a rest-of-block one (the undo resaves the whole plan), the run from its first week for the block-wide kinds.
 * Null for a kind whose undo writes no plan week or guards itself.
 */
export function weeksUndoWrites(kind: string, payload: Record<string, unknown>, scope: string | undefined, preImage: MesocycleWeek[]): number[] | null {
  const all = preImage.map(w => w.week_number)
  const week = Number(payload.weekNumber)
  switch (kind) {
    case 'propose_exercise_swap':
    case 'propose_exercise_add':
    case 'propose_exercise_remove':
    case 'propose_exercise_reorder':
    case 'propose_cardio_session':
      return (scope ?? payload.scope) === 'today' ? [week] : all
    case 'propose_session_rebuild':
    case 'propose_session_shorten':
      return [week]
    case 'propose_volume_change': {
      const from = Math.min(...((payload.weekNumbers as number[] | undefined) ?? [week]))
      return all.filter(n => n >= from)
    }
    case 'propose_schedule_change':
    case 'propose_style_change':
    case 'propose_goal_change':
    case 'propose_concurrent_activity': {
      const from = Number(payload.fromWeek)
      return all.filter(n => n >= from)
    }
    default:
      return null
  }
}

/** Does the plan still read, in every week the Undo would write, as this card left it? No record means no check. */
export function undoStillFits(planAfter: Record<string, string> | undefined, live: MesocycleWeek[], weeks: number[] | null): boolean {
  if (!planAfter || !weeks) return true
  const now = fingerprintWeeks(live)
  return weeks.every(n => planAfter[String(n)] === undefined || now[String(n)] === planAfter[String(n)])
}

export interface OfferCheckContext {
  profileId: string
  today: string
  /** The plan week a date falls in, as Home and the strip read it. */
  planForDate: (date: string) => WorkoutDay[]
  weekOf: (date: string) => number
  /** The live plan, for the cards that point at a slot in it. */
  mesocycle: MesocycleWeek[]
}

/**
 * Does the card still describe the day, at the moment she taps Apply? Kinds that touch no day or slot always hold.
 * A read that fails answers "holds": the write behind it will fail honestly on the same dead connection.
 */
export async function offerStillHolds(kind: string, payload: Record<string, unknown>, ctx: OfferCheckContext): Promise<boolean> {
  const slot = (dayName: unknown, weekNumber: unknown) => ctx.mesocycle.find(w => w.week_number === Number(weekNumber))?.days.find(d => d.day === dayName)
  switch (kind) {
    case 'propose_exercise_swap':
      return slot(payload.dayName, payload.weekNumber)?.exercises[Number(payload.exIndex)]?.name === payload.oldExerciseName
    case 'propose_exercise_remove':
      return slot(payload.dayName, payload.weekNumber)?.exercises[Number(payload.exIndex)]?.name === payload.exerciseName
    case 'propose_exercise_reorder':
      return slot(payload.dayName, payload.weekNumber)?.exercises[Number(payload.fromIndex)]?.name === payload.exerciseName
    case 'propose_rest_day':
    case 'propose_missed_session':
    case 'propose_session_activity_swap':
    case 'propose_session_move':
      break
    default:
      return true
  }

  const date = String(kind === 'propose_session_move' ? payload.fromDate : payload.date)
  let moves: Awaited<ReturnType<typeof getSessionMovesInRange>>
  let worked = 0
  let flags: { marked_missed?: boolean | null; deliberate_rest?: boolean | null; swapped_for_activity?: string | null } | null = null
  try {
    moves = await getSessionMovesInRange(ctx.profileId, addDays(date, -7), addDays(date, 14))
  } catch { return true }
  const dayRows = async (d: string) => {
    try {
      const rows = await getWeeklyDashboard(ctx.profileId, d, d)
      return rows.find(r => r.date === d) ?? null
    } catch { return null }
  }

  if (kind === 'propose_session_move') {
    // WHERE THE SESSION SITS NOW: a session already moved once is moved again from the day it sits on, and the card
    // recorded its ORIGINAL day (a re-move rewrites the original record).
    const sitting = moves.find(m => m.fromDate === date)?.toDate ?? date
    const toDate = String(payload.toDate)
    if (sitting === toDate) return false
    const there = await dayRows(sitting)
    if ((there?.workingLogs.length ?? 0) > 0) return false
    const r = resolveMoveTarget({ fromDate: sitting, requestedDate: toDate, todayDate: ctx.today, plan: ctx.planForDate(sitting), weekOf: ctx.weekOf, existing: moves })
    return r.ok && r.date === toDate && (r.remapFrom ?? sitting) === date
  }

  const day = await dayRows(date)
  worked = day?.workingLogs.length ?? 0
  flags = day?.session ?? null
  const resolved = sessionForDate({ date, plan: ctx.planForDate(date), moves })
  // (A day its session was moved away from resolves to no session at all, so this also refuses that.)
  if (!dayHasSession(resolved.day)) return false
  // A day trained on is not one to mark missed, rest, or swap for something else: the strip ranks logged work first.
  if (worked > 0) return false
  if (kind === 'propose_rest_day') return !flags?.deliberate_rest
  if (kind === 'propose_session_activity_swap') return !flags?.swapped_for_activity
  return true
}

/**
 * A DAY CARD IS UNDONE ONLY WHILE THE DAY STILL HOLDS WHAT IT WROTE. A session moved A to B and then moved again to C
 * has ONE record on A (the re-move rewrites it), so undoing the first card cleared the second move too. True when the
 * day reads as the card left it, false when it was changed since, null when the day could not be read.
 */
export async function dayStillAsWritten(kind: string, payload: Record<string, unknown>, profileId: string): Promise<boolean | null> {
  if (kind !== 'propose_session_move' && kind !== 'propose_session_activity_swap') return true
  const date = String(kind === 'propose_session_move' ? payload.fromDate : payload.date)
  const { data, error } = await supabase.from('workout_sessions').select('*').eq('profile_id', profileId).eq('date', date).maybeSingle()
  if (error) return null
  const row = data as { moved_to_date?: string | null; swapped_for_activity?: string | null } | null
  return kind === 'propose_session_move'
    ? row?.moved_to_date === payload.toDate
    : row?.swapped_for_activity === payload.activityName
}
