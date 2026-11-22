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

/**
 * Hard ab moves that strain the stomach wall (his "yes fix all three", 21 Nov 2026; CSCS, mine): repeated loaded
 * trunk flexion, hanging leg work and rollouts raise the pressure inside the abdomen and load the midline the bump is
 * already stretching (diastasis recti). Pregnancy guidance swaps them for anti-movement work: bird dog, side plank,
 * Pallof press, planks while they feel fine. Measured before: all five in pregnant plans, Hanging Leg Raises in 1,564
 * sessions. Standing rotation (woodchops, landmine rotation) stays: it is moderate and controlled.
 */
export const PREGNANCY_ABDOMINAL_STRAIN = new Set([
  'Hanging Leg Raises', 'Ab Wheel Rollout', 'Russian Twist', 'Cable Crunch', 'Ab Crunch Machine',
])

export type PregnancyReason = 'impact' | 'lying' | 'abdominal'

// ---------------------------------------------------------------------------
// FROM 28 WEEKS (his "yes fix all four", 21 Nov 2026; CSCS, mine). Two things grow harder as the bump does: balance
// (the centre of gravity moves forward, the joints loosen) and holding the trunk face-down (the abdominal wall is at
// its most stretched). So a block that reaches 28 weeks swaps split-stance and single-leg work for supported or
// two-footed versions, and front-loaded core and push-ups for incline push-ups and side-on or kneeling trunk work.
// Earlier weeks keep them: they are fine while they feel fine, which is the guidance.
// ---------------------------------------------------------------------------
export const PREGNANCY_LATE_EXCLUDED: ReadonlySet<string> = new Set([
  // split stance, single leg, wide lunges
  'Bulgarian Split Squats', 'Walking Lunges', 'Dumbbell Lateral Lunge', 'Lateral Lunge (Bodyweight)', 'Dumbbell Reverse Lunge',
  'Barbell Reverse Lunge', 'Split Squat (Bodyweight)', 'Smith Machine Split Squat', 'Single-Leg Dumbbell RDL',
  'Single-Leg RDL (Bodyweight)', 'Step-Down (Eccentric)', 'Step-Ups', 'Pistol Squat Progression',
  // face-down trunk and push-up positions
  'Plank', 'Plank Shoulder Taps', 'Copenhagen Plank', 'Mountain Climbers', 'Push-Ups', 'Decline Push-Ups',
  'Archer Push-Ups', 'Deficit Push-Ups', 'Wide Push-Ups', 'Close-Grip Push-Ups', 'Knee Push-Ups',
  // head below the hips, weight through the arms
  'Pike Push-Ups',
])

/** What takes a late-excluded exercise's place, first one the person's pool allows. */
export const PREGNANCY_LATE_REPLACEMENTS: Readonly<Record<'legs' | 'push' | 'core', readonly string[]>> = {
  legs: ['Single-Leg Leg Press', 'Leg Press', 'Low Box Step-Up', 'Goblet Squats', 'Box Squat (Bodyweight)', 'Leg Extensions'],
  push: ['Incline Push-Ups', 'Chest Press Machine', 'Incline Dumbbell Press', 'Incline Machine Press'],
  core: ['Side Plank', 'Bird Dog', 'Pallof Press', 'Cable Woodchops', 'Dumbbell Woodchop'],
}

export function lateReplacementKind(name: string, pattern: string): 'legs' | 'push' | 'core' {
  if (pattern === 'core' || /plank|mountain/i.test(name)) return 'core'
  if (/push-up/i.test(name)) return 'push'
  return 'legs'
}

/** Pelvic floor exercises in the warm-up of every training day while pregnant (his "yes", 21 Nov 2026). */
export const PELVIC_FLOOR_WARMUP_ITEM = {
  name: 'Pelvic Floor Exercises',
  prescription: '10 slow squeezes, each held for up to 10 seconds, then 10 quick ones',
  purpose: 'Recommended for everyone who is pregnant (NHS): they support your bladder and bowel, now and after the birth',
  duration_seconds: 150,
} as const

// THE WARM-UP TOO (18 Nov 2026): its opening item and mobility drills are not catalogue exercises, so these lists never
// reached them. A pregnant trainee with no kit opened every session with "Jumping Jacks & High Knees", and a hip day
// could open with a Glute Bridge. warmup.ts now asks: the opening item has a both-feet-on-the-floor twin
// (`generalWarmupFor`), and a drill named on the lists above is left out of the warm-up and of the tightness drills.

/**
 * Why this exercise is left out while pregnant, or null. A variant or machine version answers as the exercise it is a
 * version of (`parent`), so a log-only or machine copy of a flat bench press is left out with it.
 */
export function pregnancyExclusion(ex: { name: string; parent?: string | null }): PregnancyReason | null {
  for (const n of [ex.name, ex.parent ?? '']) {
    if (PREGNANCY_IMPACT.has(n)) return 'impact'
    if (PREGNANCY_LYING.has(n)) return 'lying'
    if (PREGNANCY_ABDOMINAL_STRAIN.has(n)) return 'abdominal'
  }
  return null
}

/** The free-search warning, so a pick from the whole catalogue says it, as an injury clash does. */
export function pregnancyWarning(kind: PregnancyReason): string {
  return kind === 'impact'
    ? 'A jumping move: your plan leaves these out while you are pregnant.'
    : kind === 'lying'
      ? 'A move lying flat: your plan leaves these out while you are pregnant.'
      : 'A hard ab move that strains the stomach wall: your plan leaves these out while you are pregnant.'
}

// ---------------------------------------------------------------------------
// AND NO HEAVY, LOW-REP LIFTING (his "yes fix all three", 21 Nov 2026; CSCS, mine, basis below): every working set
// is 8 reps or more, and no strength or power block (the bodyweight phase list: foundations, hypertrophy,
// conditioning). The RPE 8 cap (health-conditions.ts) bounds effort, not load: a 3-5 rep set at RPE 8 is still ~85%
// of a max, with the breath-hold that load brings. ACOG (2020) and RCOG advise moderate resistance training; the
// usual prescription is 8-12 reps at a weight that allows normal breathing. Measured before: 832 pregnant plans held
// 3-5 rep barbell squats and deadlifts in their Maximal Strength blocks.
// ---------------------------------------------------------------------------
export const PREGNANCY_REP_FLOOR = 8

