// ---------------------------------------------------------------------------
// VISION-ARCHITECTURE.md §3.3/§3.4 — writes a parsed, non-ambiguous
// interpretation through the SAME facades SetGrid.tsx uses (useActiveSession's
// logSet, never saveSet directly) so a chat-logged set is indistinguishable
// from a tap-logged one in the store. Takes the hook's functions as
// parameters rather than being a hook itself — this runs from
// ChatAssistant.tsx's event handlers, not render, and pure dependency
// injection keeps it unit-testable without mounting React.
// ---------------------------------------------------------------------------

import type { ParsedSetGroup } from './set-parse'
import type { SaveSetInput } from './set-log-store'
import type { ExerciseSetLog } from './types'
import { nextExtraSetNumber } from './session-derive'
import { prescriptionUnit } from './set-log-store'
import { saveCardioLog } from './cardio-log-store'

export interface LogWorkoutContext {
  profileId: string
  date: string
  weekNumber: number
  dayName: string
  setsFor: (exerciseId: string, exerciseName?: string) => ExerciseSetLog[]
  logSet: (input: SaveSetInput) => ExerciseSetLog
  declareOffPlan: (name: string) => void
  /** name -> prescribed set count, for exercises that ARE in today's plan (off-plan exercises pass 0). */
  todaysPlanSetCounts: Map<string, number>
  /** name -> today's suggested_load_kg, for exercises that ARE in today's plan and are externally loaded. Used only for the §3.5 progression-moment receipt note — never a write. */
  todaysPlanLoads: Map<string, number>
}

/**
 * VISION-ARCHITECTURE.md §3.5 — "the moment prescriptions stop being
 * guesses." Scoped down from the full detector (2-consecutive-sessions,
 * propose_load_recalibration) to just the receipt-level language: a
 * single logged weight >15% off the plan's suggested load gets one line
 * saying what changes. No plan write here — the existing progression
 * engine (getDoubleProgressionRecommendation, already reading
 * exercise_set_logs the same way for tap-logged sets) is what actually
 * derives next session's number from this row; NL-logged sets already go
 * through the identical store, so the "flip to logged provenance" §3.5
 * describes happens for free once this row exists — no separate write.
 */
const MATERIAL_DIVERGENCE_FRACTION = 0.15

function progressionNote(loggedWeightKg: number, prescribedLoadKg: number | undefined): string | undefined {
  if (prescribedLoadKg == null || prescribedLoadKg <= 0) return undefined
  const divergence = (loggedWeightKg - prescribedLoadKg) / prescribedLoadKg
  if (Math.abs(divergence) < MATERIAL_DIVERGENCE_FRACTION) return undefined
  return divergence > 0
    ? 'Heavier than the estimate — next session builds from your numbers.'
    : 'Lighter than the estimate — next session builds from your numbers.'
}

export interface LogWorkoutReceiptRow {
  label: string
  detail: string
  note?: string
}

/**
 * Fills free PRESCRIBED slots (1..prescribedSets) first, in order, then
 * overflows into extra-set numbers past everything ever used — never the
 * reverse. `nextExtraSetNumber` alone always returns a number past the
 * prescription, which is correct for the "+ Add Set" button (there is
 * always already-prescribed content ahead of it) but wrong here: the
 * FIRST NL-logged set for a freshly-prescribed exercise must land in slot
 * 1, not slot `prescribedSets + 1`.
 */
function allocateSetNumbers(count: number, prescribedSets: number, loggedSetNumbers: number[]): number[] {
  const used = new Set(loggedSetNumbers)
  const result: number[] = []
  for (let i = 1; i <= prescribedSets && result.length < count; i++) {
    if (!used.has(i)) { result.push(i); used.add(i) }
  }
  while (result.length < count) {
    const next = nextExtraSetNumber(prescribedSets, loggedSetNumbers, result)
    result.push(next)
  }
  return result
}

/**
 * Writes every set in every non-ambiguous group. Callers must have already
 * filtered out groups whose `resolution === 'ambiguous'` or whose
 * `ambiguity` is set — those block the whole turn (§3.1: "at most one
 * plan-mutation proposal per turn" extends here to "resolve every
 * ambiguity before any of this turn's sets write," so a partially-parsed
 * message never silently logs half of what was said).
 */
export function executeLogWorkout(groups: ParsedSetGroup[], ctx: LogWorkoutContext): { rows: LogWorkoutReceiptRow[]; totalSets: number } {
  const rows: LogWorkoutReceiptRow[] = []
  let totalSets = 0

  for (const group of groups) {
    if (group.routesToCardio) {
      saveCardioLog({
        userId: ctx.profileId,
        date: ctx.date,
        activityName: group.matchedRawPhrase,
        durationMinutes: group.cardioMinutes ?? 0,
        intensityRpe: 5, // no RPE stated in a bare duration phrase — a reasonable default, never blocks the write
      })
      rows.push({ label: group.matchedRawPhrase, detail: `${group.cardioMinutes} min`, note: 'Cardio' })
      continue
    }

    if (!group.exerciseId || !group.exerciseName || group.sets.length === 0) continue
    const exerciseId = group.exerciseId
    const exerciseName = group.exerciseName

    const isOffPlan = !ctx.todaysPlanSetCounts.has(exerciseName)
    if (isOffPlan) ctx.declareOffPlan(exerciseName)
    const prescribedSets = ctx.todaysPlanSetCounts.get(exerciseName) ?? 0

    const existingLogs = ctx.setsFor(exerciseId, exerciseName)
    const loggedSetNumbers = existingLogs.map(l => l.set_number)
    const setNumbers = allocateSetNumbers(group.sets.length, prescribedSets, loggedSetNumbers)

    group.sets.forEach((set, i) => {
      const setNumber = setNumbers[i]
      ctx.logSet({
        userId: ctx.profileId,
        date: ctx.date,
        weekNumber: ctx.weekNumber,
        day: ctx.dayName,
        exerciseId,
        exerciseName,
        setNumber,
        weightKg: set.weightKg,
        repsCompleted: set.reps,
        rpe: set.rpe ?? null,
        unit: prescriptionUnit(),
        isBodyweight: set.isBodyweight,
      })
      totalSets++
    })

    const weightLabel = group.sets[0]?.isBodyweight ? 'BW' : `${group.sets[0]?.weightKg}kg`
    const repsLabel = group.sets[0]?.repsRangeLabel ?? String(group.sets[0]?.reps)
    const note = group.resolution === 'unknown'
      ? 'Logged as a custom exercise — counts toward volume/history, excluded from progression'
      : isOffPlan
        ? "Not in today's plan — added to Additional Work"
        : !group.sets[0]?.isBodyweight
          ? progressionNote(group.sets[0]?.weightKg ?? 0, ctx.todaysPlanLoads.get(exerciseName))
          : undefined
    rows.push({
      label: exerciseName,
      detail: `${group.sets.length} × ${repsLabel} @ ${weightLabel}`,
      note,
    })
  }

  return { rows, totalSets }
}
