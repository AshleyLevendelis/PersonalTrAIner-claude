// ---------------------------------------------------------------------------
// GYM SHORTHAND -> THE CATALOGUE'S NAME. One table, zero imports.
//
// Ashley, live test, 19 Oct 2026: she typed "Im doing my own workout. First
// exercise I did was rdl" and the coach asked "How many sets and reps for
// Single-Leg RDL (Bodyweight)?". Nothing in the app knew what "rdl" means, so
// the catalogue search matched the three letters ANYWHERE in a name, found
// exactly one ("Single-Leg RDL (Bodyweight)" — "Romanian Deadlifts" does not
// contain them) and returned it as certain. A bodyweight entry then skipped
// the weight question, so her loaded RDL would have gone into history at 0 kg.
//
// CSCS BASIS for the targets. In ordinary gym usage "RDL" is the bilateral
// Romanian deadlift with a barbell or dumbbells; the single-leg version is
// always said as such ("single-leg RDL", "SL RDL"). "OHP" is the standing
// barbell overhead press, "bench" the barbell bench press, "back squat" the
// barbell back squat. Where the catalogue's one entry covers both implements
// (Romanian Deadlifts is barbell OR dumbbells), "dumbbell rdl" maps to it
// rather than to an entry that does not exist.
//
// DELIBERATELY NOT HERE, because the words do not have one meaning:
//   - bare "squat(s)": a barbell squat in a gym, an air squat at home. The
//     catalogue holds a dozen; the chooser asks.
//   - "dips", "curls", "rows", "press": several real answers each.
//   - "stiff leg deadlift" / "SLDL": the catalogue has no stiff-leg deadlift,
//     and it is not an RDL (bar from the floor, knees nearly locked). It stays
//     a custom name rather than borrowing a different lift's history.
//
// EVERY TARGET MUST BE A LIVE CATALOGUE NAME — test:exercise-aliases asserts
// it, so a renamed or retired entry fails a gate rather than an alias quietly
// resolving to nothing.
// ---------------------------------------------------------------------------

/**
 * Keys are NORMALISED (see `normaliseAliasPhrase`): lowercase, words split on
 * anything not a letter or digit, db/bb/kb/sl written out, each word made
 * singular. So "DB RDLs", "db-rdl" and "dumbbell rdl" are one key.
 */
export const EXERCISE_ALIASES: Readonly<Record<string, string>> = {
  // Romanian deadlift — the bilateral lift, either implement.
  'rdl': 'Romanian Deadlifts',
  'romanian deadlift': 'Romanian Deadlifts',
  'romanian dl': 'Romanian Deadlifts',
  'barbell rdl': 'Romanian Deadlifts',
  'dumbbell rdl': 'Romanian Deadlifts',
  'barbell romanian deadlift': 'Romanian Deadlifts',
  'dumbbell romanian deadlift': 'Romanian Deadlifts',
  // Single-leg RDL — said as such, and the catalogue holds one.
  'single leg rdl': 'Single-Leg RDL (Bodyweight)',
  'single leg romanian deadlift': 'Single-Leg RDL (Bodyweight)',
  'one leg rdl': 'Single-Leg RDL (Bodyweight)',
  // Overhead press.
  'ohp': 'Overhead Press',
  'barbell ohp': 'Overhead Press',
  'barbell overhead press': 'Overhead Press',
  'military press': 'Overhead Press',
  'standing press': 'Overhead Press',
  'dumbbell ohp': 'Dumbbell Shoulder Press',
  'dumbbell overhead press': 'Dumbbell Shoulder Press',
  // Bench press.
  'bench': 'Barbell Bench Press',
  'bench press': 'Barbell Bench Press',
  'barbell bench': 'Barbell Bench Press',
  'flat bench': 'Barbell Bench Press',
  'flat bench press': 'Barbell Bench Press',
  'dumbbell bench': 'Dumbbell Bench Press',
  // Squat — only the phrasings with one meaning.
  'back squat': 'Barbell Squats',
  'barbell squat': 'Barbell Squats',
  'barbell back squat': 'Barbell Squats',
  'bulgarian split squat': 'Bulgarian Split Squats',
  'bss': 'Bulgarian Split Squats',
  'goblet squat': 'Goblet Squats',
  // Deadlift.
  'deadlift': 'Deadlifts',
  'conventional deadlift': 'Deadlifts',
  'barbell deadlift': 'Deadlifts',
  'trap bar dl': 'Trap Bar Deadlift',
  'hex bar deadlift': 'Trap Bar Deadlift',
  'hex bar dl': 'Trap Bar Deadlift',
  // Pull-ups, chin-ups, push-ups — every way of writing them.
  'pull up': 'Pull-Ups',
  'pullup': 'Pull-Ups',
  'chin up': 'Chin-Ups',
  'chinup': 'Chin-Ups',
  'push up': 'Push-Ups',
  'pushup': 'Push-Ups',
  'press up': 'Push-Ups',
  // Rows and pulldowns.
  'bent over row': 'Barbell Rows',
  'barbell row': 'Barbell Rows',
  'dumbbell row': 'Dumbbell Rows',
  'lat pull down': 'Lat Pulldown',
  // Kettlebell swing — the ordinary entry, not the heavy variant.
  'kettlebell swing': 'Kettlebell Swings',
}

/** Shorthand prefixes written out, so "db rdl" and "dumbbell rdl" are one key. */
const WORD_EXPANSIONS: Readonly<Record<string, string>> = {
  db: 'dumbbell',
  bb: 'barbell',
  kb: 'kettlebell',
  sl: 'single leg',
}

/** "RDLs" -> "rdl", "pull-ups" -> "pull up"; "press" and "bss" keep their double s. */
function singular(word: string): string {
  if (word.length >= 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}

export function normaliseAliasPhrase(phrase: string): string {
  return phrase
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(w => WORD_EXPANSIONS[w] ?? w)
    .join(' ')
    .split(' ')
    .map(singular)
    .join(' ')
}

/** The catalogue name a piece of gym shorthand means, or undefined when it has no one meaning. */
export function exerciseAliasFor(phrase: string): string | undefined {
  const key = normaliseAliasPhrase(phrase)
  return key ? EXERCISE_ALIASES[key] : undefined
}
