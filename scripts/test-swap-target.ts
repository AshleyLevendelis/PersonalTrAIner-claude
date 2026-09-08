/**
 * Gate: "swap this exercise" must find the exercise.
 *
 * Ashley, 8 Sep 2026: asking the coach to swap an exercise answered "I
 * couldn't find that on your current plan" for exercises that were plainly on
 * it. The handler wanted THREE exact strings — the day as the plan spells it,
 * the old exercise's full catalogue name, the new one's — and returned null
 * from five different places, all of which surfaced as that one sentence.
 *
 * MEASURED against a real generated Tuesday before the fix:
 *   day      "Tuesday" ok · "today" MISS · "Tue" MISS
 *   old_item "Barbell Squats" ok · "Squats" MISS · "Barbell" MISS
 *   new_item "Lateral Raises" ok · "Lateral Raise" MISS
 *
 * Two properties matter and they pull against each other. Resolution has to be
 * tolerant enough to find what someone means — and a swap REWRITES THE PLAN,
 * so it must never guess between two candidates. Every refusal has to say
 * which of the three parts failed, because "I couldn't find that" is
 * indistinguishable from a plan that really has changed.
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { resolveDayName, resolveExerciseOnDay, resolveSwapTarget, type SwapDay } from '../src/lib/swap-target'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}
const code = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

const DAYS: SwapDay[] = [
  { day: 'Monday', exercises: [{ name: 'Barbell Bench Press' }, { name: 'Dumbbell Rows' }] },
  { day: 'Tuesday', exercises: [
    { name: 'Leg Swings' }, { name: 'Barbell Squats' }, { name: 'Overhead Carry' },
    { name: 'Plank' }, { name: 'Step-Ups' }, { name: 'Leg Extensions' }, { name: 'Seated Calf Raises' },
  ] },
  { day: 'Wednesday', exercises: [] },
]
const TODAY = 'Tuesday'
const target = (dayArg: string, exerciseArg: string) => resolveSwapTarget({ dayArg, exerciseArg, days: DAYS, todayName: TODAY })

console.log('\n1. The day, however it is written\n')

for (const [arg, want] of [
  ['Tuesday', 'Tuesday'], ['tuesday', 'Tuesday'], ['TUESDAY', 'Tuesday'],
  ['today', 'Tuesday'], ['Today', 'Tuesday'], ['Tue', 'Tuesday'], ['tomorrow', 'Wednesday'],
  ['Monday', 'Monday'], ['mon', 'Monday'],
] as const) {
  check(`"${arg}" -> ${want}`, resolveDayName(arg, DAYS, TODAY) === want, resolveDayName(arg, DAYS, TODAY))
}
check('a day that is not in the week is not invented', resolveDayName('Friday', DAYS, TODAY) === null)
check('nor is an empty one', resolveDayName('', DAYS, TODAY) === null)

console.log('\n2. The exercise, however it is written\n')

for (const [arg, want] of [
  ['Barbell Squats', 1], ['barbell squats', 1], ['Squats', 1], ['squat', 1],
  ['Barbell Squat', 1], ['Step Ups', 4], ['Step-Ups', 4], ['Leg Extension', 5],
  ['plank', 3], ['Seated Calf Raise', 6],
  // Only the substring rule reaches this one: the request CONTAINS the plan's
  // name with words either side, so a word-by-word match fails on "please".
  ['the barbell squats please', 1],
] as const) {
  const hit = resolveExerciseOnDay(arg, DAYS[1].exercises)
  check(`"${arg}" -> #${want}`, !!hit && 'index' in hit && hit.index === want, hit)
}

console.log('\n3. ...but a swap rewrites the plan, so it never guesses\n')

const legs = resolveExerciseOnDay('Leg', DAYS[1].exercises)
check('"Leg" matches two, so it is a question and not a coin toss',
  !!legs && 'ambiguous' in legs && legs.ambiguous.length === 2, legs)
check('...and both are named', !!legs && 'ambiguous' in legs
  && legs.ambiguous.includes('Leg Swings') && legs.ambiguous.includes('Leg Extensions'), legs)
check('something genuinely absent stays absent', resolveExerciseOnDay('deadlift', DAYS[1].exercises) === null)
check('...and so does a phrase with no exercise in it', resolveExerciseOnDay('this exercise', DAYS[1].exercises) === null)
check('an empty argument resolves to nothing rather than the first row',
  resolveExerciseOnDay('', DAYS[1].exercises) === null)

console.log('\n4. A refusal says WHICH part failed — the whole point\n')

const wrongDay = target('Friday', 'Barbell Squats')
check('an unknown day is named as the problem', !wrongDay.ok && wrongDay.reason === 'no_day', wrongDay)
check('...and the sentence quotes what was asked for', !wrongDay.ok && wrongDay.message.includes('Friday'), wrongDay)

const restDay = target('Wednesday', 'anything')
check('a rest day says it is a rest day', !restDay.ok && /rest day/.test(restDay.message), restDay)

const missing = target('today', 'back squat')
check('an exercise not on the day is named as the problem', !missing.ok && missing.reason === 'no_exercise', missing)
check('...AND THE MESSAGE LISTS WHAT IS ACTUALLY ON THE DAY — the thing "I couldn\'t find that" never did',
  !missing.ok && missing.message.includes('Barbell Squats') && missing.message.includes('Seated Calf Raises'), missing)

const ambiguous = target('today', 'Leg')
check('an ambiguous exercise asks which', !ambiguous.ok && ambiguous.reason === 'ambiguous_exercise', ambiguous)
check('...naming both', !ambiguous.ok && /Leg Swings and Leg Extensions/.test(ambiguous.message), ambiguous)

check('no refusal is the old catch-all sentence',
  [wrongDay, restDay, missing, ambiguous].every(r => !r.ok && !/couldn't find that on your current plan/.test(r.message)))

console.log('\n5. A resolved target keys off the PLAN\'s spelling, not the request\'s\n')

const ok = target('tue', 'squat')
check('resolved', ok.ok === true, ok)
check('the day comes back as the plan spells it', ok.ok && ok.dayName === 'Tuesday', ok)
check('the exercise too', ok.ok && ok.exerciseName === 'Barbell Squats', ok)
check('and the index is the plan\'s index, which is what the swap writes against',
  ok.ok && ok.exIndex === 1 && DAYS[1].exercises[ok.exIndex].name === 'Barbell Squats', ok)

console.log('\n6. The chat handler uses it, and says the reason out loud\n')

const chat = code('src/components/ChatAssistant.tsx')
check('the swap builder resolves through swap-target', /resolveSwapTarget\(\{/.test(chat))
check('...defaulting an absent day to today, because "swap this exercise" names none',
  /dayArg: dayArg \|\| 'today'/.test(chat))
check('...and no longer demands an exact name match on the plan',
  !/day\.exercises\.findIndex\(e => e\.name\.toLowerCase\(\) === oldItem\.toLowerCase\(\)\)/.test(chat))
check('the REPLACEMENT is resolved just as tolerantly',
  /resolveExerciseName\(newItem/.test(chat) && !/const newEntry = getExerciseEntry\(newItem\)/.test(chat))
check('every failure carries a reason instead of a bare null',
  /\{ ok: false; reason: string \}/.test(chat) && /else refusal = swap\.reason/.test(chat))
check('...and the generic sentence is only the last resort it always was',
  /refusal \?\? "I couldn't find that on your current plan/.test(chat))

console.log(failures === 0 ? '\nAll swap-target checks pass.\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
