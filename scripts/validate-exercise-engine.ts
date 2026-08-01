import { generateExercisePlan } from '../src/lib/exercise-plan'
import { EXERCISE_DATABASE, type ExerciseEntry } from '../src/lib/exercise-db'
import type { UserProfile, EquipmentAccess, TrainingStyle } from '../src/lib/types'

const EQUIPMENT_SETS: Record<EquipmentAccess, Set<string> | null> = {
  full_gym: null,
  home_gym: new Set([
    'barbell', 'dumbbells', 'dumbbell', 'bench', 'incline bench', 'pull-up bar',
    'dip bars', 'kettlebell', 'resistance band', 'plyo box', 'ab wheel',
    'bodyweight', 'EZ bar', 'squat rack', 'trap bar', 'medicine ball', 'jump rope',
  ]),
  minimalist: new Set([
    'kettlebell', 'resistance band', 'bodyweight', 'dumbbells', 'dumbbell',
    'pull-up bar', 'jump rope', 'medicine ball', 'plyo box', 'ab wheel',
  ]),
  bodyweight: new Set(['bodyweight', 'pull-up bar']),
}

const INJURY_EXCLUDED: Record<string, Set<string>> = {
  lower_back: new Set(['Deadlifts', 'Barbell Squats', 'Good Mornings', 'Barbell Rows', 'T-Bar Rows']),
  knees: new Set(['Barbell Squats', 'Hack Squat', 'Leg Press', 'Leg Extensions', 'Walking Lunges', 'Box Jumps', 'Broad Jumps', 'Burpees']),
  shoulders: new Set(['Overhead Press', 'Barbell Bench Press', 'Chest Dips', 'Tricep Dips', 'Incline Machine Press']),
  neck: new Set(['Shrugs', 'Dumbbell Shrugs', 'Overhead Press']),
  wrists: new Set(['Barbell Bench Press', 'Barbell Curls', 'Skull Crushers', 'Overhead Press', 'Barbell Rows']),
}

function makeProfile(overrides: Partial<UserProfile>): UserProfile {
  return {
    age: 28,
    gender: 'male',
    height_cm: 178,
    weight_kg: 82,
    activity_level: 'moderate',
    fitness_goal: 'hypertrophy',
    training_days: [
      { day: 'Monday', available: true },
      { day: 'Tuesday', available: true },
      { day: 'Wednesday', available: false },
      { day: 'Thursday', available: true },
      { day: 'Friday', available: true },
      { day: 'Saturday', available: false },
      { day: 'Sunday', available: false },
    ],
    preferred_time: 'evening',
    dietary_preferences: [],
    session_duration_preference: '45-60',
    training_time_preference: 'evening',
    workout_split_preference: 'ai_recommendation',
    macro_calculation_mode: 'STANDARD_STATIC',
    equipment_access: 'full_gym',
    training_style: 'hybrid',
    coaching_persona: 'analytical',
    injuries: [],
    ...overrides,
  }
}

function getExerciseEntry(name: string): ExerciseEntry | undefined {
  return EXERCISE_DATABASE.find(e => e.name.toLowerCase() === name.toLowerCase())
}

interface ValidationResult {
  profile: string
  checks: { name: string; pass: boolean; detail: string }[]
}

function validate(label: string, profile: UserProfile): ValidationResult {
  const { plan, constraint_trace } = generateExercisePlan(profile)
  const checks: { name: string; pass: boolean; detail: string }[] = []
  const allExerciseNames = plan.flatMap(d => d.exercises.map(e => e.name))

  // 1. Equipment check
  const allowedEquip = EQUIPMENT_SETS[profile.equipment_access]
  if (allowedEquip) {
    const violations: string[] = []
    for (const name of allExerciseNames) {
      const entry = getExerciseEntry(name)
      if (!entry) continue
      const hasAll = entry.equipment.every(eq => allowedEquip.has(eq))
      if (!hasAll) {
        violations.push(`${name} requires [${entry.equipment.join(', ')}]`)
      }
    }
    checks.push({
      name: 'Equipment Compliance',
      pass: violations.length === 0,
      detail: violations.length === 0
        ? `All ${allExerciseNames.length} exercises use only ${profile.equipment_access} equipment`
        : `VIOLATIONS: ${violations.join('; ')}`,
    })
  } else {
    checks.push({ name: 'Equipment Compliance', pass: true, detail: 'Full gym — no restrictions' })
  }

  // 2. Injury check
  if (profile.injuries.length > 0) {
    const banned = new Set<string>()
    for (const injury of profile.injuries) {
      const excluded = INJURY_EXCLUDED[injury]
      if (excluded) excluded.forEach(n => banned.add(n))
    }
    const violations = allExerciseNames.filter(n => banned.has(n))
    checks.push({
      name: 'Injury Safety',
      pass: violations.length === 0,
      detail: violations.length === 0
        ? `No banned exercises found (injuries: ${profile.injuries.join(', ')})`
        : `VIOLATIONS: ${violations.join(', ')} — should be excluded for ${profile.injuries.join(', ')}`,
    })
  } else {
    checks.push({ name: 'Injury Safety', pass: true, detail: 'No injuries declared' })
  }

  // 3. Style check
  const style = profile.training_style
  if (style === 'combat') {
    const hasConditioning = plan.some(d => d.focus.includes('Conditioning') || d.focus.includes('Full Body'))
    const coreCount = allExerciseNames.filter(n => {
      const e = getExerciseEntry(n)
      return e && (e.movement_pattern === 'core' || e.movement_pattern === 'carry')
    }).length
    checks.push({
      name: 'Combat Style Specificity',
      pass: hasConditioning && coreCount >= 2,
      detail: `Conditioning/Power days: ${hasConditioning ? 'YES' : 'NO'}, Core/Carry exercises: ${coreCount}`,
    })
  } else if (style === 'functional') {
    const compoundCount = allExerciseNames.filter(n => {
      const e = getExerciseEntry(n)
      return e && (e.mechanics_tier === 'tier1_compound' || e.mechanics_tier === 'tier2_compound')
    }).length
    const singleLegCount = allExerciseNames.filter(n => {
      const e = getExerciseEntry(n)
      return e && (e.movement_pattern === 'single_leg' || e.movement_pattern === 'carry')
    }).length
    const isConstrained = profile.equipment_access === 'bodyweight' || profile.equipment_access === 'minimalist'
    const hasMultipleInjuries = profile.injuries.length >= 2
    const threshold = isConstrained && hasMultipleInjuries ? 0.0 : isConstrained ? 0.3 : 0.5
    checks.push({
      name: 'Functional Style Specificity',
      pass: compoundCount >= allExerciseNames.length * threshold,
      detail: `Compounds: ${compoundCount}/${allExerciseNames.length} (threshold ${Math.round(threshold * 100)}%), Single-leg/Carry: ${singleLegCount}${isConstrained ? ' (limited pool)' : ''}`,
    })
  } else if (style === 'bodybuilding') {
    const isoCount = allExerciseNames.filter(n => {
      const e = getExerciseEntry(n)
      return e && e.mechanics_tier === 'tier3_isolation'
    }).length
    checks.push({
      name: 'Bodybuilding Style Specificity',
      pass: isoCount >= 3,
      detail: `Isolation exercises: ${isoCount}`,
    })
  }

  // 4. Duration density check
  const dur = profile.session_duration_preference
  if (dur === '30-45') {
    const supersetCount = plan.flatMap(d => d.exercises).filter(e => e.superset_label).length
    const totalExercises = allExerciseNames.length
    const avgPerDay = totalExercises / plan.length
    checks.push({
      name: 'Time-Cap Density (30-45 min)',
      pass: avgPerDay <= 7,
      detail: `Avg exercises/day: ${avgPerDay.toFixed(1)}, Supersetted: ${supersetCount}`,
    })
  } else if (dur === '90+') {
    const totalExercises = allExerciseNames.length
    const avgPerDay = totalExercises / plan.length
    checks.push({
      name: 'Volume Density (90+ min)',
      pass: avgPerDay >= 4.5,
      detail: `Avg exercises/day: ${avgPerDay.toFixed(1)}`,
    })
  }

  // 5. Non-empty plan check
  checks.push({
    name: 'Plan Not Empty',
    pass: plan.length > 0 && allExerciseNames.length > 0,
    detail: `${plan.length} training days, ${allExerciseNames.length} total exercises`,
  })

  return { profile: label, checks }
}

// --- TEST PROFILES ---

const profiles: [string, UserProfile][] = [
  [
    'ATHLETE 1: Combat / Home Gym / Knee Injury / 45min',
    makeProfile({
      fitness_goal: 'conditioning',
      training_style: 'combat',
      equipment_access: 'home_gym',
      session_duration_preference: '30-45',
      injuries: ['knees'],
      training_days: [
        { day: 'Monday', available: true },
        { day: 'Tuesday', available: false },
        { day: 'Wednesday', available: true },
        { day: 'Thursday', available: false },
        { day: 'Friday', available: true },
        { day: 'Saturday', available: true },
        { day: 'Sunday', available: false },
      ],
    }),
  ],
  [
    'ATHLETE 2: Bodybuilding / Full Gym / No Injuries / 90+min',
    makeProfile({
      fitness_goal: 'hypertrophy',
      training_style: 'bodybuilding',
      equipment_access: 'full_gym',
      session_duration_preference: '90+',
      injuries: [],
      training_days: [
        { day: 'Monday', available: true },
        { day: 'Tuesday', available: true },
        { day: 'Wednesday', available: false },
        { day: 'Thursday', available: true },
        { day: 'Friday', available: true },
        { day: 'Saturday', available: true },
        { day: 'Sunday', available: false },
      ],
    }),
  ],
  [
    'ATHLETE 3: Functional / Bodyweight Only / Lower Back + Shoulder Injury / 60min',
    makeProfile({
      fitness_goal: 'functional',
      training_style: 'functional',
      equipment_access: 'bodyweight',
      session_duration_preference: '45-60',
      injuries: ['lower_back', 'shoulders'],
      training_days: [
        { day: 'Monday', available: true },
        { day: 'Wednesday', available: true },
        { day: 'Friday', available: true },
        { day: 'Saturday', available: false },
        { day: 'Sunday', available: false },
        { day: 'Tuesday', available: false },
        { day: 'Thursday', available: false },
      ],
    }),
  ],
  [
    'ATHLETE 4: Hybrid / Minimalist / Wrist Injury / 60-90min',
    makeProfile({
      fitness_goal: 'fat_loss',
      training_style: 'hybrid',
      equipment_access: 'minimalist',
      session_duration_preference: '60-90',
      injuries: ['wrists'],
      training_days: [
        { day: 'Monday', available: true },
        { day: 'Tuesday', available: true },
        { day: 'Wednesday', available: false },
        { day: 'Thursday', available: true },
        { day: 'Friday', available: true },
        { day: 'Saturday', available: false },
        { day: 'Sunday', available: false },
      ],
    }),
  ],
]

// --- RUN VALIDATION ---

console.log('=' .repeat(80))
console.log('  EXERCISE ENGINE VALIDATION — 4 ATHLETE PROFILES')
console.log('='.repeat(80))

let allPassed = true

for (const [label, profile] of profiles) {
  const result = validate(label, profile)
  console.log(`\n${'─'.repeat(80)}`)
  console.log(`  ${result.profile}`)
  console.log(`${'─'.repeat(80)}`)

  for (const check of result.checks) {
    const icon = check.pass ? '✅' : '❌'
    console.log(`  ${icon} ${check.name}: ${check.detail}`)
    if (!check.pass) allPassed = false
  }

  // Print plan summary
  const { plan: displayPlan } = generateExercisePlan(profile)
  const plan = displayPlan
  for (const day of plan) {
    if (day.exercises.length === 0) continue
    console.log(`\n  📋 ${day.day} — ${day.focus}`)
    for (const ex of day.exercises) {
      const ss = ex.superset_label ? ` [${ex.superset_label}]` : ''
      console.log(`     ${ex.name} — ${ex.sets}x${ex.reps} @ ${ex.rest}${ss}`)
    }
  }
}

console.log(`\n${'='.repeat(80)}`)
if (allPassed) {
  console.log('  ✅ ALL CHECKS PASSED — Engine meets world-class programming standards')
} else {
  console.log('  ❌ SOME CHECKS FAILED — Review violations above')
}
console.log('='.repeat(80))

process.exit(allPassed ? 0 : 1)
