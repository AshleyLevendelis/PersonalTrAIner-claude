// ---------------------------------------------------------------------------
// Gate: THE COACH NEVER LOGS AN EXERCISE THE USER DID NOT NAME.
//
// Ashley, 14 Sep 2026, from a real session: 'Sending "I did 1x10 @60kg" in
// chat auto-logged the set under Trap Bar Deadlift without asking or
// confirming which exercise was actually performed.'
//
// She never typed those three words. The model supplied them from the
// conversation, and they arrived at the parser in exactly the same shape as a
// name somebody had typed — so nothing downstream could tell the difference,
// and three sets went into permanent history against a lift that may never
// have happened. Every future weight on that lift is calculated from what the
// history says was lifted, so this is a load-prescription bug wearing a chat
// bug's clothes.
//
// WHY THE EXISTING DEFENCE DID NOT HOLD. The tool declaration already says it,
// twice, in the imperative: "Never invent one — if this entry's raw_text names
// no exercise, don't include it as an entry; ask which exercise instead." The
// model did it anyway. THAT is the finding worth keeping: a prompt rule is not
// an enforcement. Anything the app guarantees about its own writes has to be
// checkable in code, because the model is the one component no gate can reach.
//
// WHY `raw_text` IS NOT THE ANCHOR EITHER. It is also the model's copy of the
// message. The only text this app knows a human wrote is the message they
// sent, so that is what a name is traced to.
// ---------------------------------------------------------------------------

import { parseWorkoutEntries, isNamedByTheUser, resolveExerciseName, type WorkoutEntryInput } from '../src/lib/set-parse'
import { answerPlaceholderFor } from '../src/components/chat/ClarificationCard'

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const PLAN = ['Trap Bar Deadlift', 'Barbell Bench Press', 'Lat Pulldown']
const entry = (rawText: string, exercisePhrase: string, setsPhrase: string): WorkoutEntryInput =>
  ({ rawText, exercisePhrase, setsPhrase })

console.log('\n1. THE REPORTED CASE — a name the user never said')
{
  const said = 'I did 1x10 @60kg'
  const parsed = parseWorkoutEntries({
    // The model's own output on the day: it filled the phrase AND the raw text
    // from context, which is why a raw_text-based check would not have caught it.
    entries: [entry('Trap Bar Deadlift 1x10 @60kg', 'Trap Bar Deadlift', '1x10 @60kg')],
    todaysPlanExerciseNames: PLAN,
    userSaid: said,
  })
  check('nothing is written — it asks instead', parsed.needsClarification === true, parsed.groups[0])
  check('...and no sets were parsed to write', parsed.groups[0].sets.length === 0, parsed.groups[0])
  check('...the question is about WHICH exercise', parsed.groups[0].ambiguity?.field === 'exercise_name', parsed.groups[0].ambiguity)
  check('...and it comes with today\'s session to tap',
    (parsed.groups[0].ambiguousCandidates?.length ?? 0) === PLAN.length, parsed.groups[0].ambiguousCandidates?.map(c => c.name))
}

console.log('\n2. A name the user DID say still logs, without an extra tap')
{
  const parsed = parseWorkoutEntries({
    entries: [entry('bench 3x8 @60kg', 'bench', '3x8 @60kg')],
    todaysPlanExerciseNames: PLAN,
    userSaid: 'did bench 3x8 @60kg today',
  })
  check('it goes straight through', parsed.needsClarification === false, parsed.groups[0])
  check('...resolved to the full catalogue name', parsed.groups[0].exerciseName === 'Barbell Bench Press', parsed.groups[0].exerciseName)
  check('...with the sets parsed', parsed.groups[0].sets.length === 3, parsed.groups[0].sets.length)
}

console.log('\n3. The predicate is generous where being wrong costs a tap, strict where it costs history')
{
  // Generous: one content word carries the phrase. Asking somebody who DID
  // name their lift costs a tap; logging one they never did cannot be undone
  // by asking.
  check('a shorthand the user typed carries the full name', isNamedByTheUser('Barbell Bench Press', 'bench 3x8'), true)
  check('...plurals and punctuation do not trip it', isNamedByTheUser('DB Flyes', 'did some db flyes, felt good'), true)
  check('...nor does case', isNamedByTheUser('Lat Pulldown', 'LAT PULLDOWN 3x10'), true)
  // Strict: nothing in the phrase appears in the message.
  check('a name invented from context does not', !isNamedByTheUser('Trap Bar Deadlift', 'I did 1x10 @60kg'))
  check('...and an empty message never traces anything', !isNamedByTheUser('Squats', ''))
  // A phrase of only short tokens is checked whole rather than waved through —
  // "no long words" must not become a hole shaped like an abbreviation.
  // TOKENS UNDER THREE LETTERS, which is what the whole-phrase branch is FOR.
  // The first version of this check used "OHP" — three letters, so it took the
  // ordinary word path and never touched the branch. Replacing that branch with
  // `return true` left the check green, which is a check guarding nothing.
  check('an all-short phrase is matched whole, not skipped', !isNamedByTheUser('DB', 'did 5x5'))
  check('...and matches when it really was typed', isNamedByTheUser('DB', 'db 5x5'))
}

console.log('\n4. The blank-phrase hole underneath it')
{
  // `'anything'.includes('')` is true, so a blank phrase used to match EVERY
  // exercise in today's plan — and on a one-exercise day resolved cleanly to
  // it. Found while tracing §1; a different route to the same wrong write.
  const r = resolveExerciseName('', ['Barbell Bench Press'])
  check('a blank exercise phrase resolves to nothing, even on a one-lift day',
    r.resolution === 'unknown' && !r.exerciseName, r)
  const parsed = parseWorkoutEntries({
    entries: [entry('3x8 @60kg', '', '3x8 @60kg')],
    todaysPlanExerciseNames: ['Barbell Bench Press'],
  })
  check('...so a nameless entry asks rather than writing', parsed.needsClarification === true, parsed.groups[0])
  check('...and that question has buttons, not just words',
    (parsed.groups[0].ambiguousCandidates?.length ?? 0) > 0, parsed.groups[0].ambiguousCandidates?.map(c => c.name))
}

console.log('\n5. Answering the question resolves it — the rule does not eat its own clarification')
{
  // What handleClarificationChoice does: the tapped name replaces the phrase,
  // and the answer joins the user's words. Re-parsing against the ORIGINAL
  // message alone would block the very name they just chose.
  const said = 'I did 1x10 @60kg'
  const answer = 'Trap Bar Deadlift'
  const parsed = parseWorkoutEntries({
    entries: [entry('Trap Bar Deadlift 1x10 @60kg', answer, '1x10 @60kg')],
    todaysPlanExerciseNames: PLAN,
    userSaid: `${said} ${answer}`,
  })
  check('the chosen exercise logs', parsed.needsClarification === false, parsed.groups[0])
  check('...against the lift they picked', parsed.groups[0].exerciseName === 'Trap Bar Deadlift', parsed.groups[0].exerciseName)
}

console.log('\n6. The wiring: the chat client passes the user\'s own message, from both entry points')
{
  const { readFileSync } = await import('fs')
  const { join, dirname } = await import('path')
  const { fileURLToPath } = await import('url')
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const ui = strip(readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8'))

  check('the parse is given the user\'s words', /parseWorkoutEntries\(\{[^}]*userSaid/.test(ui))
  // BOTH call sites, because one of them is the retry path — and a retry that
  // skipped the check would make the bug reachable by tapping "try again".
  const calls = ui.match(/processResponse\(result[^)]*\)/g) ?? []
  check('every processResponse call passes the message it was answering',
    calls.length >= 2 && calls.every(c => /processResponse\(result,\s*\w/.test(c)), calls)
  check('...and the logging branch forwards it',
    /resolveAndMaybeLog\(entries,[^)]*userSaid\)/.test(ui))
  // The question must be answerable. Options used to render only for the
  // 'ambiguous' resolution, so "Which exercise was that?" had no buttons.
  check('candidates become taps whenever they exist, not only when resolution is ambiguous',
    /const options = group\.ambiguousCandidates/.test(ui))
  // EXECUTED, not grepped. This asked for the exact text of an inline ternary
  // in ChatAssistant — and I moved that decision into answerPlaceholderFor
  // later the same day (so test:correction-loop could run it over every
  // question rather than read it), which turned this red over a rule that had
  // not changed. Worse, I ran correction-loop after that refactor and not this
  // one, so the breakage reached a sweep. The property is that an exercise
  // question is answerable by typing even when it offers taps.
  check('...and an exercise question keeps a box for work that was not on the plan',
    !!answerPlaceholderFor('exercise_name', true))
  check('...while the client asks that one function rather than deciding again',
    /answerPlaceholderFor\(group\.ambiguity\?\.field/.test(ui))
}

console.log('\n7. A CORRECTION names its target by existing — and still cannot invent one')
{
  // Ashley, 8 Sep 2026: correcting a mislogged set "repeats questions endlessly
  // without performing the update." That was fixed. The 14 Sep rule above then
  // closed it again, silently, because "actually it was 60kg" names no lift and
  // never can — MEASURED 15 Sep 2026 in the browser, where the app asked "Which
  // exercise was that?" and offered seven exercises off today's plan, none of
  // them the one just logged.
  //
  // The resolution is not a loosening: the target comes from the APP'S OWN LOG.
  // The model's phrase is still never used, and the branch cannot put a lift in
  // history — only change a number on one already there.
  const LOGGED = ['Barbell Bench Press']

  const one = parseWorkoutEntries({
    entries: [entry('actually it was 60kg', 'barbell bench press', '3x8 60kg')],
    todaysPlanExerciseNames: PLAN,
    userSaid: 'actually it was 60kg',
    correctsPrevious: true,
    loggedExerciseNames: LOGGED,
  })
  check('a correction with one thing on the log does not ask which exercise',
    one.needsClarification === false, one.groups[0])
  check('...it is the lift the APP logged', one.groups[0].exerciseName === 'Barbell Bench Press', one.groups[0].exerciseName)
  check('...and the new numbers are parsed', one.groups[0].sets.length === 3 && one.groups[0].sets[0].weightKg === 60, one.groups[0].sets)

  // THE MODEL'S NAME IS STILL WORTH NOTHING. Same message, same log, but the
  // model hands back the 14 Sep fabrication. The lift that comes out is the one
  // on the log — so this branch cannot reach a name nobody did.
  const fabricated = parseWorkoutEntries({
    entries: [entry('Trap Bar Deadlift 3x8 60kg', 'Trap Bar Deadlift', '3x8 60kg')],
    todaysPlanExerciseNames: PLAN,
    userSaid: 'actually it was 60kg',
    correctsPrevious: true,
    loggedExerciseNames: LOGGED,
  })
  check('a fabricated name is discarded, not followed',
    fabricated.groups[0].exerciseName === 'Barbell Bench Press', fabricated.groups[0].exerciseName)
  check('...so the only name a correction can produce is one already on the log',
    LOGGED.includes(fabricated.groups[0].exerciseName ?? ''), fabricated.groups[0].exerciseName)

  // A missing NUMBER is a different question from a missing NAME, and it names
  // the lift — which is what makes the answer box mean something.
  const weightOnly = parseWorkoutEntries({
    entries: [entry('actually it was 60kg', 'barbell bench press', '60kg')],
    todaysPlanExerciseNames: PLAN,
    userSaid: 'actually it was 60kg',
    correctsPrevious: true,
    loggedExerciseNames: LOGGED,
  })
  check('a correction missing the sets asks for the sets, naming the lift',
    weightOnly.groups[0].ambiguity?.field === 'sets_x_reps'
    && /Barbell Bench Press/.test(weightOnly.groups[0].ambiguity?.message ?? ''),
    weightOnly.groups[0].ambiguity)

  // TWO THINGS LOGGED IS GENUINELY AMBIGUOUS. It asks — and it offers what was
  // LOGGED, because those are the only things a correction can mean. Offering
  // today's plan is how the card came to list seven non-candidates.
  const TWO = ['Barbell Bench Press', 'Lat Pulldown']
  const many = parseWorkoutEntries({
    entries: [entry('actually it was 60kg', 'barbell bench press', '3x8 60kg')],
    todaysPlanExerciseNames: PLAN,
    userSaid: 'actually it was 60kg',
    correctsPrevious: true,
    loggedExerciseNames: TWO,
  })
  check('two lifts on the log and no name: it asks', many.needsClarification === true, many.groups[0])
  check('...offering what was logged, not what was planned',
    JSON.stringify((many.groups[0].ambiguousCandidates ?? []).map(c => c.name)) === JSON.stringify(TWO),
    many.groups[0].ambiguousCandidates?.map(c => c.name))

  // NOTHING LOGGED MEANS THERE IS NOTHING TO CORRECT, so the 14 Sep rule stands
  // unchanged — a "correction" against an empty log is just a nameless write.
  const empty = parseWorkoutEntries({
    entries: [entry('Trap Bar Deadlift 3x8 60kg', 'Trap Bar Deadlift', '3x8 60kg')],
    todaysPlanExerciseNames: PLAN,
    userSaid: 'actually it was 60kg',
    correctsPrevious: true,
    loggedExerciseNames: [],
  })
  check('an empty log still asks', empty.needsClarification === true, empty.groups[0])
  check('...and writes nothing', empty.groups[0].sets.length === 0, empty.groups[0])
  // ...and the question is still answerable: with nothing logged there is no
  // correction to offer, so it falls back to today's session as taps.
  check('...offering today\'s session, since there is no log to offer',
    (empty.groups[0].ambiguousCandidates?.length ?? 0) === PLAN.length,
    empty.groups[0].ambiguousCandidates?.map(c => c.name))

  // AND IT IS THE CORRECTION FLAG THAT OPENS IT, not merely having logged
  // something. An ordinary nameless entry on the same log is still refused.
  const notACorrection = parseWorkoutEntries({
    entries: [entry('Trap Bar Deadlift 3x8 60kg', 'Trap Bar Deadlift', '3x8 60kg')],
    todaysPlanExerciseNames: PLAN,
    userSaid: 'I did 1x10 @60kg',
    correctsPrevious: false,
    loggedExerciseNames: LOGGED,
  })
  check('the reported case is still refused when it is not a correction',
    notACorrection.needsClarification === true && notACorrection.groups[0].sets.length === 0, notACorrection.groups[0])
}

console.log('\n8. The wiring: the correction target comes from the app, not the model')
{
  const { readFileSync } = await import('fs')
  const { join, dirname } = await import('path')
  const { fileURLToPath } = await import('url')
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const ui = strip(readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8'))

  // EVERY parse the client runs, not just the first. The resume re-parses to
  // find which group the answer belongs to; giving it different inputs files
  // the answer against a different field.
  const parses = ui.match(/parseWorkoutEntries\(\{[\s\S]*?\}\)/g) ?? []
  check('the client parses in more than one place', parses.length >= 2, parses.length)
  check('...and every one of them is told whether this is a correction',
    parses.every(p => /correctsPrevious/.test(p)), parses.map(p => p.slice(0, 60)))
  check('...and which exercises the app itself has logged',
    parses.every(p => /loggedExerciseNames/.test(p)), parses.map(p => p.slice(0, 60)))
  // THE SOURCE OF THAT LIST IS THE APP'S OWN READ MODEL. If it ever came off
  // the model's payload the whole argument above collapses.
  const helper = ui.match(/const loggedExerciseNamesToday[\s\S]*?\n\n/)?.[0] ?? ''
  check('the list is read off the session log', /activeSession\.logs/.test(helper), helper.slice(0, 200))
  check('...and not off anything the model sent', !/entries|logWorkout|exercise_phrase/.test(helper), helper.slice(0, 200))
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nThe coach asks before logging a lift nobody named.')
