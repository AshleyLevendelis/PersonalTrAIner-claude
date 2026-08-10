import { TrainingStyle, type TrainingExperience, type UserProfile } from './types'
import { isRegressionFor } from './periodization'
import { isExternallyLoaded, preservesRelativeLoad } from './load-prescription'

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
  | 'isolation_quad'
  | 'isolation_hamstring'
  | 'isolation_calf'
  | 'cardio'
  | 'core'
  | 'activation'

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
 */
export type PrescriptionType = 'reps' | 'time' | 'distance_load' | 'intervals'

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
  joint_stress: 'low' | 'moderate' | 'high'
  form_cues: string[]
  coach_note_swap?: string
  loads_joints: string[]
  style_tags: TrainingStyle[]
  /** Hard experience gate + regression — see CapabilityRequirement. Absent means no gate beyond the generic SKILL_DEMAND ceiling. */
  capability_requirement?: CapabilityRequirement
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
    substitution_group: 'dip',
    unilateral: false,
    avg_duration_seconds: 35,
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
    loads_joints: ['lower_back_axial', 'wrist'],
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
    joint_stress: 'moderate',
    form_cues: ['Straddle bar or use landmine', 'Hinge forward 45 degrees', 'Pull to chest', 'Squeeze at top'],
    coach_note_swap: 'Neutral grip row that loads the mid-back heavily.',
    loads_joints: ['lower_back_axial', 'wrist'],
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
    style_tags: ['bodybuilding', 'hybrid'],
    substitution_group: 'rear_delt',
    unilateral: false,
    avg_duration_seconds: 28,
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
  {
    name: 'Pull-Ups',
    id: 'pull-ups',
    movement_pattern: 'vertical_pull',
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
    movement_pattern: 'isolation_shoulder',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['upper trapezius'],
    equipment: ['barbell', 'dumbbells'],
    joint_stress: 'low',
    form_cues: ['Elevate shoulders straight up', 'Hold at top 1 second', 'Do not roll shoulders', 'Full depression at bottom'],
    coach_note_swap: 'Direct trap work for neck and yoke thickness.',
    loads_joints: ['neck', 'wrist'],
    style_tags: ['bodybuilding', 'functional', 'hybrid'],
    substitution_group: 'shrug',
    unilateral: false,
    avg_duration_seconds: 28,
  },
  {
    name: 'Dumbbell Shrugs',
    id: 'dumbbell-shrugs',
    movement_pattern: 'isolation_shoulder',
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

  // HIP HINGE
  {
    name: 'Deadlifts',
    id: 'deadlifts',
    movement_pattern: 'hip_hinge',
    mechanics_tier: 'tier1_compound',
    prescription_type: 'reps',
    angle_vector: 'vertical',
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
    mechanics_tier: 'tier1_compound',
    prescription_type: 'reps',
    angle_vector: 'vertical',
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
    mechanics_tier: 'tier2_compound',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['hamstrings', 'glutes', 'erectors'],
    equipment: ['barbell', 'dumbbells'],
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
    angle_vector: 'vertical',
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
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'leg_curl',
    unilateral: false,
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

  // KNEE DOMINANT
  {
    name: 'Barbell Squats',
    id: 'barbell-squats',
    movement_pattern: 'knee_dominant',
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

  // SINGLE LEG
  {
    name: 'Walking Lunges',
    id: 'walking-lunges',
    movement_pattern: 'single_leg',
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

  {
    name: 'Calf Raises (Bodyweight)',
    id: 'calf-raises-bodyweight',
    movement_pattern: 'isolation_calf',
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

  // BICEPS
  {
    name: 'Barbell Curls',
    id: 'barbell-curls',
    movement_pattern: 'isolation_bicep',
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

  // TRICEPS
  {
    name: 'Tricep Dips',
    id: 'tricep-dips',
    movement_pattern: 'isolation_tricep',
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
  {
    name: 'Overhead Tricep Extension',
    id: 'overhead-tricep-extension',
    movement_pattern: 'isolation_tricep',
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'vertical',
    primary_muscles: ['triceps (long head)'],
    equipment: ['dumbbell', 'cable machine'],
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
    mechanics_tier: 'tier3_isolation',
    prescription_type: 'reps',
    angle_vector: 'horizontal',
    primary_muscles: ['triceps'],
    equipment: ['barbell', 'EZ bar'],
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
    style_tags: ['functional', 'combat', 'hybrid'],
    substitution_group: 'cardio_cycling',
    unilateral: false,
    avg_duration_seconds: 30,
  },
  {
    name: 'Jump Rope',
    id: 'jump-rope',
    movement_pattern: 'cardio',
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
    prescription_type: 'intervals',
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
    loads_joints: [],
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
    loads_joints: [],
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
    style_tags: ['functional', 'combat', 'hybrid'],
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
    style_tags: ['functional', 'hybrid'],
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
    style_tags: ['functional', 'combat', 'hybrid'],
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
    style_tags: ['functional', 'hybrid'],
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
    style_tags: ['functional', 'hybrid'],
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
    style_tags: ['functional', 'combat', 'hybrid'],
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
    style_tags: ['functional', 'hybrid'],
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
    style_tags: ['functional', 'hybrid'],
    substitution_group: 'scapular_control',
    unilateral: false,
    avg_duration_seconds: 18,
    primer_pattern_affinity: ['horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull'],
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
export function getSmartReplacements(
  exerciseName: string,
  pool: ExerciseEntry[],
  experience: TrainingExperience,
  exclusions: string[] = [],
  /**
   * Needed for the relative-load guard below (preservesRelativeLoad) —
   * optional and defaulted to undefined for any pre-existing caller that
   * doesn't have a profile handy; the relative-load check is skipped
   * (falls back to loading-class only) when omitted.
   */
  profile?: UserProfile,
): { exercise: ExerciseEntry; note: string }[] {
  const current = EXERCISE_DATABASE.find(
    e => e.name.toLowerCase() === exerciseName.toLowerCase()
  )
  if (!current) return []

  const excludedSet = new Set(exclusions.map(e => e.toLowerCase()))
  excludedSet.add(exerciseName.toLowerCase())

  // Same loading-class guard as periodization.ts's rotateVariation, applied
  // here too — manual swap/ban went through a completely separate candidate
  // function with no such guard, so a user swapping out a loaded Dumbbell
  // Row could still land on a bodyweight Inverted Row. Bodyweight -> loaded
  // is fine (an upgrade); loaded -> bodyweight is the regression this
  // blocks.
  const currentIsLoaded = isExternallyLoaded(current)

  const candidates = pool.filter(e => {
    if (excludedSet.has(e.name.toLowerCase())) return false
    if (e.movement_pattern !== current.movement_pattern) return false
    if (e.name === current.name) return false
    if (isRegressionFor(e.name, experience) && !isRegressionFor(current.name, experience)) return false
    if (currentIsLoaded && !isExternallyLoaded(e)) return false
    // Fix 3: loaded -> loaded must also preserve roughly the same loading
    // demand — the class guard above alone lets a 28kg dumbbell row swap
    // to a 27.5kg backpack row (both "loaded"), a stealth ~50% regression.
    if (profile && !preservesRelativeLoad(current, e, profile)) return false
    return true
  })

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
  // Swap-dead-end fix: was a hard 5, which is exactly why a real user's swap
  // dialog dead-ended (flat bench busy -> only incline offered, also busy —
  // decline bench, which conflicts with nothing, simply never made the cut).
  // Raised to 8; ExercisePlan.tsx's dialog shows the top few and offers
  // "show more" for the rest rather than dumping all 8 at once.
  return scored.slice(0, MAX_SMART_REPLACEMENTS).map(({ exercise, note }) => ({ exercise, note }))
}

/** Cap for getSmartReplacements — see its call site's comment for why this changed from 5. */
export const MAX_SMART_REPLACEMENTS = 8

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
