// ---------------------------------------------------------------------------
// HOW HARD A MOVEMENT IS, separately from what it is tagged.
//
// THE PROBLEM, measured. `tier1_compound` reads like "this is a main lift"
// and actually means "this needs a barbell". All eight tier-1 entries are
// barbell lifts or the two pull-up-bar movements. So Pistol Squat
// Progression, Nordic Hamstring Curl and Chest Dips — three of the hardest
// things a person can do without a gym — sit at tier-2 alongside Air Squat,
// Incline Push-Ups and Glute Bridge, and Dumbbell Bench Press ranks level
// with a Push-Up.
//
// That conflation is why 96 of 256 generated days had no main lift, and it
// left the promotion rule (dayAnchorExercise) unable to tell a Pistol Squat
// from an Air Squat: both tier-2, so the tie broke on list position.
//
// SCOPE, deliberately narrow. This is read by ONE thing — which exercise a
// day nominates as its anchor, and therefore which one carries the MAIN LIFT
// label and the 60-second rest floor. It does NOT touch mechanics_tier, which
// drives sets, reps, rest brackets, load ceilings and several quality checks;
// retagging those would move prescriptions for gym users who never had this
// problem. Ashley's call, taking the safe half.
//
// A HAND-MAINTAINED LIST, and no way around it. Difficulty is editorial —
// there is no property of an entry to derive "a Nordic curl is brutal" from.
// The mitigation is not to pretend otherwise but to make rot loud:
// test-main-lift-rest asserts every name below exists in the catalogue, so a
// rename orphans an entry with a failure rather than silently dropping it
// back to baseline.
// ---------------------------------------------------------------------------

/**
 * How much harder than its tier suggests, 1 or 2.
 *
 *   2 — this IS the main lift for whoever can only reach it. A coach handed
 *       these and nothing heavier would build the session around them.
 *   1 — a harder-than-baseline variant of its pattern. Real work, but not the
 *       thing you would centre a day on.
 *
 * Absent means 0: baseline for its tier, and most entries are.
 */
export const ANCHOR_DIFFICULTY_BUMP: Record<string, 1 | 2> = {
  // knee_dominant — a loaded squat is a main lift; a bodyweight one is not
  'Goblet Squats': 2,
  'Leg Press': 2,
  'Hack Squat': 2,
  // Spanish Squat is deliberately ABSENT. It is a patellar-tendon rehab tool
  // that the injury pass places on purpose; promoting it to a day's main lift
  // would turn a rehab prescription into the session's centrepiece.

  // horizontal_push
  'Dumbbell Bench Press': 2,
  'Barbell Floor Press': 2,
  'Incline Dumbbell Press': 2,
  'Neutral-Grip Dumbbell Press': 2,
  'Dumbbell Floor Press': 2,
  'Chest Press Machine': 2,
  'Incline Machine Press': 2,
  'Chest Dips': 2,
  'Archer Push-Ups': 1,
  'Deficit Push-Ups': 1,

  // horizontal_pull
  'Dumbbell Rows': 2,
  'T-Bar Rows': 2,
  'Chest-Supported Row': 2,
  'Seated Machine Row': 2,
  'Seated Cable Row': 2,
  'Cable Rows': 2,
  'Neutral-Grip Seated Cable Row': 2,
  'Inverted Row': 1,
  'Backpack Row': 1,

  // vertical_push
  'Dumbbell Shoulder Press': 2,
  'Landmine Press': 2,
  'Arnold Press': 2,
  'Shoulder Press Machine': 2,

  // vertical_pull — the assisted/loaded stand-ins for a pull-up
  'Lat Pulldown': 2,
  'Close-Grip Lat Pulldown': 2,
  'Pull-Ups (Assisted)': 2,

  // hip_hinge
  'Hip Thrust': 2,
  'Kettlebell Swing (Heavy)': 2,
  'Single-Leg RDL (Bodyweight)': 1,

  // single_leg — a pistol is a genuine main lift; a step-up is not
  'Pistol Squat Progression': 2,
  'Bulgarian Split Squats': 2,
  'Walking Lunges': 1,
  'Step-Ups': 1,
  'Step-Down (Eccentric)': 1,
  'Split Squat (Bodyweight)': 1,

  // isolation_hamstring — tagged isolation, but a Nordic curl is nobody's
  // accessory. The tag describes the joint count, not the demand.
  'Nordic Hamstring Curl': 2,
}

/** 0 unless the movement is listed above. */
export function anchorDifficultyBump(name: string): number {
  return ANCHOR_DIFFICULTY_BUMP[name] ?? 0
}
