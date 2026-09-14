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

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nThe coach asks before logging a lift nobody named.')
