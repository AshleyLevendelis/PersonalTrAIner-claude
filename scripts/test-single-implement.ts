// ---------------------------------------------------------------------------
// ONE DUMBBELL IS NOT A PAIR.
//
// Ashley, 10 Sep 2026, from her phone, on the Pull & Hinge day:
//
//     Dumbbell Leg Curl        3×15-18 · ~12kg per hand
//
// A dumbbell leg curl is done lying face down with ONE dumbbell clamped
// between the feet. No hand holds anything.
//
// THE CAUSE WAS ONE CHARACTER. `loadingMode` reads the PLURAL of the equipment
// string — 'dumbbells' is a pair (halve the estimate, caption it "per hand"),
// 'dumbbell' is one implement (leave it whole, no caption). The entry declared
// a pair while its own form cue, two lines below, said "dumbbell held between
// feet". So the estimate was halved and then captioned with an instruction to
// double it: she was shown 12kg for a lift the model had priced at 24.
//
// WHY THIS IS NOT A COSMETIC CHECK. `exercise_set_logs.weight_kg` is stored
// bare, with no unit of its own, and `getLastLoggedWeight` feeds it straight
// into next week's prescription. The caption on the logging column is the ONLY
// thing carrying the unit — SetGrid's own comment says so, in the opposite
// direction from this bug: "the column is not just telling someone a number,
// it is asking them for one."
//
// The checks below are pinned on the PROPERTY — the catalogue's cues and its
// equipment array must agree about how many dumbbells there are — rather than
// on this one exercise's name, so the next entry to get it wrong fails here
// too. §1 is the one that would have caught this without anybody noticing it
// on a screen.
// ---------------------------------------------------------------------------
import { EXERCISE_DATABASE, type ExerciseEntry } from '../src/lib/exercise-db'
import {
  prescribeLoad, loadingMode, isPerSideLoad, labelModeForEntry, statedCeilingKg,
} from '../src/lib/load-prescription'
import type { UserProfile } from '../src/lib/types'

let failures = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { console.log(`  ✓ ${label}`); return }
  failures++
  console.log(`  ✗ ${label}${detail === undefined ? '' : `\n      ${JSON.stringify(detail)}`}`)
}

const byName = (n: string): ExerciseEntry => {
  const e = EXERCISE_DATABASE.find(x => x.name === n)
  if (!e) throw new Error(`no catalogue entry named ${n}`)
  return e
}
const PROFILE = {
  age: 30, gender: 'female', height_cm: 168, weight_kg: 70,
  training_experience: 'intermediate', fitness_goal: 'hypertrophy',
  equipment_access: 'full_gym',
} as unknown as UserProfile
const shown = (e: ExerciseEntry, p: UserProfile = PROFILE) =>
  prescribeLoad(e, p, {} as never)?.display ?? null
const kg = (e: ExerciseEntry, p: UserProfile = PROFILE) =>
  prescribeLoad(e, p, {} as never)?.starting_weight_kg ?? null

// ---------------------------------------------------------------------------
console.log('\n1. The catalogue does not contradict itself about how many dumbbells')
// ---------------------------------------------------------------------------
// Read from the DATA, not from the file text: form_cues is a field, and a
// source regex would be satisfied by a comment about the rule.
/** Cues that can only describe ONE implement. */
const SAYS_ONE = /\b(a dumbbell|one dumbbell|single dumbbell|dumbbell held|both hands under|between (the )?feet|at chest|at your chest)\b/i
/** Cues that can only describe a PAIR. */
const SAYS_TWO = /\b(each hand|both hands, one|dumbbells\b|in each|one in each)\b/i

const cuesOf = (e: ExerciseEntry) => (e.form_cues ?? []).join(' | ')
const claimsPair = (e: ExerciseEntry) => e.equipment.includes('dumbbells')
const claimsOne = (e: ExerciseEntry) =>
  !e.equipment.includes('dumbbells') && e.equipment.includes('dumbbell')

const pairButCuesSayOne = EXERCISE_DATABASE
  .filter(e => claimsPair(e) && SAYS_ONE.test(cuesOf(e)) && !SAYS_TWO.test(cuesOf(e)))
  .map(e => ({ name: e.name, cues: cuesOf(e) }))
check('no entry claims a PAIR while its cues describe one dumbbell',
  pairButCuesSayOne.length === 0, pairButCuesSayOne)

const oneButCuesSayPair = EXERCISE_DATABASE
  .filter(e => claimsOne(e) && SAYS_TWO.test(cuesOf(e)) && !SAYS_ONE.test(cuesOf(e)))
  .map(e => ({ name: e.name, cues: cuesOf(e) }))
check('...and none claims ONE while its cues describe a pair',
  oneButCuesSayPair.length === 0, oneButCuesSayPair)

// The detector must be able to see the thing it is looking for. Without this,
// a regex that matches nothing at all reports two clean passes forever.
check('the detector actually fires on the shape it hunts',
  SAYS_ONE.test('Lie face down, dumbbell held between feet') && SAYS_TWO.test('Heavy weight in each hand'),
  null)

// ---------------------------------------------------------------------------
console.log('\n2. Her lift, priced and captioned as one dumbbell')
// ---------------------------------------------------------------------------
const legCurl = byName('Dumbbell Leg Curl')
check('the entry declares one dumbbell', claimsOne(legCurl), legCurl.equipment)
check('...so it is a single implement, not a pair', loadingMode(legCurl) === 'single_implement', loadingMode(legCurl))
check('...it is not per-side, because no side holds anything', !isPerSideLoad(legCurl), null)
check('...the label carries no unit qualifier at all', labelModeForEntry(legCurl) === 'total', labelModeForEntry(legCurl))
check('...and nothing on screen says "per hand"',
  !/per hand|single side/.test(shown(legCurl) ?? ''), shown(legCurl))

// The number is the point, not just the caption: the halving is what made the
// displayed figure half of what the model had actually decided on.
const legCurlKg = kg(legCurl)
check('the prescribed number is the WHOLE estimate, not half of it',
  legCurlKg !== null && legCurlKg >= 20, legCurlKg)

// ---------------------------------------------------------------------------
console.log('\n3. Correcting the label did not quietly remove a ceiling')
// ---------------------------------------------------------------------------
// max_single_implement_kg is only ever captured from KETTLEBELL words, so
// routing this lift there by its loading mode would have checked a dumbbell
// movement against an answer she may never have given. Asserted THROUGH
// prescribeLoad rather than by reading statedCeilingKg, so a routing fix that
// never reaches the prescription fails here.
const owns12 = { ...PROFILE, max_dumbbell_kg: 12 } as UserProfile
check('a stated dumbbell ceiling still clamps this lift',
  kg(legCurl, owns12) === 12, { shown: shown(legCurl, owns12), stated: statedCeilingKg(legCurl, owns12) })
check('...and it is the DUMBBELL answer that does it, not the kettlebell one',
  statedCeilingKg(legCurl, owns12) === 12
    && statedCeilingKg(legCurl, { ...PROFILE, max_single_implement_kg: 40 } as UserProfile) === null,
  null)

// The same hole existed before this change on the one dumbbell-only lift that
// was already single_implement — it is closed by the same routing.
const calf = byName('Single-Leg Dumbbell Calf Raise')
check('the calf raise gains the same clamp, which it never had',
  statedCeilingKg(calf, owns12) === 12, statedCeilingKg(calf, owns12))

// ---------------------------------------------------------------------------
console.log('\n4. A movement that can use EITHER implement keeps the answer it had')
// ---------------------------------------------------------------------------
// Narrowing a goblet squat to the dumbbell answer would cap someone below the
// kettlebell they own. These must be untouched by the routing change.
const mixed = { ...PROFILE, max_dumbbell_kg: 12, max_single_implement_kg: 24 } as UserProfile
for (const name of ['Goblet Squats', 'Suitcase Carry', 'Overhead Carry']) {
  const e = byName(name)
  check(`${name} still reads the single-implement ceiling`,
    statedCeilingKg(e, mixed) === 24, { name, got: statedCeilingKg(e, mixed) })
}

// ---------------------------------------------------------------------------
console.log('\n5. Every genuine pair is still a pair')
// ---------------------------------------------------------------------------
// The failure mode of a fix like this is over-correction: quietly demoting real
// dumbbell-pair work to a total, which HALVES nothing and doubles every
// displayed number across the plan.
const pairs = EXERCISE_DATABASE.filter(claimsPair)
check('the catalogue still holds a full set of dumbbell-pair movements', pairs.length >= 20, pairs.length)
const misjudged = pairs.filter(e => !isPerSideLoad(e) || labelModeForEntry(e) !== 'per_hand').map(e => e.name)
check('...and every one of them is still priced and captioned per hand',
  misjudged.length === 0, misjudged)
for (const name of ['Dumbbell Bench Press', 'Dumbbell Rows', 'Lateral Raises', 'Walking Lunges']) {
  check(`${name} is unchanged`, /per hand/.test(shown(byName(name)) ?? ''), shown(byName(name)))
}

// PIN THE ARITHMETIC, NOT THE CAPTION. The first version of this section
// checked that pairs were still LABELLED per hand and still returned true from
// isPerSideLoad — and survived a mutation that deleted the halving outright,
// which would have doubled every dumbbell prescription in the app while every
// label stayed correct. A caption is not a number.
//
// Stated as a ratio rather than a constant: the same movement, priced as one
// implement instead of a pair, must come out ROUGHLY DOUBLE. Not exactly —
// both ends round to the nearest real plate, so a 14 pairs with a 30.
for (const name of ['Dumbbell Bench Press', 'Lateral Raises', 'Dumbbell Curls']) {
  const e = byName(name)
  const perHand = kg(e)
  const asOne = kg({ ...e, equipment: ['dumbbell'] } as ExerciseEntry)
  check(`${name}'s per-hand number really is half the one-implement number`,
    perHand !== null && asOne !== null && asOne >= perHand * 1.7 && asOne <= perHand * 2.4,
    { perHand, asOne })
}

console.log(failures === 0 ? '\nOne dumbbell is priced as one dumbbell.\n' : `\n${failures} check(s) failed.\n`)
process.exit(failures === 0 ? 0 : 1)
