// ---------------------------------------------------------------------------
// "MY SESSIONS NEED TO BE 45 MINUTES FROM NOW ON."
//
// Two requests that are ONE WORD APART and must never be confused:
//
//   "I only have 45 minutes TODAY"        -> propose_session_shorten
//                                            one day, profile untouched
//   "my sessions need to be 45 minutes"   -> propose_session_length
//                                            every session from here, rebuilt
//
// Both carry a figure in minutes, so the number can never be the thing that
// tells them apart. That is what this file watches hardest.
//
// ASHLEY'S RULING, 16 Sep 2026, from three options: rebuild the rest of the
// block around the new length. Over trimming what is already there — a
// 60-minute session with its end chopped off is not a session designed for 45
// — and over waiting for the next block, which leaves weeks of sessions that
// do not fit.
//
// WHAT WAS WRONG BEFORE, and why the screen half needed changing too:
// `session_duration_preference` was absent from PLAN_INVALIDATING_FIELDS, so
// setting it on Profile wrote the number and touched nothing else. The only
// visible effect was today's card starting to say the session ran over. "You
// can set your session length" was true about the NUMBER and false about the
// PLAN.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { detectPlanInvalidation, PLAN_INVALIDATING_FIELDS } from '../src/lib/plan-invalidation'
import { executeSessionLength } from '../src/lib/pending-action-executor'
import { generateExercisePlan, generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { getSessionMaximumSeconds, estimateDaySeconds } from '../src/lib/session-duration'
import type { UserProfile, SessionDuration } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const base = (o: Record<string, unknown> = {}): UserProfile => ({
  age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
  fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1800, tdee: 2500,
  equipment_access: 'full_gym', injuries: [], training_style: 'hybrid',
  training_experience: 'intermediate', session_duration_preference: '60-90',
  workout_split_preference: 'upper_lower',
  training_days: [
    { day: 'Monday', available: true }, { day: 'Tuesday', available: true },
    { day: 'Wednesday', available: true }, { day: 'Thursday', available: true },
    { day: 'Friday', available: false }, { day: 'Saturday', available: false },
    { day: 'Sunday', available: false },
  ],
  weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
  exercise_exclusions: [], macro_calculation_mode: 'STANDARD_STATIC',
  coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
  ...o,
} as unknown as UserProfile)

console.log('\n1. A lasting length change makes the plan wrong, so it raises an offer')
{
  check('session length is on the invalidating list at all',
    (PLAN_INVALIDATING_FIELDS as readonly string[]).includes('session_duration_preference'),
    PLAN_INVALIDATING_FIELDS)

  const shorter = detectPlanInvalidation(base(), { session_duration_preference: '30-45' })
  check('shortening offers a rebuild', shorter?.field === 'session_duration_preference', shorter)
  check('...and says it rebuilds rather than trims — Ashley\'s ruling, before the tap',
    !!shorter && /rather than the same ones with the end cut off/.test(shorter.detail), shorter?.detail)
  check('...and promises logged work is untouched',
    !!shorter && /already logged stays exactly/.test(shorter.detail), shorter?.detail)
  check('...without naming a database field',
    !!shorter && !/session_duration|profile\./.test(shorter.detail), shorter?.detail)

  // THE DIRECTION IS THE TEST. Getting MORE time is not "cut off the end",
  // and a single sentence for both would be wrong in one direction.
  const longer = detectPlanInvalidation(base(), { session_duration_preference: '90+' })
  check('lengthening also offers a rebuild', longer?.field === 'session_duration_preference', longer)
  check('...but says something different, because the reason is different',
    !!longer && !!shorter && longer.detail !== shorter.detail)
  check('...naming the extra time rather than a cut',
    !!longer && /extra time/.test(longer.detail) && !/cut off/.test(longer.detail), longer?.detail)

  const same = detectPlanInvalidation(base(), { session_duration_preference: '60-90' })
  check('re-saving the same length does not', same === null, same)
}

console.log('\n2. The direction is decided by the ENGINE, not by string order')
{
  // '30-45' < '45-60' lexicographically is true by coincidence of first
  // digits. A band starting '1' would sort BELOW '30-45' and invert the
  // sentence. Proving the decision survives a value the alphabet gets wrong.
  const src = stripComments(readFileSync(join(ROOT, 'src/lib/plan-invalidation.ts'), 'utf8'))
  check('the comparison calls the duration budget, not < on the raw value',
    /getDurationBudgetSeconds\(/.test(src) && !/patch\.session_duration_preference \?\? ''\) </.test(src))
}

console.log('\n3. Confirming a lasting change REACHES the plan')
{
  setRandomSource(seededRngFromKey('session-length-change'))
  const profile = base()
  const meso = generateMesocycle(profile, generateExercisePlan(profile).plan)
  resetRandomSource()
  check('there is a plan to rebuild', meso.length >= 4, meso.length)

  const CURRENT = 3
  const WANTED: SessionDuration = '30-45'
  const snapshot = (weeks: typeof meso) => JSON.stringify(weeks.map(w => ({
    week: w.week_number,
    days: (w.days ?? []).map(d => ({ day: d.day, ex: (d.exercises ?? []).map(e => e.name) })),
  })))
  const behindBefore = snapshot(meso.filter(w => w.week_number < CURRENT))

  // NO profile.id, so the executor's database writes are skipped and the
  // rebuild still runs. That is the real code path, not a stub — the writes
  // are already guarded by `if (profile.id)` for exactly this reason.
  const result = await executeSessionLength(
    { ...profile, id: undefined } as unknown as UserProfile,
    meso, [], { sessionDuration: WANTED, fromWeek: CURRENT },
  )
  check('the rebuild succeeded', result.receipt.failed.length === 0, result.receipt.failed)
  check('...and returned a plan', result.mesocycle.length === meso.length, result.mesocycle.length)

  const behindAfter = snapshot(result.mesocycle.filter(w => w.week_number < CURRENT))
  check('weeks already behind are untouched', behindAfter === behindBefore)

  // THE POINT OF THE WHOLE BUILD: the sessions ahead must actually FIT.
  const cap = getSessionMaximumSeconds(WANTED)
  const ahead = result.mesocycle.filter(w => w.week_number >= CURRENT)
  const over = ahead.flatMap(w => (w.days ?? [])
    .filter(d => (d.exercises ?? []).length > 0)
    .map(d => ({ week: w.week_number, day: d.day, seconds: estimateDaySeconds(d) }))
    .filter(x => x.seconds > cap))
  check(`every rebuilt session fits ${WANTED} (cap ${cap}s)`, over.length === 0, over.slice(0, 3))

  // PROVING THE DETECTOR, so the check above cannot pass vacuously: the
  // ORIGINAL plan was built for 60-90 and must NOT fit the 30-45 cap.
  const beforeOver = meso.filter(w => w.week_number >= CURRENT).flatMap(w => (w.days ?? [])
    .filter(d => (d.exercises ?? []).length > 0)
    .map(d => estimateDaySeconds(d)).filter(sec => sec > cap))
  check('...and the plan it replaced genuinely did NOT fit, so that is a real test',
    beforeOver.length > 0, beforeOver.length)

  check('the receipt names how many weeks moved',
    result.receipt.landed.some(l => /Rebuilt \d+ week/.test(l)), result.receipt.landed)
  check('...and names the new length in the user\'s words, not the raw value',
    result.receipt.landed.some(l => /Sessions: .*min/.test(l)), result.receipt.landed)
  check('the pre-image is kept, so undo has something to restore',
    result.preImage === meso)
}

console.log('\n4. The two tools are told apart by SCOPE, never by the number')
{
  const coach = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf8')
  check('the lasting tool is declared', /name: "propose_session_length"/.test(coach))
  check('...and the today-only one still is', /name: "propose_session_shorten"/.test(coach))

  // THE DEFECT THIS REPLACED: the shorten tool used to end by sending people
  // to a screen, which Promise 2 forbids outright.
  check('no tool sends anyone to the Profile screen for this any more',
    !/which they set on the Profile screen/.test(coach))
  check('...the shorten tool names the lasting tool instead',
    /that is a LASTING change[\s\S]{0,120}propose_session_length/.test(coach))
  check('...and the lasting tool names the today-only one',
    /propose_session_length[\s\S]*?propose_session_shorten/.test(coach))

  check('the prompt tells the coach the scope decides, not the figure',
    /TIME SCOPE IS THE WHOLE DISTINCTION, NEVER THE NUMBER/.test(coach))
  check('...listing the words that mean one day',
    /"today", "this morning", "before work" mean ONE day/.test(coach))
  check('...and the words that mean lasting',
    /"from now on", "these days", "permanently"/.test(coach))
  // THE HALF THAT COSTS SOMETHING IF IT GOES: with neither kind of word, a
  // guess either rebuilds a block nobody asked to rebuild, or silently does
  // nothing lasting. Asking is the only safe answer and must stay written.
  check('...and says to ASK when neither is present, rather than guess',
    /ASK which they mean\. Do not guess/.test(coach))
}

console.log('\n5. The today-only path still does not touch the profile')
{
  const exec = stripComments(readFileSync(join(ROOT, 'src/lib/pending-action-executor.ts'), 'utf8'))
  const shorten = /export async function executeSessionShorten[\s\S]*?\n}\n/.exec(exec)?.[0] ?? ''
  check('the shorten executor was found, so this is not vacuous', shorten.length > 0)
  check('...and it never writes a profile field',
    shorten.length > 0 && !/updateProfileField/.test(shorten), shorten.slice(0, 200))

  const length = /export async function executeSessionLength[\s\S]*?\n}\n/.exec(exec)?.[0] ?? ''
  check('the lasting executor was found', length.length > 0)
  check('...and it DOES write one — the contrast is the point',
    length.length > 0 && /updateProfileField/.test(length))
  // ORDER MATTERS: writing the length and then failing the rebuild would
  // leave the profile saying 45 while every session still ran to 60 — the
  // exact divergence this tool exists to close.
  check('...after the rebuild, never before it',
    length.indexOf('rebuildFromCurrentWeek') < length.indexOf('updateProfileField'))
}

console.log(failures === 0 ? '\nAll session-length-change checks passed.\n' : `\n${failures} check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)
