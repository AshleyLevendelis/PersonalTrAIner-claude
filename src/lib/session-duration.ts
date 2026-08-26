import type { SessionDuration, WorkoutDay } from './types'
import { EXERCISE_DATABASE, type ExerciseEntry } from './exercise-db'
import { parseTempo, tempoSecondsPerRep } from './periodization'

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

// The LOW end of what the trainee actually told us they had — 45 minutes for
// "45-60", not the 52-minute midpoint the budget uses. A session may
// legitimately come in under the midpoint; coming in under the minimum means
// it is shorter than the time they set aside, which is a different and worse
// thing.
//
// Exists because applyDurationFiller used to trigger on a flat 15-minute gap,
// and that number is only correct for one tier by coincidence: 75 - 15 lands
// exactly on the 60-90 tier's 60-minute minimum, while 52 - 15 = 37 leaves an
// eight-minute hole below the 45-60 tier's minimum where nothing topped the
// session up. MEASURED across loading weeks: 1% of "60-90" sessions fell below
// their stated minimum against 13% of "45-60" ones, purely from that.
export const SESSION_MINIMUM_SECONDS: Record<SessionDuration, number> = {
  '30-45': 30 * 60,
  '45-60': 45 * 60,
  '60-90': 60 * 60,
  '90+': 90 * 60,
}

export function getSessionMinimumSeconds(duration: SessionDuration): number {
  return SESSION_MINIMUM_SECONDS[duration] ?? SESSION_MINIMUM_SECONDS['45-60']
}

/**
 * The upper end of what the trainee actually said they had — '30-45' is 45
 * minutes. Distinct from getDurationBudgetSeconds, which is the MIDPOINT the
 * generator aims at: a session at 44 minutes is on target for a "30-45"
 * trainee and 121% of the midpoint, which is why measuring overshoot against
 * the budget flagged 69 perfectly good sessions once already.
 *
 * This is the number nothing may exceed, and it is the target of the final
 * safety trim in generateMesocycle.
 */
export const SESSION_MAXIMUM_SECONDS: Record<SessionDuration, number> = {
  '30-45': 45 * 60, '45-60': 60 * 60, '60-90': 90 * 60, '90+': 120 * 60,
}

export function getSessionMaximumSeconds(duration: SessionDuration): number {
  return SESSION_MAXIMUM_SECONDS[duration] ?? SESSION_MAXIMUM_SECONDS['45-60']
}

// Steady-state cardio (currently: Elliptical) is one continuous block, not a
// fixed 20 minutes for every trainee — roughly 35-40% of the total session
// budget, since it's normally paired with at least a warm-up and one or two
// other exercises, not the whole session. A flat value regardless of
// session length either eats nearly half a short session's budget or barely
// registers in a long one; scaling it the same way DURATION_BUDGET_SECONDS
// already scales everything else keeps it proportionate at every tier.
export const STEADY_STATE_SECONDS: Record<SessionDuration, number> = {
  '30-45': 15 * 60,
  '45-60': 20 * 60,
  '60-90': 30 * 60,
  '90+': 35 * 60,
}

export function getSteadyStateSeconds(duration: SessionDuration): number {
  return STEADY_STATE_SECONDS[duration] ?? STEADY_STATE_SECONDS['45-60']
}

/**
 * The distance every carry is prescribed at before anything progresses it —
 * `fixedUnitPrescription`'s `'40m'`, named so the duration model and the
 * progression pass agree on what "unprogressed" means rather than each
 * carrying its own literal.
 *
 * Lives here rather than in exercise-plan.ts because THIS file needs it to
 * convert a distance into seconds, and exercise-plan already imports from
 * here (not the other way round).
 */
export const DEFAULT_CARRY_DISTANCE_M = 40

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
export const SESSION_OVERHEAD_SECONDS = 120

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
function computeSetWorkSeconds(reps: string, fallbackSeconds: number, exerciseName?: string, tempo?: string): number {
  const timeRange = reps.match(/^(\d+)\s*-\s*(\d+)\s*s$/)
  if (timeRange) return (parseInt(timeRange[1], 10) + parseInt(timeRange[2], 10)) / 2
  const timeSingle = reps.match(/^(\d+)\s*s$/)
  if (timeSingle) return parseInt(timeSingle[1], 10)
  // A CARRY SCALES WITH ITS DISTANCE. This used to return the exercise's flat
  // avg_duration_seconds for any distance, so a 50m carry was costed exactly
  // the same as a 40m one — fine while distance was a hardcoded constant,
  // and a silent way to blow a session's budget the moment it isn't.
  //
  // No new pace constant: each entry's own avg_duration_seconds already
  // implies one over the default distance (Farmer's Walk 35s/40m = 1.14 m/s;
  // Loaded Backpack Walk 40s = 1.00 m/s), so every carry keeps its own tuned
  // pace and simply scales.
  const distance = reps.match(/^(\d+)\s*m$/)
  if (distance) {
    return fallbackSeconds * (parseInt(distance[1], 10) / DEFAULT_CARRY_DISTANCE_M)
  }

  // A prescribed tempo REPLACES the generic pace rather than adding to it —
  // SECONDS_PER_REP is itself a tempo assumption ("a deliberate eccentric/
  // concentric plus the brief pause"), so adding them would double-count.
  const parsed = parseTempo(tempo)
  const perRep = parsed ? tempoSecondsPerRep(parsed) : SECONDS_PER_REP

  const repRange = reps.match(/^(\d+)\s*-\s*(\d+)$/)
  if (repRange) return ((parseInt(repRange[1], 10) + parseInt(repRange[2], 10)) / 2) * perRep
  const repSingle = reps.match(/^(\d+)$/)
  if (repSingle) return parseInt(repSingle[1], 10) * perRep

  // A string that matches none of the above is a real prescription-format
  // bug, not a rare edge case a silent default should absorb — this is the
  // exact shape that let a steady-state cardio block get estimated at ~30s
  // instead of its real ~20min before it shipped (caught in review, not by
  // this function). A quiet fallback here can't be found; a loud one gets
  // fixed. Mirrors the discipline of the load-ceiling warning in
  // load-prescription.ts — log, don't just absorb.
  console.warn(
    `[Session Duration] "${exerciseName ?? 'unknown exercise'}" reps string "${reps}" didn't match any known ` +
    `prescription pattern (rep count/range, "Ns"/"N-Ms" time, or "Nm" distance) — falling back to a flat ` +
    `${fallbackSeconds}s estimate. This default looks plausible but is very likely wrong; trace why the ` +
    `string didn't parse rather than trusting the fallback.`
  )
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
  /**
   * Canonical tempo notation, when the exercise carries one. MUST be
   * threaded through by every caller: SECONDS_PER_REP already assumes a
   * controlled ~3.5s rep, so a prescribed 4-1-1 is 6s and the model would
   * under-count that set by 71%. A prescription the duration model cannot
   * see is the exact mechanism that let a steady-state block be estimated at
   * 30s instead of twenty minutes.
   */
  tempo?: string
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
    const workPerSet = computeSetWorkSeconds(slot.reps, slot.entry?.avg_duration_seconds ?? 35, slot.entry?.name, slot.tempo)
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
    tempo: ex.tempo,
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
