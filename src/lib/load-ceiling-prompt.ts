// ---------------------------------------------------------------------------
// Asking what the trainee can actually load — the decision, separate from the
// interface that shows it.
//
// THE PROBLEM, in Ashley's words: "how do we know the user's backpack is 20kg
// or that they can add weight to it each week?" We don't. Onboarding asks one
// equipment question — four boxes — and the only weights anyone can state are
// squat, bench and deadlift. Everything else is inferred from strength
// standards and then clamped by tables the app invented: a rucksack against a
// strap/posture guess, and a home trainee's dumbbells against a COMMERCIAL
// GYM RACK. The dumbbell table's own comment admits that and defers it.
//
// WHAT ALREADY WORKS AND IS NOT REBUILT HERE:
// getDoubleProgressionRecommendation reads the last logged sets and works
// from that number, so from session two the app is already correct. This
// covers session one, the 16-week plan shown up front, and the ceiling that
// clamps every week after.
//
// ASKED AT FIRST USE, NOT IN ONBOARDING — Ashley's call. Someone who has
// never trained cannot answer "how much can you load", and onboarding is
// where people drop out. The question only appears when an exercise using
// that implement is actually in front of them.
// ---------------------------------------------------------------------------

import { supabase } from './supabase'
import { isImprovisedLoadImplement, loadingMode, isExternallyLoaded } from './load-prescription'
import { getExerciseEntry } from './exercise-db'
import type { UserProfile, WorkoutDay } from './types'

/**
 * The implements a trainee can be asked about.
 *
 * Three, because loadingMode already classifies every exercise and a home
 * trainee only ever owns three kinds. Barbell is excluded because those users
 * are already asked their squat/bench/deadlift; 'stack' is excluded because a
 * cable machine means a gym, and a gym's stack really does go to 100kg.
 */
export type LoadCeilingKind = 'dumbbell' | 'single_implement' | 'improvised'

export const LOAD_CEILING_COLUMN: Record<LoadCeilingKind, string> = {
  dumbbell: 'max_dumbbell_kg',
  single_implement: 'max_single_implement_kg',
  improvised: 'max_improvised_kg',
}

/**
 * How the question is worded, per implement.
 *
 * Each says what the app will DO with the answer, because a number requested
 * without a reason reads as a form. "Per hand" is stated for dumbbells for
 * the same reason the load chips say it: the per-side/total confusion has
 * caused a real defect in this codebase more than once.
 */
export const LOAD_CEILING_QUESTION: Record<LoadCeilingKind, { question: string; hint: string }> = {
  dumbbell: {
    question: 'What are your heaviest dumbbells?',
    hint: 'Per hand. I will stop suggesting weights you do not own.',
  },
  single_implement: {
    question: 'What is your heaviest kettlebell?',
    hint: 'I will stop suggesting weights you do not own.',
  },
  improvised: {
    question: 'How much can your bag actually hold?',
    hint: 'Roughly is fine. I will stop asking for more than that.',
  },
}

/** Sanity bounds. Deliberately wide — this is a typo guard, not a judgement about what someone owns. */
export const LOAD_CEILING_MIN_KG = 1
export const LOAD_CEILING_MAX_KG = 100

export function isValidCeilingKg(v: unknown): boolean {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n >= LOAD_CEILING_MIN_KG && n <= LOAD_CEILING_MAX_KG
}

/** Which implement an exercise would be asked about, or null if it is one we never ask about. */
export function ceilingKindFor(exerciseName: string): LoadCeilingKind | null {
  const entry = getExerciseEntry(exerciseName)
  if (!entry || !isExternallyLoaded(entry)) return null
  // Checked first: a weighted backpack falls through loadingMode's cases to
  // 'stack', and it is emphatically not a cable machine.
  if (isImprovisedLoadImplement(entry)) return 'improvised'
  switch (loadingMode(entry)) {
    case 'dumbbell': return 'dumbbell'
    case 'single_implement': return 'single_implement'
    default: return null
  }
}

/**
 * RETIRED, kept as a name only so the diff is legible: these four are on
 * UserProfile itself now. Declaring them here meant the compiler never
 * required restoreSession to map them, and it did not — they were saved
 * correctly and read back as undefined on every reload, so a stated ceiling
 * never applied and "I'm not sure" never stuck. test:profile-restore is what
 * catches the next one.
 */
type ProfileWithCeilings = UserProfile

/** True when this trainee has already given a number for this implement. */
export function hasStatedCeiling(profile: UserProfile, kind: LoadCeilingKind): boolean {
  const p = profile as ProfileWithCeilings
  const v = kind === 'dumbbell' ? p.max_dumbbell_kg
    : kind === 'single_implement' ? p.max_single_implement_kg
      : p.max_improvised_kg
  return v != null
}

/**
 * What to ask about in this session, if anything.
 *
 * DECLINING IS A VALUE, NOT AN ABSENCE, and it ends the asking for every
 * implement at once. The body-metrics round proved why that distinction
 * matters: age, height and weight were all "optional", but optional only
 * meant "the plan can be built without it" — the conversation still held the
 * user until each was confirmed, so someone unwilling to give a weight could
 * answer everything else and never reach Generate. A trainee who says "I
 * don't know what my dumbbells weigh" must be able to say it once.
 *
 * Returns at most ONE kind, even when a session contains two unstated
 * implements. Someone opening the app in a gym wants to start training, not
 * fill in a form; the second question can wait for the session that needs it.
 */
export function ceilingToAskFor(profile: UserProfile, day: WorkoutDay | null | undefined): LoadCeilingKind | null {
  if (!day) return null
  const p = profile as ProfileWithCeilings
  if (p.load_ceilings_declined === true) return null
  // A full-gym trainee is never asked. The tables describe a commercial gym,
  // which is exactly where they are.
  if (profile.equipment_access === 'full_gym') return null
  for (const ex of day.exercises) {
    const kind = ceilingKindFor(ex.name)
    if (kind && !hasStatedCeiling(profile, kind)) return kind
  }
  return null
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * True when a Supabase error means "that column does not exist yet".
 *
 * Copied in shape from set-log-store's identical guard, and for the identical
 * reason: migration 20260826140000 may not be applied when this ships, and a
 * feature nobody has yet used must never break a screen. The prompt writes,
 * fails softly, and the app behaves exactly as it did before.
 */
function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const msg = String(error.message ?? '')
  return error.code === 'PGRST204' || /column|schema cache/i.test(msg)
}

export interface CeilingWriteResult {
  saved: boolean
  /** The migration has not been applied. Not an error to show the user — the app simply keeps guessing, as it always has. */
  needsMigration: boolean
}

export async function saveStatedCeiling(
  profileId: string,
  kind: LoadCeilingKind,
  kg: number,
): Promise<CeilingWriteResult> {
  if (!isValidCeilingKg(kg)) return { saved: false, needsMigration: false }
  const { error } = await supabase.from('fitness_profiles')
    .update({ [LOAD_CEILING_COLUMN[kind]]: kg })
    .eq('id', profileId)
  if (error) return { saved: false, needsMigration: isMissingColumnError(error) }
  return { saved: true, needsMigration: false }
}

/**
 * Records that the trainee was asked and chose not to say.
 *
 * Silences EVERY implement, not just the one on screen. Someone who does not
 * know what their dumbbells weigh almost certainly does not know what their
 * kettlebell weighs either, and asking them again next session with a
 * different noun is the same nag wearing a hat.
 */
export async function declineStatedCeilings(profileId: string): Promise<CeilingWriteResult> {
  const { error } = await supabase.from('fitness_profiles')
    .update({ load_ceilings_declined: true })
    .eq('id', profileId)
  if (error) return { saved: false, needsMigration: isMissingColumnError(error) }
  return { saved: true, needsMigration: false }
}
