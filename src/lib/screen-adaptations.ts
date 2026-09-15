// ---------------------------------------------------------------------------
// "IT HURTS" AND "I HAVEN'T GOT THE KIT", APPLIED FROM THE EXERCISE ROW.
//
// Ashley, 15 Sep 2026, from three options: the pain conversation happens ON
// THE SCREEN, fully — "you reach for this mid-session on a gym floor, and
// dropping someone into a chat to type is the wrong thing to hand them."
//
// THESE MIRROR THE COACH'S OWN CONFIRM BRANCHES rather than inventing a second
// adaptation path: same executors, same payload shapes, same plan_adaptations
// row for the time-bounded cases. The one thing the screen cannot do is hear
// "a fortnight", so the durations are constants — see NIGGLE_EASE_OFF_DAYS.
//
// A MODULE OF ITS OWN FOR A MEASURED REASON. This code needs plan-adaptations,
// the adaptation executors and the adaptation store. ChatAssistant needs the
// same three and is already a chunk of its own; calling them from ExerciseTab,
// which lives in the MAIN chunk, made Vite hoist all of it into the bundle
// every person downloads before they see anything — 915 -> 925 kB, caught by
// test:bundle. ExerciseTab now imports THIS lazily, so it stays in a chunk
// fetched when somebody actually says something hurts. Exactly the shape that
// caught the nutrition sheet a day earlier: the size was the symptom, the
// dependency was the defect.
//
// PURE-ISH ON PURPOSE: it writes to the database but it does not touch React.
// It returns what changed and leaves the caller to tell the app, which is what
// lets two components share one path.
// ---------------------------------------------------------------------------

import type { MesocycleWeek, UserProfile } from './types'
import { NIGGLE_EASE_OFF_DAYS, EQUIPMENT_SWITCH_DAYS } from './edit-reason'
import { substituteForInjury, substituteForEquipment, assessAdaptation, countSlots } from './plan-adaptations'
import { executeInjuryAdaptation, executeLastingInjury, executeEquipmentAdaptation } from './pending-action-executor'
import { createPlanAdaptation } from './plan-adaptations-store'

export interface RowAdaptationResult {
  /** The new plan, when one was written. Absent means nothing changed. */
  mesocycle?: MesocycleWeek[]
  /** A lasting injury also goes on the profile — the caller owns that write. */
  addInjuryCode?: string
  /** A refusal or an explanation, or null when it simply worked. */
  message: string | null
}

/**
 * A niggle eases the area off for a week; a lasting one reaches the end of the
 * plan and goes into the profile so every future plan avoids it.
 */
export async function applyInjuryFromRow(
  profile: UserProfile,
  mesocycle: MesocycleWeek[],
  liveWeek: number,
  hurt: 'niggle' | 'lasting',
  area: string,
): Promise<RowAdaptationResult> {
  const lasting = hurt === 'lasting'
  const weekSpan = lasting ? Number.MAX_SAFE_INTEGER : Math.max(1, Math.ceil(NIGGLE_EASE_OFF_DAYS / 7))
  const weekNumbers = mesocycle
    .map(w => w.week_number)
    .filter(n => n >= liveWeek && n < liveWeek + weekSpan)
  if (weekNumbers.length === 0) return { message: "I can't see the rest of your plan just now." }

  const trial = await substituteForInjury({ mesocycle, profile, injuryCode: area, weekNumbers, exclusions: [] })
  if (trial.touchedSlots.length === 0) {
    // NOT AN ERROR, AND NOT SILENCE. Nothing in these weeks loads that area,
    // so there is nothing to ease off — saying so is more use than a spinner
    // that ends with the plan unchanged and no explanation. A lasting one
    // still goes on the profile, because next block might.
    return lasting
      ? { addInjuryCode: area, message: "Nothing in your plan loads that area right now, so there's nothing to change today — but I've noted it for future plans." }
      : { message: "Nothing in your plan loads that area, so there's nothing to ease off." }
  }
  // Being time-bounded does not make a gutted plan acceptable: a fortnight of
  // a hollow programme is still a fortnight of not training. The coach's own
  // cards make the same call the same way.
  const mode = assessAdaptation(trial, countSlots(mesocycle)).shouldRebuild ? 'rebuild' as const : 'substitute' as const

  try {
    const result = lasting
      ? await executeLastingInjury(profile, mesocycle, { injuryCode: area, weekNumbers, exclusions: [], mode })
      : await executeInjuryAdaptation(profile, mesocycle, {
          injuryCode: area, durationDays: NIGGLE_EASE_OFF_DAYS, weekNumbers, exclusions: [], mode,
        })
    if (!lasting) {
      await createPlanAdaptation({
        profileId: profile.id!, kind: 'injury', injuryCode: area,
        durationDays: NIGGLE_EASE_OFF_DAYS, affectedWeekNumbers: weekNumbers,
        preImage: result.preImage, reason: 'reported from the exercise row',
      })
    }
    return { mesocycle: result.mesocycle, addInjuryCode: lasting ? area : undefined, message: null }
  } catch {
    // SAY IT DID NOT WORK. A silent failure leaves somebody believing the app
    // is training around a sore shoulder when it is not.
    return { message: "That didn't save — try again in a moment." }
  }
}

/**
 * Rebuild this week around the kit they actually have today.
 *
 * TIME-BOUNDED, like the coach's equipment adaptation. "I haven't got the kit"
 * is nearly always a trip, and a permanent answer to a temporary problem is
 * how somebody comes home to a bodyweight plan. Changing it for good is the
 * Profile screen's Equipment row — a more deliberate act than a chip.
 */
export async function applyEquipmentFromRow(
  profile: UserProfile,
  mesocycle: MesocycleWeek[],
  liveWeek: number,
  tier: string,
): Promise<RowAdaptationResult> {
  const weekNumbers = mesocycle.map(w => w.week_number).filter(n => n === liveWeek)
  if (weekNumbers.length === 0) return { message: "I can't see this week on your plan just now." }

  const trial = await substituteForEquipment({
    mesocycle, profile, equipmentTier: tier as never, weekNumbers, exclusions: [],
  })
  if (trial.touchedSlots.length === 0) {
    return { message: 'Everything in this week already works with that — nothing to change.' }
  }
  try {
    const result = await executeEquipmentAdaptation(profile, mesocycle, {
      equipmentTier: tier as never, durationDays: EQUIPMENT_SWITCH_DAYS, weekNumbers, exclusions: [],
    })
    await createPlanAdaptation({
      profileId: profile.id!, kind: 'equipment', equipmentOverride: tier,
      durationDays: EQUIPMENT_SWITCH_DAYS, affectedWeekNumbers: weekNumbers,
      preImage: result.preImage, reason: 'reported from the exercise row',
    })
    return { mesocycle: result.mesocycle, message: null }
  } catch {
    return { message: "That didn't save — try again in a moment." }
  }
}
