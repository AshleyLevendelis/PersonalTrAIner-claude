import { TrainingStyle, type TrainingExperience } from './types'
import { isRegressionFor } from './periodization'

export type MovementPattern =
  | 'horizontal_push'
  | 'horizontal_pull'
  | 'vertical_push'
  | 'vertical_pull'
  | 'hip_hinge'
  | 'knee_dominant'
  | 'single_leg'
  | 'carry'
  | 'isolation_bicep'
  | 'isolation_tricep'
  | 'isolation_shoulder'
  // Upper-trap work (shrugs) — scapular ELEVATION, which is functionally a
  // pulling movement. Split out of 'isolation_shoulder', where it sat
  // alongside lateral raises and let a shrug fill a push day's shoulder
  // accessory slot: measured, 31 of 59 shrug placements landed on a pressing
  // day. The file already knew the tag was wrong — load-prescription.ts's
  // categorize() has carried a name-matched `shrug` special case, and a
  // comment explaining it, for as long as both have shared this pattern
  // ("shrugs track deadlift; lateral raises track bench"). That workaround
  // fixed the WEIGHT and never the placement.
  | 'isolation_trap'
  | 'isolation_quad'
  | 'isolation_hamstring'
  | 'isolation_calf'
  | 'cardio'
  | 'core'
  | 'activation'

/**
 * DEFINITION — angle_vector tracks TORSO ORIENTATION, not the implement's
 * literal path through the room. 'horizontal' = torso lying flat/prone
 * (flat bench, push-ups). 'diagonal' = torso pitched ~30-60° from vertical
 * (incline press, a standing hip-hinge with real forward lean). 'vertical'
 * = torso upright/axial (overhead press, dips) OR, for floor-based work
 * with no meaningful torso angle at all (Glute Bridge), the direction the
 * load/hips travel instead — the same fallback dips/overhead-press use for
 * axial movement.
 *
 * The disambiguator that settles it: a flat bench press moves the bar
 * VERTICALLY in room coordinates, yet it's 'horizontal' — because the
 * torso is lying flat. Load path alone doesn't explain that; torso
 * orientation does, consistently, across every pressing entry in this
 * file. Applied to hip-hinge: any standing hinge with real forward lean
 * (Deadlifts, Trap Bar Deadlift, Romanian Deadlifts, Kettlebell Swing
 * Heavy) is 'diagonal', not 'vertical' — none of them have an upright
 * torso. Only Good Morning/Bodyweight Good Morning earn 'horizontal'
 * (explicit "torso parallel to floor" form cue). Glute Bridge stays
 * 'vertical' as the floor-based exception described above.
 */
export type AngleVector = 'horizontal' | 'vertical' | 'diagonal' | 'rotational' | 'anti_extension' | 'anti_rotation' | 'lateral' | 'none'

export type MechanicsTier = 'tier1_compound' | 'tier2_compound' | 'tier3_isolation' | 'cardio' | 'primer'

/**
 * How this exercise is actually dosed — distinct from movement_pattern
 * (which describes the MOVEMENT, not the unit it's prescribed in). Two
 * exercises can share a movement_pattern (Farmer Squat Hold and Farmer's
 * Walk are both 'carry') while needing entirely different units (a hold has
 * no distance; a walk has no meaningful "30-45s" — it just walks until the
 * distance is covered). Getting this wrong is how an isometric hold ends up
 * prescribed in meters and a dynamic ab exercise ends up prescribed as a
 * timed hold — both real bugs an LLM coach review caught.
 *
 *  - 'reps'          strength/isolation work: N sets x rep range
 *  - 'time'          isometric/controlled-continuous holds: N sets x duration
 *  - 'distance_load' loaded carries: N sets x distance, with an explicit kg load
 *  - 'intervals'     conditioning modalities: rounds x work:rest, never a rep count
 *  - 'steady_state'  continuous machine cardio: one unbroken block, no rounds and
 *                    no rest — added after Elliptical was found sharing 'intervals'
 *                    despite having no interval structure at all (no rounds, no
 *                    work:rest split); see fixedUnitPrescription's 'steady_state'
 *                    case for how its single duration is sized.
 */
export type PrescriptionType = 'reps' | 'time' | 'distance_load' | 'intervals' | 'steady_state'

/**
 * A hard capability gate distinct from SKILL_DEMAND's generic ceiling
 * (experience-config.ts). SKILL_DEMAND's 3-level 'low'/'moderate'/'high'
 * ceiling can't express "novice ceiling is 'high', but Archer Push-Ups and
 * Pistol Squats — both genuinely 'high' — still shouldn't reach a novice."
 * capability_requirement is a specific minimum tier per exercise, checked in
 * addition to (not instead of) the general skill-demand ceiling, with a
 * named regression so a beginner/novice below the gate has somewhere to
 * land instead of the pattern just disappearing. An LLM coach review caught
 * this directly: a novice handed 5-7 sets of unassisted pull-ups, archer
 * push-ups, and pistol squats, none of which most novices can perform for a
 * single clean rep.
 */
export interface CapabilityRequirement {
  minExperience: TrainingExperience
  /** The exercise name selection should substitute for anyone below minExperience. */
  regression: string
}

export interface ExerciseEntry {
  name: string
  /**
   * Stable identity key for logging and history (C0 Part 2). Every log row
   * carries this so a future rename of `name` can't sever a trainee's
   * history (discovery landmine L7). Always the slug of the name at the time
   * the entry was added — verified collision-free across the database; if a
   * future entry's slug collides, hand-dedupe it here (the literal wins over
   * the slugifier, which is why these are written out rather than computed).
   */
  id: string
  movement_pattern: MovementPattern
  mechanics_tier: MechanicsTier
  prescription_type: PrescriptionType
  angle_vector: AngleVector
  primary_muscles: string[]
  equipment: string[]
  /**
   * When true, `equipment` lists INTERCHANGEABLE implements — having any
   * ONE of them is enough (T-Bar Rows: "straddle bar or use landmine").
   * Absent/false (the default, and every entry's historical behaviour)
   * means every listed item is required together (Barbell Bench Press
   * genuinely needs both a barbell AND a bench). Getting this wrong in
   * either direction is real: treating an AND entry as OR would offer
   * Barbell Bench Press to someone with a bench and no barbell; treating
   * an OR entry as AND (the bug this field fixes) hides Goblet Squats from
   * anyone who owns a kettlebell but not a dumbbell. Read by
   * isEquipmentAllowed/stageEquipmentFilter (exercise-plan.ts), nowhere
   * else — every other equipment check goes through those two.
   */
  equipment_alternatives?: boolean
  joint_stress: 'low' | 'moderate' | 'high'
  form_cues: string[]
  coach_note_swap?: string
  /**
   * Which joints this movement LOADS — i.e. participates. This is an
   * anatomical fact, not a safety verdict.
   *
   * It used to be both: the injury filter excluded anything whose
   * loads_joints matched an injured joint, which conflated "this joint
   * participates" with "this is dangerous for that injury." They are
   * different questions, and conflating them made the filter blunt enough
   * to remove rotator-cuff REHAB movements from a user with a rotator-cuff
   * injury (Band Pull-Aparts, Wall Slides, Prone Y-T Raises...). See
   * contraindicated_joints / indicated_joints below for the split.
   */
  loads_joints: string[]
  /**
   * Joints for which this movement is genuinely CONTRAINDICATED when
   * injured — the filter's real input. Absent means "same as loads_joints,"
   * which preserves the historical behaviour for every entry that hasn't
   * been explicitly reviewed, so this split is additive rather than a
   * silent relaxation of every exercise at once.
   *
   * An explicit empty array means "participates, but safe to keep" — use it
   * for movements where the joint is along for the ride rather than under
   * load through range.
   */
  contraindicated_joints?: string[]
  /**
   * Joints for which this movement is actively INDICATED when injured —
   * the prep/rehab work a physio would prescribe FOR that joint. These are
   * not merely tolerated: the plan should deliberately include them when
   * the matching injury is present, which is the whole reason this is a
   * third state rather than a boolean.
   */
  indicated_joints?: string[]
  style_tags: TrainingStyle[]
  /** Hard experience gate + regression — see CapabilityRequirement. Absent means no gate beyond the generic SKILL_DEMAND ceiling. */
  capability_requirement?: CapabilityRequirement
  /**
   * How much weight this movement takes relative to a weighted PULL-UP, which
   * is the 1.0 baseline. Absent means 1.0.
   *
   * A dip is genuinely the stronger movement — a trainee adding 15kg to a
   * pull-up will usually manage more on the bars — and the upright,
   * tricep-emphasis dip sits between the two, because the triceps are the
   * limiter rather than the larger chest musculature. Ashley's ruling was to
   * take the real step up but stay well inside the safety ceiling rather than
   * matching the strength charts outright: these are estimates for someone
   * the app has never watched do a single rep, on a movement this very entry
   * marks joint_stress 'high' and loads_joints ['shoulder'].
   *
   * Only read alongside accepts_added_load; meaningless without it.
   */
  added_load_scale?: number
  /**
   * True when a trainee can hang real weight on this movement — a dip belt,
   * a dumbbell between the feet, a loaded backpack. Pull-ups, chin-ups and
   * dips are the whole set; everything else on the "bodyweight" list
   * progresses by LEVERAGE instead (a deficit push-up, a straighter hanging
   * leg raise), and an assisted pull-up loads the other way entirely.
   *
   * Exists to keep the tempo prescription honest. Tempo is the progression
   * lever for a lift with no weight to add — and for a chin-up that premise
   * is false. Showing no weight on a chin-up is a GAP IN THIS APP, not a
   * fact about the exercise, and prescribing a slow eccentric there would
   * paper over the gap rather than close it. See BACKLOG: the real fix is
   * prescribing the added load, which is its own round of work.
   */
  accepts_added_load?: boolean
  substitution_group: string
  unilateral: boolean
  avg_duration_seconds: number
  /**
   * Primer-tier only. What training pattern(s) this primer suits — read only
   * by selectExercisesForTrack's primer filter (exercise-plan.ts), matched
   * against a track's own primer_patterns. Deliberately NOT movement_pattern
   * itself: every primer's movement_pattern is 'activation' (see the type
   * comment on MovementPattern), and quality-score.ts's weekly pattern-
   * coverage checks (pushSets/pullSets/hasSquat/hasHinge, day-label-mismatch)
   * read movement_pattern directly — repurposing it here would make a 2x8
   * primer set silently count as real weekly pattern volume and could mask
   * genuine imbalance. This field is additive and has no other reader.
   */
  primer_pattern_affinity?: MovementPattern[]
  /**
   * True for an entry retired from new selection. The entry (and its
   * stable `id`) stays in the database on purpose — historical
   * exercise_set_logs rows and already-generated future mesocycle weeks
   * reference exercises by name/id as plain denormalized data, never a
   * foreign key, so removing the entry outright would silently degrade
   * metadata lookups (progression, load prescription, plate calculator)
   * for anything still pointing at it. `getConstrainedPool` and
   * `generateExercisePlan`'s pool-build both filter this out at the
   * source, so it never reaches a NEW plan; `getExerciseEntry`/
   * `getExerciseId` deliberately do NOT check it, so old references keep
   * resolving. Absent/false means active.
   */
  retired?: boolean
  /**
   * Present only for exercises loaded by REMOVING resistance rather than
   * adding it (an assisted pull-up machine's counterweight, a resistance
   * band). Getting stronger means this number goes DOWN, the opposite of
   * every other loaded exercise — see load-prescription.ts's
   * prescribeAssistance and AssistanceChip.tsx, which both key off this
   * field's presence to switch to the inverted-progress framing. 'kg' is
   * the only populated unit today (Pull-Ups (Assisted)'s machine
   * counterweight); 'band_tier' is reserved for a future band-resisted
   * exercise, ordered easiest-to-hardest in band_tiers.
   */
  assistance?: { unit: 'kg' | 'band_tier'; band_tiers?: string[] }
}

export const EXERCISE_DATABASE: ExerciseEntry[] = [
  // HORIZONTAL PUSH
  {
    name: 'Barbell Bench Press',
    id: 'barbell-bench-press',
    movement_pattern: 'horizontal_push',
    mechanics_tier: 'tier1_compound',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['chest', 'anterior deltoid', 'triceps'],
    equipment: ['barbell', 'bench'],
    joint_stress: 'moderate',
    form_cues: ['Retract shoulder blades', 'Arch upper back slightly', 'Drive feet into floor', 'Touch chest at nipple line', 'Press up and slightly back'],
    coach_note_swap: 'The king of pressing movements for raw chest strength.',
    loads_joints: ['shoulder', 'wrist'],
    style_tags: ['bodybuilding', 'functional', 'combat', 'hybrid'],
    substitution_group: 'bench_press',
    unilateral: false,
    avg_duration_seconds: 40,
  },
  {
    name: 'Dumbbell Bench Press',
    id: 'dumbbell-bench-press',
    movement_pattern: 'horizontal_push',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['chest', 'anterior deltoid', 'triceps'],
    equipment: ['dumbbells', 'bench'],
    joint_stress: 'low',
    form_cues: ['Keep elbows at 45 degrees', 'Lower until stretch in pecs', 'Press dumbbells together at top', 'Control the eccentric phase'],
    coach_note_swap: 'Greater range of motion than barbell with less shoulder stress.',
    loads_joints: ['shoulder'],
    style_tags: ['bodybuilding', 'functional', 'combat', 'hybrid'],
    substitution_group: 'bench_press',
    unilateral: false,
    avg_duration_seconds: 35,
  },
  // ---------------------------------------------------------------------
  // Shoulder-friendly pressing and rowing variants.
  //
  // Added to close a real gap: the injury filter correctly rules out every
  // standard press and vertical pull for a shoulder injury, and the database
  // then had NO pressing variant left at all -- so a plan rebuilt around a
  // shoulder injury contained no upper-body pushing of any kind. That was a
  // content gap, not a filter gap.
  //
  // All of these LOAD the shoulder (they are pressing and rowing movements;
  // loads_joints says so honestly) but are not CONTRAINDICATED by it: the
  // floor limits the press before the deep-stretch position that impinges,
  // a neutral grip keeps the humerus out of internal rotation, the landmine
  // path stays in the scapular plane, and a chest-supported row removes the
  // torso swing. They are TOLERATED, not prescribed -- none is marked
  // indicated_joints, because unlike the band/scapular work these are not
  // rehab, they are ordinary training that happens to be gentler.
  //
  // This does not change the red-flag path: sharp/worsening/one-sided pain
  // still routes to a professional and never reaches exercise selection.
  // ---------------------------------------------------------------------
  {
    name: 'Barbell Floor Press',
    id: 'barbell-floor-press',
    movement_pattern: 'horizontal_push',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['chest', 'triceps', 'anterior deltoid'],
    equipment: ['barbell'],
    joint_stress: 'low',
    form_cues: ['Lie flat on the floor, knees bent', 'Lower until the upper arms touch down', 'Pause briefly, then press', 'The floor sets the depth'],
    coach_note_swap: 'The floor stops the press before the range that irritates most shoulders.',
    loads_joints: ['shoulder', 'wrist'],
    contraindicated_joints: ['wrist'],
    style_tags: ['bodybuilding', 'functional', 'hybrid'],
    substitution_group: 'bench_press',
    unilateral: false,
    avg_duration_seconds: 35,
  },
  {
    name: 'Dumbbell Floor Press',
    id: 'dumbbell-floor-press',
    movement_pattern: 'horizontal_push',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['chest', 'triceps', 'anterior deltoid'],
    equipment: ['dumbbells'],
    joint_stress: 'low',
    form_cues: ['Lie flat on the floor, knees bent', 'Elbows tucked to about 45 degrees', 'Touch the upper arms down, pause, press', 'Keep the wrists stacked over the elbows'],
    coach_note_swap: 'Floor-limited range with a dumbbell path the shoulder can choose.',
    loads_joints: ['shoulder'],
    contraindicated_joints: [],
    style_tags: ['bodybuilding', 'functional', 'combat', 'hybrid'],
    substitution_group: 'bench_press',
    unilateral: false,
    avg_duration_seconds: 35,
  },
  {
    name: 'Neutral-Grip Dumbbell Press',
    id: 'neutral-grip-dumbbell-press',
    movement_pattern: 'horizontal_push',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['chest', 'triceps', 'anterior deltoid'],
    equipment: ['dumbbells', 'bench'],
    joint_stress: 'low',
    form_cues: ['Palms facing each other throughout', 'Elbows travel close to the ribs', 'Lower to a comfortable stretch, not the deepest one', 'Press without letting the palms rotate'],
    coach_note_swap: 'Palms-in keeps the shoulder out of the internally rotated position that pinches.',
    loads_joints: ['shoulder'],
    contraindicated_joints: [],
    style_tags: ['bodybuilding', 'functional', 'combat', 'hybrid'],
    substitution_group: 'bench_press',
    unilateral: false,
    avg_duration_seconds: 35,
  },
  {
    name: 'Landmine Press',
    id: 'landmine-press',
    movement_pattern: 'vertical_push',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'diagonal',
    primary_muscles: ['anterior deltoid', 'chest', 'triceps'],
    equipment: ['barbell'],
    joint_stress: 'low',
    form_cues: ['Press up and slightly forward, not straight overhead', 'Ribs down, do not arch to finish the rep', 'Follow the bar path the landmine gives you', 'Stop short of a hard lockout'],
    coach_note_swap: 'Presses in the scapular plane rather than straight overhead.',
    loads_joints: ['shoulder'],
    contraindicated_joints: [],
    style_tags: ['functional', 'combat', 'hybrid', 'bodybuilding'],
    substitution_group: 'overhead_press',
    unilateral: true,
    avg_duration_seconds: 40,
  },
  {
    name: 'Chest-Supported Row',
    id: 'chest-supported-row',
    movement_pattern: 'horizontal_pull',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['lats', 'rhomboids', 'mid traps', 'biceps'],
    equipment: ['dumbbells', 'incline bench'],
    joint_stress: 'low',
    form_cues: ['Chest stays on the pad the whole set', 'Lead with the elbows, not the hands', 'Squeeze the shoulder blades together at the top', 'No body English, the pad is there to stop it'],
    coach_note_swap: 'The pad removes torso swing, so the mid-back works and the shoulder is not stabilising a moving trunk.',
    loads_joints: ['shoulder'],
    contraindicated_joints: [],
    style_tags: ['bodybuilding', 'functional', 'hybrid'],
    substitution_group: 'row',
    unilateral: false,
    avg_duration_seconds: 35,
  },
  {
    name: 'Neutral-Grip Seated Cable Row',
    id: 'neutral-grip-seated-cable-row',
    movement_pattern: 'horizontal_pull',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['lats', 'rhomboids', 'mid traps', 'biceps'],
    equipment: ['cable machine'],
    joint_stress: 'low',
    form_cues: ['Palms facing each other on the close handle', 'Sit tall, pull to the navel', 'Let the shoulder blades travel', 'Control the return rather than letting it snap out'],
    coach_note_swap: 'Neutral grip and a supported seated position, comfortable for most irritable shoulders.',
    loads_joints: ['shoulder'],
    contraindicated_joints: [],
    style_tags: ['bodybuilding', 'functional', 'hybrid'],
    substitution_group: 'row',
    unilateral: false,
    avg_duration_seconds: 35,
  },
  {
    name: 'Incline Dumbbell Press',
    id: 'incline-dumbbell-press',
    movement_pattern: 'horizontal_push',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'diagonal',
    primary_muscles: ['upper chest', 'anterior deltoid', 'triceps'],
    equipment: ['dumbbells', 'incline bench'],
    joint_stress: 'low',
    form_cues: ['Set bench to 30-45 degrees', 'Drive through palms', 'Keep chest up', 'Lower to upper chest level'],
    coach_note_swap: 'Targets the clavicular head of the pec for upper chest development.',
    loads_joints: ['shoulder'],
    style_tags: ['bodybuilding', 'functional', 'combat', 'hybrid'],
    substitution_group: 'bench_press',
    unilateral: false,
    avg_duration_seconds: 35,
  },
  {
    name: 'Incline Machine Press',
    id: 'incline-machine-press',
    movement_pattern: 'horizontal_push',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'diagonal',
    primary_muscles: ['upper chest', 'anterior deltoid', 'triceps'],
    equipment: ['machine'],
    joint_stress: 'low',
    form_cues: ['Adjust seat so handles align with upper chest', 'Press forward, not up', 'Squeeze at peak contraction'],
    coach_note_swap: 'Machine-guided path reduces stabilizer fatigue for pure pressing volume.',
    loads_joints: ['shoulder'],
    style_tags: ['bodybuilding', 'hybrid'],
    substitution_group: 'bench_press',
    unilateral: false,
    avg_duration_seconds: 28,
  },
  {
    name: 'Cable Flyes',
    id: 'cable-flyes',
    movement_pattern: 'horizontal_push',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['chest'],
    equipment: ['cable machine'],
    joint_stress: 'low',
    form_cues: ['Slight bend in elbows', 'Arc hands together', 'Squeeze at midline', 'Control the stretch'],
    coach_note_swap: 'Constant tension through the full range targets the pec fibers directly.',
    loads_joints: ['shoulder'],
    style_tags: ['bodybuilding', 'hybrid'],
    substitution_group: 'fly_isolation',
    unilateral: false,
    avg_duration_seconds: 30,
  },
  {
    name: 'Pec Deck Machine',
    id: 'pec-deck-machine',
    movement_pattern: 'horizontal_push',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['chest'],
    equipment: ['machine'],
    joint_stress: 'low',
    form_cues: ['Sit with back flat against pad', 'Keep slight elbow bend', 'Squeeze pads together', 'Slow eccentric'],
    coach_note_swap: 'Guided isolation that removes coordination demands.',
    loads_joints: ['shoulder'],
    style_tags: ['bodybuilding', 'hybrid'],
    substitution_group: 'fly_isolation',
    unilateral: false,
    avg_duration_seconds: 28,
  },
  // Swap-depth fix: Cable Flyes and Pec Deck Machine were each other's ONLY
  // swap option (both cable-station/machine-bound) -- a busy pec deck left
  // a busy cable stack as the sole alternative. Dumbbell Flyes is the
  // off-machine escape.
  {
    name: 'Dumbbell Flyes',
    id: 'dumbbell-flyes',
    movement_pattern: 'horizontal_push',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['chest'],
    equipment: ['dumbbells', 'bench'],
    joint_stress: 'low',
    form_cues: ['Lie flat, slight bend in elbows', 'Lower until stretch in chest', 'Arc dumbbells together over chest', 'Control the descent'],
    coach_note_swap: 'Free-weight fly with a real stretch at the bottom — no machine or cable station needed.',
    loads_joints: ['shoulder'],
    style_tags: ['bodybuilding', 'hybrid'],
    substitution_group: 'fly_isolation',
    unilateral: false,
    avg_duration_seconds: 32,
  },
  {
    name: 'Push-Ups',
    id: 'push-ups',
    movement_pattern: 'horizontal_push',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['chest', 'anterior deltoid', 'triceps', 'core'],
    equipment: ['bodyweight'],
    joint_stress: 'low',
    form_cues: ['Hands shoulder-width', 'Body forms a straight line', 'Lower until chest near floor', 'Drive through palms'],
    coach_note_swap: 'Bodyweight pressing with natural scapular movement.',
    loads_joints: ['shoulder', 'wrist'],
    style_tags: ['bodybuilding', 'functional', 'combat', 'hybrid'],
    substitution_group: 'bench_press',
    unilateral: false,
    avg_duration_seconds: 30,
  },
  {
    name: 'Incline Push-Ups',
    id: 'incline-push-ups',
    movement_pattern: 'horizontal_push',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'diagonal',
    primary_muscles: ['chest', 'anterior deltoid', 'triceps', 'core'],
    equipment: ['bodyweight'],
    joint_stress: 'low',
    form_cues: ['Hands on a raised surface (bench, step, wall)', 'Body forms a straight line', 'Lower chest toward the surface', 'Drive back up'],
    coach_note_swap: 'The easier end of the push-up leverage ladder — reduces the fraction of bodyweight being pressed.',
    loads_joints: ['shoulder', 'wrist'],
    style_tags: ['bodybuilding', 'functional', 'combat', 'hybrid'],
    substitution_group: 'bench_press',
    unilateral: false,
    avg_duration_seconds: 28,
  },
  {
    name: 'Deficit Push-Ups',
    id: 'deficit-push-ups',
    movement_pattern: 'horizontal_push',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['chest', 'anterior deltoid', 'triceps', 'core'],
    equipment: ['bodyweight'],
    joint_stress: 'moderate',
    form_cues: ['Hands on blocks/steps for extra range', 'Lower chest below hand level', 'Body forms a straight line', 'Drive back up through full range'],
    coach_note_swap: 'Extends the range of motion on the same bodyweight leverage — more stimulus without adding load.',
    loads_joints: ['shoulder', 'wrist'],
    style_tags: ['bodybuilding', 'functional', 'combat', 'hybrid'],
    capability_requirement: { minExperience: 'novice', regression: 'Push-Ups' },
    substitution_group: 'bench_press',
    unilateral: false,
    avg_duration_seconds: 32,
  },
  {
    name: 'Archer Push-Ups',
    id: 'archer-push-ups',
    movement_pattern: 'horizontal_push',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['chest', 'anterior deltoid', 'triceps', 'core'],
    equipment: ['bodyweight'],
    joint_stress: 'moderate',
    form_cues: ['Wide hand placement', 'Shift weight over one hand as you lower', 'Other arm stays straight out to the side', 'Push back to center'],
    coach_note_swap: 'Shifts most of the load to one arm — the far end of the push-up leverage ladder before a true one-arm push-up.',
    loads_joints: ['shoulder', 'wrist'],
    style_tags: ['bodybuilding', 'functional', 'combat', 'hybrid'],
    capability_requirement: { minExperience: 'intermediate', regression: 'Push-Ups' },
    substitution_group: 'bench_press',
    unilateral: true,
    avg_duration_seconds: 35,
  },
  {
    name: 'Chest Dips',
    id: 'chest-dips',
    movement_pattern: 'horizontal_push',
    contraindicated_joints: ['elbow', 'shoulder'],
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['lower chest', 'triceps', 'anterior deltoid'],
    equipment: ['dip bars'],
    joint_stress: 'high',
    form_cues: ['Lean forward 30 degrees', 'Lower until stretch in chest', 'Elbows flare slightly', 'Drive up powerfully'],
    coach_note_swap: 'Heavy loaded stretch on the lower pecs and triceps.',
    loads_joints: ['shoulder'],
    style_tags: ['bodybuilding', 'functional', 'combat', 'hybrid'],
    capability_requirement: { minExperience: 'intermediate', regression: 'Tricep Dips' },
    added_load_scale: 1.4,
    accepts_added_load: true,
    substitution_group: 'dip',
    unilateral: false,
    avg_duration_seconds: 35,
  },

  // Swap-depth fix, and the one a real gym session found: a busy machine
  // sent the trainee looking for another machine that was physically in
  // front of her, and the app had no flat machine press at all. The
  // catalogue held Incline Machine Press and Pec Deck Machine but not the
  // most-used chest machine on any commercial floor. Name matters here
  // beyond labelling: categorize() (load-prescription.ts) matches
  // 'chest press' and anchors this to the BENCH standard — a machine named
  // e.g. "Seated Press" would miss every substring and fall through to the
  // pattern default instead.
  {
    name: 'Chest Press Machine',
    id: 'chest-press-machine',
    movement_pattern: 'horizontal_push',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['chest', 'anterior deltoid', 'triceps'],
    equipment: ['machine'],
    joint_stress: 'low',
    form_cues: [
      'Set the seat so the handles sit level with mid-chest',
      'Shoulder blades stay back against the pad',
      'Press straight forward, not up',
      'Stop just short of locking the elbows',
    ],
    coach_note_swap: 'A fixed path lets you push close to failure without a spotter.',
    loads_joints: ['shoulder'],
    style_tags: ['bodybuilding', 'hybrid'],
    substitution_group: 'bench_press',
    unilateral: false,
    avg_duration_seconds: 28,
  },
  {
    name: 'Cable Crossover',
    id: 'cable-crossover',
    movement_pattern: 'horizontal_push',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['chest'],
    equipment: ['cable machine'],
    joint_stress: 'low',
    form_cues: [
      'Set both pulleys above shoulder height',
      'Keep a soft bend in the elbows and hold it',
      'Bring the hands together in front of the hips',
      'Resist the stretch on the way back',
    ],
    coach_note_swap: 'Cable tension stays on the chest exactly where a dumbbell fly goes slack.',
    loads_joints: ['shoulder'],
    style_tags: ['bodybuilding', 'hybrid'],
    substitution_group: 'chest_fly',
    unilateral: false,
    avg_duration_seconds: 28,
  },

  // HORIZONTAL PULL
  {
    name: 'Barbell Rows',
    id: 'barbell-rows',
    movement_pattern: 'horizontal_pull',
    mechanics_tier: 'tier1_compound',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['lats', 'rhomboids', 'rear deltoid', 'biceps'],
    equipment: ['barbell'],
    joint_stress: 'moderate',
    form_cues: ['Hinge at hips 45 degrees', 'Pull to lower ribcage', 'Squeeze shoulder blades', 'Control the descent'],
    coach_note_swap: 'Heavy compound pulling for thick back development.',
    // Wrist tag was over-broad: gripping a bar through a hinge is a static
    // hold, not the active wrist-extension load a push-up or bench press
    // creates. Relaxed for wrist only -- lower_back_axial stays excluded,
    // the spinal-loading concern from the hinge position is real.
    loads_joints: ['lower_back_axial', 'wrist'],
    contraindicated_joints: ['lower_back_axial'],
    style_tags: ['bodybuilding', 'functional', 'combat', 'hybrid'],
    substitution_group: 'row',
    unilateral: false,
    avg_duration_seconds: 35,
  },
  {
    name: 'Cable Rows',
    id: 'cable-rows',
    movement_pattern: 'horizontal_pull',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['lats', 'rhomboids', 'rear deltoid', 'biceps'],
    equipment: ['cable machine'],
    joint_stress: 'low',
    form_cues: ['Sit upright', 'Pull to navel', 'Squeeze shoulder blades together', 'Extend arms fully on eccentric'],
    coach_note_swap: 'Constant cable tension with adjustable angle.',
    loads_joints: [],
    style_tags: ['bodybuilding', 'functional', 'hybrid'],
    substitution_group: 'row',
    unilateral: false,
    avg_duration_seconds: 30,
    // Retired — identical to Seated Cable Row on every scoring-relevant
    // field (pattern, angle_vector, equipment, muscles); redundant with it
    // in the catalogue. Entry/id kept in place, see `retired`'s doc
    // comment on ExerciseEntry.
    retired: true,
  },
  {
    name: 'Seated Cable Row',
    id: 'seated-cable-row',
    movement_pattern: 'horizontal_pull',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['lats', 'rhomboids', 'rear deltoid', 'biceps'],
    equipment: ['cable machine'],
    joint_stress: 'low',
    form_cues: ['Maintain upright torso', 'Pull handles to lower chest', 'Retract scapulae', 'Avoid using momentum'],
    coach_note_swap: 'Stable seated position isolates the back without lower-back fatigue.',
    loads_joints: [],
    style_tags: ['bodybuilding', 'functional', 'hybrid'],
    substitution_group: 'row',
    unilateral: false,
    avg_duration_seconds: 30,
  },
  {
    name: 'Dumbbell Rows',
    id: 'dumbbell-rows',
    movement_pattern: 'horizontal_pull',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['lats', 'rhomboids', 'biceps'],
    equipment: ['dumbbells', 'bench'],
    joint_stress: 'low',
    form_cues: ['Support on bench with one hand', 'Pull dumbbell to hip', 'Drive elbow past torso', 'Lower with control'],
    coach_note_swap: 'Unilateral pulling corrects imbalances with excellent lat stretch.',
    loads_joints: [],
    style_tags: ['bodybuilding', 'functional', 'combat', 'hybrid'],
    substitution_group: 'row',
    unilateral: true,
    avg_duration_seconds: 30,
  },
  {
    name: 'T-Bar Rows',
    id: 't-bar-rows',
    movement_pattern: 'horizontal_pull',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'diagonal',
    primary_muscles: ['lats', 'rhomboids', 'rear deltoid', 'biceps'],
    equipment: ['t-bar', 'barbell'],
    // "Straddle bar or use landmine" -- either implement does this, not both.
    equipment_alternatives: true,
    joint_stress: 'moderate',
    form_cues: ['Straddle bar or use landmine', 'Hinge forward 45 degrees', 'Pull to chest', 'Squeeze at top'],
    coach_note_swap: 'Neutral grip row that loads the mid-back heavily.',
    // Same wrist-tag relaxation as Barbell Rows -- a static grip hold
    // through a hinge, not active wrist extension. lower_back_axial stays.
    loads_joints: ['lower_back_axial', 'wrist'],
    contraindicated_joints: ['lower_back_axial'],
    style_tags: ['bodybuilding', 'functional', 'combat', 'hybrid'],
    substitution_group: 'row',
    unilateral: false,
    avg_duration_seconds: 35,
  },
  {
    name: 'Inverted Row',
    id: 'inverted-row',
    movement_pattern: 'horizontal_pull',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['lats', 'rhomboids', 'rear deltoid', 'biceps'],
    equipment: ['pull-up bar'],
    joint_stress: 'low',
    form_cues: ['Set a bar or rings at hip height', 'Body forms a straight line under it', 'Pull chest to the bar', 'Lower with control'],
    coach_note_swap: 'The horizontal-pull equivalent of a push-up — feet position (bent knees vs. straight legs) is the difficulty dial.',
    loads_joints: ['shoulder'],
    style_tags: ['bodybuilding', 'functional', 'combat', 'hybrid'],
    substitution_group: 'row',
    unilateral: false,
    avg_duration_seconds: 32,
  },
  {
    name: 'Towel Row',
    id: 'towel-row',
    movement_pattern: 'horizontal_pull',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['lats', 'rhomboids', 'biceps'],
    equipment: ['bodyweight'],
    joint_stress: 'low',
    form_cues: ['Loop a towel around a sturdy doorframe or pole', 'Lean back with straight arms', 'Pull chest toward your hands', 'Control the return'],
    coach_note_swap: 'A genuine horizontal pull that needs nothing but a towel and a doorframe — no pull-up bar required.',
    loads_joints: [],
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'row',
    unilateral: false,
    avg_duration_seconds: 30,
  },
  {
    name: 'Backpack Row',
    id: 'backpack-row',
    movement_pattern: 'horizontal_pull',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['lats', 'rhomboids', 'biceps'],
    // 'weighted backpack' (not just 'bodyweight') so this actually gets a
    // real load prescription — reviews flagged both this and Loaded
    // Backpack Walk as tagged "load: Bodyweight" with zero weight and zero
    // progression despite the coach_note_swap literally instructing "pack
    // it with books to progress." A backpack IS an external load; the
    // equipment tag now says so.
    equipment: ['bodyweight', 'weighted backpack'],
    joint_stress: 'low',
    form_cues: ['Support on a bench or sturdy surface with one hand', 'Pull a loaded backpack to your hip', 'Drive the elbow past the torso', 'Lower with control'],
    coach_note_swap: 'A real loaded row for a bodyweight-only trainee — pack it with books to progress past what your own bodyweight can offer.',
    loads_joints: [],
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'row',
    unilateral: true,
    avg_duration_seconds: 32,
  },
  // Swap-depth fix (measured, not assumed): at bodyweight-only equipment,
  // Backpack Row had zero swap options — Inverted Row and Towel Row are
  // both REGRESSION_VARIATIONS (periodization.ts), so an intermediate+
  // trainee who isn't on a regression can't swap into them. This is a
  // genuine peer, not an easier on-ramp.
  {
    name: 'Table Row',
    id: 'table-row',
    movement_pattern: 'horizontal_pull',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['lats', 'rhomboids', 'biceps'],
    equipment: ['bodyweight'],
    joint_stress: 'low',
    form_cues: ['Lie under a sturdy, heavy table', 'Grip the edge, body straight, heels on the floor', 'Pull chest to the table edge', 'Lower with control'],
    coach_note_swap: 'The same straight-body horizontal pull as an inverted row, using a table instead of a bar — no pull-up bar required.',
    loads_joints: ['shoulder'],
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'row',
    unilateral: false,
    avg_duration_seconds: 32,
  },
  {
    name: 'Face Pulls',
    id: 'face-pulls',
    movement_pattern: 'horizontal_pull',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'diagonal',
    primary_muscles: ['rear deltoid', 'rotator cuff', 'rhomboids'],
    equipment: ['cable machine'],
    joint_stress: 'low',
    form_cues: ['Set cable at face height', 'Pull rope to ears', 'Externally rotate at end', 'Squeeze rear delts'],
    coach_note_swap: 'Critical for shoulder health and rear delt/rotator cuff strength.',
    loads_joints: ['shoulder'],
    contraindicated_joints: [],
    indicated_joints: ['shoulder'],
    style_tags: ['bodybuilding', 'functional', 'hybrid'],
    substitution_group: 'rear_delt',
    unilateral: false,
    avg_duration_seconds: 28,
  },
  {
    name: 'Reverse Pec Deck',
    id: 'reverse-pec-deck',
    movement_pattern: 'horizontal_pull',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['rear deltoid', 'rhomboids'],
    equipment: ['machine'],
    joint_stress: 'low',
    form_cues: ['Face the pad', 'Slight elbow bend', 'Open arms wide', 'Squeeze rear delts at peak'],
    coach_note_swap: 'Machine-guided rear delt isolation for balanced shoulder development.',
    loads_joints: ['shoulder'],
    style_tags: ['bodybuilding', 'hybrid'],
    substitution_group: 'rear_delt',
    unilateral: false,
    avg_duration_seconds: 28,
  },
  {
    name: 'Rear Delt Flyes',
    id: 'rear-delt-flyes',
    movement_pattern: 'horizontal_pull',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'lateral',
    primary_muscles: ['rear deltoid'],
    equipment: ['dumbbells'],
    joint_stress: 'low',
    form_cues: ['Bend at hips', 'Arms hang below', 'Raise to sides', 'Squeeze rear delts at top'],
    coach_note_swap: 'Free-weight rear delt isolation for posture balance.',
    loads_joints: ['shoulder'],
    contraindicated_joints: [],
    indicated_joints: ['shoulder'],
    style_tags: ['bodybuilding', 'hybrid'],
    substitution_group: 'rear_delt',
    unilateral: false,
    avg_duration_seconds: 28,
  },

  // Swap-depth fix: every row in the catalogue was a cable, a barbell, a
  // dumbbell or bodyweight — no plate-loaded machine row, which is standard
  // kit on any commercial floor and the obvious fallback when the cable
  // station is occupied.
  {
    name: 'Seated Machine Row',
    id: 'seated-machine-row',
    movement_pattern: 'horizontal_pull',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['lats', 'rhomboids', 'mid traps', 'biceps'],
    equipment: ['machine'],
    joint_stress: 'low',
    form_cues: [
      'Chest stays against the pad the whole set',
      'Drive the elbows back, not down',
      'Squeeze the shoulder blades at the finish',
      'Let the weight stretch the lats before the next rep',
    ],
    coach_note_swap: 'Chest support takes the lower back out of it entirely.',
    loads_joints: ['shoulder', 'elbow'],
    contraindicated_joints: ['shoulder'],
    style_tags: ['bodybuilding', 'hybrid'],
    substitution_group: 'row',
    unilateral: false,
    avg_duration_seconds: 30,
  },

  // VERTICAL PULL
  {
    name: 'Lat Pulldown',
    id: 'lat-pulldown',
    movement_pattern: 'vertical_pull',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['lats', 'biceps', 'teres major'],
    equipment: ['cable machine'],
    joint_stress: 'low',
    form_cues: ['Grip slightly wider than shoulders', 'Pull to upper chest', 'Lead with elbows', 'Lean back slightly'],
    coach_note_swap: 'Scalable vertical pulling for lat width development.',
    loads_joints: ['shoulder'],
    style_tags: ['bodybuilding', 'functional', 'hybrid'],
    substitution_group: 'vertical_pull',
    unilateral: false,
    avg_duration_seconds: 30,
  },
  // Swap-depth fix, and the same content gap the catalogue-thinness audit
  // found: at home_gym/minimalist, the only vertical_pull option a
  // beginner/novice could reach was Pull-Ups itself gated to intermediate+
  // (no cable machine, and the assisted pull-up machine isn't available
  // either) -- a busy pull-up bar left NOTHING. A band anchored high and
  // pulled down mimics the lat-pulldown pattern with equipment already in
  // both the home_gym and minimalist sets, and needs no prior pulling
  // strength.
  {
    name: 'Kneeling Band Lat Pulldown',
    id: 'kneeling-band-lat-pulldown',
    movement_pattern: 'vertical_pull',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['lats', 'rhomboids', 'biceps'],
    equipment: ['resistance band'],
    joint_stress: 'low',
    form_cues: ['Anchor a band high overhead, kneel facing the anchor', 'Grip wide, arms extended', 'Pull the band down to the upper chest, leading with the elbows', 'Control the return to full stretch'],
    coach_note_swap: 'The lat-pulldown pattern with a band and an overhead anchor — no cable machine, no pull-up strength required.',
    loads_joints: ['shoulder'],
    style_tags: ['bodybuilding', 'functional', 'hybrid'],
    substitution_group: 'vertical_pull',
    unilateral: false,
    avg_duration_seconds: 30,
  },
  {
    name: 'Pull-Ups',
    id: 'pull-ups',
    movement_pattern: 'vertical_pull',
    contraindicated_joints: ['elbow', 'shoulder'],
    mechanics_tier: 'tier1_compound',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['lats', 'biceps', 'teres major', 'core'],
    equipment: ['pull-up bar'],
    joint_stress: 'moderate',
    form_cues: ['Grip shoulder-width or wider', 'Dead hang start', 'Pull chin over bar', 'Control the descent'],
    coach_note_swap: 'The gold standard for relative upper-body pulling strength.',
    loads_joints: ['shoulder'],
    style_tags: ['bodybuilding', 'functional', 'combat', 'hybrid'],
    capability_requirement: { minExperience: 'intermediate', regression: 'Pull-Ups (Assisted)' },
    accepts_added_load: true,
    substitution_group: 'vertical_pull',
    unilateral: false,
    avg_duration_seconds: 35,
  },
  // Swap-depth fix (measured): at bodyweight-only equipment, Pull-Ups had
  // zero swap options for an intermediate+ trainee — Pull-Ups (Assisted)
  // is its own named regression (REGRESSION_VARIATIONS, periodization.ts)
  // and gets excluded as a candidate the same way. A genuine peer
  // movement, not an easier variant, gated the same as Pull-Ups so it
  // never becomes the unearned option for someone who hasn't earned
  // Pull-Ups itself.
  {
    name: 'Chin-Ups',
    id: 'chin-ups',
    movement_pattern: 'vertical_pull',
    contraindicated_joints: ['elbow', 'shoulder'],
    mechanics_tier: 'tier1_compound',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['lats', 'biceps', 'teres major', 'core'],
    equipment: ['pull-up bar'],
    joint_stress: 'moderate',
    form_cues: ['Underhand, shoulder-width grip', 'Dead hang start', 'Pull chin over bar', 'Control the descent'],
    coach_note_swap: 'Same vertical pull as a pull-up, underhand grip — more bicep involvement, same bar.',
    loads_joints: ['shoulder'],
    style_tags: ['bodybuilding', 'functional', 'combat', 'hybrid'],
    capability_requirement: { minExperience: 'intermediate', regression: 'Pull-Ups (Assisted)' },
    accepts_added_load: true,
    substitution_group: 'vertical_pull',
    unilateral: false,
    avg_duration_seconds: 35,
  },
  {
    name: 'Pull-Ups (Assisted)',
    id: 'pull-ups-assisted',
    movement_pattern: 'vertical_pull',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['lats', 'biceps', 'teres major'],
    equipment: ['assisted pull-up machine'],
    joint_stress: 'low',
    form_cues: ['Same form as regular pull-up', 'Select appropriate counterweight', 'Full range of motion'],
    coach_note_swap: 'Builds pulling strength progressively toward unassisted pull-ups.',
    loads_joints: ['shoulder'],
    style_tags: ['bodybuilding', 'functional', 'hybrid'],
    substitution_group: 'vertical_pull',
    unilateral: false,
    avg_duration_seconds: 30,
    assistance: { unit: 'kg' },
  },
  {
    name: 'Close-Grip Lat Pulldown',
    id: 'close-grip-lat-pulldown',
    movement_pattern: 'vertical_pull',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['lats', 'biceps', 'rhomboids'],
    equipment: ['cable machine'],
    joint_stress: 'low',
    form_cues: ['Use V-bar or neutral grip handle', 'Pull to sternum', 'Squeeze lats at bottom', 'Full stretch at top'],
    coach_note_swap: 'Neutral grip shifts emphasis to lower lats and rhomboids.',
    loads_joints: ['shoulder'],
    style_tags: ['bodybuilding', 'functional', 'hybrid'],
    substitution_group: 'row',
    unilateral: false,
    avg_duration_seconds: 30,
  },
  {
    name: 'Straight-Arm Pulldown',
    id: 'straight-arm-pulldown',
    movement_pattern: 'vertical_pull',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'diagonal',
    primary_muscles: ['lats', 'teres major'],
    equipment: ['cable machine'],
    joint_stress: 'low',
    form_cues: ['Stand back from cable', 'Arms nearly straight', 'Push bar down in arc to thighs', 'Squeeze lats at bottom'],
    coach_note_swap: 'Isolates the lats without bicep involvement.',
    loads_joints: ['shoulder'],
    style_tags: ['bodybuilding', 'hybrid'],
    substitution_group: 'lat_isolation',
    unilateral: false,
    avg_duration_seconds: 28,
  },

  // VERTICAL PUSH
  {
    name: 'Overhead Press',
    id: 'overhead-press',
    movement_pattern: 'vertical_push',
    mechanics_tier: 'tier1_compound',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['anterior deltoid', 'lateral deltoid', 'triceps', 'core'],
    equipment: ['barbell'],
    joint_stress: 'moderate',
    form_cues: ['Bar at collarbone height', 'Press straight up', 'Move head through at top', 'Brace core throughout'],
    coach_note_swap: 'Foundational overhead strength builder.',
    loads_joints: ['lower_back_axial', 'shoulder', 'wrist', 'neck'],
    style_tags: ['bodybuilding', 'functional', 'combat', 'hybrid'],
    substitution_group: 'overhead_press',
    unilateral: false,
    avg_duration_seconds: 38,
  },
  {
    name: 'Dumbbell Shoulder Press',
    id: 'dumbbell-shoulder-press',
    movement_pattern: 'vertical_push',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['anterior deltoid', 'lateral deltoid', 'triceps'],
    equipment: ['dumbbells'],
    joint_stress: 'low',
    form_cues: ['Start at ear height', 'Press up and slightly in', 'Lock out at top', 'Control the descent'],
    coach_note_swap: 'Freer path than barbell — better for shoulders with mobility limitations.',
    loads_joints: ['shoulder'],
    style_tags: ['bodybuilding', 'functional', 'combat', 'hybrid'],
    substitution_group: 'overhead_press',
    unilateral: false,
    avg_duration_seconds: 35,
  },
  {
    name: 'Arnold Press',
    id: 'arnold-press',
    movement_pattern: 'vertical_push',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'rotational',
    primary_muscles: ['anterior deltoid', 'lateral deltoid', 'triceps'],
    equipment: ['dumbbells'],
    joint_stress: 'low',
    form_cues: ['Start palms facing you', 'Rotate as you press up', 'Finish palms forward', 'Reverse on descent'],
    coach_note_swap: 'Rotational path hits all three delt heads through one rep.',
    loads_joints: ['shoulder'],
    style_tags: ['bodybuilding', 'functional', 'hybrid'],
    substitution_group: 'overhead_press',
    unilateral: true,
    avg_duration_seconds: 35,
  },
  // Swap-depth fix: Dumbbell Shoulder Press and Arnold Press were each
  // other's only swap at the minimalist tier. A band press adds a third,
  // using equipment already in that tier.
  {
    name: 'Band Shoulder Press',
    id: 'band-shoulder-press',
    movement_pattern: 'vertical_push',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['anterior deltoid', 'lateral deltoid', 'triceps'],
    equipment: ['resistance band'],
    joint_stress: 'low',
    form_cues: ['Stand on the band, one handle at each shoulder', 'Press straight overhead', 'Lock out without shrugging', 'Control the descent'],
    coach_note_swap: 'Overhead press with accommodating band resistance — heaviest at lockout, easiest at the bottom.',
    loads_joints: ['shoulder'],
    style_tags: ['bodybuilding', 'functional', 'hybrid'],
    substitution_group: 'overhead_press',
    unilateral: false,
    avg_duration_seconds: 32,
  },
  {
    name: 'Lateral Raises',
    id: 'lateral-raises',
    movement_pattern: 'isolation_shoulder',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'lateral',
    primary_muscles: ['lateral deltoid'],
    equipment: ['dumbbells'],
    joint_stress: 'low',
    form_cues: ['Slight elbow bend', 'Raise to shoulder height', 'Lead with elbows', 'Slow eccentric'],
    coach_note_swap: 'Targets the medial delt for wider shoulders.',
    loads_joints: ['shoulder'],
    style_tags: ['bodybuilding', 'hybrid'],
    substitution_group: 'lateral_delt',
    unilateral: false,
    avg_duration_seconds: 28,
  },
  {
    name: 'Cable Lateral Raises',
    id: 'cable-lateral-raises',
    movement_pattern: 'isolation_shoulder',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'lateral',
    primary_muscles: ['lateral deltoid'],
    equipment: ['cable machine'],
    joint_stress: 'low',
    form_cues: ['Stand sideways to cable', 'Raise arm to shoulder height', 'Constant tension throughout', 'Control both phases'],
    coach_note_swap: 'Continuous cable tension eliminates the dead zone at the bottom.',
    loads_joints: ['shoulder'],
    style_tags: ['bodybuilding', 'hybrid'],
    substitution_group: 'lateral_delt',
    unilateral: true,
    avg_duration_seconds: 28,
  },
  {
    name: 'Shrugs',
    id: 'shrugs',
    movement_pattern: 'isolation_trap',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['upper trapezius'],
    equipment: ['barbell', 'dumbbells'],
    // Either implement shrugs the same way -- not both required.
    equipment_alternatives: true,
    joint_stress: 'low',
    form_cues: ['Elevate shoulders straight up', 'Hold at top 1 second', 'Do not roll shoulders', 'Full depression at bottom'],
    coach_note_swap: 'Direct trap work for neck and yoke thickness.',
    // Wrist tag was over-broad: arms hang straight down in a static grip
    // hold while the shoulders elevate -- the wrist itself does no active
    // work through range. Relaxed for wrist only -- neck stays excluded.
    loads_joints: ['neck', 'wrist'],
    contraindicated_joints: ['neck'],
    style_tags: ['bodybuilding', 'functional', 'hybrid'],
    substitution_group: 'shrug',
    unilateral: false,
    avg_duration_seconds: 28,
  },
  {
    name: 'Dumbbell Shrugs',
    id: 'dumbbell-shrugs',
    movement_pattern: 'isolation_trap',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['upper trapezius'],
    equipment: ['dumbbells'],
    joint_stress: 'low',
    form_cues: ['Arms at sides', 'Shrug straight up', 'Hold briefly', 'Control descent'],
    coach_note_swap: 'Neutral grip reduces wrist strain compared to barbell shrugs.',
    loads_joints: ['neck'],
    style_tags: ['bodybuilding', 'functional', 'hybrid'],
    substitution_group: 'shrug',
    unilateral: false,
    avg_duration_seconds: 28,
  },

  // Swap-depth fix, and the widest gap the coverage audit found: overhead
  // pressing held FIVE movements and not one machine — two barbell, two
  // dumbbell, one band. A trainee whose shoulder press station was busy had
  // only free-weight options, every one of them harder to self-spot.
  // 'shoulder press' in the name is load-bearing: it anchors this to the
  // OVERHEAD standard rather than the materially heavier bench one. See the
  // Landmine Press note in load-prescription.ts for what that fallback cost
  // last time it was missed.
  {
    name: 'Shoulder Press Machine',
    id: 'shoulder-press-machine',
    movement_pattern: 'vertical_push',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['anterior deltoid', 'lateral deltoid', 'triceps'],
    equipment: ['machine'],
    joint_stress: 'low',
    form_cues: [
      'Set the seat so the handles start at ear height',
      'Press up without shrugging the shoulders',
      'Keep the ribs down rather than arching the back',
      'Lower under control to the starting height',
    ],
    coach_note_swap: 'Guided overhead pressing when a bar overhead is the part that is limiting you.',
    loads_joints: ['shoulder', 'elbow'],
    contraindicated_joints: ['shoulder'],
    style_tags: ['bodybuilding', 'hybrid'],
    substitution_group: 'overhead_press',
    unilateral: false,
    avg_duration_seconds: 30,
  },

  // Swap-depth fix, measured: isolation_shoulder and isolation_trap were the
  // two thinnest patterns in the whole catalogue — ONE alternative each, at
  // every equipment tier. Thin enough that at home_gym and minimalist the
  // same-pattern list came back empty and NEAREST_PATTERN_FALLBACK took over,
  // handing a trainee who wanted a lateral raise a list of overhead presses.
  // Not a dead end (the fallback is doing its job) but not a real choice
  // either, which is a distinction worth keeping: see report:swap-coverage,
  // whose first cut reported this as a dead end and was wrong.
  //
  // Machine Lateral Raise below was briefly deleted and then restored, and
  // the reason is worth keeping. It put the constraint audit 56 failures
  // red against what was then a 25kg isolation_shoulder ceiling — and the
  // entry was correct all along. prescribeLoad stores a dumbbell pair PER
  // HAND and a machine as a TOTAL, so this movement's honest 40kg total
  // (identical real load to the dumbbell version's 20kg per hand) was being
  // compared against a ceiling calibrated in per-hand units. A sweep of the
  // whole population puts the heaviest per-hand lateral raise the app ever
  // prescribes at 20kg, inside 25. The ceiling table now states its unit
  // and the check normalises both sides; see SAFETY_CEILING_KG_TOTAL.
  // HOME-GYM AND MINIMALIST DEPTH, measured rather than guessed
  // (report:swap-coverage). isolation_shoulder held exactly one movement a
  // home trainee could reach — Lateral Raises — and Cable/Machine variants
  // need a gym, so the same-pattern list came back EMPTY and
  // NEAREST_PATTERN_FALLBACK handed them overhead presses instead. Not a dead
  // end, but being offered a compound press when you wanted a side-delt
  // isolation is not a real choice. Both entries below are reachable at
  // home_gym AND minimalist (dumbbells and a band are in both equipment
  // sets), which is the whole point of choosing these two implements.
  //
  // Neither carries a load-ceiling risk: a band is not in LOADED_EQUIPMENT so
  // no kilogram figure is prescribed at all, and Front Raises is a per-side
  // dumbbell pair like the Lateral Raises it sits beside — same category,
  // same unit, well inside the ceiling test:ceiling-units now guards.
  {
    name: 'Front Raises',
    id: 'front-raises',
    movement_pattern: 'isolation_shoulder',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['anterior deltoid'],
    equipment: ['dumbbells'],
    joint_stress: 'low',
    form_cues: [
      'Start with the weights against the thighs',
      'Raise to shoulder height, no higher',
      'Keep the elbows almost straight',
      'Do not lean back to get them up',
    ],
    coach_note_swap: 'Hits the front of the shoulder, which pressing works but rarely finishes off.',
    loads_joints: ['shoulder'],
    style_tags: ['bodybuilding', 'hybrid'],
    substitution_group: 'front_delt',
    unilateral: false,
    avg_duration_seconds: 26,
  },
  {
    name: 'Band Lateral Raise',
    id: 'band-lateral-raise',
    movement_pattern: 'isolation_shoulder',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'lateral',
    primary_muscles: ['lateral deltoid'],
    equipment: ['resistance band'],
    joint_stress: 'low',
    form_cues: [
      'Stand on the middle of the band',
      'Raise the arms out to the sides to shoulder height',
      'The band gets harder as you go — slow down, do not swing',
      'Resist all the way back down',
    ],
    coach_note_swap: 'The band is hardest at the top, exactly where a lateral raise is weakest.',
    loads_joints: ['shoulder'],
    style_tags: ['functional', 'hybrid'],
    substitution_group: 'lateral_delt',
    unilateral: false,
    avg_duration_seconds: 26,
  },
  {
    name: 'Machine Lateral Raise',
    id: 'machine-lateral-raise',
    movement_pattern: 'isolation_shoulder',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'lateral',
    primary_muscles: ['lateral deltoid'],
    equipment: ['machine'],
    joint_stress: 'low',
    form_cues: [
      'Set the pads against the outside of the upper arms',
      'Lead with the elbows, not the hands',
      'Stop at shoulder height',
      'Lower slowly rather than letting the stack drop',
    ],
    coach_note_swap: 'The pad keeps the load on the side delt when a dumbbell would start swinging.',
    loads_joints: ['shoulder'],
    style_tags: ['bodybuilding', 'hybrid'],
    substitution_group: 'lateral_delt',
    unilateral: false,
    avg_duration_seconds: 28,
  },
  {
    name: 'Band Shrug',
    id: 'band-shrug',
    movement_pattern: 'isolation_trap',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['upper traps'],
    equipment: ['resistance band'],
    joint_stress: 'low',
    form_cues: [
      'Stand on the band with the handles at your sides',
      'Shrug straight up, no rolling',
      'Pause at the top',
      'Let the shoulders travel all the way down',
    ],
    coach_note_swap: 'Trap work without needing a heavy bar or a cable stack.',
    loads_joints: ['shoulder', 'neck'],
    style_tags: ['functional', 'hybrid'],
    substitution_group: 'shrug',
    unilateral: false,
    avg_duration_seconds: 24,
  },
  {
    name: 'Cable Shrug',
    id: 'cable-shrug',
    movement_pattern: 'isolation_trap',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['upper traps'],
    equipment: ['cable machine'],
    joint_stress: 'low',
    form_cues: [
      'Stand tall with the cable in front of the thighs',
      'Shrug straight up, no rolling',
      'Hold the top for a beat',
      'Let the shoulders travel all the way down',
    ],
    coach_note_swap: 'Constant tension through the whole shrug, including the bottom.',
    loads_joints: ['shoulder', 'neck'],
    style_tags: ['bodybuilding', 'hybrid'],
    substitution_group: 'shrug',
    unilateral: false,
    avg_duration_seconds: 26,
  },

  // HIP HINGE
  {
    name: 'Deadlifts',
    id: 'deadlifts',
    movement_pattern: 'hip_hinge',
    contraindicated_joints: ['hip', 'knee', 'lower_back_axial', 'wrist'],
    mechanics_tier: 'tier1_compound',
    prescription_type: 'reps',
    // Torso orientation, not bar path (see AngleVector's doc comment): a
    // conventional deadlift has real forward lean at the bottom, not an
    // upright torso — 'diagonal', matching every other standing hip-hinge
    // with genuine forward lean (Trap Bar Deadlift, Romanian Deadlifts,
    // Kettlebell Swing Heavy).
    angle_vector: 'diagonal',
    primary_muscles: ['hamstrings', 'glutes', 'erectors', 'lats'],
    equipment: ['barbell'],
    joint_stress: 'high',
    form_cues: ['Bar over mid-foot', 'Hinge at hips', 'Neutral spine', 'Drive through heels', 'Lock out at top'],
    coach_note_swap: 'The ultimate posterior chain builder — maximum systemic load.',
    loads_joints: ['lower_back_axial', 'knee', 'wrist'],
    style_tags: ['bodybuilding', 'functional', 'combat', 'hybrid'],
    substitution_group: 'hip_hinge',
    unilateral: false,
    avg_duration_seconds: 45,
  },
  {
    name: 'Trap Bar Deadlift',
    id: 'trap-bar-deadlift',
    movement_pattern: 'hip_hinge',
    contraindicated_joints: ['hip', 'knee', 'lower_back_axial'],
    mechanics_tier: 'tier1_compound',
    prescription_type: 'reps',
    // 'diagonal', not 'vertical' — the trap bar reduces forward lean
    // relative to a straight-bar deadlift, but it's still a real hip-hinge
    // with meaningful torso pitch, not an upright torso. See Deadlifts'
    // comment and AngleVector's doc comment for the definition.
    angle_vector: 'diagonal',
    primary_muscles: ['hamstrings', 'glutes', 'quads', 'erectors'],
    equipment: ['trap bar'],
    joint_stress: 'moderate',
    form_cues: ['Stand in center', 'Hinge and grip handles', 'Neutral spine', 'Stand up powerfully'],
    coach_note_swap: 'Reduces lower-back shear while maintaining heavy hip-hinge loading.',
    loads_joints: ['lower_back_axial', 'knee'],
    style_tags: ['bodybuilding', 'functional', 'combat', 'hybrid'],
    substitution_group: 'hip_hinge',
    unilateral: false,
    avg_duration_seconds: 40,
  },
  {
    name: 'Romanian Deadlifts',
    id: 'romanian-deadlifts',
    movement_pattern: 'hip_hinge',
    contraindicated_joints: ['hip', 'lower_back_axial', 'wrist'],
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    // 'diagonal', not 'vertical' — form cues describe a pronounced hinge
    // (bar slides down the thighs to mid-shin), real forward torso lean,
    // not an upright torso. See AngleVector's doc comment for the
    // definition this now matches.
    angle_vector: 'diagonal',
    primary_muscles: ['hamstrings', 'glutes', 'erectors'],
    equipment: ['barbell', 'dumbbells'],
    // Either implement hinges the same way -- not both required.
    equipment_alternatives: true,
    joint_stress: 'moderate',
    form_cues: ['Soft knees', 'Push hips back', 'Bar slides down thighs', 'Stop at mid-shin', 'Squeeze glutes up'],
    coach_note_swap: 'Eccentric-focused hamstring builder with excellent stretch.',
    loads_joints: ['lower_back_axial', 'wrist'],
    style_tags: ['bodybuilding', 'functional', 'combat', 'hybrid'],
    substitution_group: 'hip_hinge',
    unilateral: false,
    avg_duration_seconds: 38,
  },
  {
    name: 'Good Mornings',
    id: 'good-mornings',
    movement_pattern: 'hip_hinge',
    contraindicated_joints: ['hip', 'lower_back_axial'],
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['hamstrings', 'glutes', 'erectors'],
    equipment: ['barbell'],
    joint_stress: 'moderate',
    form_cues: ['Bar on upper traps', 'Push hips back', 'Torso parallel to floor', 'Drive hips forward to stand'],
    coach_note_swap: 'A classic posterior chain builder that strengthens the hip hinge pattern under load.',
    loads_joints: ['lower_back_axial'],
    style_tags: ['bodybuilding', 'functional', 'hybrid'],
    substitution_group: 'hip_hinge',
    unilateral: false,
    avg_duration_seconds: 35,
  },
  {
    name: 'Kettlebell Swing (Heavy)',
    id: 'kettlebell-swing-heavy',
    movement_pattern: 'hip_hinge',
    contraindicated_joints: ['hip', 'lower_back_axial'],
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'diagonal',
    primary_muscles: ['glutes', 'hamstrings', 'core'],
    equipment: ['kettlebell'],
    joint_stress: 'low',
    form_cues: ['Hinge explosively', 'Snap hips forward', 'Float bell to chest height', 'Brace at top'],
    coach_note_swap: 'Ballistic hinge for power endurance and posterior chain conditioning.',
    loads_joints: ['lower_back_axial'],
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'hip_hinge',
    unilateral: false,
    avg_duration_seconds: 25,
  },
  {
    name: 'Glute Bridge',
    id: 'glute-bridge',
    movement_pattern: 'hip_hinge',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['glutes', 'hamstrings'],
    equipment: ['bodyweight'],
    joint_stress: 'low',
    form_cues: ['Feet flat, knees bent', 'Drive hips up by squeezing glutes', 'Hold briefly at the top', 'Lower with control'],
    coach_note_swap: 'No-equipment hip hinge — teaches glute-driven hip extension without any spinal loading.',
    loads_joints: [],
    style_tags: ['bodybuilding', 'functional', 'combat', 'hybrid'],
    substitution_group: 'hip_hinge',
    unilateral: false,
    avg_duration_seconds: 28,
  },
  {
    name: 'Single-Leg RDL (Bodyweight)',
    id: 'single-leg-rdl-bodyweight',
    movement_pattern: 'hip_hinge',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    // Was 'vertical' (matching Glute Bridge) — corrected to 'horizontal' to
    // match Bodyweight Good Morning: both are a standing torso-hinge
    // hip-hinge, the torso pitching toward horizontal, not a vertical hip
    // drive off the floor like Glute Bridge. This now diverges from
    // Romanian Deadlifts (its loaded namesake, 'diagonal') on purpose —
    // this variant's own coach_note_swap describes a deeper torso pitch
    // ("genuine balance and hamstring-stretch demand") than the loaded
    // RDL's moderate hinge. Both readings are consistent under
    // AngleVector's torso-orientation definition; they just describe
    // different depths of the same movement family.
    angle_vector: 'horizontal',
    primary_muscles: ['hamstrings', 'glutes', 'erectors'],
    equipment: ['bodyweight'],
    joint_stress: 'low',
    form_cues: ['Stand on one leg, soft knee', 'Hinge forward as the free leg extends behind', 'Keep hips square', 'Return to standing with control'],
    coach_note_swap: 'Unilateral hinge with a genuine balance and hamstring-stretch demand even without load.',
    loads_joints: [],
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'hip_hinge',
    unilateral: true,
    avg_duration_seconds: 32,
  },
  {
    name: 'Bodyweight Good Morning',
    id: 'bodyweight-good-morning',
    movement_pattern: 'hip_hinge',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['hamstrings', 'glutes', 'erectors'],
    equipment: ['bodyweight'],
    joint_stress: 'low',
    form_cues: ['Hands behind head or crossed on chest', 'Push hips back with a soft knee bend', 'Torso lowers toward parallel', 'Drive hips forward to stand'],
    coach_note_swap: 'Teaches the hip-hinge pattern under bodyweight-only load before it ever needs a bar.',
    loads_joints: [],
    style_tags: ['bodybuilding', 'functional', 'hybrid'],
    substitution_group: 'hip_hinge',
    unilateral: false,
    avg_duration_seconds: 30,
  },
  // Sliding Leg Curl / Lying Leg Curl: same knee-tag split as the shoulder
  // review. Both genuinely load the knee (loads_joints says so honestly),
  // but a controlled, low-range hamstring curl is a standard knee-rehab
  // tool, not a contraindication — unlike Nordic Hamstring Curl just below,
  // whose large eccentric knee-flexor demand keeps it excluded. Marked
  // indicated_joints (not just tolerated) because these are genuinely the
  // kind of accessory a physio prescribes FOR a knee injury, the same
  // reasoning that put Band Pull-Aparts in the shoulder-indicated set.
  {
    name: 'Sliding Leg Curl',
    id: 'sliding-leg-curl',
    movement_pattern: 'isolation_hamstring',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['hamstrings'],
    equipment: ['bodyweight'],
    joint_stress: 'low',
    form_cues: ['Lie back, heels on a towel or slider', 'Bridge the hips up', 'Curl heels toward glutes, hips staying elevated', 'Extend back out with control'],
    coach_note_swap: 'A genuine Nordic-curl regression — real hamstring loading with none of the skill demand.',
    loads_joints: ['knee'],
    contraindicated_joints: [],
    indicated_joints: ['knee'],
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'leg_curl',
    unilateral: false,
    avg_duration_seconds: 28,
  },
  // Swap-depth fix (measured after the first pass, not assumed): Seated
  // Band Leg Curl below needs a resistance band, which the bodyweight-only
  // equipment tier doesn't have — so Sliding Leg Curl was STILL the only
  // isolation_hamstring option there, the single worst remaining gap after
  // this session's first round of additions. Same equipment, same
  // mechanism, but genuinely harder (full weight on one leg) — a real
  // progression, not a duplicate.
  {
    name: 'Single-Leg Sliding Leg Curl',
    id: 'single-leg-sliding-leg-curl',
    movement_pattern: 'isolation_hamstring',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['hamstrings'],
    equipment: ['bodyweight'],
    joint_stress: 'low',
    form_cues: ['Lie back, one heel on a towel or slider, other leg lifted', 'Bridge the hips up on the working leg', 'Curl the heel toward the glute, hips staying elevated', 'Extend back out with control'],
    coach_note_swap: 'Same slider curl, one leg at a time — the working leg takes your full hip weight instead of sharing it.',
    loads_joints: ['knee'],
    contraindicated_joints: [],
    indicated_joints: ['knee'],
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'leg_curl',
    unilateral: true,
    avg_duration_seconds: 30,
  },
  // Swap-depth fix (measured): Sliding Leg Curl was the ONLY knee-indicated
  // hamstring isolation exercise at home_gym/minimalist equipment — anyone
  // without a slider-friendly floor had exactly one option. A band gives
  // the same short-range, low-shear knee-flexion work from different
  // equipment.
  {
    name: 'Seated Band Leg Curl',
    id: 'seated-band-leg-curl',
    movement_pattern: 'isolation_hamstring',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['hamstrings'],
    equipment: ['resistance band'],
    joint_stress: 'low',
    form_cues: ['Sit on a chair or the floor, band anchored in front', 'Loop the band around one ankle', 'Curl the heel toward the glute', 'Control the return, no jerking'],
    coach_note_swap: 'Short-range, controlled knee-flexion work with a band — the same low-shear hamstring loading a slider gives, for anyone without a smooth floor.',
    loads_joints: ['knee'],
    contraindicated_joints: [],
    indicated_joints: ['knee'],
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'leg_curl',
    unilateral: true,
    avg_duration_seconds: 28,
  },
  {
    name: 'Lying Leg Curl',
    id: 'lying-leg-curl',
    movement_pattern: 'isolation_hamstring',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['hamstrings'],
    equipment: ['machine'],
    joint_stress: 'low',
    form_cues: ['Pad above ankles', 'Curl heels toward glutes', 'Squeeze at top', 'Slow negative'],
    coach_note_swap: 'Isolated knee-flexion work for hamstring hypertrophy.',
    loads_joints: ['knee'],
    contraindicated_joints: [],
    indicated_joints: ['knee'],
    style_tags: ['bodybuilding', 'hybrid'],
    substitution_group: 'leg_curl',
    unilateral: false,
    avg_duration_seconds: 28,
  },
  {
    name: 'Nordic Hamstring Curl',
    id: 'nordic-hamstring-curl',
    movement_pattern: 'isolation_hamstring',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['hamstrings'],
    equipment: ['bodyweight'],
    joint_stress: 'moderate',
    form_cues: ['Kneel with ankles anchored', 'Lower torso forward slowly', 'Resist with hamstrings', 'Push off floor to return'],
    coach_note_swap: 'Eccentric hamstring strength — reduces injury risk significantly.',
    loads_joints: ['knee'],
    style_tags: ['functional', 'combat', 'hybrid'],
    capability_requirement: { minExperience: 'advanced', regression: 'Sliding Leg Curl' },
    substitution_group: 'leg_curl',
    unilateral: false,
    avg_duration_seconds: 30,
  },
  // Swap-depth fix: Lying Leg Curl (machine) had zero swap options at all --
  // a busy leg-curl station left nothing. These two give it a loaded,
  // off-machine alternative.
  {
    name: 'Seated Leg Curl',
    id: 'seated-leg-curl',
    movement_pattern: 'isolation_hamstring',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['hamstrings'],
    equipment: ['machine'],
    joint_stress: 'low',
    form_cues: ['Pad above ankles, seated upright', 'Curl heels down and under', 'Squeeze at bottom', 'Control the return'],
    coach_note_swap: 'Same isolated knee-flexion work as the lying version, from a different machine.',
    loads_joints: ['knee'],
    style_tags: ['bodybuilding', 'hybrid'],
    substitution_group: 'leg_curl',
    unilateral: false,
    avg_duration_seconds: 28,
  },
  {
    name: 'Dumbbell Leg Curl',
    id: 'dumbbell-leg-curl',
    movement_pattern: 'isolation_hamstring',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['hamstrings'],
    equipment: ['dumbbells'],
    joint_stress: 'low',
    form_cues: ['Lie face down, dumbbell held between feet', 'Curl heels toward glutes', 'Squeeze at top', 'Lower with control'],
    coach_note_swap: 'A real loaded leg curl with nothing but a dumbbell and a floor — no machine required.',
    loads_joints: ['knee'],
    style_tags: ['bodybuilding', 'functional', 'hybrid'],
    substitution_group: 'leg_curl',
    unilateral: false,
    avg_duration_seconds: 30,
  },

  // No hip thrust existed anywhere in the catalogue — glute work was carried
  // entirely by hinges and single-leg movements. LOAD NOTE, deliberate and
  // flagged rather than discovered later: the name matches none of
  // categorize()'s substrings, so it falls through to the hip_hinge pattern
  // default and is priced as 'hinge_accessory' (0.55x deadlift 1RM). A real
  // hip thrust is usually HEAVIER than an RDL, so this under-prescribes. That
  // is the safe direction and it is left deliberately conservative — a
  // trainee adding plates is a better failure than a trainee pinned under
  // them on the first session.
  {
    name: 'Hip Thrust',
    id: 'hip-thrust',
    movement_pattern: 'hip_hinge',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['glutes', 'hamstrings'],
    equipment: ['barbell', 'bench'],
    joint_stress: 'low',
    form_cues: [
      'Shoulder blades on the bench, feet flat and shins vertical at the top',
      'Drive through the heels',
      'Squeeze the glutes at the top, ribs down',
      'Do not arch the lower back to gain height',
    ],
    coach_note_swap: 'Loads the glutes hard with almost nothing on the spine.',
    loads_joints: ['hip'],
    contraindicated_joints: [],
    style_tags: ['bodybuilding', 'functional', 'hybrid'],
    substitution_group: 'hip_thrust',
    unilateral: false,
    avg_duration_seconds: 32,
  },

  // KNEE DOMINANT
  {
    name: 'Barbell Squats',
    id: 'barbell-squats',
    movement_pattern: 'knee_dominant',
    contraindicated_joints: ['hip', 'knee', 'lower_back_axial', 'wrist'],
    mechanics_tier: 'tier1_compound',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['quadriceps', 'glutes', 'hamstrings', 'core'],
    equipment: ['barbell', 'squat rack'],
    joint_stress: 'high',
    form_cues: ['Bar on upper traps', 'Break at hips and knees', 'Knees track over toes', 'Depth to parallel or below', 'Drive up through heels'],
    coach_note_swap: 'The foundational lower body strength exercise.',
    loads_joints: ['lower_back_axial', 'knee', 'wrist'],
    style_tags: ['bodybuilding', 'functional', 'combat', 'hybrid'],
    substitution_group: 'squat',
    unilateral: false,
    avg_duration_seconds: 42,
  },
  {
    name: 'Leg Press',
    id: 'leg-press',
    movement_pattern: 'knee_dominant',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'diagonal',
    primary_muscles: ['quadriceps', 'glutes'],
    equipment: ['leg press machine'],
    joint_stress: 'moderate',
    form_cues: ['Feet shoulder-width on platform', 'Lower until 90-degree knee angle', 'Do not lock knees at top', 'Keep lower back pressed into seat'],
    coach_note_swap: 'Heavy quad loading without spinal compression.',
    loads_joints: ['knee'],
    style_tags: ['bodybuilding', 'hybrid'],
    substitution_group: 'squat',
    unilateral: false,
    avg_duration_seconds: 35,
  },
  {
    name: 'Goblet Squats',
    id: 'goblet-squats',
    movement_pattern: 'knee_dominant',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['quadriceps', 'glutes', 'core'],
    equipment: ['dumbbell', 'kettlebell'],
    // Either implement holds the same way -- not both required.
    equipment_alternatives: true,
    joint_stress: 'low',
    form_cues: ['Hold weight at chest', 'Elbows between knees at bottom', 'Upright torso', 'Full depth'],
    coach_note_swap: 'Teaches squat mechanics with natural upright posture.',
    loads_joints: ['knee'],
    style_tags: ['bodybuilding', 'functional', 'hybrid'],
    substitution_group: 'squat',
    unilateral: false,
    avg_duration_seconds: 32,
  },
  {
    name: 'Hack Squat',
    id: 'hack-squat',
    movement_pattern: 'knee_dominant',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'diagonal',
    primary_muscles: ['quadriceps', 'glutes'],
    equipment: ['hack squat machine'],
    joint_stress: 'moderate',
    form_cues: ['Shoulder pads secure', 'Feet lower on platform for quad emphasis', 'Full depth', 'Drive through heels'],
    coach_note_swap: 'Machine-guided squat that isolates quads with back support.',
    loads_joints: ['knee'],
    style_tags: ['bodybuilding', 'hybrid'],
    substitution_group: 'squat',
    unilateral: false,
    avg_duration_seconds: 35,
  },
  {
    name: 'Leg Extensions',
    id: 'leg-extensions',
    movement_pattern: 'isolation_quad',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['quadriceps'],
    equipment: ['machine'],
    joint_stress: 'moderate',
    form_cues: ['Pad above ankles', 'Extend fully', 'Squeeze at top', 'Control the descent'],
    coach_note_swap: 'Open-chain quad isolation for targeted hypertrophy.',
    loads_joints: ['knee'],
    style_tags: ['bodybuilding', 'hybrid'],
    substitution_group: 'quad_isolation',
    unilateral: false,
    avg_duration_seconds: 28,
  },
  // Swap-depth fix: Leg Extensions had zero swap options. Sissy Squat is
  // the bodyweight escape, but it's the opposite end of the knee-stress
  // spectrum from the Wall Sit/Spanish Squat additions above -- a deep,
  // leaned-back bodyweight knee flexion under real eccentric control, not
  // a neutral option. Gated to advanced and marked knee-contraindicated,
  // not offered as a general "no equipment" substitute.
  {
    name: 'Sissy Squat',
    id: 'sissy-squat',
    movement_pattern: 'isolation_quad',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['quadriceps'],
    equipment: ['bodyweight'],
    joint_stress: 'high',
    form_cues: ['Rise onto toes, hold a support for balance', 'Lean back as the knees drive forward', 'Lower until a deep quad stretch', 'Drive back up through the quads'],
    coach_note_swap: 'Deep, leaned-back knee flexion under full bodyweight — real quad demand, real knee stress. Not a substitute for someone easing back into training.',
    loads_joints: ['knee'],
    contraindicated_joints: ['knee'],
    style_tags: ['bodybuilding', 'functional', 'hybrid'],
    capability_requirement: { minExperience: 'advanced', regression: 'Leg Extensions' },
    substitution_group: 'quad_isolation',
    unilateral: false,
    avg_duration_seconds: 30,
  },
  // ---------------------------------------------------------------------
  // Knee-friendly additions. A knee injury correctly excludes every
  // knee_dominant/single_leg/isolation_quad movement above -- and until
  // now that left NO direct quad-focused work at all, the same content gap
  // the shoulder-friendly presses closed. These four are deliberately
  // low-compressive/low-shear variants used in real knee rehab protocols:
  // an isometric hold, a closed-chain squat with an anchor that unloads
  // the knee, a short-range banded terminal extension, and a shallow step
  // with reduced knee flexion. All genuinely load the knee (loads_joints
  // says so honestly) but are indicated_joints, not merely tolerated --
  // the whole reason they exist is to be prescribed for a knee injury.
  // Leg Extensions above is deliberately NOT given this treatment: full
  // open-chain knee extension is commonly contraindicated for
  // patellofemoral pain, the most common knee complaint, so it stays a
  // plain contraindication rather than a judgment call this app can't make
  // without knowing the injury subtype.
  // ---------------------------------------------------------------------
  {
    name: 'Wall Sit',
    id: 'wall-sit',
    movement_pattern: 'knee_dominant',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'time',
    angle_vector: 'vertical',
    primary_muscles: ['quadriceps', 'glutes'],
    equipment: ['bodyweight'],
    joint_stress: 'low',
    form_cues: ['Back flat against a wall', 'Thighs parallel to floor, or as close as comfortable', 'Knees stacked over ankles, not past toes', 'Breathe steadily and hold'],
    coach_note_swap: 'Isometric quad work with no eccentric or joint-shear component — a standard knee-rehab hold.',
    loads_joints: ['knee'],
    contraindicated_joints: [],
    indicated_joints: ['knee'],
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'knee_isometric',
    unilateral: false,
    avg_duration_seconds: 40,
  },
  {
    name: 'Spanish Squat',
    id: 'spanish-squat',
    movement_pattern: 'knee_dominant',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'time',
    angle_vector: 'vertical',
    primary_muscles: ['quadriceps'],
    equipment: ['resistance band'],
    joint_stress: 'low',
    form_cues: ['Loop a heavy band around a sturdy anchor and behind both knees', 'Sit back against the band, torso upright', 'Lower to a comfortable depth and hold', 'The band takes the shear the knee would otherwise absorb'],
    coach_note_swap: 'The band lets the torso counterbalance the squat, which shifts load off the knee joint while still driving real quad tension — a standard patellar-tendon rehab tool.',
    loads_joints: ['knee'],
    contraindicated_joints: [],
    indicated_joints: ['knee'],
    style_tags: ['functional', 'hybrid'],
    substitution_group: 'knee_isometric',
    unilateral: false,
    avg_duration_seconds: 40,
  },
  {
    name: 'Banded Terminal Knee Extension',
    id: 'banded-terminal-knee-extension',
    movement_pattern: 'isolation_quad',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['quadriceps'],
    equipment: ['resistance band'],
    joint_stress: 'low',
    form_cues: ['Anchor a band behind the knee at knee height', 'Start with a slight bend', 'Straighten the knee fully against the band', 'Control the return, do not let the band snap it back'],
    coach_note_swap: 'Short-range, closed-chain extension near lockout — builds the terminal quad strength a knee needs without the open-chain shear a full leg extension creates.',
    loads_joints: ['knee'],
    contraindicated_joints: [],
    indicated_joints: ['knee'],
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'quad_isolation',
    unilateral: true,
    avg_duration_seconds: 28,
  },
  // Swap-depth fix (measured): isolation_quad was the single worst pattern
  // in the whole catalogue — 11 of 59 measured zero-swap situations. Two
  // gaps, two different fixes:
  // 1. At home_gym/minimalist equipment, an intermediate trainee with no
  //    injury had exactly one isolation_quad option (Banded Terminal Knee
  //    Extension) — Leg Extensions needs a machine, Sissy Squat is gated to
  //    advanced. A genuine bodyweight, non-gated quad isolation closes it.
  // 2. Banded Terminal Knee Extension was ALSO the only knee-INDICATED
  //    option at every equipment tier, including full_gym — a knee injury
  //    left exactly one option regardless of what gym someone had. A second
  //    knee-safe isolation with different equipment (none at all) closes
  //    that at every tier simultaneously.
  {
    name: 'Chair Leg Extension',
    id: 'chair-leg-extension',
    movement_pattern: 'isolation_quad',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['quadriceps'],
    equipment: ['bodyweight'],
    joint_stress: 'moderate',
    form_cues: ['Sit tall on the edge of a sturdy chair', 'Extend one leg fully, foot flexed', 'Hold briefly at the top', 'Lower with control, no swinging'],
    coach_note_swap: 'The same open-chain quad extension as a leg-extension machine, done seated with just your own bodyweight.',
    loads_joints: ['knee'],
    style_tags: ['bodybuilding', 'functional', 'hybrid'],
    substitution_group: 'quad_isolation',
    unilateral: true,
    avg_duration_seconds: 26,
  },
  {
    name: 'Seated Short-Arc Quad Set',
    id: 'seated-short-arc-quad-set',
    movement_pattern: 'isolation_quad',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['quadriceps'],
    equipment: ['bodyweight'],
    joint_stress: 'low',
    form_cues: ['Sit with the leg mostly straight, a small roll or towel under the knee', 'Push the back of the knee down into the roll', 'Lift the heel a few centimetres, hold', 'Lower with control — small range throughout'],
    coach_note_swap: 'A short-arc "quad set" near full extension — standard physio-clinic knee rehab, and needs nothing but a rolled towel.',
    loads_joints: ['knee'],
    contraindicated_joints: [],
    indicated_joints: ['knee'],
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'quad_isolation',
    unilateral: true,
    avg_duration_seconds: 24,
  },

  // SINGLE LEG
  {
    name: 'Walking Lunges',
    id: 'walking-lunges',
    movement_pattern: 'single_leg',
    contraindicated_joints: ['ankle', 'hip', 'knee'],
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['quadriceps', 'glutes', 'hamstrings'],
    equipment: ['dumbbells', 'bodyweight'],
    joint_stress: 'moderate',
    form_cues: ['Long stride', 'Back knee near floor', 'Upright torso', 'Push off front heel'],
    coach_note_swap: 'Dynamic unilateral work building balance and single-leg strength.',
    loads_joints: ['knee'],
    style_tags: ['bodybuilding', 'functional', 'combat', 'hybrid'],
    substitution_group: 'single_leg',
    unilateral: true,
    avg_duration_seconds: 35,
  },
  {
    name: 'Bulgarian Split Squats',
    id: 'bulgarian-split-squats',
    movement_pattern: 'single_leg',
    contraindicated_joints: ['ankle', 'hip', 'knee'],
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['quadriceps', 'glutes', 'hamstrings'],
    equipment: ['dumbbells', 'bench'],
    joint_stress: 'moderate',
    form_cues: ['Rear foot on bench', 'Lower until front thigh is parallel', 'Lean slightly forward', 'Drive up through front heel'],
    coach_note_swap: 'Unilateral knee-dominant with excellent quad stretch and balance demand.',
    loads_joints: ['knee'],
    style_tags: ['bodybuilding', 'functional', 'combat', 'hybrid'],
    substitution_group: 'single_leg',
    unilateral: true,
    avg_duration_seconds: 38,
  },
  {
    name: 'Step-Ups',
    id: 'step-ups',
    movement_pattern: 'single_leg',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['quadriceps', 'glutes'],
    equipment: ['dumbbells', 'box'],
    joint_stress: 'low',
    form_cues: ['Box at knee height', 'Drive through front heel', 'Stand fully at top', 'Lower with control'],
    coach_note_swap: 'Low-impact unilateral leg work emphasizing glute drive.',
    loads_joints: ['knee'],
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'single_leg',
    unilateral: true,
    avg_duration_seconds: 32,
  },

  {
    name: 'Air Squat',
    id: 'air-squat',
    movement_pattern: 'knee_dominant',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['quadriceps', 'glutes', 'hamstrings'],
    equipment: ['bodyweight'],
    joint_stress: 'low',
    form_cues: ['Feet shoulder-width', 'Break at hips and knees together', 'Depth to parallel or below', 'Drive up through the whole foot'],
    coach_note_swap: 'The no-equipment squat pattern — depth and tempo replace load as the intensity lever.',
    loads_joints: ['knee'],
    style_tags: ['bodybuilding', 'functional', 'combat', 'hybrid'],
    substitution_group: 'squat',
    unilateral: false,
    avg_duration_seconds: 30,
  },
  // Swap-depth fix (measured): at bodyweight-only equipment, Air Squat had
  // zero swap options — it's on REGRESSION_VARIATIONS itself, and Wall Sit
  // (the other bodyweight knee_dominant entry) is a genuinely different
  // movement quality (isometric hold vs. dynamic reps), not interchangeable
  // as a like-for-like swap. This is a real second dynamic squat pattern,
  // not a regression.
  {
    name: 'Box Squat (Bodyweight)',
    id: 'box-squat-bodyweight',
    movement_pattern: 'knee_dominant',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['quadriceps', 'glutes', 'hamstrings'],
    equipment: ['bodyweight'],
    joint_stress: 'low',
    form_cues: ['A box or sturdy chair just below knee height', 'Sit back with the hips, not straight down', 'Lightly touch the box, do not relax onto it', 'Drive back up through the heels'],
    coach_note_swap: 'Same no-equipment squat as Air Squat, but the box teaches a hips-back pattern and gives a consistent depth target every rep.',
    loads_joints: ['knee'],
    style_tags: ['bodybuilding', 'functional', 'combat', 'hybrid'],
    substitution_group: 'squat',
    unilateral: false,
    avg_duration_seconds: 32,
  },
  {
    name: 'Split Squat (Bodyweight)',
    id: 'split-squat-bodyweight',
    movement_pattern: 'single_leg',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['quadriceps', 'glutes', 'hamstrings'],
    equipment: ['bodyweight'],
    joint_stress: 'low',
    form_cues: ['Long staggered stance', 'Back knee lowers toward the floor', 'Upright torso', 'Drive through the front heel'],
    coach_note_swap: 'Single-leg squat pattern with no equipment needed — a stepping stone toward Bulgarian split squats once weight is available.',
    loads_joints: ['knee'],
    style_tags: ['bodybuilding', 'functional', 'combat', 'hybrid'],
    substitution_group: 'single_leg',
    unilateral: true,
    avg_duration_seconds: 32,
  },
  {
    name: 'Step-Ups (Bodyweight)',
    id: 'step-ups-bodyweight',
    movement_pattern: 'single_leg',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['quadriceps', 'glutes'],
    equipment: ['bodyweight'],
    joint_stress: 'low',
    form_cues: ['Use a sturdy step, stair, or bench', 'Drive through the lead heel', 'Stand fully at the top', 'Lower with control'],
    coach_note_swap: 'Same pattern as the loaded version — any stable elevated surface works.',
    loads_joints: ['knee'],
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'single_leg',
    unilateral: true,
    avg_duration_seconds: 32,
  },
  {
    name: 'Low Box Step-Up',
    id: 'low-box-step-up',
    movement_pattern: 'single_leg',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['quadriceps', 'glutes'],
    equipment: ['bodyweight'],
    joint_stress: 'low',
    form_cues: ['A curb-height step or low box — well below knee height', 'Drive through the lead heel', 'Stand fully at the top without shoving off the trailing leg', 'Lower with control'],
    coach_note_swap: 'The same step-up pattern at a shallow height, which keeps knee flexion in a smaller, lower-stress range — a standard early-stage regression for a knee injury.',
    loads_joints: ['knee'],
    contraindicated_joints: [],
    indicated_joints: ['knee'],
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'single_leg',
    unilateral: true,
    avg_duration_seconds: 30,
  },
  // Swap-depth fix (measured): Low Box Step-Up was the ONLY knee-indicated
  // single-leg exercise — a knee injury left exactly one option in this
  // whole pattern. A controlled eccentric step-down is a distinct rehab
  // tool (loaded control on the way down, not concentric drive up), and a
  // genuine second one.
  {
    name: 'Step-Down (Eccentric)',
    id: 'step-down-eccentric',
    movement_pattern: 'single_leg',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['quadriceps', 'glutes'],
    equipment: ['bodyweight'],
    joint_stress: 'low',
    form_cues: ['Stand on a low step or curb, well below knee height', 'Lower the free leg toward the floor with control', 'Tap the heel lightly, don’t collapse into it', 'Drive back up through the standing leg'],
    coach_note_swap: 'Slow, controlled lowering rather than a drive up — the eccentric-control side of knee rehab that a step-up alone doesn’t train.',
    loads_joints: ['knee'],
    contraindicated_joints: [],
    indicated_joints: ['knee'],
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'single_leg',
    unilateral: true,
    avg_duration_seconds: 30,
  },
  {
    name: 'Pistol Squat Progression',
    id: 'pistol-squat-progression',
    movement_pattern: 'single_leg',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['quadriceps', 'glutes', 'hamstrings', 'core'],
    equipment: ['bodyweight'],
    joint_stress: 'moderate',
    form_cues: ['Extend the non-working leg forward', 'Lower under control, using a box/rail for balance if needed', 'Full depth on the working leg', 'Stand back up without the other foot touching down'],
    coach_note_swap: 'The single-leg squat ceiling for a trainee with no external load available — genuinely heavy on one leg.',
    loads_joints: ['knee'],
    style_tags: ['functional', 'combat', 'hybrid'],
    capability_requirement: { minExperience: 'advanced', regression: 'Split Squat (Bodyweight)' },
    substitution_group: 'single_leg',
    unilateral: true,
    avg_duration_seconds: 35,
  },

  // CARRY / LOADED CARRY
  {
    name: "Farmer's Walk",
    id: 'farmer-s-walk',
    movement_pattern: 'carry',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'distance_load',
    angle_vector: 'none',
    primary_muscles: ['forearms', 'traps', 'core', 'glutes'],
    equipment: ['dumbbells', 'farmer handles'],
    // Either implement carries the same way -- not both required.
    equipment_alternatives: true,
    joint_stress: 'low',
    form_cues: ['Heavy weight in each hand', 'Tall posture', 'Short quick steps', 'Brace core throughout'],
    coach_note_swap: 'Total-body bracing exercise that builds grip, traps, and core stability.',
    loads_joints: ['wrist'],
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'carry',
    unilateral: false,
    avg_duration_seconds: 35,
  },
  {
    name: 'Suitcase Carry',
    id: 'suitcase-carry',
    movement_pattern: 'carry',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'distance_load',
    angle_vector: 'lateral',
    primary_muscles: ['obliques', 'core', 'forearms', 'traps'],
    equipment: ['dumbbell', 'kettlebell'],
    // Either implement carries the same way -- not both required.
    equipment_alternatives: true,
    joint_stress: 'low',
    form_cues: ['Heavy weight in one hand only', 'Resist lateral lean', 'Walk tall and straight', 'Switch sides'],
    coach_note_swap: 'Anti-lateral flexion carry that hammers obliques and stabilizers.',
    loads_joints: ['wrist'],
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'carry',
    unilateral: true,
    avg_duration_seconds: 35,
  },
  {
    name: 'Overhead Carry',
    id: 'overhead-carry',
    movement_pattern: 'carry',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'distance_load',
    angle_vector: 'vertical',
    primary_muscles: ['shoulders', 'core', 'traps', 'serratus anterior'],
    equipment: ['dumbbell', 'kettlebell'],
    // Either implement carries the same way -- not both required.
    equipment_alternatives: true,
    joint_stress: 'moderate',
    form_cues: ['Lock weight overhead', 'Ribs down, core braced', 'Walk with control', 'Maintain vertical arm'],
    coach_note_swap: 'Overhead stability carry that builds shoulder health and core anti-extension.',
    loads_joints: ['shoulder'],
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'carry',
    unilateral: true,
    avg_duration_seconds: 35,
  },
  {
    name: 'Trap Bar Carry',
    id: 'trap-bar-carry',
    movement_pattern: 'carry',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'distance_load',
    angle_vector: 'none',
    primary_muscles: ['forearms', 'traps', 'core', 'glutes', 'quads'],
    equipment: ['trap bar'],
    joint_stress: 'low',
    form_cues: ['Load heavy', 'Stand tall', 'Walk with short controlled steps', 'Maintain neutral spine'],
    coach_note_swap: 'Highest-load carry variation for total-body strength and grip endurance.',
    loads_joints: ['wrist'],
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'carry',
    unilateral: false,
    avg_duration_seconds: 35,
  },
  {
    name: 'Loaded Backpack Walk',
    id: 'loaded-backpack-walk',
    movement_pattern: 'carry',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'distance_load',
    angle_vector: 'none',
    primary_muscles: ['traps', 'core', 'glutes', 'legs'],
    // See Backpack Row's equipment comment — same fix, same reason.
    equipment: ['bodyweight', 'weighted backpack'],
    joint_stress: 'low',
    form_cues: ['Load weight onto a backpack evenly', 'Stand tall with chest up', 'Walk with controlled steps', 'Brace core throughout', 'Complete duration before switching load distribution'],
    coach_note_swap: 'Bodyweight-compatible carry using a weighted backpack or heavy backpack. Great for combating time-crunched scenarios.',
    loads_joints: [],
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'carry',
    unilateral: false,
    avg_duration_seconds: 40,
  },
  {
    name: 'Farmer Squat Hold (Isometric Carry)',
    id: 'farmer-squat-hold-isometric-carry',
    movement_pattern: 'carry',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'time',
    angle_vector: 'none',
    primary_muscles: ['core', 'legs', 'glutes', 'traps'],
    equipment: ['bodyweight'],
    joint_stress: 'low',
    form_cues: ['Stand at rest position or partial squat', 'Brace core maximally', 'Maintain stable posture', 'Breathe steadily under tension'],
    coach_note_swap: 'Isometric carry that builds anti-gravity stability. Perfect for bodyweight-only environments when hold duration matters more than movement.',
    loads_joints: [],
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'carry',
    unilateral: false,
    avg_duration_seconds: 45,
  },

  // CALF
  {
    name: 'Calf Raises',
    id: 'calf-raises',
    movement_pattern: 'isolation_calf',
    contraindicated_joints: ['ankle'],
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['gastrocnemius', 'soleus'],
    equipment: ['machine', 'bodyweight'],
    joint_stress: 'low',
    form_cues: ['Full range of motion', 'Pause at the top', 'Stretch at the bottom', 'Straight legs'],
    coach_note_swap: 'Standing variation emphasizes the gastrocnemius.',
    loads_joints: [],
    style_tags: ['bodybuilding', 'hybrid'],
    substitution_group: 'calf',
    unilateral: false,
    avg_duration_seconds: 28,
  },
  {
    name: 'Seated Calf Raises',
    id: 'seated-calf-raises',
    movement_pattern: 'isolation_calf',
    contraindicated_joints: ['ankle'],
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['soleus'],
    equipment: ['machine'],
    joint_stress: 'low',
    form_cues: ['Knees bent at 90 degrees', 'Full range of motion', 'Slow eccentrics', 'Pause at peak'],
    coach_note_swap: 'Bent-knee position isolates the deeper soleus muscle.',
    loads_joints: [],
    style_tags: ['bodybuilding', 'hybrid'],
    substitution_group: 'calf',
    unilateral: false,
    avg_duration_seconds: 28,
  },
  // Swap-depth fix: Calf Raises (machine) and Seated Calf Raises were each
  // other's only swap -- both machine-bound, so a busy calf station left
  // nothing. A single-leg dumbbell version off the edge of any step is the
  // loaded, off-machine escape.
  {
    name: 'Single-Leg Dumbbell Calf Raise',
    id: 'single-leg-dumbbell-calf-raise',
    movement_pattern: 'isolation_calf',
    contraindicated_joints: ['ankle'],
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['gastrocnemius', 'soleus'],
    equipment: ['dumbbell'],
    joint_stress: 'low',
    form_cues: ['Stand on one foot at the edge of a step, dumbbell in the same-side hand', 'Lower heel below the step for a full stretch', 'Rise onto the toes', 'Pause at the top'],
    coach_note_swap: 'A real loaded calf raise off a step edge — no machine needed, and unilateral catches side-to-side imbalances a machine hides.',
    loads_joints: [],
    style_tags: ['bodybuilding', 'functional', 'hybrid'],
    substitution_group: 'calf',
    unilateral: true,
    avg_duration_seconds: 30,
  },

  {
    name: 'Calf Raises (Bodyweight)',
    id: 'calf-raises-bodyweight',
    movement_pattern: 'isolation_calf',
    contraindicated_joints: ['ankle'],
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['gastrocnemius', 'soleus'],
    equipment: ['bodyweight'],
    joint_stress: 'low',
    form_cues: ['Stand on a flat surface or step edge', 'Rise onto the balls of the feet', 'Pause at the top', 'Lower under control for a full stretch'],
    coach_note_swap: 'No machine needed — a step edge adds range of motion in place of load.',
    loads_joints: [],
    style_tags: ['bodybuilding', 'functional', 'combat', 'hybrid'],
    substitution_group: 'calf',
    unilateral: false,
    avg_duration_seconds: 26,
  },
  // Swap-depth fix (measured): at bodyweight-only equipment, Calf Raises
  // (Bodyweight) had zero swap options in EVERY injury state — it was the
  // only calf exercise this tier could ever offer at all. Going single-leg
  // adds real intensity without needing any load.
  {
    name: 'Single-Leg Calf Raise (Bodyweight)',
    id: 'single-leg-calf-raise-bodyweight',
    movement_pattern: 'isolation_calf',
    contraindicated_joints: ['ankle'],
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['gastrocnemius', 'soleus'],
    equipment: ['bodyweight'],
    joint_stress: 'low',
    form_cues: ['Stand on one foot, a step edge if available', 'Rise onto the ball of that foot', 'Pause at the top', 'Lower under control for a full stretch'],
    coach_note_swap: 'Full bodyweight on one leg is real added resistance — no dumbbell needed to make this genuinely harder than the two-footed version.',
    loads_joints: [],
    style_tags: ['bodybuilding', 'functional', 'hybrid'],
    substitution_group: 'calf',
    unilateral: true,
    avg_duration_seconds: 28,
  },

  // BICEPS
  {
    name: 'Barbell Curls',
    id: 'barbell-curls',
    movement_pattern: 'isolation_bicep',
    contraindicated_joints: ['elbow', 'wrist'],
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['biceps brachii'],
    equipment: ['barbell'],
    joint_stress: 'low',
    form_cues: ['Elbows pinned to sides', 'Full extension at bottom', 'Squeeze at top', 'No swinging'],
    coach_note_swap: 'The classic mass builder for biceps.',
    loads_joints: ['wrist'],
    style_tags: ['bodybuilding', 'hybrid'],
    substitution_group: 'bicep_curl',
    unilateral: false,
    avg_duration_seconds: 30,
  },
  {
    name: 'Dumbbell Curls',
    id: 'dumbbell-curls',
    movement_pattern: 'isolation_bicep',
    contraindicated_joints: ['elbow'],
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['biceps brachii'],
    equipment: ['dumbbells'],
    joint_stress: 'low',
    form_cues: ['Supinate as you curl', 'Elbows stable', 'Full range', 'Alternate or simultaneous'],
    coach_note_swap: 'Free-wrist supination for peak bicep contraction.',
    loads_joints: [],
    style_tags: ['bodybuilding', 'hybrid'],
    substitution_group: 'bicep_curl',
    unilateral: false,
    avg_duration_seconds: 28,
  },
  {
    name: 'Hammer Curls',
    id: 'hammer-curls',
    movement_pattern: 'isolation_bicep',
    contraindicated_joints: ['elbow'],
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['brachioradialis', 'biceps brachii'],
    equipment: ['dumbbells'],
    joint_stress: 'low',
    form_cues: ['Neutral grip (palms facing)', 'Curl to shoulder', 'No wrist rotation', 'Elbows stay put'],
    coach_note_swap: 'Targets brachioradialis and forearm thickness.',
    loads_joints: [],
    style_tags: ['bodybuilding', 'hybrid'],
    substitution_group: 'bicep_curl',
    unilateral: false,
    avg_duration_seconds: 28,
  },
  // Swap-depth fix, and closes the minimalist-tier isolation_bicep content
  // gap the thinness audit found -- Dumbbell Curls and Hammer Curls were
  // each other's only option, and the tier had no band-based isolation
  // pair at all despite owning bands.
  {
    name: 'Band Curl',
    id: 'band-curl',
    movement_pattern: 'isolation_bicep',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['biceps brachii'],
    equipment: ['resistance band'],
    joint_stress: 'low',
    form_cues: ['Stand on the band, feet shoulder-width', 'Elbows pinned to sides', 'Curl to full contraction', 'Control the return, no slack in the band'],
    coach_note_swap: 'Accommodating resistance curl — heaviest at the top of the contraction.',
    loads_joints: [],
    style_tags: ['bodybuilding', 'hybrid'],
    substitution_group: 'bicep_curl',
    unilateral: false,
    avg_duration_seconds: 28,
  },
  {
    name: 'Cable Curls',
    id: 'cable-curls',
    movement_pattern: 'isolation_bicep',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'diagonal',
    primary_muscles: ['biceps brachii'],
    equipment: ['cable machine'],
    joint_stress: 'low',
    form_cues: ['Low cable attachment', 'Curl with constant tension', 'Squeeze at top', 'Slow negative'],
    coach_note_swap: 'Continuous tension throughout the entire curl arc.',
    loads_joints: [],
    style_tags: ['bodybuilding', 'hybrid'],
    substitution_group: 'bicep_curl',
    unilateral: false,
    avg_duration_seconds: 28,
  },
  {
    name: 'Incline Dumbbell Curls',
    id: 'incline-dumbbell-curls',
    movement_pattern: 'isolation_bicep',
    contraindicated_joints: ['elbow'],
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'diagonal',
    primary_muscles: ['biceps brachii (long head)'],
    equipment: ['dumbbells', 'incline bench'],
    joint_stress: 'low',
    form_cues: ['Lie on incline bench', 'Arms hang behind torso', 'Curl without swinging', 'Maximum stretch at bottom'],
    coach_note_swap: 'Incline angle pre-stretches the long head for superior activation.',
    loads_joints: [],
    style_tags: ['bodybuilding', 'hybrid'],
    substitution_group: 'bicep_curl',
    unilateral: true,
    avg_duration_seconds: 30,
  },

  // NO PREACHER CURL, and the reason is a constraint on every future
  // catalogue addition, not a fact about preacher curls.
  //
  // One was written and pulled back out: it put 3 of 13,967 audit
  // combinations over the duration tolerance, all of them the same
  // "Back & Biceps" day on a 30-45 minute bodybuilding split, landing at
  // exactly the +15% boundary. Traced rather than guessed — that day went
  // from FIVE exercises to SEVEN, gaining a second bicep movement alongside
  // Barbell Curls. Adding a candidate does not merely change which exercise
  // is picked; a deeper pool lets the day-filler fit one more distinct
  // movement, and on a short session that is the difference between fitting
  // and not.
  //
  // So depth is not free, and it is least free where the pattern is ALREADY
  // deep: isolation_bicep had six entries and no swap problem at all. The
  // additions that earn their duration cost are the ones in thin patterns
  // (vertical_push had five movements and no machine) or the ones a trainee
  // physically cannot substitute for (a flat chest press machine). Any
  // future entry in an already-deep pattern must be measured against
  // test:audit before it is assumed harmless.
  //
  // TRICEPS
  {
    name: 'Tricep Dips',
    id: 'tricep-dips',
    movement_pattern: 'isolation_tricep',
    contraindicated_joints: ['elbow', 'shoulder'],
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['triceps', 'chest', 'anterior deltoid'],
    equipment: ['dip bars'],
    joint_stress: 'moderate',
    form_cues: ['Upright torso (more tricep)', 'Lower until 90-degree elbow', 'Lock out at top', 'Elbows close to body'],
    coach_note_swap: 'Heavy bodyweight tricep loading with pressing crossover.',
    loads_joints: ['shoulder'],
    style_tags: ['bodybuilding', 'functional', 'combat', 'hybrid'],
    capability_requirement: { minExperience: 'novice', regression: 'Push-Ups' },
    added_load_scale: 1.2,
    accepts_added_load: true,
    substitution_group: 'dip',
    unilateral: false,
    avg_duration_seconds: 35,
  },
  {
    name: 'Tricep Pushdowns',
    id: 'tricep-pushdowns',
    movement_pattern: 'isolation_tricep',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['triceps'],
    equipment: ['cable machine'],
    joint_stress: 'low',
    form_cues: ['Elbows pinned to sides', 'Push down to full extension', 'Squeeze at bottom', 'Control the return'],
    coach_note_swap: 'Cable isolation for tricep lateral head emphasis.',
    loads_joints: [],
    style_tags: ['bodybuilding', 'hybrid'],
    substitution_group: 'tricep_extension',
    unilateral: false,
    avg_duration_seconds: 28,
  },
  // Swap-depth fix, and closes the minimalist-tier isolation_tricep content
  // gap the thinness audit found -- all 4 existing tricep-isolation
  // exercises need dip bars/cable/barbell, so minimalist (and home_gym)
  // had zero or near-zero options regardless of injury or experience.
  {
    name: 'Band Tricep Pushdown',
    id: 'band-tricep-pushdown',
    movement_pattern: 'isolation_tricep',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['triceps'],
    equipment: ['resistance band'],
    joint_stress: 'low',
    form_cues: ['Anchor a band overhead', 'Elbows pinned to sides', 'Push down to full extension', 'Control the return'],
    coach_note_swap: 'The cable pushdown pattern with a band and any overhead anchor.',
    loads_joints: [],
    style_tags: ['bodybuilding', 'hybrid'],
    substitution_group: 'tricep_extension',
    unilateral: false,
    avg_duration_seconds: 28,
  },
  // Swap-depth fix (measured): at home_gym/minimalist equipment, Band
  // Tricep Pushdown was the only shoulder-safe tricep isolation on offer —
  // a shoulder injury left exactly one option. Same band, elbow pinned to
  // the side rather than overhead, so the shoulder stays in a neutral,
  // low-flexion position throughout.
  {
    name: 'Band Tricep Kickback',
    id: 'band-tricep-kickback',
    movement_pattern: 'isolation_tricep',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['triceps'],
    equipment: ['resistance band'],
    joint_stress: 'low',
    form_cues: ['Anchor a band low, behind you', 'Elbow pinned to your side, upper arm still', 'Extend the forearm straight back', 'Control the return'],
    coach_note_swap: 'Elbow stays pinned at your side the whole set — the shoulder barely moves, unlike an overhead extension.',
    loads_joints: [],
    style_tags: ['bodybuilding', 'functional', 'hybrid'],
    substitution_group: 'tricep_extension',
    unilateral: true,
    avg_duration_seconds: 26,
  },
  {
    name: 'Overhead Tricep Extension',
    id: 'overhead-tricep-extension',
    movement_pattern: 'isolation_tricep',
    contraindicated_joints: ['elbow', 'shoulder'],
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['triceps (long head)'],
    equipment: ['dumbbell', 'cable machine'],
    // Either implement does this the same way -- not both required.
    equipment_alternatives: true,
    joint_stress: 'low',
    form_cues: ['Elbows pointing up', 'Lower behind head', 'Extend fully overhead', 'Keep upper arms still'],
    coach_note_swap: 'Overhead position maximally stretches the long head.',
    loads_joints: ['shoulder'],
    style_tags: ['bodybuilding', 'hybrid'],
    substitution_group: 'tricep_extension',
    unilateral: false,
    avg_duration_seconds: 28,
  },
  {
    name: 'Skull Crushers',
    id: 'skull-crushers',
    movement_pattern: 'isolation_tricep',
    contraindicated_joints: ['elbow', 'shoulder', 'wrist'],
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['triceps'],
    equipment: ['barbell', 'EZ bar'],
    // Either bar type does this the same way -- not both required.
    equipment_alternatives: true,
    joint_stress: 'moderate',
    form_cues: ['Lie flat on bench', 'Lower bar to forehead', 'Elbows point to ceiling', 'Extend without flaring'],
    coach_note_swap: 'Effective heavy tricep isolation with stretch component.',
    loads_joints: ['wrist', 'shoulder'],
    style_tags: ['bodybuilding', 'hybrid'],
    substitution_group: 'tricep_extension',
    unilateral: false,
    avg_duration_seconds: 30,
  },

  // CARDIO
  {
    name: 'Treadmill Intervals',
    id: 'treadmill-intervals',
    movement_pattern: 'cardio',
    contraindicated_joints: ['ankle', 'knee'],
    mechanics_tier: 'cardio',
    prescription_type: 'intervals',
    angle_vector: 'none',
    primary_muscles: ['cardiovascular system', 'quadriceps', 'hamstrings'],
    equipment: ['treadmill'],
    joint_stress: 'moderate',
    form_cues: ['Alternate sprint and recovery', 'Maintain upright posture', 'Pump arms', 'Land midfoot'],
    coach_note_swap: 'High-intensity intervals for maximum VO2max improvement.',
    loads_joints: ['knee'],
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'cardio_running',
    unilateral: false,
    avg_duration_seconds: 30,
  },
  // Cycling Intervals genuinely loads the knee (loads_joints says so
  // honestly) but was being excluded by the same blunt rule that dropped
  // it alongside Treadmill Intervals/Jump Rope/Burpees — impact-loading
  // cardio a knee injury should actually avoid. Cycling has none of that
  // impact; it's low-range, non-weight-bearing, and the standard "switch
  // to the bike" recommendation for a knee injury. contraindicated_joints
  // (not indicated_joints) because it's a tolerated substitute training
  // modality, not literally rehab — same tier as the shoulder press
  // variants below.
  {
    name: 'Cycling Intervals',
    id: 'cycling-intervals',
    movement_pattern: 'cardio',
    mechanics_tier: 'cardio',
    prescription_type: 'intervals',
    angle_vector: 'none',
    primary_muscles: ['cardiovascular system', 'quadriceps'],
    equipment: ['stationary bike'],
    joint_stress: 'low',
    form_cues: ['Alternate resistance levels', 'Keep cadence above 80rpm', 'Seated and standing mix'],
    coach_note_swap: 'Low-impact cardio preserving knee and ankle joints.',
    loads_joints: ['knee'],
    contraindicated_joints: [],
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'cardio_cycling',
    unilateral: false,
    avg_duration_seconds: 30,
  },
  {
    name: 'Jump Rope',
    id: 'jump-rope',
    movement_pattern: 'cardio',
    contraindicated_joints: ['ankle', 'knee', 'wrist'],
    mechanics_tier: 'cardio',
    prescription_type: 'intervals',
    angle_vector: 'none',
    primary_muscles: ['cardiovascular system', 'calves', 'shoulders'],
    equipment: ['jump rope'],
    joint_stress: 'moderate',
    form_cues: ['Wrists drive rotation', 'Light bounces', 'Stay on balls of feet', 'Keep elbows close'],
    coach_note_swap: 'Coordination + conditioning in one exercise.',
    loads_joints: ['knee', 'wrist'],
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'cardio_jump_rope',
    unilateral: false,
    avg_duration_seconds: 30,
  },
  {
    name: 'Burpees',
    id: 'burpees',
    movement_pattern: 'cardio',
    contraindicated_joints: ['ankle', 'knee', 'shoulder', 'wrist'],
    mechanics_tier: 'cardio',
    prescription_type: 'intervals',
    angle_vector: 'none',
    primary_muscles: ['cardiovascular system', 'full body'],
    equipment: ['bodyweight'],
    joint_stress: 'high',
    form_cues: ['Squat down', 'Kick back to plank', 'Push-up', 'Jump up explosively'],
    coach_note_swap: 'Full-body metabolic conditioning at maximum intensity.',
    loads_joints: ['knee', 'wrist', 'shoulder'],
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'conditioning',
    unilateral: false,
    avg_duration_seconds: 20,
  },
  {
    name: 'Rowing Machine',
    id: 'rowing-machine',
    movement_pattern: 'cardio',
    mechanics_tier: 'cardio',
    prescription_type: 'intervals',
    angle_vector: 'horizontal',
    primary_muscles: ['cardiovascular system', 'lats', 'legs'],
    equipment: ['rowing machine'],
    joint_stress: 'low',
    form_cues: ['Drive with legs first', 'Pull handle to lower chest', 'Reverse the sequence on return', 'Maintain rhythm'],
    coach_note_swap: 'Full-body low-impact cardio with significant posterior chain engagement.',
    loads_joints: [],
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'cardio_rowing',
    unilateral: false,
    avg_duration_seconds: 30,
  },
  {
    name: 'Elliptical',
    id: 'elliptical',
    movement_pattern: 'cardio',
    mechanics_tier: 'cardio',
    // Zero-impact, steady-state machine cardio — no rounds, no work:rest
    // split (its own coach_note_swap already calls it "conditioning," not
    // intervals). Was sharing 'intervals' with genuinely round-based
    // exercises (Cycling Intervals, Treadmill Intervals) purely because no
    // continuous-cardio type existed yet — confirmed a mis-typing, not a
    // deliberate choice, during the cardio-prescription investigation.
    prescription_type: 'steady_state',
    angle_vector: 'none',
    primary_muscles: ['cardiovascular system', 'quadriceps', 'glutes'],
    equipment: ['elliptical machine'],
    joint_stress: 'low',
    form_cues: ['Upright posture', 'Push and pull handles', 'Vary resistance', 'Keep feet flat on pedals'],
    coach_note_swap: 'Zero-impact conditioning that spares knees and ankles.',
    loads_joints: [],
    style_tags: ['functional', 'hybrid'],
    substitution_group: 'cardio_elliptical',
    unilateral: false,
    avg_duration_seconds: 30,
  },
  {
    name: 'Battle Ropes',
    id: 'battle-ropes',
    movement_pattern: 'cardio',
    mechanics_tier: 'cardio',
    prescription_type: 'intervals',
    angle_vector: 'none',
    primary_muscles: ['cardiovascular system', 'shoulders', 'core'],
    equipment: ['battle ropes'],
    joint_stress: 'low',
    form_cues: ['Athletic stance', 'Alternate or simultaneous waves', 'Full arm range', 'Engage core throughout'],
    coach_note_swap: 'Upper-body dominant conditioning with core anti-extension.',
    loads_joints: ['shoulder'],
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'cardio_battle_ropes',
    unilateral: false,
    avg_duration_seconds: 25,
  },
  {
    name: 'Mountain Climbers',
    id: 'mountain-climbers',
    movement_pattern: 'cardio',
    contraindicated_joints: ['ankle', 'wrist'],
    mechanics_tier: 'cardio',
    prescription_type: 'intervals',
    angle_vector: 'none',
    primary_muscles: ['cardiovascular system', 'core', 'hip flexors'],
    equipment: ['bodyweight'],
    joint_stress: 'low',
    form_cues: ['Plank position', 'Drive knees toward chest', 'Keep hips level', 'Quick alternating rhythm'],
    coach_note_swap: 'Core-intensive cardio with zero equipment needed.',
    loads_joints: ['wrist'],
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'core_dynamic',
    unilateral: false,
    avg_duration_seconds: 20,
  },

  // CORE
  {
    name: 'Plank',
    id: 'plank',
    movement_pattern: 'core',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'time',
    angle_vector: 'anti_extension',
    primary_muscles: ['rectus abdominis', 'transverse abdominis', 'obliques'],
    equipment: ['bodyweight'],
    joint_stress: 'low',
    form_cues: ['Elbows under shoulders', 'Body forms straight line', 'Squeeze glutes', 'Brace core', 'Breathe steadily'],
    coach_note_swap: 'Anti-extension hold building foundational core stability.',
    loads_joints: [],
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'core_stability',
    unilateral: false,
    avg_duration_seconds: 60,
  },
  {
    name: 'Dead Bug',
    id: 'dead-bug',
    movement_pattern: 'core',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'time',
    angle_vector: 'anti_extension',
    primary_muscles: ['rectus abdominis', 'transverse abdominis'],
    equipment: ['bodyweight'],
    joint_stress: 'low',
    form_cues: ['Back flat on floor', 'Extend opposite arm and leg', 'Maintain low-back contact', 'Exhale on extension'],
    coach_note_swap: 'Teaches anti-extension with zero spinal load — excellent for back pain.',
    // Declares the joint it treats. test:rehab-prescribed §6 requires this —
    // "every indicated movement records the joint it loads, honestly" — and
    // caught these three when they claimed to be back rehab while recording
    // that they load nothing.
    //
    // The explicit empty contraindicated_joints is NOT redundant: that getter
    // is `contraindicated_joints ?? loads_joints`, so naming the joint here
    // without it would mark the movement DANGEROUS for the very joint it
    // treats. Same trap as 31b05d7, running the other way.
    loads_joints: ['lower_back_axial'],
    contraindicated_joints: [],
    // The note directly above has always said "excellent for back pain" and
    // nothing acted on it: indicated_joints was the field that would have,
    // and it was empty, so a trainee who reported a bad back was never
    // deliberately given this. Tagged now.
    //
    // lower_back_axial, NOT lower_back. INJURED_JOINTS (exercise-plan.ts:499)
    // maps the injury CODE `lower_back` to the joint TAG `lower_back_axial`;
    // tagging the code here would match nothing and read as done.
    indicated_joints: ['lower_back_axial'],
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'core_stability',
    unilateral: false,
    avg_duration_seconds: 45,
  },
  {
    name: 'Pallof Press',
    id: 'pallof-press',
    movement_pattern: 'core',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'anti_rotation',
    primary_muscles: ['obliques', 'transverse abdominis', 'core'],
    // Band Pallof presses are the standard home-gym version — do not narrow
    // this to 'cable machine' alone (isEquipmentAllowed requires EVERY listed
    // equipment tag to be covered by a tier's allowed set, so adding 'cable
    // machine' alongside 'resistance band' here would re-narrow this to
    // full_gym only, not widen it — the array is AND, not OR). The load-chip
    // gap this used to be tagged for is a separate, still-open defect in how
    // a null starting_weight_kg renders (see load-prescription.ts), not an
    // equipment-tagging problem.
    equipment: ['resistance band'],
    joint_stress: 'low',
    form_cues: ['Stand perpendicular to the anchor point — band or cable', 'Press hands straight out', 'Resist rotation', 'Hold 2 seconds extended'],
    coach_note_swap: 'Gold-standard anti-rotation exercise for rotational stability.',
    loads_joints: [],
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'core_stability',
    unilateral: false,
    avg_duration_seconds: 30,
  },
  {
    name: 'Hanging Leg Raises',
    id: 'hanging-leg-raises',
    movement_pattern: 'core',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['rectus abdominis', 'hip flexors', 'obliques'],
    equipment: ['pull-up bar'],
    joint_stress: 'moderate',
    form_cues: ['Dead hang', 'Curl pelvis up', 'Raise legs to parallel or above', 'Control the descent'],
    coach_note_swap: 'Advanced core flexion under load — builds visible ab development.',
    loads_joints: ['shoulder'],
    style_tags: ['bodybuilding', 'functional', 'combat', 'hybrid'],
    capability_requirement: { minExperience: 'intermediate', regression: 'Dead Bug' },
    substitution_group: 'core_dynamic',
    unilateral: false,
    avg_duration_seconds: 30,
  },
  {
    name: 'Ab Wheel Rollout',
    id: 'ab-wheel-rollout',
    movement_pattern: 'core',
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'anti_extension',
    primary_muscles: ['rectus abdominis', 'transverse abdominis', 'lats'],
    equipment: ['ab wheel'],
    joint_stress: 'moderate',
    form_cues: ['Kneel with wheel below shoulders', 'Roll out maintaining neutral spine', 'Extend as far as possible', 'Pull back with abs'],
    coach_note_swap: 'Progressive anti-extension that challenges the entire anterior chain.',
    loads_joints: ['shoulder', 'wrist'],
    style_tags: ['functional', 'combat', 'hybrid'],
    capability_requirement: { minExperience: 'intermediate', regression: 'Plank' },
    substitution_group: 'core_stability',
    unilateral: false,
    avg_duration_seconds: 35,
  },
  {
    name: 'Cable Woodchops',
    id: 'cable-woodchops',
    movement_pattern: 'core',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'rotational',
    primary_muscles: ['obliques', 'core', 'shoulders'],
    equipment: ['cable machine'],
    joint_stress: 'low',
    form_cues: ['High-to-low or low-to-high path', 'Rotate through hips and torso', 'Arms stay extended', 'Control the return'],
    coach_note_swap: 'Rotational power for sport-specific core development.',
    loads_joints: [],
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'core_rotational',
    unilateral: false,
    avg_duration_seconds: 28,
  },
  // Swap-depth fix: Cable Woodchops had zero swap options. Russian Twist is
  // the off-cable escape, but it's loaded spinal rotation under a seated
  // lean-back -- a real lower-back load, unlike Cable Woodchops' standing,
  // hip-driven path. Marked lower_back-contraindicated rather than offered
  // as a blanket substitute.
  {
    name: 'Russian Twist',
    id: 'russian-twist',
    movement_pattern: 'core',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'rotational',
    primary_muscles: ['obliques', 'core'],
    equipment: ['medicine ball'],
    joint_stress: 'moderate',
    form_cues: ['Sit with knees bent, lean back to a stable angle', 'Hold the ball at the chest', 'Rotate side to side, touching the ball down each time', 'Keep the chest up, don\'t round the spine'],
    coach_note_swap: 'Loaded rotational core work — the seated lean-back puts real load through the lower back, unlike a standing woodchop.',
    loads_joints: ['lower_back_axial'],
    contraindicated_joints: ['lower_back_axial'],
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'core_rotational',
    unilateral: false,
    avg_duration_seconds: 28,
  },
  {
    // -----------------------------------------------------------------------
    // HIP REHAB. Four entries written rather than tagged, and the reason is
    // mechanical: pickRehabMovement excludes tier2_compound outright (Ashley's
    // ruling — "a Spanish Squat is leg day arriving uninvited"), and every hip
    // movement the catalogue already owned is tier2_compound. Glute Bridge,
    // Hip Thrust, Step-Ups: tagging any of them would have been a no-op that
    // read as a fix. The only non-tier2 hip_hinge entries are Deadlifts and
    // Trap Bar Deadlift, both contraindicated for an injured hip.
    //
    // So a bad hip had NOTHING the guaranteed rehab slot could reach for:
    // measured at 0 of 576 training days, 144 of 144 plans with no hip work
    // at all, before these existed.
    //
    // ACTIVATION PRIMERS, matching the seven shoulder-rehab entries exactly
    // rather than inventing a shape. pickRehabMovement prefers the primer
    // tier when any indicated primer exists, so these three ARE the hip
    // rotation; Bird Dog stays tier3 and is deliberately not in it.
    //
    // DURATIONS ARE LOAD-BEARING, not decorative. The slot keeps everything
    // within 1.25x the cheapest indicated movement, so 30/30/32 puts all
    // three inside one band (30 x 1.25 = 37.5) and it rotates between them.
    //
    // All bodyweight or band, so the minimalist and bodyweight tiers get them
    // too; a hip is not only injured in a commercial gym.
    // -----------------------------------------------------------------------
    name: 'Clamshell',
    id: 'clamshell',
    movement_pattern: 'activation',
    mechanics_tier: 'primer',
    prescription_type: 'reps',
    angle_vector: 'lateral',
    primary_muscles: ['glute medius', 'glute minimus', 'external rotators'],
    equipment: ['bodyweight', 'resistance band'],
    equipment_alternatives: true,
    joint_stress: 'low',
    form_cues: ['Lie on your side, knees bent about 45 degrees', 'Heels together throughout', 'Open the top knee slowly', 'Do not let the hips roll back'],
    coach_note_swap: 'Wakes up the glute medius without loading the hip joint through range.',
    loads_joints: ['hip'],
    contraindicated_joints: [],
    indicated_joints: ['hip'],
    style_tags: ['functional', 'hybrid', 'bodybuilding'],
    substitution_group: 'conditioning',
    unilateral: true,
    avg_duration_seconds: 30,
    // A primer with no affinity is never selected by getAffinityPrimerPool
    // (`.some()` over an empty array is false), so it would exist only for
    // the rehab slot and be dead weight everywhere else. Lower-body days.
    primer_pattern_affinity: ['hip_hinge', 'knee_dominant', 'single_leg'],
  },
  {
    name: 'Side-Lying Hip Abduction',
    id: 'side-lying-hip-abduction',
    movement_pattern: 'activation',
    mechanics_tier: 'primer',
    prescription_type: 'reps',
    angle_vector: 'lateral',
    primary_muscles: ['glute medius', 'tensor fasciae latae'],
    equipment: ['bodyweight'],
    joint_stress: 'low',
    form_cues: ['Lie on your side, bottom knee bent for balance', 'Top leg straight, lift to about 30 degrees', 'Lead with the heel, not the toes', 'Lower under control — do not drop it'],
    coach_note_swap: 'Straight-leg abduction with body weight only — the standard lateral hip drill.',
    loads_joints: ['hip'],
    contraindicated_joints: [],
    indicated_joints: ['hip'],
    style_tags: ['functional', 'hybrid', 'bodybuilding'],
    substitution_group: 'conditioning',
    unilateral: true,
    avg_duration_seconds: 30,
    // A primer with no affinity is never selected by getAffinityPrimerPool
    // (`.some()` over an empty array is false), so it would exist only for
    // the rehab slot and be dead weight everywhere else. Lower-body days.
    primer_pattern_affinity: ['hip_hinge', 'knee_dominant', 'single_leg'],
  },
  {
    name: 'Standing Band Hip Abduction',
    id: 'standing-band-hip-abduction',
    movement_pattern: 'activation',
    mechanics_tier: 'primer',
    prescription_type: 'reps',
    angle_vector: 'lateral',
    primary_muscles: ['glute medius', 'glute minimus'],
    equipment: ['resistance band'],
    joint_stress: 'low',
    form_cues: ['Band around both ankles', 'Stand tall, hold something for balance', 'Take the working leg out to the side', 'Keep the standing hip level — do not lean away'],
    coach_note_swap: 'Loads the lateral hip standing up, which is how it actually has to work.',
    loads_joints: ['hip'],
    contraindicated_joints: [],
    indicated_joints: ['hip'],
    style_tags: ['functional', 'hybrid', 'bodybuilding'],
    substitution_group: 'conditioning',
    unilateral: true,
    avg_duration_seconds: 32,
    // A primer with no affinity is never selected by getAffinityPrimerPool
    // (`.some()` over an empty array is false), so it would exist only for
    // the rehab slot and be dead weight everywhere else. Lower-body days.
    primer_pattern_affinity: ['hip_hinge', 'knee_dominant', 'single_leg'],
  },
  {
    // BOTH JOINTS, and genuinely so — bird dog is a hip-extension drill and
    // one of McGill's big three for a bad back, which is also why it is
    // classed with Dead Bug and Side Plank rather than with the three hip
    // primers above.
    //
    // THAT TIER IS NOT COSMETIC. pickRehabMovement takes the primer tier
    // EXCLUSIVELY when any indicated primer exists. Making this a primer
    // would put it alone in the lower back's band — no other back movement
    // is a primer — and the back would get Bird Dog every session forever,
    // collapsing the Dead Bug / Side Plank rotation this work exists to
    // create. Staying tier3 keeps the back at a three-way rotation (all
    // three sit at 45s) and leaves the hip rotation to the primers.
    //
    // The band is SHARED ACROSS JOINTS, so a tier or duration chosen for one
    // joint silently reshapes what stays eligible for the other. That is why
    // both rotations get measured after the fact rather than reasoned about.
    name: 'Bird Dog',
    id: 'bird-dog',
    movement_pattern: 'core',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'anti_extension',
    primary_muscles: ['glute max', 'erector spinae', 'transverse abdominis'],
    equipment: ['bodyweight'],
    joint_stress: 'low',
    form_cues: ['On hands and knees, spine neutral', 'Extend opposite arm and leg', 'Keep the hips square to the floor', 'Move slowly — no arching the low back'],
    coach_note_swap: 'Hip extension and anti-rotation together, with no load on the spine.',
    loads_joints: ['hip', 'lower_back_axial'],
    contraindicated_joints: [],
    indicated_joints: ['hip', 'lower_back_axial'],
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'core_stability',
    unilateral: true,
    avg_duration_seconds: 45,
  },
  {
    name: 'Side Plank',
    id: 'side-plank',
    movement_pattern: 'core',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'time',
    angle_vector: 'lateral',
    primary_muscles: ['obliques', 'quadratus lumborum', 'glute medius'],
    equipment: ['bodyweight'],
    joint_stress: 'low',
    form_cues: ['Elbow under shoulder', 'Hips stacked', 'Body forms straight line', 'Hold position steadily'],
    coach_note_swap: 'Anti-lateral flexion hold targeting oblique and hip stability.',
    loads_joints: ['lower_back_axial'],
    contraindicated_joints: [],
    // Paired with Dead Bug at the SAME 45s on purpose. pickRehabMovement
    // keeps everything within 1.25x the cheapest indicated movement, so two
    // equal durations put both inside the band and the guaranteed slot
    // rotates between them instead of picking one movement for sixteen
    // weeks (the 576/576 monotony documented at exercise-plan.ts:1650).
    indicated_joints: ['lower_back_axial'],
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'core_stability',
    unilateral: true,
    avg_duration_seconds: 45,
  },

  // ACTIVATION / PRIMING
  {
    name: 'Box Jumps',
    id: 'box-jumps',
    movement_pattern: 'activation',
    contraindicated_joints: ['ankle', 'knee'],
    mechanics_tier: 'primer',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['glutes', 'quadriceps', 'calves'],
    equipment: ['plyo box'],
    joint_stress: 'moderate',
    form_cues: ['Athletic stance', 'Swing arms and explode up', 'Land softly with bent knees', 'Step down — do not jump down'],
    coach_note_swap: 'CNS primer that activates fast-twitch motor units for heavy lifting.',
    loads_joints: ['knee'],
    style_tags: ['functional', 'combat', 'hybrid'],
    capability_requirement: { minExperience: 'intermediate', regression: 'Bodyweight Squat Marches' },
    substitution_group: 'explosive_lower',
    unilateral: false,
    avg_duration_seconds: 18,
    // Explosive knee-dominant power — suits squat/leg days.
    primer_pattern_affinity: ['knee_dominant'],
  },
  {
    name: 'Bodyweight Squat Marches',
    id: 'bodyweight-squat-marches',
    movement_pattern: 'activation',
    mechanics_tier: 'primer',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['glutes', 'quadriceps', 'hip flexors'],
    equipment: ['bodyweight'],
    joint_stress: 'low',
    form_cues: ['High-knee march in place or walking', 'Controlled tempo, no jumping', 'Drive the knee to hip height', 'Land softly'],
    coach_note_swap: 'Low-impact lower-body primer — raises heart rate and preps the hip/knee patterns without the landing forces of a jump.',
    loads_joints: [],
    // 'bodybuilding' added: unlike its 5 siblings excluded two rounds ago
    // (Box Jumps, Broad Jumps, Medicine Ball Slams, Plyo Push-Ups,
    // Kettlebell Swings), this one is explicitly low-impact and non-jumping
    // by its own form_cues ("no jumping") — it was grouped with the
    // ballistic set for being their common regression option, not for
    // being ballistic itself.
    style_tags: ['functional', 'combat', 'hybrid', 'bodybuilding'],
    substitution_group: 'low_impact_activation',
    unilateral: false,
    avg_duration_seconds: 15,
    // Knee-dominant, and its own note calls out raising heart rate —
    // suits squat/leg days and doubles as a low-impact conditioning primer.
    primer_pattern_affinity: ['knee_dominant', 'cardio'],
  },
  {
    name: 'Band Pull-Aparts',
    id: 'band-pull-aparts',
    movement_pattern: 'activation',
    mechanics_tier: 'primer',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['rear deltoid', 'rhomboids', 'rotator cuff'],
    equipment: ['resistance band'],
    joint_stress: 'low',
    form_cues: ['Arms straight at shoulder height', 'Pull band apart to chest', 'Squeeze shoulder blades', 'Controlled return'],
    coach_note_swap: 'Warms up the posterior shoulder complex and improves scapular positioning.',
    loads_joints: ['shoulder'],
    contraindicated_joints: [],
    indicated_joints: ['shoulder'],
    // 'bodybuilding' added: this is mobility/activation work standard in a
    // bodybuilding warm-up (unlike the ballistic primers below, which aren't).
    style_tags: ['functional', 'hybrid', 'bodybuilding'],
    substitution_group: 'conditioning',
    unilateral: false,
    avg_duration_seconds: 18,
    // Its own note says posterior-shoulder/scapular prep — genuinely helps
    // both pressing days (shoulder stability under load) and pulling days
    // (the movement itself is a horizontal pull).
    primer_pattern_affinity: ['horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull'],
  },
  {
    name: 'Medicine Ball Slams',
    id: 'medicine-ball-slams',
    movement_pattern: 'activation',
    mechanics_tier: 'primer',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['core', 'lats', 'shoulders', 'hip flexors'],
    equipment: ['medicine ball'],
    joint_stress: 'low',
    form_cues: ['Reach overhead fully', 'Slam with full-body extension', 'Hinge and follow through', 'Catch on bounce'],
    coach_note_swap: 'Full-body power primer that lights up the CNS before heavy compound work.',
    loads_joints: ['shoulder'],
    style_tags: ['functional', 'combat', 'hybrid'],
    capability_requirement: { minExperience: 'novice', regression: 'Bodyweight Squat Marches' },
    substitution_group: 'explosive_upper',
    unilateral: false,
    avg_duration_seconds: 18,
    // Hip-hinge loaded descent into a pulling-motion ascent — suits
    // hinge/pull days, not press days (no push component to the movement).
    primer_pattern_affinity: ['hip_hinge', 'horizontal_pull'],
  },
  {
    name: 'Broad Jumps',
    id: 'broad-jumps',
    movement_pattern: 'activation',
    contraindicated_joints: ['ankle', 'knee'],
    mechanics_tier: 'primer',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['glutes', 'hamstrings', 'quadriceps'],
    equipment: ['bodyweight'],
    joint_stress: 'moderate',
    form_cues: ['Hinge back at hips', 'Swing arms forward explosively', 'Jump for max distance', 'Stick the landing'],
    coach_note_swap: 'Horizontal power development primes hip extensors for hinge work.',
    loads_joints: ['knee'],
    style_tags: ['functional', 'combat', 'hybrid'],
    capability_requirement: { minExperience: 'intermediate', regression: 'Bodyweight Squat Marches' },
    substitution_group: 'explosive_lower',
    unilateral: false,
    avg_duration_seconds: 15,
    // Its own note says it "primes hip extensors for hinge work" — also a
    // real knee-dominant/squat power movement, so it fits both.
    primer_pattern_affinity: ['hip_hinge', 'knee_dominant'],
  },
  {
    name: 'Kettlebell Swings',
    id: 'kettlebell-swings',
    movement_pattern: 'activation',
    contraindicated_joints: ['hip', 'lower_back_axial'],
    mechanics_tier: 'primer',
    prescription_type: 'reps',
    angle_vector: 'diagonal',
    primary_muscles: ['glutes', 'hamstrings', 'core', 'shoulders'],
    equipment: ['kettlebell'],
    joint_stress: 'low',
    form_cues: ['Hinge at hips', 'Snap hips forward', 'Float the bell to chest height', 'Brace core at the top'],
    coach_note_swap: 'Ballistic hip hinge that activates the posterior chain and elevates heart rate.',
    loads_joints: ['lower_back_axial'],
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'swing',
    unilateral: false,
    avg_duration_seconds: 20,
    // Ballistic hip hinge; its own note explicitly says it elevates heart
    // rate too, so it also fits a conditioning-flavored day.
    primer_pattern_affinity: ['hip_hinge', 'cardio'],
  },
  {
    name: 'Plyo Push-Ups',
    id: 'plyo-push-ups',
    movement_pattern: 'activation',
    mechanics_tier: 'primer',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['chest', 'triceps', 'core'],
    equipment: ['bodyweight'],
    joint_stress: 'moderate',
    form_cues: ['Lower controlled', 'Explode off the ground', 'Hands leave floor', 'Land with soft elbows'],
    coach_note_swap: 'Upper-body power activation for pressing days.',
    loads_joints: ['wrist', 'shoulder'],
    style_tags: ['functional', 'combat', 'hybrid'],
    capability_requirement: { minExperience: 'intermediate', regression: 'Band Pull-Aparts' },
    substitution_group: 'explosive_upper',
    unilateral: false,
    avg_duration_seconds: 18,
    // Its own note says "pressing days" explicitly — horizontal push, and
    // general enough as CNS activation to also serve overhead-pressing days.
    primer_pattern_affinity: ['horizontal_push', 'vertical_push'],
  },
  // The next four are equipment: ['bodyweight'] ONLY — verified against
  // EQUIPMENT_SETS.bodyweight (exercise-plan.ts), which allows exactly
  // ['bodyweight', 'pull-up bar', 'weighted backpack']. Added because the
  // bodyweight equipment tier was the single largest driver of primer-pool
  // exhaustion (1616 of 3408 affected combos, measured against 3c2b191) —
  // every other existing primer needs a kettlebell, medicine ball,
  // resistance band, or plyo box, none of which that tier allows.
  {
    name: 'Scapular Push-Ups',
    id: 'scapular-push-ups',
    movement_pattern: 'activation',
    mechanics_tier: 'primer',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['serratus anterior', 'chest', 'shoulders'],
    equipment: ['bodyweight'],
    joint_stress: 'low',
    form_cues: ['Plank or push-up position', 'Let shoulder blades sink together', 'Push the floor away to protract', 'Small range, elbows locked'],
    coach_note_swap: 'Trains scapular control under bodyweight load — the foundational pattern under every push-up and bench press. No plyo skill required.',
    loads_joints: ['shoulder', 'wrist'],
    contraindicated_joints: ['wrist'],
    indicated_joints: ['shoulder'],
    style_tags: ['functional', 'combat', 'hybrid', 'bodybuilding'],
    substitution_group: 'scapular_control',
    unilateral: false,
    avg_duration_seconds: 15,
    primer_pattern_affinity: ['horizontal_push', 'vertical_push'],
  },
  {
    name: 'Wall Slides',
    id: 'wall-slides',
    movement_pattern: 'activation',
    mechanics_tier: 'primer',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['shoulders', 'upper back', 'rotator cuff'],
    equipment: ['bodyweight'],
    joint_stress: 'low',
    form_cues: ['Back flat against a wall', 'Arms in goalpost position', 'Slide arms overhead keeping contact', 'Control the return'],
    coach_note_swap: 'Shoulder mobility and scapular control — preps the joint for overhead pressing with zero load.',
    loads_joints: ['shoulder'],
    contraindicated_joints: [],
    indicated_joints: ['shoulder'],
    style_tags: ['functional', 'hybrid', 'bodybuilding'],
    substitution_group: 'scapular_control',
    unilateral: false,
    avg_duration_seconds: 15,
    primer_pattern_affinity: ['horizontal_push', 'vertical_push'],
  },
  {
    name: 'Prone Y-T Raises',
    id: 'prone-y-t-raises',
    movement_pattern: 'activation',
    mechanics_tier: 'primer',
    prescription_type: 'reps',
    angle_vector: 'diagonal',
    primary_muscles: ['rear deltoid', 'rhomboids', 'lower trapezius'],
    equipment: ['bodyweight'],
    joint_stress: 'low',
    form_cues: ['Lie face down', 'Raise arms to a Y then a T', 'Squeeze shoulder blades together', 'Keep neck neutral'],
    // Own note deliberately parallels Band Pull-Aparts' — same posterior-
    // shoulder role, zero equipment, so it's the fallback when a band isn't
    // available AND the zero-equipment primer for the bodyweight tier.
    coach_note_swap: 'Bodyweight scapular activation from the floor — the same posterior-shoulder stability as a band pull-apart, for anyone without a band handy.',
    loads_joints: ['shoulder', 'lower_back_axial'],
    contraindicated_joints: ['lower_back_axial'],
    indicated_joints: ['shoulder'],
    style_tags: ['functional', 'hybrid', 'bodybuilding'],
    substitution_group: 'scapular_control',
    unilateral: false,
    avg_duration_seconds: 18,
    primer_pattern_affinity: ['horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull'],
  },
  {
    name: 'Arm Circles',
    id: 'arm-circles',
    movement_pattern: 'activation',
    mechanics_tier: 'primer',
    prescription_type: 'reps',
    angle_vector: 'rotational',
    primary_muscles: ['shoulders', 'rotator cuff'],
    equipment: ['bodyweight'],
    joint_stress: 'low',
    form_cues: ['Arms extended out to sides', 'Small controlled circles', 'Reverse direction halfway', 'Shoulders down, not shrugged'],
    coach_note_swap: 'General shoulder-joint warm-up before any upper-body pressing or pulling.',
    loads_joints: ['shoulder'],
    contraindicated_joints: [],
    indicated_joints: ['shoulder'],
    style_tags: ['functional', 'combat', 'hybrid', 'bodybuilding'],
    substitution_group: 'general_warmup',
    unilateral: false,
    avg_duration_seconds: 15,
    // Deliberately the broadest of the six — general joint warm-up, not a
    // specific strength pattern, so it's eligible everywhere upper-body work
    // happens. Flagged in the accompanying report as a real design tension:
    // this breadth also means it can crowd out more specific primers if it
    // gets picked too often — a coaching judgment call, not a filter bug.
    primer_pattern_affinity: ['horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull'],
  },
  {
    name: 'Band Dislocates',
    id: 'band-dislocates',
    movement_pattern: 'activation',
    mechanics_tier: 'primer',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['shoulders', 'rotator cuff', 'chest'],
    equipment: ['resistance band'],
    joint_stress: 'low',
    form_cues: ['Hold band wide with both hands', 'Raise arms overhead and back', 'Keep elbows locked throughout', 'Return under control'],
    coach_note_swap: 'Opens shoulder range of motion before overhead work — especially valuable heading into a vertical press.',
    loads_joints: ['shoulder'],
    contraindicated_joints: [],
    indicated_joints: ['shoulder'],
    style_tags: ['functional', 'hybrid', 'bodybuilding'],
    substitution_group: 'scapular_control',
    unilateral: false,
    avg_duration_seconds: 18,
    primer_pattern_affinity: ['horizontal_push', 'vertical_push'],
  },
  {
    // Distinct name from the existing tier3 'Face Pulls' cable exercise
    // (same movement family, different tier/equipment) — kept separate so
    // neither exercise-name lookups nor substitution_group dedup conflate a
    // primer with a real working-set accessory.
    name: 'Band Face Pulls',
    id: 'band-face-pulls',
    movement_pattern: 'activation',
    mechanics_tier: 'primer',
    prescription_type: 'reps',
    angle_vector: 'diagonal',
    primary_muscles: ['rear deltoid', 'rotator cuff', 'rhomboids'],
    equipment: ['resistance band'],
    joint_stress: 'low',
    form_cues: ['Anchor band at face height', 'Pull to the face, elbows high', 'Externally rotate at the end', 'Controlled return'],
    coach_note_swap: 'Rotator-cuff and rear-delt prep — protects the shoulder under press load and suits pulling days too.',
    loads_joints: ['shoulder'],
    contraindicated_joints: [],
    indicated_joints: ['shoulder'],
    style_tags: ['functional', 'hybrid', 'bodybuilding'],
    substitution_group: 'scapular_control',
    unilateral: false,
    avg_duration_seconds: 18,
    primer_pattern_affinity: ['horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull'],
  },
  // The 7 primers above cover every upper-body push/pull pattern for
  // bodybuilding-style profiles (see the accompanying report) but nothing
  // lower-body or cardio — Squat & Carry, Legs & Calves, and Conditioning &
  // Core still had zero bodybuilding-tagged primer with a matching
  // primer_pattern_affinity, so those tracks fell back to a mismatched
  // primer for every bodybuilding-style profile. The only EXISTING primers
  // covering knee_dominant/hip_hinge/cardio are the 6 explicitly-excluded
  // ballistic ones (Box Jumps, Broad Jumps, Medicine Ball Slams, Plyo
  // Push-Ups, Kettlebell Swings, Bodyweight Squat Marches) — genuinely a
  // missing-exercise gap, not a missing-tag one, so these two are new
  // entries rather than a re-tag.
  {
    name: 'Leg Swings',
    id: 'leg-swings',
    movement_pattern: 'activation',
    mechanics_tier: 'primer',
    prescription_type: 'reps',
    angle_vector: 'diagonal',
    primary_muscles: ['hip flexors', 'glutes', 'hamstrings'],
    equipment: ['bodyweight'],
    joint_stress: 'low',
    form_cues: ['Hold a wall or rack for balance', 'Swing one leg forward and back under control', 'Full range, no momentum or kicking', 'Switch legs halfway'],
    coach_note_swap: 'Dynamic hip-mobility warm-up — controlled range of motion before squat or hinge work, no jump and no impact.',
    loads_joints: [],
    style_tags: ['functional', 'hybrid', 'bodybuilding'],
    substitution_group: 'low_impact_activation',
    unilateral: true,
    avg_duration_seconds: 18,
    // Dynamic hip flexion/extension under control — suits squat and hinge
    // days alike, the same dual-pattern shape Broad Jumps has, just without
    // the jump.
    primer_pattern_affinity: ['knee_dominant', 'hip_hinge'],
  },
  {
    name: 'Lateral Step Touches',
    id: 'lateral-step-touches',
    movement_pattern: 'activation',
    mechanics_tier: 'primer',
    prescription_type: 'reps',
    angle_vector: 'lateral',
    primary_muscles: ['glutes', 'quadriceps', 'calves'],
    equipment: ['bodyweight'],
    joint_stress: 'low',
    form_cues: ['Step side to side at a steady pace', 'Stay light on the feet — no jumping', 'Swing arms naturally for rhythm', 'Keep knees soft throughout'],
    coach_note_swap: 'Zero-impact rhythmic warm-up that raises heart rate without any jumping or landing force.',
    loads_joints: [],
    style_tags: ['functional', 'hybrid', 'bodybuilding'],
    substitution_group: 'low_impact_activation',
    unilateral: false,
    avg_duration_seconds: 20,
    // Raises heart rate with zero impact — the conditioning-primer role
    // Kettlebell Swings/Bodyweight Squat Marches play elsewhere, without
    // the ballistic hip-snap or the (excluded) march.
    primer_pattern_affinity: ['cardio'],
  },
]

/**
 * Candidates for swapping OUT `exerciseName`. `pool` must be a constraint-
 * filtered pool (getConstrainedPool(profile, exclusions) from
 * exercise-plan.ts) — equipment/injury/style/skill already applied — NOT
 * the raw EXERCISE_DATABASE. Passing the raw database here was the original
 * bug: it could suggest a barbell exercise to a bodyweight-only user, a
 * movement loading an injured joint, or something above the trainee's skill
 * level, because none of the 5-stage pipeline ran on the candidate list.
 *
 * `experience` applies the same "never a downgrade" regression guard
 * rotateVariation() uses at generation time (periodization.ts) — an
 * advanced lifter swapping out Barbell Squats should never be offered
 * Goblet Squats as a same-tier alternative.
 */
/**
 * The nearest coaching-equivalent pattern when a movement's OWN pattern has
 * no eligible candidates left — a missing vertical press becomes a second
 * horizontal press, not an unrelated isolation exercise.
 *
 * Lives here, beside MovementPattern itself, rather than in exercise-plan.ts
 * where it started, because it now has two readers that reach a pattern dead
 * end by different routes: selectExercisesForTrack's required slots, and
 * getSmartReplacements below. It was one map with one reader when a slot
 * could only be orphaned at plan-BUILD time; a swap can orphan one too.
 */
export const NEAREST_PATTERN_FALLBACK: Partial<Record<MovementPattern, MovementPattern[]>> = {
  vertical_push: ['horizontal_push'],
  horizontal_push: ['vertical_push'],
  vertical_pull: ['horizontal_pull'],
  horizontal_pull: ['vertical_pull'],
  hip_hinge: ['knee_dominant', 'single_leg'],
  knee_dominant: ['hip_hinge', 'single_leg'],
  single_leg: ['knee_dominant', 'hip_hinge'],
  carry: ['core'],
  isolation_bicep: ['horizontal_pull'],
  isolation_tricep: ['horizontal_push'],
  isolation_shoulder: ['vertical_push'],
  // Traps mirror the shoulder entry above, on the pulling side — a shrug's
  // nearest relative is a row, not a press.
  isolation_trap: ['horizontal_pull', 'vertical_pull'],
  isolation_quad: ['knee_dominant'],
  isolation_hamstring: ['hip_hinge'],
  isolation_calf: ['knee_dominant'],
}

export function getSmartReplacements(
  exerciseName: string,
  pool: ExerciseEntry[],
  experience: TrainingExperience,
  exclusions: string[] = [],
): { exercise: ExerciseEntry; note: string }[] {
  const current = EXERCISE_DATABASE.find(
    e => e.name.toLowerCase() === exerciseName.toLowerCase()
  )
  if (!current) return []

  const excludedSet = new Set(exclusions.map(e => e.toLowerCase()))
  excludedSet.add(exerciseName.toLowerCase())

  // A blanket "loaded -> bodyweight is always blocked" guard used to live
  // here (mirroring periodization.ts's rotateVariation, which keeps it —
  // automatic week-to-week rotation must never silently delete a trainee's
  // logged overload). A manual swap is a different situation: the user is
  // asking for this specific substitute (their equipment is busy), and
  // recomputeLoad (mesocycle-edit.ts) already throws away the outgoing
  // exercise's number and prescribes fresh for whatever's chosen — there is
  // no load to "carry over" and accidentally lose. What still needs
  // blocking is a genuine skill downgrade, and that's already covered by
  // two other checks: `pool` only contains exercises whose
  // capability_requirement this profile's experience already satisfies
  // (getConstrainedPool's skill stage), and the regression-guard line right
  // above already excludes named easier variants (REGRESSION_VARIATIONS)
  // for anyone past novice. Barbell Squats -> Air Squat is deliberately
  // allowed to fail this filter at every experience level below advanced
  // and blocked at advanced+ via that same regression-guard line, since
  // Air Squat is on that list.
  //
  // The same swap ALSO used to require the replacement stay within +-40%
  // of the outgoing exercise's estimated load (preservesRelativeLoad) —
  // right for automatic rotation (still enforced in rotateVariation), wrong
  // here for the identical reason: different equipment genuinely takes a
  // different number, and a fresh prescription is computed either way, so
  // there's no "stealth regression" to protect against on a manual pick.
  const eligible = (e: ExerciseEntry, patterns: MovementPattern[]) => {
    if (excludedSet.has(e.name.toLowerCase())) return false
    if (!patterns.includes(e.movement_pattern)) return false
    if (e.name === current.name) return false
    if (isRegressionFor(e.name, experience) && !isRegressionFor(current.name, experience)) return false
    return true
  }

  // Same pattern first, always — a swap should stay the same KIND of movement.
  let candidates = pool.filter(e => eligible(e, [current.movement_pattern]))

  // Only when that comes back empty: the nearest coaching-equivalent pattern,
  // rather than dropping the slot.
  //
  // REGRESSION THIS FIXES, caught by test:injury-rebuild after it had already
  // shipped: splitting isolation_trap out of isolation_shoulder left the trap
  // pattern holding exactly two movements, both shrugs, and both
  // contraindicated for a NECK injury. So a neck-injured trainee's shrug
  // slots had no same-pattern replacement and were dropped outright — 32 of
  // them — which reads downstream as "a whole movement pattern was wiped" and
  // forced a full plan rebuild over what is genuinely a thinning injury.
  // Before the split those slots fell back to lateral raises, which a neck
  // injury permits, so nothing had ever exercised this path.
  //
  // The general bug is that this filter demanded an exact pattern match with
  // no fallback at all, while plan-build has had NEAREST_PATTERN_FALLBACK for
  // exactly this since long before traps existed. Any thin pattern could hit
  // the same wall; traps are just the one that did.
  if (candidates.length === 0) {
    const fallback = NEAREST_PATTERN_FALLBACK[current.movement_pattern] ?? []
    if (fallback.length > 0) candidates = pool.filter(e => eligible(e, fallback))
  }

  const scored = candidates.map(candidate => {
    let score = 0
    if (candidate.mechanics_tier === current.mechanics_tier) score += 3
    if (candidate.joint_stress === current.joint_stress) score += 1
    if (candidate.joint_stress === 'low' && current.joint_stress !== 'low') score += 2
    const muscleOverlap = candidate.primary_muscles.filter(m =>
      current.primary_muscles.includes(m)
    ).length
    score += muscleOverlap

    let note = candidate.coach_note_swap || ''
    if (candidate.joint_stress === 'low' && current.joint_stress !== 'low') {
      note = `Lower joint stress alternative. ${note}`
    }

    return { exercise: candidate, score, note }
  })

  scored.sort((a, b) => b.score - a.score)
  // NO CAP, and the history is the argument for that.
  //
  // This was a hard 5, which dead-ended a real user's swap: flat bench busy,
  // only incline offered, also busy, and decline bench — which conflicts with
  // nothing — never made the cut. The fix then was to raise it to 8. A second
  // real gym session then dead-ended at 8, on chest again: 14 legitimate
  // alternatives existed and 6 were withheld.
  //
  // Raising it a third time would be the same mistake a third time, and the
  // number was never the problem — a COUNT is the wrong mechanism for "don't
  // overwhelm the trainee". Truncating a ranked list silently discards real
  // options and looks identical, from the outside, to a catalogue that has
  // run out. SwapDialog is where the "don't overwhelm" job belongs and it
  // already does it properly: it shows the top few and offers "Show N more",
  // which now reaches everything eligible instead of everything up to 8.
  //
  // Unbounded is safe here because the list is already constrained hard
  // upstream — same movement pattern, this trainee's equipment, no skill
  // regression, no injury conflict. The widest pattern in the catalogue
  // yields 14. See `npm run report:swap-coverage`.
  return scored.map(({ exercise, note }) => ({ exercise, note }))
}

/**
 * The joints that actually disqualify this movement for an injured trainee.
 * Falls back to loads_joints when contraindicated_joints is absent, so an
 * un-reviewed entry keeps its historical (conservative) behaviour.
 *
 * Every injury filter reads THIS, never loads_joints directly — that's what
 * keeps "participates" and "is unsafe" from collapsing back into one idea.
 */
export function contraindicatedJoints(entry: ExerciseEntry): string[] {
  return entry.contraindicated_joints ?? entry.loads_joints
}

/**
 * Plain English for a joint tag, for anything a trainee reads.
 *
 * The tags are internal strings and one of them is not a phrase: rendering
 * `lower_back_axial` by swapping underscores for spaces produces "lower back
 * axial", which is what the two injury sentences in exercise-plan.ts did.
 * That was ALREADY SHIPPING on the contraindication branch — anyone with a
 * bad back looking at a conflicting exercise read "Loads your lower back
 * axial — you've flagged an injury there." It is not a new bug, it is one
 * this work would have doubled.
 *
 * Same rule as the meal refusals: the trainee sees English, never a tag name.
 * Unknown tags fall back to the underscore swap, which is right for every
 * single-word joint (`hip`, `knee`, `wrist`) and keeps a newly added tag
 * readable rather than blank.
 */
const JOINT_DISPLAY_NAME: Record<string, string> = {
  lower_back_axial: 'lower back',
}

export function jointDisplayName(joint: string): string {
  return JOINT_DISPLAY_NAME[joint] ?? joint.replace(/_/g, ' ')
}

/** Several joints, written the way a person would say them: "knee and lower back". */
export function jointListDisplay(joints: string[]): string {
  const names = joints.map(jointDisplayName)
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** True when this movement is prep/rehab work FOR one of the flagged joints — it should be actively included, not merely allowed. */
export function isIndicatedFor(entry: ExerciseEntry, flaggedJoints: Set<string>): boolean {
  return (entry.indicated_joints ?? []).some(j => flaggedJoints.has(j))
}

/**
 * True when this movement's resistance comes from a band.
 *
 * Lives next to the joint predicates rather than in load-prescription.ts on
 * purpose: this answers "what is the implement", which is a property of the
 * catalogue entry, while `isExternallyLoaded` answers "can we put a number in
 * kilograms on it" — a band is the one implement where those two disagree,
 * which is exactly why the distinction needs a name of its own.
 */
export function isBandEquipped(entry: ExerciseEntry): boolean {
  return entry.equipment.some(e => e === 'resistance band')
}

/** True when this movement must be excluded for a trainee with these flagged joints. An indicated movement is never excluded, even if it loads the joint. */
export function isContraindicatedFor(entry: ExerciseEntry, flaggedJoints: Set<string>): boolean {
  if (isIndicatedFor(entry, flaggedJoints)) return false
  return contraindicatedJoints(entry).some(j => flaggedJoints.has(j))
}

export function getExerciseEntry(name: string): ExerciseEntry | undefined {
  return EXERCISE_DATABASE.find(
    e => e.name.toLowerCase() === name.toLowerCase()
  )
}

/**
 * Free-entry search across the FULL catalog (unfiltered by equipment,
 * injury, style, or skill) — swap-dead-end fix: the ranked list is
 * constraint-checked and capped, so a valid-but-unranked or even
 * constraint-violating exercise the user specifically wants (and is warned
 * about, not blocked from) needs a separate, unfiltered lookup. Prefix
 * matches rank before other substring matches; alphabetical within each
 * group. Capped so the results list stays scrollable, not a full-DB dump.
 */
export function searchExerciseCatalog(query: string, limit = 20): ExerciseEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const startsWith: ExerciseEntry[] = []
  const contains: ExerciseEntry[] = []
  for (const ex of EXERCISE_DATABASE) {
    const name = ex.name.toLowerCase()
    if (name.startsWith(q)) startsWith.push(ex)
    else if (name.includes(q)) contains.push(ex)
  }
  const byName = (a: ExerciseEntry, b: ExerciseEntry) => a.name.localeCompare(b.name)
  return [...startsWith.sort(byName), ...contains.sort(byName)].slice(0, limit)
}

/**
 * The slug scheme behind every ExerciseEntry.id. The SQL backfill in the C0
 * migration derives exercise_id with the Postgres equivalent of exactly this
 * expression — keep the two in sync if this ever changes.
 */
export function slugifyExerciseName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/**
 * Stable exercise identity for log rows (C0 Part 2). Database entries resolve
 * to their hand-written id (exact name match, case-insensitive — same rule as
 * getExerciseEntry). Anything else (user-typed custom exercises, chat-parsed
 * names) falls back to the slug of the raw name, which is deterministic, so
 * the same custom name always maps to the same history. MOVEMENT_FAMILIES is
 * deliberately NOT consulted here: it groups distinct movements ("same
 * movement wearing different hats") for session dedup — collapsing those to
 * one id would merge genuinely different lifts' histories.
 */
export function getExerciseId(name: string): string {
  return getExerciseEntry(name)?.id ?? slugifyExerciseName(name)
}

// ---------------------------------------------------------------------------
// MOVEMENT FAMILIES
// ---------------------------------------------------------------------------
// `substitution_group` captures "these are interchangeable for the same slot".
// It does NOT capture "these are the same movement wearing different hats".
//
// Kettlebell Swings is classified as `activation` / group `swing`, while
// Kettlebell Swing (Heavy) is `hip_hinge` / group `hip_hinge`. Different
// pattern, different group — so nothing stopped the engine from programming
// both in one session. It is the same movement twice, and no trainer would
// write that.
//
// Anything not listed falls back to its substitution_group, so this map only
// needs to cover genuine cross-classification overlaps.

const MOVEMENT_FAMILIES: Record<string, string> = {
  'Kettlebell Swings': 'kettlebell_swing',
  'Kettlebell Swing (Heavy)': 'kettlebell_swing',
  'Chest Dips': 'dip',
  'Tricep Dips': 'dip',
  'Pull-Ups': 'pull_up',
  'Pull-Ups (Assisted)': 'pull_up',
  'Lat Pulldown': 'pulldown',
  'Close-Grip Lat Pulldown': 'pulldown',
  'Cable Rows': 'cable_row',
  'Seated Cable Row': 'cable_row',
  'Shrugs': 'shrug',
  'Dumbbell Shrugs': 'shrug',
  'Lateral Raises': 'lateral_raise',
  'Cable Lateral Raises': 'lateral_raise',
  'Calf Raises': 'calf_raise',
  'Seated Calf Raises': 'calf_raise',
  'Calf Raises (Bodyweight)': 'calf_raise',
  'Deadlifts': 'deadlift',
  'Trap Bar Deadlift': 'deadlift',
  'Box Jumps': 'jump',
  'Broad Jumps': 'jump',
  'Push-Ups': 'push_up',
  'Plyo Push-Ups': 'push_up',
}

/**
 * The dedup key for "is this the same movement as that one". Prefer this over
 * substitution_group when deciding whether two exercises can coexist in a
 * single session.
 */
export function getMovementFamily(entry: ExerciseEntry): string {
  return MOVEMENT_FAMILIES[entry.name] ?? entry.substitution_group
}

// ---------------------------------------------------------------------------
// CAPABILITY GATING
// ---------------------------------------------------------------------------

const EXPERIENCE_RANK: Record<TrainingExperience, number> = {
  beginner: 0, novice: 1, intermediate: 2, advanced: 3,
}

/**
 * Whether this trainee's experience clears the exercise's capability_
 * requirement, if it has one. Entries with no capability_requirement are
 * always fine (they're still subject to the generic SKILL_DEMAND ceiling in
 * experience-config.ts, checked separately).
 */
export function meetsCapabilityRequirement(entry: ExerciseEntry, experience: TrainingExperience): boolean {
  if (!entry.capability_requirement) return true
  return EXPERIENCE_RANK[experience] >= EXPERIENCE_RANK[entry.capability_requirement.minExperience]
}

// ---------------------------------------------------------------------------
// VOLUME ROLE — the set-count hierarchy every session must respect
// ---------------------------------------------------------------------------
// Deliberately keyed off mechanics_tier alone, NOT `isExternallyLoaded` —
// bodyweight tier1 compounds (Pull-Ups) are still a main lift for volume
// purposes even though they have no external load to ramp, and conflating
// "main lift" with "has a barbell" is how Pull-Ups ended up topped up to
// 7x9-13 alongside 2-set accessories. `null` for primers, which sit outside
// the hierarchy entirely (fixed 2 sets, never scaled).

export type VolumeRole = 'main' | 'accessory' | 'isolation' | 'conditioning'

export function getVolumeRole(entry: ExerciseEntry): VolumeRole | null {
  if (entry.mechanics_tier === 'primer') return null
  // A "set" of interval work (30-60s of jump rope, battle ropes, mountain
  // climbers) is a fundamentally different unit than a strength set — capping
  // it at the isolation ceiling (3) is exactly how a dedicated conditioning
  // day's interval work ended up trimmed to "3x30s = 3 minutes of work,"
  // a direct, repeated LLM coach review finding. Checked before the
  // core/carry fallback below since cardio mechanics_tier never overlaps them.
  if (entry.mechanics_tier === 'cardio') return 'conditioning'
  if (entry.movement_pattern === 'core' || entry.movement_pattern === 'carry') return 'isolation'
  switch (entry.mechanics_tier) {
    case 'tier1_compound': return 'main'
    case 'tier2_compound': return 'accessory'
    default: return 'isolation'
  }
}
