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
// From her two lists (`comprehensive_exercise_database.md`, `expanded_exercise_database_2000.md`): a first slice of 85
// written by hand, then the rest by rule and review. A name is added only when its parent is unambiguous.
//
// LOADED AFTER THE APP OPENS, never in the first download (near-copies-loader.ts): about 860 names would have pushed
// first paint past its budget, and nothing on the first screen needs them.
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
  ['Seated Rear Delt Fly', 'Rear Delt Flyes'],
  ['Chest-Supported Rear Delt Fly', 'Rear Delt Flyes'],
  // pull
  ['Pendlay Row', 'Barbell Rows'],
  ['Underhand Barbell Row', 'Barbell Rows'],
  ['Kroc Row', 'Dumbbell Rows'],
  ['Tripod Dumbbell Row', 'Dumbbell Rows'],
  ['Wide-Grip Pull-Up', 'Pull-Ups'],
  ['Neutral-Grip Pull-Up', 'Pull-Ups'],
  ['Chest-to-Bar Pull-Up', 'Pull-Ups'],
  ['Pause Pull-Up', 'Pull-Ups'],
  // legs
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
  ['Incline Skull Crusher', 'Skull Crushers'],
  ['Seated Dumbbell Overhead Extension', 'Overhead Tricep Extension'],
  ['Single-Arm Overhead Tricep Extension', 'Overhead Tricep Extension'],
  // bodyweight
  ['Close-Grip Push-Up', 'Push-Ups'],
  ['Pause Push-Up', 'Push-Ups'],
  // ---------------------------------------------------------------------------------------------------------------
  // THE REST OF HER TWO LISTS (4 Nov 2026, her "carry on with the rest of the near-copies"): 778 names, each matched to
  // its parent by a written rule and every group read by eye before it went in (the rules and the review are in
  // docs/plans/log-only-near-copies.md). Left out: cardio and sport drills, elite skills, strongman and specialty bars,
  // Olympic and jumping lifts, combination moves, kit the app does not ask about yet, and any name with no unambiguous
  // parent (336). Her names as she wrote them, so the search finds her words.
  // ---------------------------------------------------------------------------------------------------------------
  // Air Squat
  ["Air Squat (Bodyweight Squat)", "Air Squat"],
  ["Pause Bodyweight Squat", "Air Squat"],
  ["Air Squat (Bodyweight)", "Air Squat"],
  ["Pause Air Squat", "Air Squat"],
  // Archer Push-Ups
  ["Archer Push-Up", "Archer Push-Ups"],
  // Arnold Press
  ["Dumbbell Arnold Press (Seated)", "Arnold Press"],
  ["Dumbbell Arnold Press (Standing)", "Arnold Press"],
  ["Dumbbell Alternating Arnold Press", "Arnold Press"],
  // Assisted Dip Machine
  // Back Extension Machine
  ["Barbell Hyperextension (Weighted)", "Back Extension Machine"],
  ["Barbell Reverse Hyperextension (Weighted)", "Back Extension Machine"],
  ["Barbell Weighted Hyperextension", "Back Extension Machine"],
  ["Barbell Weighted Reverse Hyperextension", "Back Extension Machine"],
  ["Iso-Lateral Back Extension Machine", "Back Extension Machine"],
  ["Iso-Lateral Back Extension Plate-Loaded", "Back Extension Machine"],
  ["Hyperextension Bench Bodyweight", "Back Extension Machine"],
  // Band Curl
  ["Banded Bicep Curl", "Band Curl"],
  // Band Lat Pulldown
  ["Banded Lat Pulldown", "Band Lat Pulldown"],
  // Band Shoulder Press
  ["Banded Overhead Press", "Band Shoulder Press"],
  // Barbell Bench Press
  ["Barbell Flat Bench Press", "Barbell Bench Press"],
  ["Barbell Decline Bench Press", "Barbell Bench Press"],
  ["Barbell Paused Bench Press", "Barbell Bench Press"],
  ["Barbell Flat Bench Press (Touch and Go)", "Barbell Bench Press"],
  ["Barbell Paused Flat Bench Press (Competition Stop)", "Barbell Bench Press"],
  ["Barbell Decline Bench Press (15-Degree)", "Barbell Bench Press"],
  ["Barbell Decline Bench Press (30-Degree)", "Barbell Bench Press"],
  ["Barbell Soft-Touch Bench Press", "Barbell Bench Press"],
  // Barbell Curls
  ["Barbell Standing Bicep Curl", "Barbell Curls"],
  ["Barbell EZ-Bar Standing Curl", "Barbell Curls"],
  ["Barbell EZ-Bar Reverse Curl", "Barbell Curls"],
  // Barbell Reverse Lunge
  ["Barbell Split Squat", "Barbell Reverse Lunge"],
  ["Barbell Bulgarian Split Squat", "Barbell Reverse Lunge"],
  ["Barbell Forward Lunge", "Barbell Reverse Lunge"],
  ["Barbell Walking Lunge", "Barbell Reverse Lunge"],
  ["Barbell Curtsy Lunge", "Barbell Reverse Lunge"],
  ["Barbell Lateral Lunge", "Barbell Reverse Lunge"],
  ["Barbell Step-Up (Flat Bench)", "Barbell Reverse Lunge"],
  ["Barbell High Box Step-Up", "Barbell Reverse Lunge"],
  ["Barbell Deficit Reverse Lunge", "Barbell Reverse Lunge"],
  ["Barbell Overhead Walking Lunge", "Barbell Reverse Lunge"],
  ["Barbell Deficit Bulgarian Split Squat", "Barbell Reverse Lunge"],
  ["Barbell Step-Up (12-Inch Box)", "Barbell Reverse Lunge"],
  ["Barbell Step-Up (18-Inch Box)", "Barbell Reverse Lunge"],
  ["Barbell Step-Up (24-Inch Box)", "Barbell Reverse Lunge"],
  // Barbell Rows
  ["Barbell Incline Bench Row (Chest Supported)", "Barbell Rows"],
  ["Barbell Incline Chest-Supported Row", "Barbell Rows"],
  // Barbell Squats
  ["Barbell Back Squat (High Bar)", "Barbell Squats"],
  ["Barbell Back Squat (Low Bar)", "Barbell Squats"],
  ["Barbell Box Squat", "Barbell Squats"],
  ["Barbell Pause Squat", "Barbell Squats"],
  ["Barbell Tempo Squat (3-0-3-0)", "Barbell Squats"],
  ["Barbell Hack Squat (Behind the Back Barbell)", "Barbell Squats"],
  ["Barbell Cyclist Squat (Heels Elevated)", "Barbell Squats"],
  ["Barbell Box Squat (Parallel)", "Barbell Squats"],
  ["Barbell Box Squat (Below Parallel)", "Barbell Squats"],
  ["Barbell Box Squat (Above Parallel)", "Barbell Squats"],
  ["Barbell Pause Squat (2-Second Stop)", "Barbell Squats"],
  ["Barbell Pause Squat (3-Second Stop)", "Barbell Squats"],
  ["Barbell Tempo Squat (4-1-1-0)", "Barbell Squats"],
  ["Barbell Hack Squat (Rear Barbell Lift)", "Barbell Squats"],
  ["Barbell Cyclist Squat (15-Degree Heel Elevation)", "Barbell Squats"],
  ["Barbell Cyclist Squat (30-Degree Heel Elevation)", "Barbell Squats"],
  // Bayesian Cable Curl
  // Belt Squat
  // Bent-Over Dumbbell Row
  ["Dumbbell Two-Arm Bent-Over Row", "Bent-Over Dumbbell Row"],
  ["Dumbbell Bent-Over High Row", "Bent-Over Dumbbell Row"],
  ["Dumbbell Alternating Bent-Over Row", "Bent-Over Dumbbell Row"],
  ["Dumbbell Gorilla Row", "Bent-Over Dumbbell Row"],
  ["Dumbbell Scapular Row", "Bent-Over Dumbbell Row"],
  ["Dumbbell Pause Row (2-Second Compression)", "Bent-Over Dumbbell Row"],
  ["Dumbbell Slow Tempo Row", "Bent-Over Dumbbell Row"],
  ["Dumbbell Half-Kneeling Dual Row", "Bent-Over Dumbbell Row"],
  ["Dumbbell Curved Path Lat Row", "Bent-Over Dumbbell Row"],
  ["Dumbbell Unsupported Bent-Over Row", "Bent-Over Dumbbell Row"],
  ["Dumbbell Wide Stance Row", "Bent-Over Dumbbell Row"],
  ["Dumbbell Single-Leg Balance Row", "Bent-Over Dumbbell Row"],
  ["Dumbbell Deficit Bent-Over Row", "Bent-Over Dumbbell Row"],
  // Bulgarian Split Squats
  ["Dumbbell Bulgarian Split Squat", "Bulgarian Split Squats"],
  ["Dumbbell Deficit Bulgarian Split Squat", "Bulgarian Split Squats"],
  // Cable Crossover
  // Cable Crunch
  // Cable Curls
  // Cable Flyes
  // Cable Glute Kickback
  // Cable Lateral Raises
  // Cable Pull-Through
  // Cable Rear Delt Fly
  // Cable Rope Hammer Curl
  // Cable Shrug
  // Calf Raises (Bodyweight)
  ["Calf Raise (Standing Single-Leg)", "Calf Raises (Bodyweight)"],
  ["Calf Raise (Standing Two-Leg)", "Calf Raises (Bodyweight)"],
  ["Standing Calf Raise Slow Tempo", "Calf Raises (Bodyweight)"],
  ["Standing Single-Leg Calf Raise", "Calf Raises (Bodyweight)"],
  ["Standing Two-Leg Calf Raise", "Calf Raises (Bodyweight)"],
  // Chair Dips
  ["Bench Dips", "Chair Dips"],
  // Chest Dips
  ["Parallel Bar Dips", "Chest Dips"],
  ["Straight Bar Dips", "Chest Dips"],
  // Chest Press Machine
  // Chest-Supported Row
  ["Dumbbell Chest-Supported Row (Incline Bench)", "Chest-Supported Row"],
  ["Dumbbell Supinated Chest-Supported Row", "Chest-Supported Row"],
  ["Dumbbell Incline Alternating Row", "Chest-Supported Row"],
  ["Dumbbell High Row (Chest Supported)", "Chest-Supported Row"],
  ["Dumbbell Low Row (Chest Supported)", "Chest-Supported Row"],
  ["Dumbbell Single-Arm Chest-Supported Row", "Chest-Supported Row"],
  // Chin-Ups
  ["Chin-Up (Underhand / Supinated)", "Chin-Ups"],
  // Close-Grip Lat Pulldown
  // Deadlifts
  ["Barbell Conventional Deadlift", "Deadlifts"],
  ["Barbell Semi-Sumo / Hybrid Deadlift", "Deadlifts"],
  ["Barbell Paused Deadlift", "Deadlifts"],
  ["Barbell Suitcase Deadlift", "Deadlifts"],
  ["Barbell Reeves Deadlift", "Deadlifts"],
  ["Barbell Continental Deadlift", "Deadlifts"],
  ["Barbell Paused Deadlift (Off Floor)", "Deadlifts"],
  ["Barbell Paused Deadlift (At Knee)", "Deadlifts"],
  // Deficit Push-Ups
  ["Decline Push-Up (Feet Elevated)", "Deficit Push-Ups"],
  // Dumbbell Bench Press
  ["Dumbbell Flat Bench Press", "Dumbbell Bench Press"],
  ["Dumbbell Decline Bench Press", "Dumbbell Bench Press"],
  ["Dumbbell Alternating Flat Press", "Dumbbell Bench Press"],
  ["Dumbbell Flat Bench Press with Pause", "Dumbbell Bench Press"],
  ["Dumbbell Decline Bench Press (15-Degree)", "Dumbbell Bench Press"],
  ["Dumbbell Decline Bench Press (30-Degree)", "Dumbbell Bench Press"],
  ["Dumbbell Alternating Decline Press", "Dumbbell Bench Press"],
  ["Dumbbell Bridge Chest Press", "Dumbbell Bench Press"],
  ["Dumbbell Single-Leg Flat Press (Core Focus)", "Dumbbell Bench Press"],
  ["Dumbbell Bench Press with Legs Raised", "Dumbbell Bench Press"],
  // Dumbbell Curls
  ["Dumbbell Standing Bicep Curl (Alternating)", "Dumbbell Curls"],
  ["Dumbbell Seated Bicep Curl", "Dumbbell Curls"],
  ["Dumbbell Preacher Curl (Single-Arm)", "Dumbbell Curls"],
  ["Dumbbell Preacher Curl (Two-Arm)", "Dumbbell Curls"],
  ["Dumbbell Concentration Curl", "Dumbbell Curls"],
  ["Dumbbell Reverse Curl", "Dumbbell Curls"],
  ["Dumbbell Standing Bicep Curl (Dual)", "Dumbbell Curls"],
  ["Dumbbell Single-Arm Preacher Curl", "Dumbbell Curls"],
  ["Dumbbell Two-Arm Preacher Curl", "Dumbbell Curls"],
  ["Dumbbell Waiter Curl", "Dumbbell Curls"],
  ["Dumbbell Wide Curl", "Dumbbell Curls"],
  ["Dumbbell Outer-Head Bicep Curl", "Dumbbell Curls"],
  ["Dumbbell Inner-Head Bicep Curl", "Dumbbell Curls"],
  ["Dumbbell Standing Supinated Curl with Pause", "Dumbbell Curls"],
  // Dumbbell Floor Press
  ["Dumbbell Single-Arm Floor Press", "Dumbbell Floor Press"],
  ["Dumbbell Alternating Floor Press", "Dumbbell Floor Press"],
  ["Dumbbell Deadstop Floor Press", "Dumbbell Floor Press"],
  // Dumbbell Flyes
  ["Dumbbell Flat Chest Fly", "Dumbbell Flyes"],
  ["Dumbbell Incline Chest Fly", "Dumbbell Flyes"],
  ["Dumbbell Decline Chest Fly", "Dumbbell Flyes"],
  ["Dumbbell Standing Chest Fly (Low-to-High)", "Dumbbell Flyes"],
  ["Dumbbell Standing Low-to-High Chest Fly", "Dumbbell Flyes"],
  ["Dumbbell Single-Arm Incline Fly", "Dumbbell Flyes"],
  ["Dumbbell Single-Arm Flat Fly", "Dumbbell Flyes"],
  ["Dumbbell Decline Fly with Pause", "Dumbbell Flyes"],
  ["Dumbbell Alternating Incline Fly", "Dumbbell Flyes"],
  ["Dumbbell Standing Chest Fly (Mid Height)", "Dumbbell Flyes"],
  ["Dumbbell Wide Flat Fly", "Dumbbell Flyes"],
  // Dumbbell Front Squat
  ["Dumbbell Double Front Squat", "Dumbbell Front Squat"],
  // Dumbbell Hip Thrust
  ["Dumbbell Single-Leg Hip Thrust", "Dumbbell Hip Thrust"],
  ["Dumbbell Elevated Single-Leg Hip Thrust", "Dumbbell Hip Thrust"],
  ["Dumbbell B-Stance Hip Thrust", "Dumbbell Hip Thrust"],
  ["Dumbbell Glute Bridge", "Dumbbell Hip Thrust"],
  ["Dumbbell Single-Leg Glute Bridge", "Dumbbell Hip Thrust"],
  // Dumbbell Lateral Lunge
  ["Dumbbell Side / Lateral Lunge", "Dumbbell Lateral Lunge"],
  // Dumbbell Leg Curl
  ["Dumbbell Hamstring Curl (Held between feet)", "Dumbbell Leg Curl"],
  ["Dumbbell Hamstring Curl (Between Feet)", "Dumbbell Leg Curl"],
  // Dumbbell Pullover
  ["Dumbbell Straight-Arm Pullover (Chest focus)", "Dumbbell Pullover"],
  ["Dumbbell Pullover (Lat Focus)", "Dumbbell Pullover"],
  ["Dumbbell Single-Arm Pullover", "Dumbbell Pullover"],
  ["Dumbbell Bench-Supported Pullover", "Dumbbell Pullover"],
  // Dumbbell Reverse Lunge
  ["Dumbbell Curtsy Lunge", "Dumbbell Reverse Lunge"],
  ["Dumbbell Deficit Lunge", "Dumbbell Reverse Lunge"],
  ["Dumbbell Clock Lunge", "Dumbbell Reverse Lunge"],
  ["Dumbbell Deficit Forward Lunge", "Dumbbell Reverse Lunge"],
  ["Dumbbell Deficit Reverse Lunge", "Dumbbell Reverse Lunge"],
  // Dumbbell Rows
  ["Dumbbell Single-Arm Row (Knee on Bench)", "Dumbbell Rows"],
  ["Dumbbell Single-Arm Row (Standing Support)", "Dumbbell Rows"],
  ["Dumbbell Single-Leg Single-Arm Row", "Dumbbell Rows"],
  ["Dumbbell Single-Arm Row (Standing Bench Support)", "Dumbbell Rows"],
  ["Dumbbell Underhand Single-Arm Row", "Dumbbell Rows"],
  ["Dumbbell Deadstop Single-Arm Row", "Dumbbell Rows"],
  ["Dumbbell Rotational Single-Arm Row", "Dumbbell Rows"],
  ["Dumbbell Half-Kneeling Single-Arm Row", "Dumbbell Rows"],
  ["Dumbbell Tall-Kneeling Single-Arm Row", "Dumbbell Rows"],
  // Dumbbell Shoulder Press
  ["Dumbbell Seated Shoulder Press", "Dumbbell Shoulder Press"],
  ["Dumbbell Standing Overhead Press", "Dumbbell Shoulder Press"],
  ["Dumbbell Single-Arm Overhead Press", "Dumbbell Shoulder Press"],
  ["Dumbbell Single-Arm Push Press", "Dumbbell Shoulder Press"],
  ["Dumbbell Dual Push Press", "Dumbbell Shoulder Press"],
  ["Dumbbell Half-Kneeling Overhead Press", "Dumbbell Shoulder Press"],
  ["Dumbbell Tall-Kneeling Overhead Press", "Dumbbell Shoulder Press"],
  ["Dumbbell Alternating Overhead Press", "Dumbbell Shoulder Press"],
  // Dumbbell Shrugs
  ["Dumbbell Shrug", "Dumbbell Shrugs"],
  ["Dumbbell Incline Shrug", "Dumbbell Shrugs"],
  ["Dumbbell Seated Shrug", "Dumbbell Shrugs"],
  ["Dumbbell Behind-the-Back Shrug", "Dumbbell Shrugs"],
  ["Dumbbell Single-Arm Shrug", "Dumbbell Shrugs"],
  // Dumbbell Squeeze Press
  ["Dumbbell Squeeze Press (Hex Press)", "Dumbbell Squeeze Press"],
  ["Dumbbell Incline Squeeze Press", "Dumbbell Squeeze Press"],
  ["Dumbbell Squeeze Press (Hex Press Flat)", "Dumbbell Squeeze Press"],
  ["Dumbbell Decline Squeeze Press", "Dumbbell Squeeze Press"],
  ["Dumbbell Floor Squeeze Press", "Dumbbell Squeeze Press"],
  ["Dumbbell Incline Squeeze Fly", "Dumbbell Squeeze Press"],
  // Dumbbell Tricep Kickback
  ["Dumbbell Triceps Kickback", "Dumbbell Tricep Kickback"],
  ["Dumbbell Single-Arm Kickback (Chest Supported)", "Dumbbell Tricep Kickback"],
  ["Dumbbell Overhead Kickback", "Dumbbell Tricep Kickback"],
  ["Dumbbell Bench-Supported Kickback", "Dumbbell Tricep Kickback"],
  ["Dumbbell Pronated Kickback", "Dumbbell Tricep Kickback"],
  // Face Pulls
  // Front Raises
  ["Dumbbell Front Raise (Pronated)", "Front Raises"],
  ["Dumbbell Alternating Front Raise", "Front Raises"],
  ["Dumbbell Incline Front Raise", "Front Raises"],
  ["Dumbbell Single-Arm Front Raise", "Front Raises"],
  // Front Squat
  ["Barbell Front Squat (Crossed Arms)", "Front Squat"],
  // Glute Kickback Machine
  // Goblet Squats
  ["Dumbbell Goblet Squat", "Goblet Squats"],
  ["Dumbbell Goblet Lateral Lunge", "Goblet Squats"],
  ["Kettlebell Goblet Squat", "Goblet Squats"],
  ["Dumbbell Goblet Squat (Heels Elevated)", "Goblet Squats"],
  ["Dumbbell Single-Arm Goblet Lunge", "Goblet Squats"],
  ["Dumbbell Paused Goblet Squat", "Goblet Squats"],
  ["Dumbbell Tempo Goblet Squat", "Goblet Squats"],
  ["Dumbbell Goblet Box Squat", "Goblet Squats"],
  // Good Mornings
  ["Barbell Good Morning", "Good Mornings"],
  ["Barbell Seated Good Morning", "Good Mornings"],
  // Hack Squat
  // Hammer Curls
  ["Dumbbell Standing Hammer Curl", "Hammer Curls"],
  ["Dumbbell Incline Hammer Curl", "Hammer Curls"],
  ["Dumbbell Cross-Body Hammer Curl", "Hammer Curls"],
  ["Dumbbell Preacher Hammer Curl", "Hammer Curls"],
  ["Dumbbell Seated Hammer Curl", "Hammer Curls"],
  ["Dumbbell Seated Concentration Hammer Curl", "Hammer Curls"],
  ["Dumbbell Standing Alternating Hammer Curl", "Hammer Curls"],
  // Hanging Leg Raises
  ["Hanging Knee Raise", "Hanging Leg Raises"],
  ["Hanging Straight Leg Raise", "Hanging Leg Raises"],
  ["Knees-to-Elbows (K2E)", "Hanging Leg Raises"],
  ["Captain's Chair Knee Raise", "Hanging Leg Raises"],
  ["Captain's Chair Leg Raise", "Hanging Leg Raises"],
  ["Hanging Single-Leg Raise", "Hanging Leg Raises"],
  ["Hanging Alternating Knee Raise", "Hanging Leg Raises"],
  ["Hanging Oblique Knee Raise", "Hanging Leg Raises"],
  ["Hanging Oblique Leg Raise", "Hanging Leg Raises"],
  ["Captain's Chair Single-Leg Raise", "Hanging Leg Raises"],
  // Hip Abduction Machine
  ["Abduction Machine (Iso-Lateral)", "Hip Abduction Machine"],
  // Hip Adduction Machine
  ["Adduction Machine (Iso-Lateral)", "Hip Adduction Machine"],
  // Hip Thrust
  ["Barbell Hip Thrust", "Hip Thrust"],
  ["Barbell Single-Leg Hip Thrust", "Hip Thrust"],
  ["Barbell Single-Leg Glute Bridge", "Hip Thrust"],
  // Incline Barbell Bench Press
  ["Barbell Incline Bench Press (30 Degree)", "Incline Barbell Bench Press"],
  ["Barbell Incline Bench Press (45 Degree)", "Incline Barbell Bench Press"],
  ["Barbell Incline Floor Press", "Incline Barbell Bench Press"],
  ["Barbell Incline Bench Press (15-Degree)", "Incline Barbell Bench Press"],
  ["Barbell Incline Bench Press (60-Degree)", "Incline Barbell Bench Press"],
  ["Barbell Paused Incline Bench Press", "Incline Barbell Bench Press"],
  // Incline Dumbbell Curls
  ["Dumbbell Incline Bicep Curl", "Incline Dumbbell Curls"],
  ["Dumbbell Incline Inner Bicep Curl", "Incline Dumbbell Curls"],
  ["Dumbbell Incline Reverse Curl", "Incline Dumbbell Curls"],
  // Incline Dumbbell Press
  ["Dumbbell Incline Press (15 Degree)", "Incline Dumbbell Press"],
  ["Dumbbell Incline Press (30 Degree)", "Incline Dumbbell Press"],
  ["Dumbbell Incline Press (45 Degree)", "Incline Dumbbell Press"],
  ["Dumbbell Incline Press (60 Degree)", "Incline Dumbbell Press"],
  ["Dumbbell Single-Arm Incline Press", "Incline Dumbbell Press"],
  ["Dumbbell Alternating Incline Press", "Incline Dumbbell Press"],
  ["Dumbbell Incline Chest Press with Rotation", "Incline Dumbbell Press"],
  // Incline Machine Press
  // Incline Push-Ups
  ["Incline Push-Up (Hands Elevated)", "Incline Push-Ups"],
  // Inverted Row
  ["Inverted Row (Australian Pull-Up)", "Inverted Row"],
  ["Elevated Feet Inverted Row", "Inverted Row"],
  ["Single-Leg Inverted Row", "Inverted Row"],
  ["Wide Inverted Row", "Inverted Row"],
  ["Underhand Inverted Row", "Inverted Row"],
  ["Archer Inverted Row", "Inverted Row"],
  // Iso-Lateral High Row
  // Iso-Lateral Kneeling Leg Curl
  // Iso-Lateral Pulldown
  // Kettlebell Swing (Heavy)
  ["Russian Kettlebell Swing (Eye Level)", "Kettlebell Swing (Heavy)"],
  ["American Kettlebell Swing (Overhead)", "Kettlebell Swing (Heavy)"],
  ["Single-Arm Kettlebell Swing", "Kettlebell Swing (Heavy)"],
  ["Alternating Kettlebell Swing", "Kettlebell Swing (Heavy)"],
  ["Double Kettlebell Swing", "Kettlebell Swing (Heavy)"],
  ["Kettlebell Banded Swing", "Kettlebell Swing (Heavy)"],
  // Lat Pulldown
  // Lateral Raises
  ["Dumbbell Standing Lateral Raise", "Lateral Raises"],
  ["Dumbbell Seated Lateral Raise", "Lateral Raises"],
  ["Dumbbell Lean-Away Lateral Raise", "Lateral Raises"],
  ["Dumbbell Incline Bench Lateral Raise (Chest Supported)", "Lateral Raises"],
  ["Dumbbell Incline Bench Side-Lying Lateral Raise", "Lateral Raises"],
  ["Dumbbell Side-Lying Lateral Raise (Incline Bench)", "Lateral Raises"],
  ["Dumbbell Single-Arm Lateral Raise", "Lateral Raises"],
  ["Dumbbell Alternating Lateral Raise", "Lateral Raises"],
  ["Dumbbell Full Circle Lateral Raise", "Lateral Raises"],
  // Leg Extensions
  // Leg Press
  // Leg Press Calf Raise
  // Lying Dumbbell Tricep Extension
  ["Dumbbell Lying Triceps Extension (Skull Crusher)", "Lying Dumbbell Tricep Extension"],
  ["Dumbbell Incline Triceps Extension", "Lying Dumbbell Tricep Extension"],
  ["Dumbbell Lying Hammer Extension", "Lying Dumbbell Tricep Extension"],
  ["Dumbbell Decline Triceps Extension", "Lying Dumbbell Tricep Extension"],
  ["Dumbbell Single-Arm Skull Crusher", "Lying Dumbbell Tricep Extension"],
  ["Dumbbell Lying Supinated Triceps Extension", "Lying Dumbbell Tricep Extension"],
  // Lying Leg Curl
  // Machine Hip Thrust
  ["Hip Thrust Machine (Iso-Lateral)", "Machine Hip Thrust"],
  // Machine Lateral Raise
  // Machine Preacher Curl
  // Machine Shrug
  // Machine Tricep Extension
  // Overhead Carry
  ["Kettlebell Overhead Carry (Waiter's)", "Overhead Carry"],
  // Overhead Press
  ["Barbell Overhead Press (OHP / Standing Military Press)", "Overhead Press"],
  ["Barbell Seated Overhead Press (With Back Support)", "Overhead Press"],
  ["Barbell Seated Overhead Press (No Back Support)", "Overhead Press"],
  ["Barbell Push Press", "Overhead Press"],
  ["Barbell Standing Overhead Press (OHP)", "Overhead Press"],
  ["Barbell Strict Military Press", "Overhead Press"],
  ["Barbell Standing Push Press", "Overhead Press"],
  ["Barbell Half-Kneeling Overhead Press", "Overhead Press"],
  ["Barbell Tall-Kneeling Overhead Press", "Overhead Press"],
  // Overhead Tricep Extension
  ["Dumbbell Standing Overhead Triceps Extension", "Overhead Tricep Extension"],
  ["Dumbbell Seated Two-Arm Overhead Extension", "Overhead Tricep Extension"],
  ["Dumbbell Single-Arm Overhead Triceps Extension", "Overhead Tricep Extension"],
  // Pallof Press
  ["Banded Pallof Press", "Pallof Press"],
  // Pec Deck Machine
  // Pike Push-Ups
  ["Pike Push-Up", "Pike Push-Ups"],
  ["Elevated Pike Push-Up", "Pike Push-Ups"],
  // Plank
  ["Standard Elbow Plank", "Plank"],
  ["High Push-Up Plank", "Plank"],
  ["Plank Shoulder Tap", "Plank"],
  ["Plank Arm Reach", "Plank"],
  ["Plank Leg Lift", "Plank"],
  ["Plank Arm-Leg Cross Lift", "Plank"],
  // Preacher Curl (EZ bar)
  ["Barbell Preacher Curl", "Preacher Curl (EZ bar)"],
  ["Barbell Preacher Curl (Standard Bar)", "Preacher Curl (EZ bar)"],
  ["Barbell EZ-Bar Preacher Curl", "Preacher Curl (EZ bar)"],
  ["Barbell EZ-Bar Preacher Reverse Curl", "Preacher Curl (EZ bar)"],
  // Pull-Ups
  ["Strict Overhand Pull-Up", "Pull-Ups"],
  ["Archer Pull-Up", "Pull-Ups"],
  ["Commando Pull-Up (Parallel Bar)", "Pull-Ups"],
  // Push-Ups
  ["Standard Push-Up", "Push-Ups"],
  ["Superman Push-Up", "Push-Ups"],
  ["Hindu Push-Up", "Push-Ups"],
  ["Divebomber Push-Up", "Push-Ups"],
  ["Staggered Hands Push-Up", "Push-Ups"],
  ["Cobra Push-Up", "Push-Ups"],
  ["Standard Floor Push-Up", "Push-Ups"],
  ["Incline Diamond Push-Up", "Push-Ups"],
  ["Decline Diamond Push-Up", "Push-Ups"],
  // Rear Delt Flyes
  ["Dumbbell Rear Delt Fly (Bent-Over Standing)", "Rear Delt Flyes"],
  ["Dumbbell Rear Delt Fly (Seated Bent-Over)", "Rear Delt Flyes"],
  ["Dumbbell Rear Delt Fly (Chest-Supported Incline)", "Rear Delt Flyes"],
  ["Dumbbell Rear Delt Row", "Rear Delt Flyes"],
  ["Dumbbell Single-Arm Rear Delt Fly", "Rear Delt Flyes"],
  ["Dumbbell Seated Rear Delt Row", "Rear Delt Flyes"],
  // Renegade Row
  ["Dumbbell Renegade Row", "Renegade Row"],
  ["Dumbbell Elevated Plank Row", "Renegade Row"],
  ["Dumbbell Side-Plank Row", "Renegade Row"],
  ["Dumbbell Bird-Dog Row", "Renegade Row"],
  // Reverse Hyper Machine
  ["Reverse Hyper Single-Leg", "Reverse Hyper Machine"],
  ["Single-Leg Reverse Hyper Machine", "Reverse Hyper Machine"],
  ["Reverse Hyper Bodyweight", "Reverse Hyper Machine"],
  ["Single-Leg Reverse Hyper Bodyweight", "Reverse Hyper Machine"],
  // Reverse Pec Deck
  // Romanian Deadlifts
  ["Barbell Romanian Deadlift (RDL)", "Romanian Deadlifts"],
  ["Barbell Stiff-Legged Deadlift", "Romanian Deadlifts"],
  ["Dumbbell Romanian Deadlift (RDL)", "Romanian Deadlifts"],
  ["Dumbbell Stiff-Legged Deadlift", "Romanian Deadlifts"],
  ["Barbell Paused Romanian Deadlift", "Romanian Deadlifts"],
  ["Barbell Elevated Heel Romanian Deadlift", "Romanian Deadlifts"],
  ["Dumbbell B-Stance Romanian Deadlift", "Romanian Deadlifts"],
  ["Dumbbell Good Morning", "Romanian Deadlifts"],
  ["Dumbbell Seated Good Morning", "Romanian Deadlifts"],
  // Rope Tricep Pushdown
  // Rotary Torso Machine
  // Russian Twist
  ["Russian Twist (Bodyweight)", "Russian Twist"],
  ["Medicine Ball Russian Twist", "Russian Twist"],
  ["Bodyweight Russian Twist", "Russian Twist"],
  // Scapular Pull-Ups
  ["Scapular Pull-Up", "Scapular Pull-Ups"],
  // Seated Cable Row
  // Seated Calf Raises
  // Seated Dip Machine
  // Seated Leg Curl
  // Seated Machine Row
  // Shoulder Press Machine
  // Shrugs
  ["Barbell Scapular Shrug", "Shrugs"],
  ["Barbell Standard Shrug (Front)", "Shrugs"],
  ["Barbell Behind-the-Back Shrug", "Shrugs"],
  ["Barbell Overhead Shrug", "Shrugs"],
  // Side Plank
  ["Side Plank (Elbow)", "Side Plank"],
  ["Side Plank (Hand)", "Side Plank"],
  ["Elevated Side Plank", "Side Plank"],
  ["Side Plank Leg Lift", "Side Plank"],
  ["Side-Plank Thread-the-Needle", "Side Plank"],
  // Single-Arm Cable Row
  // Single-Arm Dumbbell Bench Press
  ["Dumbbell Single-Arm Flat Press", "Single-Arm Dumbbell Bench Press"],
  ["Dumbbell Single-Arm Decline Press", "Single-Arm Dumbbell Bench Press"],
  // Single-Arm Lat Pulldown
  // Single-Leg Dumbbell Calf Raise
  ["Dumbbell Calf Raise (Single-Leg)", "Single-Leg Dumbbell Calf Raise"],
  ["Dumbbell Seated Calf Raise (Weighted Knees)", "Single-Leg Dumbbell Calf Raise"],
  ["Dumbbell Standing Calf Raise (Dual)", "Single-Leg Dumbbell Calf Raise"],
  ["Dumbbell Standing Single-Leg Calf Raise", "Single-Leg Dumbbell Calf Raise"],
  ["Dumbbell Seated Calf Raise", "Single-Leg Dumbbell Calf Raise"],
  ["Dumbbell Donkey Calf Raise", "Single-Leg Dumbbell Calf Raise"],
  ["Dumbbell Pause Calf Raise", "Single-Leg Dumbbell Calf Raise"],
  // Single-Leg Dumbbell RDL
  ["Dumbbell Single-Leg RDL", "Single-Leg Dumbbell RDL"],
  ["Dumbbell Single-Leg Romanian Deadlift (Supported)", "Single-Leg Dumbbell RDL"],
  ["Dumbbell Single-Leg Stiff-Legged Deadlift", "Single-Leg Dumbbell RDL"],
  ["Dumbbell Single-Leg Good Morning", "Single-Leg Dumbbell RDL"],
  // Single-Leg Glute Bridge
  ["Elevated Single-Leg Glute Bridge", "Single-Leg Glute Bridge"],
  // Single-Leg Leg Extension
  // Single-Leg Leg Press
  // Single-Leg RDL (Bodyweight)
  ["Single-Leg RDL Reach Bodyweight", "Single-Leg RDL (Bodyweight)"],
  // Skull Crushers
  ["Barbell Lying Triceps Extension (Skull Crusher)", "Skull Crushers"],
  ["Barbell Incline Triceps Extension", "Skull Crushers"],
  ["Barbell Overhead Triceps Extension (Standing)", "Skull Crushers"],
  ["Barbell Overhead Triceps Extension (Seated)", "Skull Crushers"],
  ["Barbell Standing Overhead Triceps Extension", "Skull Crushers"],
  ["Barbell Seated Overhead Triceps Extension", "Skull Crushers"],
  ["Barbell Declined Lying Triceps Extension", "Skull Crushers"],
  ["Barbell Pronated Triceps Extension", "Skull Crushers"],
  ["Barbell EZ-Bar Lying Extension", "Skull Crushers"],
  ["Barbell EZ-Bar Overhead Extension", "Skull Crushers"],
  ["Barbell Rollover Triceps Extension", "Skull Crushers"],
  // Smith Machine Bench Press
  ["Smith Machine Flat Bench (Iso-Lateral Motion)", "Smith Machine Bench Press"],
  ["Smith Machine Incline Bench (Iso-Lateral Motion)", "Smith Machine Bench Press"],
  // Smith Machine Shoulder Press
  ["Smith Machine Single-Arm Overhead Press", "Smith Machine Shoulder Press"],
  // Smith Machine Split Squat
  // Smith Machine Squat
  // Split Squat (Bodyweight)
  ["Alternating Forward Lunge", "Split Squat (Bodyweight)"],
  ["Alternating Reverse Lunge", "Split Squat (Bodyweight)"],
  ["Curtsy Lunge", "Split Squat (Bodyweight)"],
  // Standing Calf Raise Machine
  ["Single-Leg Standing Calf Machine", "Standing Calf Raise Machine"],
  ["Iso-Lateral Standing Calf Raise", "Standing Calf Raise Machine"],
  ["Calf Raise Machine (Iso-Lateral)", "Standing Calf Raise Machine"],
  // Step-Ups
  ["Dumbbell Step-Up (Flat Bench)", "Step-Ups"],
  ["Dumbbell High Box Step-Up", "Step-Ups"],
  ["Dumbbell Single-Arm Step-Up", "Step-Ups"],
  ["Dumbbell Lateral Step-Up", "Step-Ups"],
  ["Dumbbell Crossover Step-Up", "Step-Ups"],
  // Step-Ups (Bodyweight)
  ["Step-Up (Bodyweight)", "Step-Ups (Bodyweight)"],
  ["Lateral Step-Up", "Step-Ups (Bodyweight)"],
  ["High Box Step-Up Bodyweight", "Step-Ups (Bodyweight)"],
  ["Lateral Step-Up Bodyweight", "Step-Ups (Bodyweight)"],
  ["Crossover Step-Up Bodyweight", "Step-Ups (Bodyweight)"],
  // Straight-Arm Pulldown
  // Suitcase Carry
  ["Kettlebell Suitcase Carry", "Suitcase Carry"],
  // Suitcase Deadlift
  ["Dumbbell Suitcase Deadlift", "Suitcase Deadlift"],
  // Sumo Deadlift
  ["Barbell Sumo Deadlift", "Sumo Deadlift"],
  // T-Bar Row Machine
  ["T-Bar Row Machine (Single-Arm)", "T-Bar Row Machine"],
  // Tricep Pushdowns
  // Walking Lunges
  ["Dumbbell Walking Lunge", "Walking Lunges"],
  ["Walking Lunge", "Walking Lunges"],
]
