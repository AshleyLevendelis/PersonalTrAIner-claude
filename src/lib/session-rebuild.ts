import type { MesocycleWeek, Exercise, UserProfile } from './types'
import { getReplacementCandidates, recomputeLoad, applyReplacement, isMainLiftSlot } from './mesocycle-edit'
import { settleWeek, clearOrphanedSupersetLabels } from './settle-week'

// ---------------------------------------------------------------------------
// A DIFFERENT SESSION TODAY — everything but the lift carrying your progression.
//
// Ashley's ruling, 16 Sep 2026, from three options: **keep the main lift and
// rebuild around it**, over asking each time and over rebuilding the whole
// session. You still do today's main lift at the weight and sets already
// prescribed; everything else changes.
//
// TWO REASONS, both of which generalise beyond this file:
//   - It matches the 13 Sep ruling for SHORTENING a session (protect the main
//     lift, drop accessories), so the app holds one position on the main lift
//     rather than two.
//   - If the main lift is the thing you want gone, swapping it on its own
//     already works from both surfaces. Refusing to touch it here costs
//     nothing that is not one tap away.
//
// THIS IS THE SWAP PATH, ONCE PER SLOT — and that is the whole design. Every
// thing that makes a swap safe is inherited rather than reimplemented:
// getReplacementCandidates has already applied equipment, injury and exclusion
// filtering; recomputeLoad prices the slot off logged history, or honestly
// says "find your working weight" when there is none; applyReplacement carries
// the unit and ramp rules that cost two separate bugs to learn; and settleWeek
// re-runs set hierarchy, one-weight, load coherence, the warm-up and the
// week-level balance pass. A rebuild is not a new kind of change to the plan.
// It is several of the change the app already makes.
//
// WHAT IT DOES NOT DO, stated here because the note that said this was MISSING
// gave a reason that is wrong: it does NOT regenerate the day. The cheap route
// — regenerate the week and keep one day — picks that day without knowing what
// the rest of the week now holds, and can hand you the same exercise twice.
// This walks the day it was given and never leaves it.
// ---------------------------------------------------------------------------

export interface SessionRebuildResult {
  mesocycle: MesocycleWeek[]
  changed: boolean
  /** Why nothing happened, in words a person can read. Empty when `changed`. */
  refusal?: string
  /** Every slot that actually changed, in the order they sit in the session. */
  replaced: { from: string; to: string }[]
  /**
   * Slots it could not change, and why.
   *
   * NEVER SILENT. A rebuild that quietly leaves three exercises alone and says
   * "done" is the shape of defect this codebase keeps finding — the app
   * knowing something and the screen saying nothing. A kept slot is named so
   * the card can say "these stayed, there was nothing else that fits".
   */
  kept: { name: string; reason: string }[]
  /** The main lift left untouched, so the card can say so by name. */
  mainLift: string | null
}

export interface RebuildSessionParams {
  mesocycle: MesocycleWeek[]
  profile: UserProfile
  weekNumber: number
  dayName: string
  /** The compiled exercise-exclusion list — bans and dislikes, already resolved. */
  exclusions: string[]
}

const NOTHING = (mesocycle: MesocycleWeek[], refusal: string): SessionRebuildResult =>
  ({ mesocycle, changed: false, refusal, replaced: [], kept: [], mainLift: null })

/**
 * Every exercise name this rebuild must not produce — what is on the day
 * already, and what appears anywhere else in the same week.
 *
 * READ OFF THE MESOCYCLE, which is the point. CLAUDE.md recorded the cross-day
 * dedupe set as a reason this feature could not be built, on the grounds that
 * it lives inside generation. The set generation uses does; this one is simply
 * what the week currently holds, and the week is right here.
 */
function namesInPlay(week: MesocycleWeek, dayName: string): Set<string> {
  const taken = new Set<string>()
  for (const d of week.days) for (const e of d.exercises) taken.add(e.name)
  const day = week.days.find(x => x.day === dayName)
  for (const e of day?.exercises ?? []) taken.add(e.name)
  return taken
}

/**
 * Rebuild today's session around the lift that carries its progression.
 *
 * TODAY ONLY. This is a today-verb like shortening, and the caller saves it
 * with scope 'today'. Nothing here reaches the rest of the block.
 */
export async function rebuildDayAroundMainLift(params: RebuildSessionParams): Promise<SessionRebuildResult> {
  const { mesocycle, profile, weekNumber, dayName, exclusions } = params
  const week = mesocycle.find(w => w.week_number === weekNumber)
  const day = week?.days.find(d => d.day === dayName)

  if (!week || !day) return NOTHING(mesocycle, "I couldn't find that day on your plan.")
  if (day.exercises.length === 0) return NOTHING(mesocycle, `${dayName} is a rest day — there's no session to rebuild.`)

  const mainLift = day.exercises.find(isMainLiftSlot) ?? null
  const rebuildable = day.exercises.filter(e => !isMainLiftSlot(e))
  if (rebuildable.length === 0) {
    return NOTHING(mesocycle, mainLift
      ? `${dayName} is just ${mainLift.name} — that's the lift I keep, so there's nothing else to change.`
      : `There's nothing on ${dayName} I can rebuild.`)
  }

  const taken = namesInPlay(week, dayName)
  const replaced: SessionRebuildResult['replaced'] = []
  const kept: SessionRebuildResult['kept'] = []
  const next: Exercise[] = []

  for (const slot of day.exercises) {
    // THE MAIN LIFT IS NOT CONSIDERED, not merely ranked last. Ashley's ruling
    // is about the progression thread, and the only version of "untouched"
    // that stays true is not looking at it.
    if (isMainLiftSlot(slot)) { next.push(slot); continue }

    const candidates = getReplacementCandidates(slot.name, profile, exclusions)
    const pick = candidates.find(c => !taken.has(c.exercise.name))
    if (!pick) {
      kept.push({ name: slot.name, reason: 'nothing else fits that slot with your equipment and injuries' })
      next.push(slot)
      continue
    }

    // isMainLiftReset false, always: a main lift never reaches this branch, so
    // passing true here could only ever mis-price an accessory as a new lift.
    const load = await recomputeLoad(pick.exercise, profile, slot.intensity || '', slot.sets, slot.reps, false)
    next.push(applyReplacement(slot, pick.exercise, load, profile.session_duration_preference))
    // The incoming name is claimed, and the outgoing one stays claimed too —
    // a later slot must not re-introduce the exercise this rebuild just took
    // out, which would read as the app changing nothing.
    taken.add(pick.exercise.name)
    replaced.push({ from: slot.name, to: pick.exercise.name })
  }

  if (replaced.length === 0) {
    return { ...NOTHING(mesocycle, `I couldn't find anything different for ${dayName} that works with your equipment and injuries.`), kept, mainLift: mainLift?.name ?? null }
  }

  const days = week.days.map(d => (d.day === dayName ? { ...d, exercises: clearOrphanedSupersetLabels(next) } : d))
  const settled = settleWeek({ ...week, days }, dayName, profile).week

  return {
    mesocycle: mesocycle.map(w => (w.week_number === weekNumber ? settled : w)),
    changed: true,
    replaced,
    kept,
    mainLift: mainLift?.name ?? null,
  }
}
