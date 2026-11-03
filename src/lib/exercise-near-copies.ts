// ---------------------------------------------------------------------------
// NEAR-COPIES: LOG-ONLY EXERCISES (3 Nov 2026; Ashley's ruling "Searchable, log-only", from three options, and her
// "then build the log-only near-copies"; docs/plans/log-only-near-copies.md).
//
// A near-copy is the same lift as a catalogue entry with another grip, angle, stance, tempo or setup: a paused squat,
// a wide-grip pulldown. Her ruling: NEVER prescribed by a plan, but found in search and logged under its own name,
// with its own history and best.
//
// PURE DATA, name -> parent. Everything else about the entry (kit, joints, tier, pattern, how it is loaded) is copied
// from the parent in exercise-db.ts, so a near-copy is excluded for every injury its parent is and can never carry a
// field written by hand. The list lives OUTSIDE the catalogue array on purpose: every pool, rotation, shortlist and
// gate iterates EXERCISE_DATABASE, so none of them can see one. Only the name lookup and the logging search do.
//
// From her two lists (`comprehensive_exercise_database.md`, `expanded_exercise_database_2000.md`); this is the first
// slice, the common free-weight, cable and machine lifts. A name is added only when its parent is unambiguous.
// ---------------------------------------------------------------------------

export const NEAR_COPIES: readonly (readonly [name: string, parent: string])[] = [
  // squat
  ['High-Bar Back Squat', 'Barbell Squats'],
  ['Low-Bar Back Squat', 'Barbell Squats'],
  ['Pause Squat', 'Barbell Squats'],
  ['Tempo Squat', 'Barbell Squats'],
  ['Box Squat', 'Barbell Squats'],
  ['Pin Squat', 'Barbell Squats'],
  ['Safety Bar Squat', 'Barbell Squats'],
  ['Pause Front Squat', 'Front Squat'],
  ['Cross-Arm Front Squat', 'Front Squat'],
  ['Heels-Elevated Goblet Squat', 'Goblet Squats'],
  ['Goblet Box Squat', 'Goblet Squats'],
  // hinge
  ['Paused Deadlift', 'Deadlifts'],
  ['Deficit Deadlift', 'Deadlifts'],
  ['Rack Pull', 'Deadlifts'],
  ['Block Pull', 'Deadlifts'],
  ['Snatch-Grip Deadlift', 'Deadlifts'],
  ['Semi-Sumo Deadlift', 'Sumo Deadlift'],
  ['Stiff-Legged Deadlift', 'Romanian Deadlifts'],
  ['Barbell Frog Pump', 'Hip Thrust'],
  ['Single-Leg Barbell Hip Thrust', 'Hip Thrust'],
  // bench
  ['Paused Bench Press', 'Barbell Bench Press'],
  ['Wide-Grip Bench Press', 'Barbell Bench Press'],
  ['Spoto Press', 'Barbell Bench Press'],
  ['Larsen Press', 'Barbell Bench Press'],
  ['Feet-Up Bench Press', 'Barbell Bench Press'],
  ['Pin Press', 'Barbell Bench Press'],
  ['Board Press', 'Barbell Bench Press'],
  ['Reverse-Grip Bench Press', 'Barbell Bench Press'],
  ['Decline Barbell Bench Press', 'Barbell Bench Press'],
  ['Paused Incline Barbell Bench Press', 'Incline Barbell Bench Press'],
  ['Decline Dumbbell Press', 'Dumbbell Bench Press'],
  ['Alternating Dumbbell Bench Press', 'Dumbbell Bench Press'],
  ['Low-Incline Dumbbell Press', 'Incline Dumbbell Press'],
  ['High-Incline Dumbbell Press', 'Incline Dumbbell Press'],
  ['Alternating Incline Dumbbell Press', 'Incline Dumbbell Press'],
  ['Incline Dumbbell Fly', 'Dumbbell Flyes'],
  ['Decline Dumbbell Fly', 'Dumbbell Flyes'],
  // overhead
  ['Seated Barbell Overhead Press', 'Overhead Press'],
  ['Z-Press', 'Overhead Press'],
  ['Seated Dumbbell Shoulder Press', 'Dumbbell Shoulder Press'],
  ['Standing Dumbbell Shoulder Press', 'Dumbbell Shoulder Press'],
  ['Neutral-Grip Dumbbell Shoulder Press', 'Dumbbell Shoulder Press'],
  ['Seated Lateral Raise', 'Lateral Raises'],
  ['Lean-Away Lateral Raise', 'Lateral Raises'],
  ['Chest-Supported Lateral Raise', 'Lateral Raises'],
  ['Behind-the-Back Cable Lateral Raise', 'Cable Lateral Raises'],
  ['Seated Rear Delt Fly', 'Rear Delt Flyes'],
  ['Chest-Supported Rear Delt Fly', 'Rear Delt Flyes'],
  ['Face Pull with External Rotation', 'Face Pulls'],
  // pull
  ['Pendlay Row', 'Barbell Rows'],
  ['Underhand Barbell Row', 'Barbell Rows'],
  ['Kroc Row', 'Dumbbell Rows'],
  ['Tripod Dumbbell Row', 'Dumbbell Rows'],
  ['Wide-Grip Lat Pulldown', 'Lat Pulldown'],
  ['Underhand Lat Pulldown', 'Lat Pulldown'],
  ['Neutral-Grip Lat Pulldown', 'Lat Pulldown'],
  ['Wide-Grip Seated Cable Row', 'Seated Cable Row'],
  ['Wide-Grip Pull-Up', 'Pull-Ups'],
  ['Neutral-Grip Pull-Up', 'Pull-Ups'],
  ['Chest-to-Bar Pull-Up', 'Pull-Ups'],
  ['Pause Pull-Up', 'Pull-Ups'],
  // legs
  ['45-Degree Leg Press', 'Leg Press'],
  ['Horizontal Leg Press', 'Leg Press'],
  ['Wide-Stance Leg Press', 'Leg Press'],
  ['Narrow-Stance Leg Press', 'Leg Press'],
  ['Dumbbell Forward Lunge', 'Walking Lunges'],
  ['Deficit Reverse Lunge', 'Dumbbell Reverse Lunge'],
  // arms
  ['Barbell Drag Curl', 'Barbell Curls'],
  ['Barbell Reverse Curl', 'Barbell Curls'],
  ['Seated Dumbbell Curl', 'Dumbbell Curls'],
  ['Alternating Dumbbell Curl', 'Dumbbell Curls'],
  ['Concentration Curl', 'Dumbbell Curls'],
  ['Zottman Curl', 'Dumbbell Curls'],
  ['Dumbbell Spider Curl', 'Dumbbell Curls'],
  ['Cross-Body Hammer Curl', 'Hammer Curls'],
  ['Incline Hammer Curl', 'Hammer Curls'],
  ['EZ-Bar Cable Curl', 'Cable Curls'],
  ['Incline Skull Crusher', 'Skull Crushers'],
  ['Seated Dumbbell Overhead Extension', 'Overhead Tricep Extension'],
  ['Single-Arm Overhead Tricep Extension', 'Overhead Tricep Extension'],
  ['V-Bar Tricep Pushdown', 'Tricep Pushdowns'],
  ['Reverse-Grip Tricep Pushdown', 'Tricep Pushdowns'],
  // bodyweight
  ['Close-Grip Push-Up', 'Push-Ups'],
  ['Pause Push-Up', 'Push-Ups'],
]
