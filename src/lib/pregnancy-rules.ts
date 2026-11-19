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
//
// EXTENDED 18 Nov 2026 (the full pass; found by a walk that ticked Pregnant and was handed a flat dumbbell press). The
// first list was checked against exercise NAMES, and a move whose name does not say how it is done slipped through:
// "Neutral-Grip Dumbbell Press" is a flat bench press. Every catalogue entry was read again for the POSITION it is
// done in (docs/plans/pregnancy-exercise-rules.md, "Extended"):
//   - flat on the back: two more flat presses, the sliding leg curls (hips bridged off the floor), and the two rows
//     done hanging face-up under a bar or table (the trunk is horizontal and supine for the whole set);
//   - face down with the weight of the body on the front: the bench-supported and pad-supported rows, the reverse
//     hyper and the back-extension bench, the face-down dumbbell leg curl, and the Nordic curl (a controlled fall
//     forward onto the hands);
//   - impact: running on the spot (High Knees, the same class as Jumping Jacks) and the medicine-ball slam (a maximal
//     throw whose ball comes back up at the body).
// All on the safe side of the same rule; none is a new rule. Plank and push-up positions (hands and feet, nothing
// lying on the front), incline and seated work, side-lying work and a 45-degree leg press stay, as before.
// ---------------------------------------------------------------------------

/** Jumping or impact moves: never while pregnant. */
export const PREGNANCY_IMPACT = new Set([
  'Jump Rope', 'Burpees', 'Box Jumps', 'Broad Jumps', 'Plyo Push-Ups', 'Jumping Jacks', 'Skater Bounds',
  'High Knees', 'Medicine Ball Slams',
])

/** Lying flat on the back (or face down): not while pregnant (no due date: from the start, the safe side). */
export const PREGNANCY_LYING = new Set([
  'Barbell Bench Press', 'Smith Machine Bench Press', 'Dumbbell Bench Press', 'Barbell Floor Press', 'Dumbbell Floor Press',
  'Single-Arm Dumbbell Bench Press', 'Close-Grip Bench Press', 'Dumbbell Flyes', 'Dumbbell Pullover',
  'Lying Dumbbell Tricep Extension', 'Skull Crushers', 'Dead Bug', 'Glute Bridge', 'Single-Leg Glute Bridge',
  'Barbell Glute Bridge', 'Reverse Crunch', 'Hollow Body Hold', 'Lying Leg Curl', 'Prone Y-T Raises', 'Prone Hamstring Curl (Bodyweight)',
  // 18 Nov 2026, read by position:
  'Neutral-Grip Dumbbell Press', 'Dumbbell Squeeze Press', 'Sliding Leg Curl', 'Single-Leg Sliding Leg Curl',
  'Inverted Row', 'Table Row',
  'Chest-Supported Row', 'T-Bar Row Machine', 'Reverse Hyper Machine', 'Back Extension Machine', 'Dumbbell Leg Curl',
  'Nordic Hamstring Curl',
])

// THE WARM-UP TOO (18 Nov 2026): its opening item and mobility drills are not catalogue exercises, so these lists never
// reached them. A pregnant trainee with no kit opened every session with "Jumping Jacks & High Knees", and a hip day
// could open with a Glute Bridge. warmup.ts now asks: the opening item has a both-feet-on-the-floor twin
// (`generalWarmupFor`), and a drill named on the lists above is left out of the warm-up and of the tightness drills.

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
