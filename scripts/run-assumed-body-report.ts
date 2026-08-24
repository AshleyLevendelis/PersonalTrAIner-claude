// ---------------------------------------------------------------------------
// Assumed-body load report (backlog 2b) — READ-ONLY measurement, no fixes.
//
// Onboarding lets someone decline their weight, age and sex. The nutrition
// side honours that refusal and renders an absence. The load engine did not:
// resolveParentOneRepMaxKg substituted 75kg / male / 30 and prescribed from
// those numbers with no mark on the output.
//
// This script measures the size of that substitution, so the fix can be
// argued from a ratio rather than from "sounds safer". Run it BEFORE and
// AFTER any change to the load path.
//
// Method: matched pairs. Same persona twice — once with body metrics stated,
// once with all three declined — seeded identically (seededRngFromKey), so a
// load difference is the substitution and not RNG. Reports the ratio
// declined/stated on every shared lift, in week 1 and in a representative
// later week, plus what the app SAYS about those numbers.
// ---------------------------------------------------------------------------

import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import type { UserProfile, MesocycleWeek, WorkoutDay } from '../src/lib/types'

function buildProfile(overrides: Partial<UserProfile>): UserProfile {
  return {
    age: 30,
    gender: 'male',
    height_cm: 178,
    weight_kg: 75,
    activity_level: 'moderate',
    fitness_goal: 'hypertrophy',
    preferred_time: 'morning',
    bmr: 1800,
    tdee: 2500,
    equipment_access: 'full_gym',
    injuries: [],
    training_style: 'bodybuilding',
    training_experience: 'novice',
    session_duration_preference: '60-90',
    workout_split_preference: 'ai_recommendation',
    training_days: [
      { day: 'Monday', available: true },
      { day: 'Tuesday', available: false },
      { day: 'Wednesday', available: true },
      { day: 'Thursday', available: false },
      { day: 'Friday', available: true },
      { day: 'Saturday', available: false },
      { day: 'Sunday', available: false },
    ],
    weekly_schedule: {},
    dietary_preferences: [],
    concurrent_activities: [],
    exercise_exclusions: [] as unknown as never,
    macro_calculation_mode: 'STANDARD_STATIC',
    coaching_persona: 'supportive',
    recovery_capacity: 'moderate',
    conditioning_preference: 'tolerate',
    ...overrides,
  } as UserProfile
}

/** The declined side: the three body metrics the onboarding "Prefer not to say" button clears. */
function declineBody(p: UserProfile): UserProfile {
  const out = { ...p }
  delete (out as Record<string, unknown>).weight_kg
  delete (out as Record<string, unknown>).age
  delete (out as Record<string, unknown>).gender
  return out
}

function generateSeeded(profile: UserProfile, seedKey: string): MesocycleWeek[] {
  setRandomSource(seededRngFromKey(seedKey))
  const originalDebug = console.debug
  const originalWarn = console.warn
  console.debug = () => {}
  console.warn = () => {}
  try {
    return generateMesocycle(profile)
  } finally {
    console.debug = originalDebug
    console.warn = originalWarn
    resetRandomSource()
  }
}

interface Row { name: string; kg: number; source: string }

function loadedRows(days: WorkoutDay[]): Map<string, Row> {
  const out = new Map<string, Row>()
  for (const d of days) {
    for (const ex of d.exercises) {
      if (ex.suggested_load_kg == null || ex.suggested_load_kg <= 0) continue
      if (!out.has(ex.name)) {
        out.set(ex.name, { name: ex.name, kg: ex.suggested_load_kg, source: ex.load_source ?? '(unset)' })
      }
    }
  }
  return out
}

function weekOf(meso: MesocycleWeek[], pick: 'first' | 'representative'): MesocycleWeek | undefined {
  if (pick === 'first') return meso[0]
  return meso.find(w => !w.isCalibrationWeek && !w.is_deload && (w.block_number ?? 1) > 1)
    ?? meso.find(w => !w.isCalibrationWeek && !w.is_deload)
    ?? meso[0]
}

function fmt(n: number): string {
  return n.toFixed(2)
}

interface Persona { key: string; label: string; overrides: Partial<UserProfile> }

const PERSONAS: Persona[] = [
  {
    key: 'light-female',
    label: '52yo woman, 55kg, novice',
    overrides: { age: 52, gender: 'female', weight_kg: 55, height_cm: 162, training_experience: 'novice' },
  },
  {
    key: 'heavy-male',
    label: '35yo man, 100kg, intermediate',
    overrides: { age: 35, gender: 'male', weight_kg: 100, height_cm: 186, training_experience: 'intermediate' },
  },
  {
    key: 'control-male',
    label: '30yo man, 75kg, novice  (CONTROL — this IS the assumed body)',
    overrides: { age: 30, gender: 'male', weight_kg: 75, height_cm: 178, training_experience: 'novice' },
  },
]

const lines: string[] = []
const push = (s = '') => { lines.push(s); console.log(s) }

push('='.repeat(78))
push('ASSUMED-BODY LOAD REPORT')
push('Ratio = what a DECLINED profile is prescribed / what the SAME person is')
push('prescribed once the app knows their body. 1.00 means no fabrication.')
push('='.repeat(78))

for (const persona of PERSONAS) {
  const stated = buildProfile(persona.overrides)
  const declined = declineBody(stated)
  const seed = `assumed-body:${persona.key}`
  const mesoStated = generateSeeded(stated, seed)
  const mesoDeclined = generateSeeded(declined, seed)

  push()
  push(`--- ${persona.label} ---`)
  push(`week 1 is a calibration week?   stated=${!!weekOf(mesoStated, 'first')?.isCalibrationWeek}  declined=${!!weekOf(mesoDeclined, 'first')?.isCalibrationWeek}`)

  for (const pick of ['first', 'representative'] as const) {
    const wS = weekOf(mesoStated, pick)
    const wD = weekOf(mesoDeclined, pick)
    if (!wS || !wD) continue
    const rowsS = loadedRows(wS.days)
    const rowsD = loadedRows(wD.days)
    const ratios: { name: string; s: number; d: number; r: number; src: string }[] = []
    for (const [name, s] of rowsS) {
      const d = rowsD.get(name)
      if (d) ratios.push({ name, s: s.kg, d: d.kg, r: d.kg / s.kg, src: d.source })
    }
    ratios.sort((a, b) => b.r - a.r)
    const mean = ratios.length ? ratios.reduce((t, x) => t + x.r, 0) / ratios.length : 0
    const worst = ratios[0]
    const overCount = ratios.filter(x => x.r > 1.15).length
    const label = pick === 'first' ? `week 1        ` : `week ${wD.week_number ?? '?'} (later)`
    push(`${label}  shared lifts=${String(ratios.length).padStart(2)}  mean ratio=${fmt(mean)}  over-prescribed(>1.15x)=${overCount}` +
      (worst ? `  worst=${worst.name} ${fmt(worst.r)}x (${worst.s}kg -> ${worst.d}kg)` : ''))
    if (pick === 'representative') {
      const sources = new Map<string, number>()
      for (const r of rowsD.values()) sources.set(r.source, (sources.get(r.source) ?? 0) + 1)
      push(`                 what the app calls those numbers: ${[...sources].map(([k, v]) => `${k}=${v}`).join(', ')}`)
    }
    if (pick === 'first' && ratios.length) {
      for (const r of ratios.slice(0, 4)) {
        push(`                   ${r.name.padEnd(34)} ${String(r.s).padStart(6)}kg -> ${String(r.d).padStart(6)}kg  ${fmt(r.r)}x`)
      }
    }
  }
}

// -------------------------------------------------------------------------
// The related defect: "I know my numbers" with nothing actually entered.
// -------------------------------------------------------------------------
push()
push('--- "I know my numbers", zero numbers entered ---')
const bluffer = buildProfile({
  age: 52, gender: 'female', weight_kg: 55, height_cm: 162,
  skip_calibration_week: true,
})
const mesoBluff = generateSeeded(bluffer, 'assumed-body:bluffer')
push(`week 1 is a calibration week?   ${!!mesoBluff[0]?.isCalibrationWeek}   (skip_calibration_week=true, no lift numbers)`)

const blufferNoBody = declineBody(bluffer)
const mesoBluffNoBody = generateSeeded(blufferNoBody, 'assumed-body:bluffer')
push(`same, body also declined:       ${!!mesoBluffNoBody[0]?.isCalibrationWeek}`)
const w1 = loadedRows(mesoBluffNoBody[0]?.days ?? [])
const w1Stated = loadedRows(mesoBluff[0]?.days ?? [])
const bluffRatios = [...w1Stated].flatMap(([n, s]) => {
  const d = w1.get(n)
  return d ? [d.kg / s.kg] : []
})
if (bluffRatios.length) {
  push(`week 1 mean ratio declined/stated: ${fmt(bluffRatios.reduce((a, b) => a + b, 0) / bluffRatios.length)} over ${bluffRatios.length} lifts`)
}

push()
push('='.repeat(78))
