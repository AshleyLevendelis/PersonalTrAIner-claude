// ---------------------------------------------------------------------------
// Gate: GYM SHORTHAND MEANS WHAT A GYM MEANS BY IT, AND A GUESS IS NEVER
// PASSED OFF AS CERTAIN.
//
// Ashley, live test, 19 Oct 2026: "Im doing my own workout. First exercise I
// did was rdl". The app asked "How many sets and reps for Single-Leg RDL
// (Bodyweight)?". The catalogue search found the letters "rdl" inside exactly
// one name and returned it as RESOLVED; "Romanian Deadlifts" does not contain
// them. The follow-up asked only sets and reps, so the wrong name could not be
// changed, and a bodyweight entry skips the weight question, so her loaded RDL
// would have gone into history at 0 kg and every future RDL weight built on it.
//
// What this holds:
//   1. Every alias names a live catalogue entry, by a key that can be reached.
//   2. The reported case, through the parser the chat uses.
//   3. The common shorthand resolves.
//   4. A short query, or letters found mid-word, is offered, never assumed.
//   5. Today's plan still counts when it disagrees with the shorthand.
//   6. Every catalogue name still resolves to itself, exactly.
//   7. A guessed BODYWEIGHT name is confirmed before it can log 0 kg.
//   8. Her shorthand traces the model's expanded name back to her message.
//   9. The other callers of the resolver (ban, dislike) gain, never lose.
// ---------------------------------------------------------------------------

import { EXERCISE_ALIASES, exerciseAliasFor, normaliseAliasPhrase } from '../src/lib/exercise-aliases'
import { resolveExerciseName, parseWorkoutEntries, isNamedByTheUser, type WorkoutEntryInput } from '../src/lib/set-parse'
import { EXERCISE_DATABASE, getExerciseEntry, searchExerciseCatalog } from '../src/lib/exercise-db'
import { isExternallyLoaded } from '../src/lib/load-prescription'
import { resolveExerciseDislike } from '../src/lib/fact-compiler'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const resolvedName = (phrase: string, plan: string[] = []): string | null => {
  const r = resolveExerciseName(phrase, plan)
  return r.resolution === 'resolved' ? r.exerciseName : null
}
const candidatesOf = (phrase: string, plan: string[] = []): string[] => {
  const r = resolveExerciseName(phrase, plan)
  return r.resolution === 'ambiguous' ? r.candidates.map(c => c.name) : []
}
const entry = (rawText: string, exercisePhrase: string, setsPhrase: string): WorkoutEntryInput =>
  ({ rawText, exercisePhrase, setsPhrase })

console.log('\n1. Every alias names a live catalogue entry, by a key that can be reached')
{
  const keys = Object.keys(EXERCISE_ALIASES)
  check(`the table is not empty (${keys.length} aliases)`, keys.length >= 20, keys.length)
  const missing = keys.filter(k => !EXERCISE_DATABASE.some(e => e.name === EXERCISE_ALIASES[k]))
  check('every target is a catalogue name, spelled exactly', missing.length === 0, missing.map(k => `${k} -> ${EXERCISE_ALIASES[k]}`))
  const retired = keys.filter(k => getExerciseEntry(EXERCISE_ALIASES[k])?.retired)
  check('no target is a retired entry', retired.length === 0, retired)
  // A key written in a form the normaliser never produces can never be looked
  // up: it would sit in the table looking like coverage.
  const unreachable = keys.filter(k => normaliseAliasPhrase(k) !== k)
  check('every key is already in normalised form, so it can be reached', unreachable.length === 0, unreachable)
}

console.log('\n2. The reported case — "First exercise I did was rdl"')
{
  check('"rdl" resolves to Romanian Deadlifts', resolvedName('rdl') === 'Romanian Deadlifts', resolveExerciseName('rdl', []))
  check('"RDL" the same', resolvedName('RDL') === 'Romanian Deadlifts', resolveExerciseName('RDL', []))
  check('"RDLs" the same', resolvedName('RDLs') === 'Romanian Deadlifts', resolveExerciseName('RDLs', []))
  const said = 'Im doing my own workout. First exercise I did was rdl'
  const noSets = parseWorkoutEntries({ entries: [entry('rdl', 'rdl', '')], todaysPlanExerciseNames: [], userSaid: said })
  const g = noSets.groups[0]
  check('it asks for sets and reps FOR ROMANIAN DEADLIFTS, not the single-leg variant',
    g.ambiguity?.field === 'sets_x_reps' && /Romanian Deadlifts/.test(g.ambiguity.message) && !/Single-Leg/.test(g.ambiguity.message),
    g.ambiguity)
  const withSets = parseWorkoutEntries({ entries: [entry('rdl 3x8', 'rdl', '3x8')], todaysPlanExerciseNames: [], userSaid: `${said} 3x8` })
  const w = withSets.groups[0]
  check('with sets and reps but no weight, it asks the WEIGHT — a loaded RDL never logs at 0 kg',
    w.ambiguity?.field === 'weight' && w.sets.length === 0, { ambiguity: w.ambiguity, sets: w.sets })
}

console.log('\n3. Common shorthand resolves')
{
  const cases: Array<[string, string]> = [
    ['dumbbell rdl', 'Romanian Deadlifts'],
    ['db rdl', 'Romanian Deadlifts'],
    ['DB RDLs', 'Romanian Deadlifts'],
    ['romanian deadlift', 'Romanian Deadlifts'],
    ['single leg rdl', 'Single-Leg RDL (Bodyweight)'],
    ['SL RDL', 'Single-Leg RDL (Bodyweight)'],
    ['ohp', 'Overhead Press'],
    ['OHP', 'Overhead Press'],
    ['db ohp', 'Dumbbell Shoulder Press'],
    ['bench', 'Barbell Bench Press'],
    ['back squat', 'Barbell Squats'],
    ['bss', 'Bulgarian Split Squats'],
    ['pull ups', 'Pull-Ups'],
    ['pullups', 'Pull-Ups'],
    ['chin-ups', 'Chin-Ups'],
    ['push ups', 'Push-Ups'],
    ['kb swings', 'Kettlebell Swings'],
  ]
  for (const [said, want] of cases) check(`"${said}" -> ${want}`, resolvedName(said) === want, resolveExerciseName(said, []))
  // Named in the table's own note as having no one meaning: the chooser asks.
  check('bare "squats" is still a question, not a guess', candidatesOf('squats').length > 1, resolveExerciseName('squats', []))
  check('"stiff leg deadlift" borrows no other lift (the catalogue has none)',
    resolveExerciseName('stiff leg deadlift', []).resolution === 'unknown', resolveExerciseName('stiff leg deadlift', []))
}

console.log('\n4. A short query, or letters found mid-word, is offered, never assumed')
{
  // Fixtures that BIND: each is a query the catalogue answers with exactly one
  // hit, which is the branch that used to return it as certain.
  const hack = searchExerciseCatalog('hack', 6)
  check('fixture: "hack" is a unique catalogue prefix', hack.length === 1 && hack[0].name === 'Hack Squat', hack.map(e => e.name))
  check('"hack" (four letters) is a question offering Hack Squat, not a resolution',
    resolveExerciseName('hack', []).resolution === 'ambiguous' && candidatesOf('hack').includes('Hack Squat'), resolveExerciseName('hack', []))
  const verted = searchExerciseCatalog('verted', 6)
  check('fixture: "verted" hits exactly one name, mid-word', verted.length === 1 && verted[0].name === 'Inverted Row', verted.map(e => e.name))
  check('letters found mid-word ("verted" in Inverted Row) are offered, not assumed',
    resolveExerciseName('verted', []).resolution === 'ambiguous' && candidatesOf('verted').includes('Inverted Row'), resolveExerciseName('verted', []))
  check('"row" no longer means Rowing Machine; it is a question with the rows in it',
    resolveExerciseName('row', []).resolution === 'ambiguous' && candidatesOf('row').includes('Rowing Machine') && candidatesOf('row').length > 1,
    resolveExerciseName('row', []))
  // The other side: a query that names a word in one entry still resolves.
  check('"lunges" (a whole word, six letters) still resolves to Walking Lunges', resolvedName('lunges') === 'Walking Lunges', resolveExerciseName('lunges', []))
  check('"rowing" still resolves to Rowing Machine', resolvedName('rowing') === 'Rowing Machine', resolveExerciseName('rowing', []))
}

console.log('\n5. Today\'s plan still counts when it disagrees with the shorthand')
{
  const a = candidatesOf('rdl', ['Single-Leg RDL (Bodyweight)'])
  check('"rdl" with the single-leg RDL on today\'s card offers BOTH',
    a.includes('Romanian Deadlifts') && a.includes('Single-Leg RDL (Bodyweight)'), resolveExerciseName('rdl', ['Single-Leg RDL (Bodyweight)']))
  const b = candidatesOf('bench', ['Dumbbell Bench Press', 'Lat Pulldown'])
  check('"bench" with Dumbbell Bench Press on today\'s card offers both benches',
    b.includes('Barbell Bench Press') && b.includes('Dumbbell Bench Press') && !b.includes('Lat Pulldown'), b)
  check('"rdl" with Romanian Deadlifts on the plan simply resolves',
    resolvedName('rdl', ['Romanian Deadlifts', 'Lat Pulldown']) === 'Romanian Deadlifts')
}

console.log('\n6. Every catalogue name still resolves to itself, exactly')
{
  const misses: string[] = []
  for (const e of EXERCISE_DATABASE) {
    for (const spelt of [e.name, e.name.toLowerCase()]) {
      const r = resolveExerciseName(spelt, [])
      if (r.resolution !== 'resolved' || r.exerciseName !== e.name || r.via !== 'exact') misses.push(spelt)
    }
  }
  check(`all ${EXERCISE_DATABASE.length} names, as written and lowercased, resolve exactly to themselves`, misses.length === 0, misses)
}

console.log('\n7. A guessed BODYWEIGHT name is confirmed before it can log 0 kg')
{
  const sissy = getExerciseEntry('Sissy Squat')
  const sissyRes = resolveExerciseName('sissy', [])
  check('fixture: "sissy" is a catalogue guess landing on a bodyweight entry',
    !!sissy && !isExternallyLoaded(sissy) && sissyRes.resolution === 'resolved' && sissyRes.via === 'search', sissyRes)
  const p = parseWorkoutEntries({ entries: [entry('sissy 3x10', 'sissy', '3x10')], todaysPlanExerciseNames: [], userSaid: 'did sissy 3x10' })
  const g = p.groups[0]
  check('it asks which, offering Sissy Squat, and writes nothing',
    p.needsClarification === true && g.resolution === 'ambiguous' && g.sets.length === 0
      && (g.ambiguousCandidates ?? []).some(c => c.name === 'Sissy Squat'), g)
  // Naming the whole exercise is not a guess. "burpee", not "burpees": the
  // plural IS the catalogue name, resolves exactly, and never reaches the rule.
  const burpeeRes = resolveExerciseName('burpee', [])
  check('fixture: "burpee" is a catalogue guess (not exact) landing on a bodyweight entry',
    burpeeRes.resolution === 'resolved' && burpeeRes.via === 'search' && !isExternallyLoaded(getExerciseEntry(burpeeRes.exerciseName)!), burpeeRes)
  const b = parseWorkoutEntries({ entries: [entry('burpee 3x10', 'burpee', '3x10')], todaysPlanExerciseNames: [], userSaid: 'did burpee 3x10' })
  check('"burpee 3x10" still logs straight away — the words name the whole exercise',
    b.needsClarification !== true && b.groups[0].exerciseName === 'Burpees' && b.groups[0].sets.length === 3, b.groups[0])
  // A LOADED guess is not held up: the weight question that follows names it.
  const loadedGuess = resolveExerciseName('skull', [])
  check('fixture: "skull" is a catalogue guess landing on a loaded entry',
    loadedGuess.resolution === 'resolved' && loadedGuess.via === 'search'
      && isExternallyLoaded(getExerciseEntry(loadedGuess.exerciseName)!), loadedGuess)
  const s = parseWorkoutEntries({ entries: [entry('skull 3x10 @20kg', 'skull', '3x10 @20kg')], todaysPlanExerciseNames: [], userSaid: 'skull 3x10 @20kg' })
  check('...and logs without an extra tap', s.needsClarification !== true && s.groups[0].sets.length === 3, s.groups[0])
}

console.log('\n8. Her shorthand traces the model\'s expanded name back to her message')
{
  check('the model writing "Romanian Deadlifts" for her "rdl" is traced to her', isNamedByTheUser('Romanian Deadlifts', 'did rdl 3x8 @60kg'))
  check('...and "Overhead Press" for her "OHP"', isNamedByTheUser('Overhead Press', 'OHP 3x5 @40kg'))
  check('a name her words do not mean is still NOT traced ("Barbell Bench Press" for "rdl")', !isNamedByTheUser('Barbell Bench Press', 'did rdl 3x8'))
  check('a message naming nothing traces nothing', !isNamedByTheUser('Romanian Deadlifts', 'I did 1x10 @60kg'))
  const p = parseWorkoutEntries({
    entries: [entry('Romanian Deadlifts 3x8 @60kg', 'Romanian Deadlifts', '3x8 @60kg')],
    todaysPlanExerciseNames: [], userSaid: 'First exercise I did was rdl 3x8 @60kg',
  })
  check('...so it logs 3 sets of Romanian Deadlifts at 60 kg',
    p.needsClarification !== true && p.groups[0].exerciseName === 'Romanian Deadlifts' && p.groups[0].sets.length === 3
      && p.groups[0].sets.every(x => x.weightKg === 60), p.groups[0])
}

console.log('\n9. The other callers of the resolver gain, never lose')
{
  // The screen's "Exercises to avoid" and the coach's ban both go through it.
  const rdl = resolveExerciseDislike('rdl', resolveExerciseName)
  check('avoiding "rdl" names Romanian Deadlifts (was the bodyweight single-leg RDL)', rdl.ok && rdl.name === 'Romanian Deadlifts', rdl)
  const row = resolveExerciseDislike('row', resolveExerciseName)
  check('avoiding "row" asks which (was a silent Rowing Machine)', !row.ok && (row.candidates?.length ?? 0) > 1, row)
  const lat = resolveExerciseDislike('lat pulldown', resolveExerciseName)
  check('a full name still works', lat.ok && lat.name === 'Lat Pulldown', lat)
  check('exerciseAliasFor has no answer for a blank phrase', exerciseAliasFor('   ') === undefined)
}

console.log(`\n${ran} checks ran, ${failures} failed`)
if (failures > 0) process.exit(1)
