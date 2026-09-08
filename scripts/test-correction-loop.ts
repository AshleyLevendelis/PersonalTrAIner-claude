/**
 * Gate: correcting a mislogged set must end in a correction, not in questions.
 *
 * Ashley, 8 Sep 2026: asking the coach to fix a mislogged set "repeats
 * questions endlessly without performing the update."
 *
 * THE CAUSE was one regex. A weight was only ever recognised as `@60kg` —
 * /@\s*(\d+(?:\.\d+)?)\s*kg?/i, which needs a literal `@` AND a literal `k`
 * (the `?` sits on the g, not the k). Of twenty phrasings a person actually
 * types, THREE parsed. Everything else came back with no weight, and a missing
 * weight on a loaded lift is a BLOCKING clarification: "What weight did you
 * use for Barbell Bench Press?"
 *
 * THE TRAP was that the question had no answer. The clarification card renders
 * tap options, and a weight has none — so the trainee typed into the ordinary
 * composer, the answer went back through the model as a brand-new turn, landed
 * in the parser without the half-finished entry it belonged to, and was asked
 * for again. Forever, and nothing was ever written.
 *
 * So this gate holds three things: the grammar accepts what people write, a
 * question that still has to be asked can be answered where it was asked, and
 * the resumed turn still knows it was a CORRECTION — because a correction that
 * resumes as an ordinary log doubles the session, which is the harm
 * nl-logging-executor's own comment was written about.
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { parseSetsPhrase, parseWorkoutEntries, type WorkoutEntryInput, type ParsedSetGroup } from '../src/lib/set-parse'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}
const code = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

const PLAN = ['Barbell Bench Press', 'Dumbbell Rows', 'Lateral Raises']
const parse1 = (e: WorkoutEntryInput) => parseWorkoutEntries({ entries: [e], todaysPlanExerciseNames: PLAN }).groups[0]

console.log('\n1. A weight is written the way people write it\n')

// Every one of these was measured against the old grammar: only the two @-forms
// and the bodyweight token parsed. The rest are the loop.
const WEIGHTS: [string, number][] = [
  ['3x8 @60kg', 60], ['3x8 60kg', 60], ['3x8 60 kg', 60], ['3x8 at 60kg', 60],
  ['3x8 at 60', 60], ['3x8 with 60kg', 60], ['3 sets of 8 at 60kg', 60],
  ['3 sets of 8 at 60', 60], ['3 sets of 8 @60kg', 60], ['60kg 3x8', 60],
  ['60kg for 8', 60], ['100 for 5,5,4', 100], ['3x8 60', 60], ['3x8 @ 60', 60],
  ['3x8 60kgs', 60], ['3x8 60 kilos', 60], ['5x5 100kg', 100], ['82.5kg 3x5', 82.5],
]
for (const [phrase, want] of WEIGHTS) {
  const got = parseSetsPhrase(phrase).weightKg
  check(`"${phrase}" -> ${want}kg`, got === want, got)
}

console.log('\n2. ...and a number that is not a weight is never read as one\n')

check('"3x8" has no weight, and saying so is the honest answer', parseSetsPhrase('3x8').weightKg === null)
check('a rep count is not a load — "3 sets of 8" stays weightless', parseSetsPhrase('3 sets of 8').weightKg === null)
check('an RPE is not a load', parseSetsPhrase('3x8 rpe 8').weightKg === null, parseSetsPhrase('3x8 rpe 8'))
check('...even when it is the only number left over', parseSetsPhrase('3 sets of 8 rpe 9').weightKg === null)
check('two loose numbers are refused rather than guessed between',
  parseSetsPhrase('3x8 60 70').weightKg === null, parseSetsPhrase('3x8 60 70'))
check('bodyweight still means zero, not a missing weight',
  parseSetsPhrase('3x10 bodyweight').isBodyweight && parseSetsPhrase('3x10 bodyweight').weightKg === 0)
check('the reps survive all of it', JSON.stringify(parseSetsPhrase('3x8 60kg').repsPerSet) === '[8,8,8]')
check('...and a per-set list is not flattened', JSON.stringify(parseSetsPhrase('100 for 5,5,4').repsPerSet) === '[5,5,4]')

console.log('\n3. An exercise with no name is never written\n')

const nameless = parse1({ rawText: '3x8 60kg', exercisePhrase: '', setsPhrase: '3x8 60kg' })
check('a blank exercise phrase asks rather than logging `custom:`',
  nameless.ambiguity?.field === 'exercise_name' && nameless.sets.length === 0, nameless)
check('...and the question is a sentence, not "for ?"',
  !!nameless.ambiguity && !/ for \?|for \?$/.test(nameless.ambiguity.message), nameless.ambiguity?.message)
for (const g of [
  parse1({ rawText: 'bench 60kg', exercisePhrase: 'bench', setsPhrase: '60kg' }),
  parse1({ rawText: 'bench 3x8', exercisePhrase: 'bench', setsPhrase: '3x8' }),
]) {
  check(`"${g.ambiguity?.message}" names the exercise it is asking about`,
    !!g.ambiguity && g.ambiguity.message.includes('Barbell Bench Press'), g.ambiguity)
}

console.log('\n4. The loop terminates — every answer gets closer to a logged set\n')

/**
 * The merge ChatAssistant performs when a clarification is answered, reproduced
 * here so the property is tested rather than the wiring: a name REPLACES the
 * exercise phrase, anything else is ADDED to the sets phrase, because what is
 * already there is still true.
 */
const answer = (entries: WorkoutEntryInput[], value: string): WorkoutEntryInput[] => {
  const groups = parseWorkoutEntries({ entries, todaysPlanExerciseNames: PLAN }).groups
  const idx = groups.findIndex((g: ParsedSetGroup) => g.resolution === 'ambiguous' || !!g.ambiguity)
  if (idx === -1) return entries
  const field = groups[idx].resolution === 'ambiguous' ? 'exercise_name' : groups[idx].ambiguity?.field
  return entries.map((e, i) => i !== idx ? e : (
    field === 'exercise_name'
      ? { ...e, exercisePhrase: value }
      : { ...e, setsPhrase: `${e.setsPhrase} ${value}`.trim(), rawText: `${e.rawText} ${value}`.trim() }
  ))
}

// Her actual conversation: a correction that names the weight but not the sets.
let entries: WorkoutEntryInput[] = [{ rawText: 'actually the bench was 60kg', exercisePhrase: 'bench', setsPhrase: '60kg' }]
let asked = 0
const questions: string[] = []
for (let turn = 0; turn < 6; turn++) {
  const parsed = parseWorkoutEntries({ entries, todaysPlanExerciseNames: PLAN })
  if (!parsed.needsClarification) break
  asked++
  const g = parsed.groups.find(x => x.ambiguity)!
  questions.push(g.ambiguity!.message)
  entries = answer(entries, g.ambiguity!.field === 'weight' ? '60kg' : g.ambiguity!.field === 'sets_x_reps' ? '3x8' : 'bench')
}
const settled = parseWorkoutEntries({ entries, todaysPlanExerciseNames: PLAN })
check('it asks at most once', asked <= 1, questions)
check('...and then it is done asking', !settled.needsClarification, settled.groups[0]?.ambiguity)
check('...with the correction actually parsed', settled.groups[0]?.sets.length === 3
  && settled.groups[0].sets[0].weightKg === 60 && settled.groups[0].sets[0].reps === 8, settled.groups[0]?.sets)

// The worst case: the model hands over a bare fragment with nothing resolved.
let bare: WorkoutEntryInput[] = [{ rawText: '60kg', exercisePhrase: '', setsPhrase: '60kg' }]
let bareAsked = 0
for (let turn = 0; turn < 6; turn++) {
  const parsed = parseWorkoutEntries({ entries: bare, todaysPlanExerciseNames: PLAN })
  if (!parsed.needsClarification) break
  bareAsked++
  const g = parsed.groups.find(x => x.ambiguity)!
  bare = answer(bare, g.ambiguity!.field === 'exercise_name' ? 'bench' : g.ambiguity!.field === 'weight' ? '60kg' : '3x8')
}
const bareSettled = parseWorkoutEntries({ entries: bare, todaysPlanExerciseNames: PLAN })
check('even from nothing it converges rather than circling', !bareSettled.needsClarification && bareAsked <= 3, { bareAsked })
check('...on the numbers that were actually given', bareSettled.groups[0]?.sets[0]?.weightKg === 60, bareSettled.groups[0]?.sets)

console.log('\n5. The screen can be answered, and the answer resumes the same turn\n')

const card = code('src/components/chat/ClarificationCard.tsx')
check('the card has somewhere to type an answer', /answerPlaceholder/.test(card) && /<Input/.test(card))
check('...and does not ask the question a second time, one line under the first',
  !/\{prompt\}\s*\n\s*<\/p>/.test(card) && /aria-label=\{prompt\}/.test(card))
check('...shown only when there is nothing to tap instead',
  /\{!resolved && options\.length > 0 &&/.test(card) && /\{!resolved && answerPlaceholder &&/.test(card))

const chat = code('src/components/ChatAssistant.tsx')
check('a question without options always gets an answer box',
  /const answerPlaceholder = options\.length > 0\s*\?\s*undefined/.test(chat))
check('...and it is passed to the card', /answerPlaceholder=\{msg\.clarification\.answerPlaceholder\}/.test(chat))
check('the answer is merged into the entry it belongs to, not sent as a new message',
  /if \(field === 'exercise_name'\) return \{ \.\.\.e, exercisePhrase: value \}/.test(chat)
  && /setsPhrase: `\$\{e\.setsPhrase\} \$\{value\}`\.trim\(\)/.test(chat))
check('A RESUMED CORRECTION IS STILL A CORRECTION',
  /correctsPrevious: boolean/.test(chat)
  && /parseSessionsRef\.current\[resolverId\] = \{ entries, todaysPlanExerciseNames, correctsPrevious \}/.test(chat)
  && /resolveAndMaybeLog\(updatedEntries, session\.correctsPrevious\)/.test(chat))

console.log(failures === 0 ? '\nAll correction-loop checks pass.\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
