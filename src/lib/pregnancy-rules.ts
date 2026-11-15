// ---------------------------------------------------------------------------
// PREGNANCY: EXERCISE RULES (his ruling 14 Nov 2026, "Exercise rules only"; docs/plans/pregnancy-exercise-rules.md).
// While "Pregnant" is ticked, the plan holds no jumping or impact move and no move lying flat on the back or face down;
// each is replaced by a move of the same kind, never left empty. The RPE 8 cap (health-conditions.ts) is unchanged.
// Calories and food are untouched (clinical nutrition, outside the CSCS delegation).
//
// CSCS, mine under his delegation (basis in BACKLOG): ACOG and RCOG advise against high-impact and fall-risk exercise
// in pregnancy (relaxin, a shifting centre of mass), and against lying flat on the back from the second trimester
// (vena cava compression). THERE IS NO DUE DATE YET, so every pregnancy is treated as past week 16 from the start: the
// safe side of the line, with nothing to store. Face-down lying is added for the same weeks (the bump makes it
// impractical). Hip thrusts (shoulders up on a bench), incline presses, seated machines and standing cable flyes are
// not flat and stay. The list is by name so it reads as what it is; a gate checks the catalogue for a new entry the
// name patterns would flag that the list does not decide.
// ---------------------------------------------------------------------------

/** Jumping or impact moves: never while pregnant. */
export const PREGNANCY_IMPACT = new Set([
  'Jump Rope', 'Burpees', 'Box Jumps', 'Broad Jumps', 'Plyo Push-Ups', 'Jumping Jacks', 'Skater Bounds',
])

/** Lying flat on the back (or face down): not while pregnant (no due date: from the start, the safe side). */
export const PREGNANCY_LYING = new Set([
  'Barbell Bench Press', 'Smith Machine Bench Press', 'Dumbbell Bench Press', 'Barbell Floor Press', 'Dumbbell Floor Press',
  'Single-Arm Dumbbell Bench Press', 'Close-Grip Bench Press', 'Dumbbell Flyes', 'Dumbbell Pullover',
  'Lying Dumbbell Tricep Extension', 'Skull Crushers', 'Dead Bug', 'Glute Bridge', 'Single-Leg Glute Bridge',
  'Barbell Glute Bridge', 'Reverse Crunch', 'Hollow Body Hold', 'Lying Leg Curl', 'Prone Y-T Raises', 'Prone Hamstring Curl (Bodyweight)',
])

/**
 * Why this exercise is left out while pregnant, or null. A variant or machine version answers as the exercise it is a
 * version of (`parent`), so a log-only or machine copy of a flat bench press is left out with it.
 */
export function pregnancyExclusion(ex: { name: string; parent?: string | null }): 'impact' | 'lying' | null {
  for (const n of [ex.name, ex.parent ?? '']) {
    if (PREGNANCY_IMPACT.has(n)) return 'impact'
    if (PREGNANCY_LYING.has(n)) return 'lying'
  }
  return null
}

/** The free-search warning, so a pick from the whole catalogue says it, as an injury clash does. */
export function pregnancyWarning(kind: 'impact' | 'lying'): string {
  return kind === 'impact'
    ? 'A jumping move: your plan leaves these out while you are pregnant.'
    : 'A move lying flat: your plan leaves these out while you are pregnant.'
}
