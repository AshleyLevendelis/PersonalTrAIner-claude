// ---------------------------------------------------------------------------
// THE FEW PLAN-SHAPED FACTS THE SERVER CANNOT WORK OUT, from what Home already
// holds. docs/plans/the-coach-can-reach-you.md, slice 3.
//
// The server reads logs, marks, moves and open offers live. What it cannot do
// is run the plan engine, so these are sent ahead while the app is open:
//   - the weekday pattern — the SAME one the streak counts by (dashboard-data
//     reads week-1 of the flat plan as the schedule, and so does this);
//   - the day after the plan's last week, so a finished plan is never nagged;
//   - the day after the current block's last week, for the block review;
//   - the streak Home just counted, with the date it counted it on.
//
// momentFactsFrom is pure, so test:reach-out calls it. Dates are the person's
// LOCAL calendar dates, because the server compares them against their local
// today. sendFactsAhead writes them, deduped. Both live here rather than with
// the switches because Home runs them on every open — and that keeps the
// Reminders screen's code out of the first download (test:bundle).
// ---------------------------------------------------------------------------
import type { WorkoutDay, MesocycleWeek } from './types'
import { isScheduledDay } from './activity-day'
import { getActiveMesocycleWeek } from './calculations'
import { addDays } from './session-move'
import { getLocalDateString } from './dev-clock'
import { supabase } from './supabase'

export interface FactsAhead {
  trainingWeekdays?: string[]
  planEndsOn?: string | null
  blockEndsOn?: string | null
  streakDays?: number
  streakAsOf?: string
}

const SENT_KEY = 'fitplan_moment_facts_sent_v1'

/**
 * ONLY WHEN SOMETHING CHANGED. This runs from App and from Home as their data
 * settles, so an unguarded write would fire on every render. The last payload
 * per person is remembered locally; a repeat is not sent.
 *
 * A missing table (the migration not pushed yet) is not an error anyone can
 * act on — the facts are simply not sent until it is. Everything else is
 * logged: a failed write here costs a notification, never a screen.
 */
export async function sendFactsAhead(profileId: string, facts: FactsAhead): Promise<'sent' | 'unchanged' | 'not_live_yet' | 'failed'> {
  const row: Record<string, unknown> = { user_id: profileId }
  if (facts.trainingWeekdays) row.training_weekdays = facts.trainingWeekdays
  if (facts.planEndsOn !== undefined) row.plan_ends_on = facts.planEndsOn
  if (facts.blockEndsOn !== undefined) row.block_ends_on = facts.blockEndsOn
  if (facts.streakDays !== undefined) row.streak_days = facts.streakDays
  if (facts.streakAsOf !== undefined) row.streak_as_of = facts.streakAsOf

  let remembered: Record<string, string> = {}
  try { remembered = JSON.parse(localStorage.getItem(SENT_KEY) ?? '{}') } catch { /* private window: send anyway */ }
  const memoKey = `${profileId}:${Object.keys(row).sort().join(',')}`
  const fingerprint = JSON.stringify(row)
  if (remembered[memoKey] === fingerprint) return 'unchanged'

  const { error } = await supabase.from('coach_moment_facts').upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) {
    const code = String((error as { code?: string }).code ?? '')
    // THE TABLE ITSELF MISSING, and nothing broader: a row-level-security
    // refusal also names the table, and reading that as "not live yet" would
    // hide a real fault behind a harmless-sounding one.
    if (code === '42P01' || code === 'PGRST205' || /could not find the table|does not exist/i.test(String(error.message ?? ''))) return 'not_live_yet'
    console.error('[reach-out] sending the facts ahead failed:', error)
    return 'failed'
  }
  try { localStorage.setItem(SENT_KEY, JSON.stringify({ ...remembered, [memoKey]: fingerprint })) } catch { /* fine */ }
  return 'sent'
}

export function momentFactsFrom(input: {
  exercisePlan: WorkoutDay[]
  mesocycle: MesocycleWeek[]
  planCreatedAt: string | undefined
  now: Date
  streakDays: number
  today: string
}): FactsAhead {
  const trainingWeekdays = [...new Set(input.exercisePlan.filter(isScheduledDay).map(d => d.day))]
  let planEndsOn: string | null = null
  let blockEndsOn: string | null = null
  if (input.planCreatedAt && input.mesocycle.length > 0) {
    const start = getLocalDateString(new Date(input.planCreatedAt))
    planEndsOn = addDays(start, input.mesocycle.length * 7)
    const liveIdx = getActiveMesocycleWeek(input.planCreatedAt, input.now, input.mesocycle.length) - 1
    const block = input.mesocycle[liveIdx]?.block_number
    if (block != null) {
      // The LAST week carrying this block's number, not block x 4: a block's
      // length is the plan's business, and assuming it here is how the review
      // would come a week early or late on any plan that is not four-weekly.
      let last = liveIdx
      input.mesocycle.forEach((w, i) => { if (w.block_number === block && i > last) last = i })
      blockEndsOn = addDays(start, (last + 1) * 7)
    }
  }
  return { trainingWeekdays, planEndsOn, blockEndsOn, streakDays: Math.max(0, input.streakDays), streakAsOf: input.today }
}
