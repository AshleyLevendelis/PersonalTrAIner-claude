// ---------------------------------------------------------------------------
// THE LIFT NUMBERS, ASKED AT THE FIRST SESSION (his ruling 14 Nov 2026, "Ask at the first session", part of the
// shorter setup, "Light trim"). Setup no longer asks them. At a lifter's first session one card asks a recent hard set
// of each (the weight and the reps, his 11 Nov "Weight and reps"), with "I don't know" beside it. Answered, the plan
// starts from those weights and the first week's testing is skipped; unanswered, the first week finds them, as before.
//
// The card is shown ONLY where answering can take effect: the plan's skip rule (exercise-plan.ts canSkipCalibration)
// skips the first week only for a non-beginner whose body weight is known and whose numbers are plausible. A card that
// asked anyone else would take numbers and change nothing.
// ---------------------------------------------------------------------------
import type { MesocycleWeek, UserProfile } from './types'
import { isStartingOut } from './starting-out'
import { allowedEquipmentFor } from './exercise-plan'
import { resolveBodyBasis } from './load-prescription'
import { referenceWeightFromSet } from './working-weight'
import { implausibleLifts } from './lift-plausibility'

export type FirstLiftKey = 'known_squat_kg' | 'known_bench_kg' | 'known_deadlift_kg'

export const FIRST_LIFTS: { key: FirstLiftKey; label: string }[] = [
  { key: 'known_squat_kg', label: 'Barbell back squat' },
  { key: 'known_bench_kg', label: 'Barbell bench press' },
  { key: 'known_deadlift_kg', label: 'Barbell deadlift' },
]

export interface FirstLiftsContext {
  profile: UserProfile | null | undefined
  /** The plan week the person is in today. */
  week: MesocycleWeek | null | undefined
  /** Any working set logged before today, or today. Unknown (a failed read) counts as yes: never ask on a guess. */
  trainedBefore: boolean | null
  /** He has already answered or said "I don't know" on this phone. */
  dismissed: boolean
}

/** Whether the card is due today. */
export function firstSessionLiftsDue(ctx: FirstLiftsContext): boolean {
  const p = ctx.profile
  if (!p) return false
  if (ctx.dismissed || ctx.trainedBefore !== false) return false
  if (!ctx.week?.isCalibrationWeek) return false
  if (p.skip_calibration_week) return false
  if (p.known_squat_kg != null || p.known_bench_kg != null || p.known_deadlift_kg != null) return false
  if (p.training_experience === 'beginner' || isStartingOut(p)) return false
  // A body weight the app was told, not assumed: the plan's skip rule needs it (canSkipCalibration).
  if (resolveBodyBasis(p).assumed) return false
  const allowed = allowedEquipmentFor(p)
  return allowed === null || allowed.has('barbell')
}

export interface FirstLiftSet { weightKg: string; reps: string }

export type FirstLiftsResult =
  | { ok: true; patch: Partial<UserProfile> }
  | { ok: false; message: string }

/**
 * The profile change from what he typed: each lift with a usable set becomes the plan's number for it
 * (referenceWeightFromSet, the same reading setup used), and the first week's testing is skipped. A weight without
 * reps, or reps without a weight, is asked about; an implausible number is said back, never saved.
 */
export function firstLiftsPatch(profile: UserProfile, sets: Partial<Record<FirstLiftKey, FirstLiftSet>>): FirstLiftsResult {
  const patch: Partial<UserProfile> = {}
  for (const { key, label } of FIRST_LIFTS) {
    const s = sets[key]
    const w = (s?.weightKg ?? '').trim(), r = (s?.reps ?? '').trim()
    if (!w && !r) continue
    if (!w || !r) return { ok: false, message: `For the ${label.replace('Barbell ', '').toLowerCase()}, put the weight and how many reps you got, or leave both empty.` }
    const kg = referenceWeightFromSet(Number(w), Number(r))
    if (kg == null) return { ok: false, message: `That ${label.replace('Barbell ', '').toLowerCase()} set can't be read: a weight in kg and 1 to 15 reps.` }
    patch[key] = kg
  }
  if (Object.keys(patch).length === 0) return { ok: false, message: 'Put in at least one lift, or tap "I don\'t know".' }
  const flagged = implausibleLifts({ ...profile, ...patch }, resolveBodyBasis(profile).assumed)
  if (flagged.length > 0) return { ok: false, message: flagged[0].message }
  return { ok: true, patch: { ...patch, skip_calibration_week: true } }
}

/** The card's words, in one place. */
export const FIRST_LIFTS_WORDS = {
  title: 'Know a recent hard set?',
  lead: "Your first week finds your starting weights. If you know a recent hard set of these, I'll start you from them instead and skip that week.",
  use: 'Start from these',
  dontKnow: "I don't know",
  done: 'Done. Your plan now starts from these weights.',
}
