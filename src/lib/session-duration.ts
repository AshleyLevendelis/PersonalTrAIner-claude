import type { SessionDuration, WorkoutDay } from './types'
import { EXERCISE_DATABASE, type ExerciseEntry } from './exercise-db'

// ---------------------------------------------------------------------------
// SESSION DURATION — single source of truth
// ---------------------------------------------------------------------------
// Three different layers need to agree on "how long is this session": the
// engine's time-cap trimming and duration top-up (how many sets fit/fill the
// budget), the quality scorer's time-fit dimension (did the engine actually
// hit it), and the UI (what to show the user). Previously each had its own
// copy of the same budget table and the same warmup+sets+rest formula —
// harmless while they agreed, a silent scoring bug the moment they drifted.
// This is the one place all three read from.
//
// The formula itself was rebuilt after an LLM coach review's hand-arithmetic
// on rendered plans consistently landed 20-40% higher than this module's
// estimate (llm-review-report.txt) — e.g. a 28-set session it clocked at
// 65-80min this module was calling ~45min. Two things were missing: no
// per-exercise setup/transition cost (loading plates, walking to a new
// station — a real, one-time-per-exercise cost the old formula charged
// nothing for), and a STATIC per-set duration that ignored the actual
// prescribed rep count — a phase asking for 13-17 reps takes meaningfully
// longer per set than one asking for 3-5, and the old model charged both the
// same flat `avg_duration_seconds`.

export const DURATION_BUDGET_SECONDS: Record<SessionDuration, number> = {
  '30-45': 37 * 60,
  '45-60': 52 * 60,
  '60-90': 75 * 60,
  '90+': 100 * 60,
}

export function getDurationBudgetSeconds(duration: SessionDuration): number {
  return DURATION_BUDGET_SECONDS[duration] ?? DURATION_BUDGET_SECONDS['45-60']
}

// Rough controlled-tempo pace for a rep-based working set — covers a
// deliberate eccentric/concentric plus the brief pause most working sets
// have at the top or bottom. At 10 reps this lands at 35s, matching the
// exercise database's old static `avg_duration_seconds` baseline for a
// typical compound — the difference is this now SCALES with the actual
// prescribed rep count instead of staying flat across every phase.
const SECONDS_PER_REP = 3.5

// One-time cost of getting INTO an exercise — loading plates, adjusting a
// rack or bench height, walking to a different station. Distinct from
// per-set rest, and charged once per exercise, not once per set. Plated
// barbell/EZ-bar/trap-bar/t-bar work costs the most; dumbbells, machines and
// bodyweight cost less.
const SETUP_SECONDS_PLATED = 50
const SETUP_SECONDS_OTHER = 30
const SETUP_SECONDS_PRIMER = 15

// Getting into the session itself: changing, walking to the first station,
// the mental changeover from warm-up to working sets. Charged once per
// non-empty session, not per exercise — this is what the review's hand math
// implicitly included and the old formula omitted entirely.
const SESSION_OVERHEAD_SECONDS = 120

/**
 * Per-SET working time, honoring the actual prescription TYPE instead of a
 * single static per-exercise average:
 *  - time-based ('30-45s', '45s') -> the prescribed hold duration itself
 *  - distance-based ('40m') -> no rep count to scale from; falls back to the
 *    exercise's own tuned estimate
 *  - rep-based ('9-13', '8') -> reps x SECONDS_PER_REP, so a high-rep
 *    anatomical-adaptation phase and a low-rep strength phase are no longer
 *    charged the same time for a set that takes visibly different effort
 */
function computeSetWorkSeconds(reps: string, fallbackSeconds: number): number {
  const timeRange = reps.match(/^(\d+)\s*-\s*(\d+)\s*s$/)
  if (timeRange) return (parseInt(timeRange[1], 10) + parseInt(timeRange[2], 10)) / 2
  const timeSingle = reps.match(/^(\d+)\s*s$/)
  if (timeSingle) return parseInt(timeSingle[1], 10)
  if (/^\d+\s*m$/.test(reps)) return fallbackSeconds

  const repRange = reps.match(/^(\d+)\s*-\s*(\d+)$/)
  if (repRange) return ((parseInt(repRange[1], 10) + parseInt(repRange[2], 10)) / 2) * SECONDS_PER_REP
  const repSingle = reps.match(/^(\d+)$/)
  if (repSingle) return parseInt(repSingle[1], 10) * SECONDS_PER_REP

  return fallbackSeconds
}

function getSetupSeconds(entry: ExerciseEntry | undefined): number {
  if (!entry) return SETUP_SECONDS_OTHER
  if (entry.mechanics_tier === 'primer') return SETUP_SECONDS_PRIMER
  const platedEquipment = entry.equipment.some(
    e => e === 'barbell' || e === 'EZ bar' || e === 'trap bar' || e === 't-bar'
  )
  return entry.mechanics_tier === 'tier1_compound' || platedEquipment ? SETUP_SECONDS_PLATED : SETUP_SECONDS_OTHER
}

/**
 * A superset partner's `rest` field is the literal string 'alternate' (see
 * buildSupersetPairs in exercise-plan.ts) — its real rest is shared with its
 * paired exercise's work time, not an independent full rest period, so it
 * gets a short fixed value rather than the 60s a missing/unparseable rest
 * used to silently default to.
 */
export function parseRestSeconds(rest: string): number {
  const match = rest.match(/(\d+)/)
  return match ? parseInt(match[1], 10) : 20
}

export interface DurationSlot {
  entry: ExerciseEntry | undefined
  sets: number
  reps: string
  restSeconds: number
}

/**
 * The one place total working-set time is computed from a list of exercise
 * slots — shared by the generation engine (time-cap trimming, duration
 * top-up estimation) and estimateDaySeconds below, so the two can never
 * drift out of formula sync.
 */
export function estimateSlotsSeconds(slots: DurationSlot[]): number {
  let total = 0
  for (const slot of slots) {
    const workPerSet = computeSetWorkSeconds(slot.reps, slot.entry?.avg_duration_seconds ?? 35)
    total += getSetupSeconds(slot.entry) + slot.sets * (workPerSet + slot.restSeconds)
  }
  return total
}

/** Warm-up + session overhead + working sets + any post-session conditioning that's actually part of THIS session (honest model — see module doc comment). */
export function estimateDaySeconds(day: WorkoutDay): number {
  if (day.exercises.length === 0) return 0
  const slots: DurationSlot[] = day.exercises.map(ex => ({
    entry: EXERCISE_DATABASE.find(e => e.name.toLowerCase() === ex.name.toLowerCase()),
    sets: ex.sets,
    reps: ex.reps,
    restSeconds: parseRestSeconds(ex.rest),
  }))
  // A post-session finisher (assignConditioningNotes' heavy/light-day brief,
  // or applyDurationFiller's mobility/conditioning fill — exercise-plan.ts)
  // is real prescribed time tacked onto THIS session, not a separate one —
  // an "independent_session" or "rest_day" entry is genuinely a different
  // block of time and stays out of this session's estimate.
  const postSessionCardioSeconds =
    day.recommendedCardio?.timing === 'post_session' ? day.recommendedCardio.duration * 60 : 0
  return (day.warmup?.total_seconds ?? 0) + SESSION_OVERHEAD_SECONDS + estimateSlotsSeconds(slots) + postSessionCardioSeconds
}
