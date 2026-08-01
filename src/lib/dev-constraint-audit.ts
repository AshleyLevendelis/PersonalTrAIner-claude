import { generateExercisePlan } from './exercise-plan'
import { EXERCISE_DATABASE } from './exercise-db'
import type {
  UserProfile, EquipmentAccess, TrainingStyle, SessionDuration,
  WorkoutDay, ConstraintTrace, PlanResult, TrainingExperience,
} from './types'
import { getSkillDemand, isSkillAppropriate } from './experience-config'
import { categorize, CATEGORY_CAPS_KG } from './load-prescription'

// All combinations to test
const ALL_EQUIPMENT: EquipmentAccess[] = ['full_gym', 'home_gym', 'minimalist', 'bodyweight']
const ALL_INJURIES = ['lower_back', 'knees', 'shoulders', 'neck', 'wrists']
const ALL_DURATIONS: SessionDuration[] = ['30-45', '45-60', '60-90', '90+']
const ALL_STYLES: TrainingStyle[] = ['functional', 'bodybuilding', 'combat', 'hybrid']
const ALL_EXPERIENCE: TrainingExperience[] = ['beginner', 'novice', 'intermediate', 'advanced']

// Injury -> joints that should NOT appear in final exercises
const INJURED_JOINTS_MAP: Record<string, string[]> = {
  lower_back: ['lower_back_axial'],
  knees: ['knee'],
  shoulders: ['shoulder'],
  neck: ['neck'],
  wrists: ['wrist'],
}

// Equipment access -> what IS allowed (null = everything)
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

// Duration budgets in seconds (with 15% tolerance)
const DURATION_BUDGETS: Record<SessionDuration, number> = {
  '30-45': 37 * 60,
  '45-60': 52 * 60,
  '60-90': 75 * 60,
  '90+': 100 * 60,
}

// Style-required patterns
const STYLE_REQUIRED_PATTERNS: Record<TrainingStyle, string[]> = {
  combat: ['core', 'carry'],
  functional: [],
  bodybuilding: [],
  hybrid: [],
}

export interface AuditFailure {
  check: 'equipment' | 'injury' | 'duration' | 'style_pattern' | 'skill' | 'empty_session' | 'load_cap'
  combination: string
  details: string
  exercise?: string
}

export interface AuditTestCase {
  equipment: EquipmentAccess
  injuries: string[]
  duration: SessionDuration
  style: TrainingStyle
  experience: TrainingExperience
  passed: boolean
  failures: AuditFailure[]
  planDays: number
  totalExercises: number
  estimatedDurationSec: number
}

export interface AuditReport {
  totalCombinations: number
  passed: number
  failed: number
  results: AuditTestCase[]
  runTimeMs: number
}

function buildTestProfile(
  equipment: EquipmentAccess,
  injuries: string[],
  duration: SessionDuration,
  style: TrainingStyle,
  experience: TrainingExperience
): UserProfile {
  return {
    id: 'audit-test',
    age: 30,
    gender: 'male',
    height_cm: 178,
    weight_kg: 80,
    activity_level: 'moderate',
    fitness_goal: 'hypertrophy',
    preferred_time: 'morning',
    bmr: 1800,
    tdee: 2500,
    equipment_access: equipment,
    injuries,
    training_style: style,
    training_experience: experience,
    session_duration_preference: duration,
    workout_split_preference: 'ai_recommendation',
    training_days: [
      { day: 'Monday', available: true },
      { day: 'Tuesday', available: true },
      { day: 'Wednesday', available: false },
      { day: 'Thursday', available: true },
      { day: 'Friday', available: true },
      { day: 'Saturday', available: false },
      { day: 'Sunday', available: false },
    ],
    weekly_schedule: {},
    dietary_preferences: [],
    concurrent_activities: [],
    exercise_exclusions: [],
    training_time_preference: 'morning',
    macro_calculation_mode: 'STANDARD_STATIC',
    coaching_persona: 'supportive',
    created_at: new Date().toISOString(),
  } as UserProfile
}

function estimateSessionSeconds(day: WorkoutDay): number {
  // Warm-up counts toward the session. If it did not, the duration check would
  // pass while real sessions ran over the user's stated time by 5-12 minutes.
  let total = day.warmup?.total_seconds ?? 0
  for (const ex of day.exercises) {
    const restMatch = ex.rest.match(/(\d+)/)
    const restSec = restMatch ? parseInt(restMatch[1]) : 60
    const entry = EXERCISE_DATABASE.find(e => e.name === ex.name)
    const repDuration = entry?.avg_duration_seconds || 35
    total += ex.sets * (repDuration + restSec)
  }
  return total
}

function runSingleAudit(
  equipment: EquipmentAccess,
  injuries: string[],
  duration: SessionDuration,
  style: TrainingStyle,
  experience: TrainingExperience
): AuditTestCase {
  const profile = buildTestProfile(equipment, injuries, duration, style, experience)
  const comboLabel = `${equipment} / ${injuries.length > 0 ? injuries.join('+') : 'none'} / ${duration} / ${style} / ${experience}`
  const failures: AuditFailure[] = []

  let result: PlanResult
  try {
    result = generateExercisePlan(profile)
  } catch (err) {
    return {
      equipment, injuries, duration, style, experience,
      passed: false,
      failures: [{ check: 'equipment', combination: comboLabel, details: `Plan generation threw: ${err}` }],
      planDays: 0, totalExercises: 0, estimatedDurationSec: 0,
    }
  }

  const { plan, constraint_trace } = result
  const allExercises = plan.flatMap(d => d.exercises)

  // CHECK 1: No excluded equipment in output
  const allowedSet = EQUIPMENT_SETS[equipment]
  if (allowedSet) {
    for (const ex of allExercises) {
      const entry = EXERCISE_DATABASE.find(e => e.name === ex.name)
      if (!entry) continue
      for (const eq of entry.equipment) {
        if (!allowedSet.has(eq)) {
          failures.push({
            check: 'equipment',
            combination: comboLabel,
            details: `Exercise requires "${eq}" but user only has ${equipment}`,
            exercise: ex.name,
          })
        }
      }
    }
  }

  // CHECK 2: No flagged joint's movement pattern in output
  const flaggedJoints = new Set<string>()
  for (const injury of injuries) {
    const joints = INJURED_JOINTS_MAP[injury]
    if (joints) joints.forEach(j => flaggedJoints.add(j))
  }
  if (flaggedJoints.size > 0) {
    for (const ex of allExercises) {
      const entry = EXERCISE_DATABASE.find(e => e.name === ex.name)
      if (!entry) continue
      for (const joint of entry.loads_joints) {
        if (flaggedJoints.has(joint)) {
          failures.push({
            check: 'injury',
            combination: comboLabel,
            details: `Exercise loads joint "${joint}" which is flagged by injury [${injuries.join(', ')}]`,
            exercise: ex.name,
          })
        }
      }
    }
  }

  // CHECK 3: Session duration within tolerance of time cap (15% over allowed)
  const budget = DURATION_BUDGETS[duration]
  const tolerance = 1.15
  for (const day of plan) {
    const estSec = estimateSessionSeconds(day)
    if (estSec > budget * tolerance) {
      failures.push({
        check: 'duration',
        combination: comboLabel,
        details: `${day.day} (${day.focus}) estimated at ${Math.round(estSec / 60)}min, budget is ${Math.round(budget / 60)}min (+15% = ${Math.round(budget * tolerance / 60)}min)`,
      })
    }
  }

  // CHECK 4: Style-required patterns present (at least once across the week)
  // NOTE: Some patterns may be relaxed for certain equipment/injury scenarios
  let requiredPatterns = STYLE_REQUIRED_PATTERNS[style]
  
  // Relax 'carry' requirement for bodyweight + limited equipment scenarios
  if (equipment === 'bodyweight' && requiredPatterns.includes('carry')) {
    requiredPatterns = requiredPatterns.filter(p => p !== 'carry')
  }
  if (injuries.includes('wrists') && (equipment === 'minimalist' || equipment === 'bodyweight') && requiredPatterns.includes('carry')) {
    requiredPatterns = requiredPatterns.filter(p => p !== 'carry')
  }
  
  if (requiredPatterns.length > 0) {
    const presentPatterns = new Set<string>()
    for (const ex of allExercises) {
      const entry = EXERCISE_DATABASE.find(e => e.name === ex.name)
      if (entry) presentPatterns.add(entry.movement_pattern)
    }
    for (const pattern of requiredPatterns) {
      if (!presentPatterns.has(pattern)) {
        failures.push({
          check: 'style_pattern',
          combination: comboLabel,
          details: `Style "${style}" requires pattern "${pattern}" but it's not present in any session`,
        })
      }
    }
  }

  // CHECK 5: Every scheduled day must contain actual work.
  // This check exists because the audit previously reported 100% pass while
  // silently emitting sessions with zero exercises — a plan that passes every
  // constraint by virtue of being empty is not a plan.
  for (const day of plan) {
    if (day.exercises.length === 0) {
      failures.push({
        check: 'empty_session',
        combination: comboLabel,
        details: `${day.day} (${day.focus}) contains no exercises`,
      })
    }
  }

  // CHECK 6: No exercise exceeds the trainee's skill ceiling.
  // Exempt when the skill filter had to relax to keep the pool non-empty —
  // that relaxation is deliberate and is recorded in the trace.
  const skillRelaxed = result.constraint_trace.skill_filtered.some(
    e => e.exercise === '(all)'
  )
  if (!skillRelaxed) {
    for (const ex of allExercises) {
      if (!isSkillAppropriate(ex.name, experience)) {
        failures.push({
          check: 'skill',
          combination: comboLabel,
          details: `"${ex.name}" has ${getSkillDemand(ex.name)} skill demand, too advanced for "${experience}"`,
          exercise: ex.name,
        })
      }
    }
  }

  // CHECK 7: No suggested load exceeds its category's absolute first-block
  // safety cap. `generateExercisePlan` always produces a first, unverified
  // prescription, so every non-null suggested_load_kg here should have been
  // capped by prescribeLoad — this check catches a regression in that path.
  for (const ex of allExercises) {
    if (ex.suggested_load_kg == null) continue
    const entry = EXERCISE_DATABASE.find(e => e.name === ex.name)
    if (!entry) continue
    const category = categorize(entry)
    if (!category) continue
    const cap = CATEGORY_CAPS_KG[category]
    if (cap != null && ex.suggested_load_kg > cap) {
      failures.push({
        check: 'load_cap',
        combination: comboLabel,
        details: `Suggested load ${ex.suggested_load_kg}kg exceeds the ${cap}kg first-prescription safety cap for category "${category}"`,
        exercise: ex.name,
      })
    }
  }

  const maxDuration = plan.reduce((max, day) => Math.max(max, estimateSessionSeconds(day)), 0)

  return {
    equipment, injuries, duration, style, experience,
    passed: failures.length === 0,
    failures,
    planDays: plan.length,
    totalExercises: allExercises.length,
    estimatedDurationSec: maxDuration,
  }
}

export function runFullConstraintAudit(
  onProgress?: (done: number, total: number) => void
): AuditReport {
  const startTime = performance.now()

  // Generate all injury combinations (empty + each single injury + a couple combos)
  const injuryCombinations: string[][] = [
    [],
    ...ALL_INJURIES.map(i => [i]),
    ['lower_back', 'knees'],
    ['shoulders', 'wrists'],
    ['knees', 'shoulders', 'lower_back'],
  ]

  const totalCombinations =
    ALL_EQUIPMENT.length * injuryCombinations.length * ALL_DURATIONS.length *
    ALL_STYLES.length * ALL_EXPERIENCE.length
  const results: AuditTestCase[] = []
  let done = 0

  for (const equipment of ALL_EQUIPMENT) {
    for (const injuries of injuryCombinations) {
      for (const duration of ALL_DURATIONS) {
        for (const style of ALL_STYLES) {
          for (const experience of ALL_EXPERIENCE) {
            const testCase = runSingleAudit(equipment, injuries, duration, style, experience)
            results.push(testCase)
            done++
            onProgress?.(done, totalCombinations)
          }
        }
      }
    }
  }

  const runTimeMs = performance.now() - startTime

  return {
    totalCombinations,
    passed: results.filter(r => r.passed).length,
    failed: results.filter(r => !r.passed).length,
    results,
    runTimeMs,
  }
}
