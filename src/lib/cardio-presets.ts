// ---------------------------------------------------------------------------
// THE QUICK-PICK CARDIO OPTIONS, CHOSEN FOR THE KIT THE PERSON HAS.
//
// Test log L14, 9 Oct 2026: a tester training at home with dumbbells opened
// "Add unplanned work → Cardio" and was offered Incline walk, Heavy bag,
// HIIT bike and Zone 2. Three of the four name a machine or a bag he does not
// have. The list was one constant in the component, which took no profile, so
// everybody got a commercial gym's options.
//
// DECIDED AS A CSCS COACH: a preset is a suggested modality, and a modality
// the person cannot do is not a suggestion. Outside a full gym the four are
// the ones that need nothing: a brisk walk (easy), a run (steady), a
// bodyweight circuit (hard) and Zone 2 — the same easy / steady / hard spread
// the gym set covers, so the choice is the same choice with different kit.
// "Other" is unchanged and still takes anything.
//
// WHY ONLY TWO LISTS, when there are four tiers. Home gym, Minimalist and
// Bodyweight differ in what they LIFT with; none of them promises a
// treadmill, a bike or a bag (exercise-plan.ts's EQUIPMENT_SETS). A skipping
// rope is in two of them and is deliberately not a preset: it is the one
// small item the app has no record of anyone owning, and "Other" covers it.
//
// AN UNKNOWN TIER GETS THE NO-KIT LIST. The round timer opens this sheet from
// a screen that has no profile; offering options everybody can do is the safe
// side of not knowing, and offering a treadmill is the defect.
//
// THE GYM LIST IS BYTE-FOR-BYTE WHAT IT WAS — activity strings and RPEs both.
// The activity string is what the log has always recorded and what the
// "last time you did this for N minutes" memory is keyed on.
// ---------------------------------------------------------------------------

import type { EquipmentAccess } from './types'

export interface CardioPreset {
  /** The chip's face. */
  label: string
  /** What is written to the log. */
  activity: string
  /** The suggested minutes. */
  minutes: number
  /** The suggested effort, as an RPE (≤4 Easy, 5-6 Steady, ≥7 Hard). */
  rpe: number
}

const GYM_PRESETS: readonly CardioPreset[] = [
  { label: 'Incline walk', activity: 'Incline Treadmill Walk', minutes: 15, rpe: 4 },
  { label: 'Heavy bag', activity: 'Heavy Bag / Functional Circuit', minutes: 15, rpe: 7 },
  { label: 'HIIT bike', activity: 'HIIT / Assault Bike', minutes: 10, rpe: 8 },
  { label: 'Zone 2', activity: 'Zone 2 Cardio', minutes: 15, rpe: 5 },
]

const NO_KIT_PRESETS: readonly CardioPreset[] = [
  { label: 'Brisk walk', activity: 'Brisk Walk', minutes: 20, rpe: 4 },
  { label: 'Run', activity: 'Run', minutes: 15, rpe: 6 },
  { label: 'Circuit', activity: 'Bodyweight Circuit', minutes: 10, rpe: 7 },
  { label: 'Zone 2', activity: 'Zone 2 Cardio', minutes: 15, rpe: 5 },
]

/** The four quick picks for this kit tier. Always four: the row is laid out for four plus "Other". */
export function cardioPresetsFor(equipment: EquipmentAccess | null | undefined): readonly CardioPreset[] {
  return equipment === 'full_gym' ? GYM_PRESETS : NO_KIT_PRESETS
}
