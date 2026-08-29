/**
 * Gate: a stated lift the app's own standards call impossible must not become
 * a confident heavy prescription.
 *
 * THE INCIDENT. Ashley's live profile carried squat 100 / bench 150 /
 * deadlift 150 at 86 kg. Her Exercise tab read "Trap Bar Deadlift 152.5 kg —
 * YOU TOLD US", ramping to 140 x 1. Her words: "i didn't tell the app i could
 * deadlift 150 but it claims i did. and 150kg is a lot and someone who hasn't
 * specified or shown they can lift that could injure themselves."
 *
 * The app already held the evidence and never looked: 150 kg is 116% of its
 * own advanced one-rep-max estimate for that body, and a deadlift equal to a
 * bench is below the 1.67x minimum ratio anywhere in its standards table.
 * The only validation was isNumberIn(1, 500).
 *
 * Her ruling: ask once, and never skip calibration on it. §3 is the half that
 * holds whatever the person answers.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { implausibleLifts, isImplausible } from '../src/lib/lift-plausibility'
import { STRENGTH_STANDARDS_1RM_PER_BW } from '../src/lib/load-prescription'
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import type { UserProfile } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 240)}` : ''}`) }
}
const P = (o: Record<string, unknown>) => o as unknown as Parameters<typeof implausibleLifts>[0]

console.log('\n1. The incident itself\n')
const ashley = P({ known_squat_kg: 100, known_bench_kg: 150, known_deadlift_kg: 150, weight_kg: 86, gender: 'male' })
const found = implausibleLifts(ashley)
check('her bench is flagged (116% of the advanced 1RM estimate)', found.some(f => f.lift === 'bench' && f.reason === 'above_ceiling'), found)
check('her deadlift is flagged (identical to the bench)', found.some(f => f.lift === 'deadlift' && f.reason === 'impossible_pair'), found)
check('her squat is NOT flagged — 100kg at 86kg is ordinary', !found.some(f => f.lift === 'squat'))
check('the message names the number, not a column or a rule',
  found.every(f => f.message.includes(String(f.statedKg)) && !/known_|_kg|reason/.test(f.message)), found.map(f => f.message))

console.log('\n2. A false positive costs more than a cautious load — these must stay silent\n')
for (const [label, prof] of [
  ['advanced male 86kg, sensible spread', P({ known_squat_kg: 160, known_bench_kg: 110, known_deadlift_kg: 200, weight_kg: 86, gender: 'male' })],
  ['beginner female 60kg', P({ known_squat_kg: 40, known_bench_kg: 25, known_deadlift_kg: 55, weight_kg: 60, gender: 'female' })],
  ['bench specialist, deadlift only 1.4x bench', P({ known_bench_kg: 120, known_deadlift_kg: 168, weight_kg: 90, gender: 'male' })],
  ['one lift only, nothing to compare against', P({ known_deadlift_kg: 200, weight_kg: 86, gender: 'male' })],
  ['no lifts stated at all', P({ weight_kg: 86, gender: 'male' })],
] as const) {
  check(`silent: ${label}`, implausibleLifts(prof).length === 0, implausibleLifts(prof))
}

console.log('\n3. The half that does not depend on anyone answering\n')
function meso(p: Record<string, unknown>) {
  const profile = {
    age: 37, gender: 'male', height_cm: 178, weight_kg: 86, activity_level: 'light',
    fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1800, tdee: 2500,
    equipment_access: 'full_gym', injuries: [], training_style: 'functional',
    training_experience: 'advanced', session_duration_preference: '30-45',
    workout_split_preference: 'ai_recommendation',
    training_days: [
      { day: 'Monday', available: true }, { day: 'Tuesday', available: true },
      { day: 'Thursday', available: true }, { day: 'Friday', available: true },
      { day: 'Saturday', available: true }, { day: 'Wednesday', available: false },
      { day: 'Sunday', available: false },
    ],
    weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
    exercise_exclusions: [], macro_calculation_mode: 'STANDARD_STATIC',
    coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
    skip_calibration_week: true, ...p,
  } as unknown as UserProfile
  setRandomSource(seededRngFromKey('gate'))
  const d = console.debug, w = console.warn
  console.debug = () => {}; console.warn = () => {}
  try { return generateMesocycle(profile) } finally { console.debug = d; console.warn = w; resetRandomSource() }
}
const heaviest = (weeks: ReturnType<typeof meso>) => {
  let max = 0
  for (const day of (weeks[0].days ?? [])) {
    for (const ex of (day.exercises ?? []) as { suggested_load_kg?: number | null }[]) {
      if (typeof ex.suggested_load_kg === 'number' && ex.suggested_load_kg > max) max = ex.suggested_load_kg
    }
  }
  return max
}
const flaggedWeeks = meso({ known_squat_kg: 100, known_bench_kg: 150, known_deadlift_kg: 150 })
const saneWeeks = meso({ known_squat_kg: 100, known_bench_kg: 80, known_deadlift_kg: 140 })
check('a flagged profile gets a calibration week even having asked to skip it',
  flaggedWeeks[0].isCalibrationWeek === true)
check('...and a trustworthy one still skips it, so the feature is not broken for everyone',
  saneWeeks[0].isCalibrationWeek === false)
const flaggedMax = heaviest(flaggedWeeks), saneMax = heaviest(saneWeeks)
console.log(`     week-1 heaviest — flagged ${flaggedMax}kg, trustworthy ${saneMax}kg`)
check('the flagged number no longer drags week 1 up to it', flaggedMax < 150, flaggedMax)
check('...while a trustworthy number still anchors normally', saneMax > 100, saneMax)
check('isImplausible agrees with implausibleLifts per lift',
  isImplausible(ashley, 'bench') && isImplausible(ashley, 'deadlift') && !isImplausible(ashley, 'squat'))

console.log('\n3b. A beginner always calibrates, whatever they tapped\n')
// Ashley's ruling, 30 Aug 2026: "a beginner should always get a calibration
// week." skip_calibration_week was set from knowsWorkingLifts alone, so
// someone who had just described themselves as a beginner could tap "I know
// my numbers" and start heavy on a figure nobody had checked — and a beginner
// is both least able to judge whether their number is right and least able to
// absorb it if it is not. The numbers still anchor loads; they no longer buy
// a skipped week.
{
  const withLifts = { known_squat_kg: 80, known_bench_kg: 60, known_deadlift_kg: 100, skip_calibration_week: true }
  const byExperience = (['beginner', 'novice', 'intermediate', 'advanced'] as const)
    .map(exp => ({ exp, cal: meso({ ...withLifts, training_experience: exp })[0].isCalibrationWeek }))
  check('a beginner calibrates even having tapped "I know my numbers"',
    byExperience.find(r => r.exp === 'beginner')?.cal === true, byExperience)
  check('...and nobody else is forced into one by this rule',
    byExperience.filter(r => r.exp !== 'beginner').every(r => r.cal === false), byExperience)
  // The lifts must still be RECORDED — the ruling was about the skipped week,
  // not about discarding what they told us.
  const anchored = meso({ ...withLifts, training_experience: 'beginner' })
  let heaviest = 0
  for (const day of (anchored[0].days ?? [])) {
    for (const ex of (day.exercises ?? []) as { suggested_load_kg?: number | null }[]) {
      if (typeof ex.suggested_load_kg === 'number' && ex.suggested_load_kg > heaviest) heaviest = ex.suggested_load_kg
    }
  }
  check('...and their stated numbers still anchor the loads', heaviest > 40, heaviest)
}

console.log('\n3c. The option no longer calls anyone new\n')
// Ashley: "I dont like the 'Im new/ not sure' just say not sure." Someone with
// a solid gym background who simply has not tested lately is not new, and the
// question is only asking whether they know a number.
const slots = readFileSync(join(ROOT, 'src/lib/onboarding-slots.ts'), 'utf8')
check('the label is "Not sure"', /label: 'Not sure'/.test(slots))
check("...and no longer says \"I'm new\"", !/I&apos;m new|I'm new \/ not sure/.test(slots))

console.log('\n4. The rules read the app\'s own table, not a second copy\n')
const mod = readFileSync(join(ROOT, 'src/lib/lift-plausibility.ts'), 'utf8')
check('it imports the standards rather than restating them',
  /import \{ STRENGTH_STANDARDS_1RM_PER_BW \}/.test(mod) && !/squat:\s*\{\s*male:/.test(mod))
// If the table itself moves, the ceiling moves with it — that is the point of
// importing. Pinned so a silent edit to the standards shows up here too.
check('the advanced male bench standard is still 1.5x bodyweight',
  STRENGTH_STANDARDS_1RM_PER_BW.bench.male.advanced === 1.5, STRENGTH_STANDARDS_1RM_PER_BW.bench.male.advanced)
check('...and the deadlift:bench ratio floor stays below the table minimum',
  1.25 < Math.min(...(['beginner', 'novice', 'intermediate', 'advanced'] as const).flatMap(e =>
    (['male', 'female'] as const).map(s => STRENGTH_STANDARDS_1RM_PER_BW.deadlift[s][e] / STRENGTH_STANDARDS_1RM_PER_BW.bench[s][e]))))

console.log('\n5. The ceiling rule never runs on a guessed bodyweight\n')
const assumedBody = P({ known_bench_kg: 150, weight_kg: 86, gender: 'male' })
check('flagged when the weight is real', implausibleLifts(assumedBody, false).length > 0)
check('silent when the weight was assumed — a ratio against a guess proves nothing',
  implausibleLifts(assumedBody, true).length === 0)
check('...but the pair rule still protects them, needing no bodyweight',
  implausibleLifts(P({ known_bench_kg: 100, known_deadlift_kg: 100 }), true).length === 1)

console.log('\n6. Both halves are wired\n')
const plan = readFileSync(join(ROOT, 'src/lib/exercise-plan.ts'), 'utf8')
const onb = readFileSync(join(ROOT, 'src/components/onboarding/ConversationalOnboarding.tsx'), 'utf8')
check('the generator drops a flagged lift from the anchors', /flaggedLifts\.has\('deadlift'\)/.test(plan))
check('...and refuses to skip calibration on one', /flaggedLifts\.size === 0/.test(plan))
check('the review asks about it before generating', /liftWarnings/.test(onb) && /implausibleLifts/.test(onb))
check('...and asks rather than blocks', !/disabled=\{[^}]*liftWarnings/.test(onb))

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\nA weight nobody could lift never becomes a weight somebody is told to lift.\n')
