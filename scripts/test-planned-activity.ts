// ---------------------------------------------------------------------------
// "A day whose plan is an activity shows the activity" gate.
//
// THE DEFECT THIS EXISTS TO STOP COMING BACK, measured 15 Sep 2026: the type
// PlannedActivity had existed for weeks, the beginner's walking plan had been
// filling it in for weeks, the coach could read it — and NO SCREEN COMPONENT
// read it at all. TodayPanel decided "is this a session?" with
// `exercises.length === 0`, called a prescribed 20-minute walk active
// recovery, and rendered a card whose entire offer was a blank
// "Log a walk or other activity" form. The plan said walk; the screen asked
// what you did. The week list and tomorrow's preview filtered it out entirely.
//
// WHAT THIS GATE CAN AND CANNOT PROVE, stated because the distinction is the
// whole reason verify:planned-activity exists beside it:
//   - §1 and §2 are BEHAVIOURAL. They generate a real plan and call the real
//     decision functions. They prove the answers are right.
//   - §3 is a SOURCE check, and a source check can never prove a branch is
//     REACHED. It proves each screen asks the shared question instead of
//     re-deriving it; it cannot prove the rendered card contains the words.
//     That is verify:planned-activity's job, and its screenshot is READ.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs'
import { generateMesocycle } from '../src/lib/exercise-plan'
import { isScheduledDay, prescriptionLine, dayDetail } from '../src/lib/activity-day'
import type { UserProfile, WorkoutDay } from '../src/lib/types'

let failures = 0
const check = (name: string, ok: boolean, detail: unknown = '') => {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures++
    console.error(`  ✗ ${name}${detail ? ` — ${JSON.stringify(detail)}` : ''}`)
  }
}

const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const CHOSEN = ['Monday', 'Wednesday', 'Friday']

/** The one profile the app gives a walking plan to — see test:starting-out. */
const walkerProfile: UserProfile = {
  age: 63, gender: 'female', height_cm: 165, weight_kg: 72,
  activity_level: 'sedentary', fitness_goal: 'fat_loss', start_preference: 'move_more',
  training_days: ALL_DAYS.map(d => ({ day: d, available: CHOSEN.includes(d) })),
  preferred_time: 'morning', dietary_preferences: [],
  session_duration_preference: '30-45', workout_split_preference: 'ai_recommendation',
  macro_calculation_mode: 'STANDARD_STATIC', equipment_access: 'bodyweight',
  training_style: 'functional', training_experience: 'beginner',
  coaching_persona: 'supportive', injuries: [],
  recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
}

const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (_m, p1) => p1)

/**
 * AN IMPORT IS NOT A USE. Caught by mutation on 15 Sep 2026: replacing the
 * one call to isScheduledDay with the hand-rolled exercise count left the
 * import untouched, so a check looking for the bare name still found it and
 * passed over exactly the defect it was written for. Same shape as grepping
 * for an identifier after inserting a line that uses it.
 */
const stripImports = (src: string) => src.replace(/^\s*import\s[\s\S]*?from\s+['"][^'"]+['"]\s*$/gm, '')

console.log('planned-activity gate\n')

// -------------------------------------------------------------------------
console.log('1. A generator really does produce these — the premise the old type comment denied')

const meso = generateMesocycle(walkerProfile)
const week1 = meso[0]
const chosenDays = week1.days.filter(d => CHOSEN.includes(d.day))

check('the walking plan generates the days that were chosen', chosenDays.length === CHOSEN.length, chosenDays.map(d => d.day))
check(
  'every chosen day carries a whole prescription, not an empty session',
  chosenDays.length > 0 && chosenDays.every(d => !!d.plannedActivity && d.exercises.length === 0),
  chosenDays.map(d => ({ day: d.day, planned: !!d.plannedActivity, exercises: d.exercises.length })),
)
// NULL-SAFE ON PURPOSE. These read `?.` rather than `!.` because a mutation
// that removed the prescription made this file THROW — 2 of 28 checks ran and
// the harness saw zero failures, which is indistinguishable from a pass.
check(
  '...with a named activity and real minutes',
  chosenDays.length > 0 && chosenDays.every(d => !!d.plannedActivity?.activity.trim() && (d.plannedActivity?.duration ?? 0) > 0),
  chosenDays.map(d => d.plannedActivity),
)
check(
  '...and a reason written for a person to read',
  chosenDays.length > 0 && chosenDays.every(d => (d.plannedActivity?.reason ?? '').trim().length > 20),
  chosenDays.map(d => d.plannedActivity?.reason),
)

// -------------------------------------------------------------------------
console.log('\n2. The shared decisions, run — not read')

// A MISSING PRESCRIPTION MUST FAIL, NOT THROW. Found by mutation: removing
// plannedActivity from the generator crashed this file on the first non-null
// assertion, so 2 of 28 checks ran and the harness saw zero failures — which
// reads exactly like a pass. The fallback keeps the remaining checks running
// and lets §1's failure be the finding.
const generated = chosenDays[0]
if (!generated?.plannedActivity) {
  check('the generated walk day carries a prescription for the rest of this file to read', false, generated?.day)
}
const walkDay: WorkoutDay = generated?.plannedActivity
  ? generated
  : { day: 'Monday', focus: 'Walk', exercises: [], is_scheduled: true, plannedActivity: { activity: 'Walk', duration: 20, targetRpe: 4, reason: 'x'.repeat(30) } }
const gymDay: WorkoutDay = {
  day: 'Tuesday', focus: 'Upper Body', is_scheduled: true,
  exercises: [
    { name: 'Bench Press', sets: 3, reps: '8-10', rest_seconds: 120, intensity: 'RPE 7' },
    { name: 'Row', sets: 3, reps: '8-10', rest_seconds: 120, intensity: 'RPE 7' },
  ] as WorkoutDay['exercises'],
}
const restDay: WorkoutDay = { day: 'Sunday', focus: 'Rest', exercises: [] }
const legacyGymDay: WorkoutDay = { day: 'Thursday', focus: 'Legs', exercises: gymDay.exercises }

check('an activity day counts as scheduled', isScheduledDay(walkDay) === true, walkDay.day)
check('a gym day counts as scheduled', isScheduledDay(gymDay) === true)
check('a rest day does not', isScheduledDay(restDay) === false)
check('a plan stored before the flag existed still counts by its exercises', isScheduledDay(legacyGymDay) === true)
check('nothing at all is not a session', isScheduledDay(undefined) === false)

// THE ORIGINAL BUG, IN ONE LINE: the old readers all asked this question, and
// this is the answer they got for the only plan a beginner is ever given.
check(
  'and the OLD test would have called that walk a rest day',
  walkDay.exercises.length === 0 && isScheduledDay(walkDay),
  { exercises: walkDay.exercises.length },
)

check(
  'a preview of an activity day is measured in minutes, never "0 exercises"',
  dayDetail(walkDay) === `${walkDay.plannedActivity!.duration} minutes` && !dayDetail(walkDay).includes('exercise'),
  dayDetail(walkDay),
)
check('a preview of a gym day is measured in exercises', dayDetail(gymDay) === '2 exercises', dayDetail(gymDay))
check('...and one exercise is not "1 exercises"', dayDetail({ ...gymDay, exercises: [gymDay.exercises[0]!] }) === '1 exercise')

check(
  'one phrase for one thing: activity, minutes, effort',
  // In words since 24 Sep 2026 — Ashley's "like a lifting set" ruling put
  // effort as Easy / Steady / Hard everywhere, and this phrase is literally the
  // one a saved cardio row reads back.
  prescriptionLine({ activity: 'Walk', duration: 20, targetRpe: 4 }) === 'Walk · 20 min · Easy',
  prescriptionLine({ activity: 'Walk', duration: 20, targetRpe: 4 }),
)
check(
  'an unstated effort target disappears rather than printing "RPE undefined"',
  prescriptionLine({ activity: 'Walk', duration: 20 }) === 'Walk · 20 min' &&
    !prescriptionLine({ activity: 'Walk', duration: 20 }).toLowerCase().includes('undefined'),
  prescriptionLine({ activity: 'Walk', duration: 20 }),
)

// -------------------------------------------------------------------------
console.log('\n3. Every screen that shows a day asks the shared question')
// SOURCE-SHAPED, and the limit is stated at the top of this file. What it
// catches is the failure that actually happened: a component deciding for
// itself what a session is. Comments are stripped first, so a note saying
// "we should read plannedActivity here" cannot satisfy it.

type Use = { symbol: string; form: 'call' | 'field' }
const readers: { file: string; must: Use[]; why: string }[] = [
  {
    // RE-ANCHORED 24 Sep 2026: the card hands the prescription to the shared
    // cardio row, which is where the phrase is now printed — so the card must
    // read the field AND render that row, and the row must call the phrase.
    file: 'src/components/exercise/RestDayCard.tsx',
    must: [{ symbol: 'plannedActivity', form: 'field' }, { symbol: '<PlannedCardioRow prescription={planned}', form: 'field' }],
    why: 'the card for the day itself — this is where the blank form was',
  },
  {
    file: 'src/components/exercise/CardioSetRow.tsx',
    must: [{ symbol: 'prescriptionLine', form: 'call' }],
    why: 'the row every prescribed activity is drawn with',
  },
  {
    file: 'src/components/exercise/TodayPanel.tsx',
    must: [
      { symbol: 'isScheduledDay', form: 'call' },
      { symbol: 'dayDetail', form: 'call' },
      { symbol: 'plannedActivity', form: 'field' },
    ],
    why: "tomorrow's preview and the peek into another day",
  },
  {
    file: 'src/components/exercise/ProgramBrowse.tsx',
    must: [{ symbol: 'plannedActivity', form: 'field' }, { symbol: 'prescriptionLine', form: 'call' }],
    why: 'the week list, where an activity day had no line of its own',
  },
]

const bodyOf = (file: string) => stripImports(stripComments(readFileSync(file, 'utf8')))

for (const r of readers) {
  const src = bodyOf(r.file)
  for (const use of r.must) {
    const hit = use.form === 'call' ? new RegExp(`\\b${use.symbol}\\s*\\(`).test(src) : src.includes(use.symbol)
    check(`${r.file.split('/').pop()} ${use.form === 'call' ? 'calls' : 'reads'} ${use.symbol} (${r.why})`, hit, {
      file: r.file, symbol: use.symbol, form: use.form,
    })
  }
}

// PROVE THE DETECTOR BEFORE TRUSTING IT. A call-form check that quietly
// matched the import line is how M7 passed over a real defect once already.
check(
  'the call-form detector rejects a bare import',
  !/\bisScheduledDay\s*\(/.test(bodyOf('src/components/exercise/ProgramBrowse.tsx')) &&
    /\bisScheduledDay\s*\(/.test(bodyOf('src/components/exercise/TodayPanel.tsx')),
)

// The prescription phrase is written ONCE. Two surfaces printed the same fact
// two ways ("20m · RPE 4" and "20 min @ RPE 4") before this gate existed.
for (const r of readers) {
  check(`${r.file.split('/').pop()} does not hand-roll the effort phrase`, !/@ RPE/.test(bodyOf(r.file)), { file: r.file })
}

// A DAY'S OWN CARD MUST NOT OFFER A BLANK FORM AS ITS ONLY CONTENT. The
// property: the rest-day card module reads the prescription BEFORE it reaches
// the free-text logging entry, so the prescription cannot be the thing that
// got left out.
{
  const src = stripComments(readFileSync('src/components/exercise/RestDayCard.tsx', 'utf8'))
  // ANCHORED ON THE RENDERED BLOCK, not on the variable that feeds it. The
  // first version compared `indexOf('plannedActivity')` — which finds the
  // const declaration near the top of the component — against the form, so it
  // was true however the JSX was ordered and proved nothing.
  const prescriptionAt = src.indexOf('data-testid="planned-activity"')
  const blankFormAt = src.lastIndexOf('<ActivityLogEntry')
  check(
    'the prescription is rendered above the blank "log something else" form',
    prescriptionAt > -1 && blankFormAt > -1 && prescriptionAt < blankFormAt,
    { prescriptionAt, blankFormAt },
  )
  check(
    'and the blank form stops calling itself "log a walk" when a walk is already prescribed',
    /alsoLabel/.test(src),
  )
}

// -------------------------------------------------------------------------
console.log(`\n${failures === 0 ? 'PASS' : `FAIL (${failures})`}`)
process.exit(failures === 0 ? 0 : 1)
