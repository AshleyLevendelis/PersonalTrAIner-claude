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
import { NIGGLE_EASE_OFF_DAYS, EQUIPMENT_SWITCH_DAYS, NOTHING_LOADS_THAT_AREA, NOTHING_LOADS_THAT_AREA_NOTED, equipmentNothingToChange } from './edit-reason'
import { EQUIPMENT_OPTIONS } from './picker-options'
import { substituteForInjury, substituteForEquipment, assessAdaptation, countSlots } from './plan-adaptations'
import { executeInjuryAdaptation, executeLastingInjury, executeEquipmentAdaptation } from './pending-action-executor'
import { createPlanAdaptation } from './plan-adaptations-store'
import { loadPlanEditContext } from './plan-edit-context'
import { planDaysInWindow } from './plan-guard'

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
  /** When the plan was made — what turns "the next seven days" into plan rows. */
  planCreatedAt: string | undefined,
  hurt: 'niggle' | 'lasting',
  area: string,
  /**
   * The person's real exclusions — everything they have banned or said they
   * dislike, already compiled. REQUIRED, not defaulted: this used to pass `[]`
   * to every call below, so easing off a sore knee from the exercise row could
   * hand back an exercise the person had banned (the replacement pool is
   * filtered by this list and by nothing else that knows about a ban). The
   * coach's own cards have always passed theirs.
   */
  exclusions: string[],
): Promise<RowAdaptationResult> {
  const lasting = hurt === 'lasting'
  // WHICH DAYS, FROM DATES. A niggle eases off the next seven days; a lasting
  // one runs from today to the end of the plan. Never "this plan week": that
  // reached back over days already trained and stopped short of day seven.
  const context = await loadPlanEditContext(profile, mesocycle, planCreatedAt)
  const targetDays = planDaysInWindow(mesocycle, context.calendar, lasting ? undefined : NIGGLE_EASE_OFF_DAYS)
  const weekNumbers = [...new Set(targetDays.map(d => d.weekNumber))]
  if (targetDays.length === 0) return { message: "I can't see the rest of your plan just now." }

  const trial = await substituteForInjury({ mesocycle, profile, injuryCode: area, targetDays, exclusions, context })
  if (trial.touchedSlots.length === 0) {
    // NOT AN ERROR, AND NOT SILENCE. Nothing in these days loads that area,
    // so there is nothing to ease off — saying so is more use than a spinner
    // that ends with the plan unchanged and no explanation. A lasting one
    // still goes on the profile, because next block might.
    return lasting
      ? { addInjuryCode: area, message: NOTHING_LOADS_THAT_AREA_NOTED }
      : { message: NOTHING_LOADS_THAT_AREA }
  }
  // Being time-bounded does not make a gutted plan acceptable: a fortnight of
  // a hollow programme is still a fortnight of not training. The coach's own
  // cards make the same call the same way.
  const mode = assessAdaptation(trial, countSlots(mesocycle)).shouldRebuild ? 'rebuild' as const : 'substitute' as const

  try {
    const result = lasting
      ? await executeLastingInjury(profile, mesocycle, { injuryCode: area, weekNumbers, exclusions, mode }, context)
      : await executeInjuryAdaptation(profile, mesocycle, {
          injuryCode: area, durationDays: NIGGLE_EASE_OFF_DAYS, weekNumbers, startDate: context.calendar.today, exclusions, mode,
        }, context)
    if (!lasting) {
      await createPlanAdaptation({
        profileId: profile.id!, kind: 'injury', injuryCode: area,
        durationDays: NIGGLE_EASE_OFF_DAYS, affectedWeekNumbers: weekNumbers,
        record: result.record, reason: 'reported from the exercise row',
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
 * Rebuild the next week around the kit they actually have today.
 *
 * TIME-BOUNDED, like the coach's equipment adaptation. "I haven't got the kit"
 * is nearly always a trip, and a permanent answer to a temporary problem is
 * how somebody comes home to a bodyweight plan. Changing it for good is the
 * Profile screen's Equipment row — a more deliberate act than a chip.
 */
export async function applyEquipmentFromRow(
  profile: UserProfile,
  mesocycle: MesocycleWeek[],
  /** When the plan was made — see applyInjuryFromRow. */
  planCreatedAt: string | undefined,
  tier: string,
  /** The person's real exclusions — see applyInjuryFromRow. */
  exclusions: string[],
): Promise<RowAdaptationResult> {
  const context = await loadPlanEditContext(profile, mesocycle, planCreatedAt)
  // The seven days the change lasts, from today — the same seven the stored
  // adaptation expires after. It used to be "this plan week", which on a
  // Thursday meant three days forward and four days back.
  const targetDays = planDaysInWindow(mesocycle, context.calendar, EQUIPMENT_SWITCH_DAYS)
  const weekNumbers = [...new Set(targetDays.map(d => d.weekNumber))]
  if (targetDays.length === 0) return { message: "I can't see this week on your plan just now." }

  const trial = await substituteForEquipment({
    mesocycle, profile, equipmentTier: tier as never, targetDays, exclusions, context,
  })
  if (trial.touchedSlots.length === 0) {
    // INFORMATION, NOT A REFUSAL — see edit-reason.ts. The sheet draws it as
    // such, and names the kit that was checked rather than "that".
    return {
      message: equipmentNothingToChange({
        sameTier: tier === profile.equipment_access,
        tierLabel: EQUIPMENT_OPTIONS.find(o => o.value === tier)?.label ?? tier,
        scope: 'this week',
      }),
    }
  }
  try {
    const result = await executeEquipmentAdaptation(profile, mesocycle, {
      equipmentTier: tier as never, durationDays: EQUIPMENT_SWITCH_DAYS, weekNumbers, startDate: context.calendar.today, exclusions,
    }, context)
    await createPlanAdaptation({
      profileId: profile.id!, kind: 'equipment', equipmentOverride: tier,
      durationDays: EQUIPMENT_SWITCH_DAYS, affectedWeekNumbers: weekNumbers,
      record: result.record, reason: 'reported from the exercise row',
    })
    return { mesocycle: result.mesocycle, message: null }
  } catch {
    return { message: "That didn't save — try again in a moment." }
  }
}
