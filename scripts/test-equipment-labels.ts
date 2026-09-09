// ---------------------------------------------------------------------------
// THE WORDS BESIDE AN EQUIPMENT OPTION ARE A PROMISE, AND THIS GATE HOLDS IT.
//
// Roadmap item 11. Until 9 Sep 2026 the four setup options described far less
// kit than the tiers behind them actually permit:
//
//   "Minimalist  — Bands & kettlebells"   ... also gave you dumbbells, a
//                                             pull-up bar, a plyo box, an ab
//                                             wheel, a medicine ball, a jump
//                                             rope and a weighted backpack
//   "Home gym    — Barbell, dumbbells, bench"  ... 18 implements, including a
//                                             squat rack, trap bar, EZ bar and
//                                             dip bars
//   "Bodyweight only — No equipment needed"    ... prescribed pull-ups and
//                                             loaded a rucksack
//
// Someone who owns only bands and a kettlebell picked Minimalist and got
// dumbbell work. Ashley's ruling, 9 Sep 2026, from four options: FIX THE
// WORDS, not the kit — narrowing the sets would change every existing plan on
// those tiers. So the words are now the thing that can drift, and this is what
// stops them.
//
// TWO RULES, and they pull in opposite directions on purpose:
//
//   A. NO OVERCLAIM  — every implement the description NAMES must be in that
//      tier's set. Stops the words promising kit the plan will never use.
//   B. NO HIDDEN KIT — every implement in the set that MATTERS must be named.
//      Stops the words hiding kit the plan WILL assume you own.
//
// "Matters" is the DISCLOSABLE list below: the implements whose absence
// actually stops you doing an exercise, and whose presence someone would be
// surprised by. A plyo box or an ab wheel changes an accessory; a barbell
// changes whether the plan is possible at all. Listing all eighteen would
// produce a subtitle nobody reads, which is its own kind of dishonesty.
//
// An "— no x or y" clause is read as an EXCLUSION rather than a claim, and is
// itself checked: it may only name things the tier genuinely lacks.
// ---------------------------------------------------------------------------
import fs from 'fs'
import { EQUIPMENT_OPTIONS } from '../src/lib/onboarding-slots'
import { isEquipmentAllowed } from '../src/lib/exercise-plan'
import type { EquipmentAccess, ExerciseEntry, UserProfile } from '../src/lib/types'
import { getExerciseCompatibilityWarnings } from '../src/lib/exercise-plan'
import { EXERCISE_DATABASE } from '../src/lib/exercise-db'
import { ONBOARDING_SLOTS, NEVER_BLOCKING_SLOTS, initialSlotValues, assembleProfile } from '../src/lib/onboarding-slots'
import { ceilingIsInUserWords } from '../src/lib/onboarding-ceiling-capture'
import { LOAD_CEILING_MIN_KG, LOAD_CEILING_MAX_KG } from '../src/lib/load-ceiling-prompt'

let failures = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { console.log(`  ✓ ${label}`); return }
  failures++
  console.log(`  ✗ ${label}${detail === undefined ? '' : `\n      ${JSON.stringify(detail)}`}`)
}

// ---------------------------------------------------------------------------
// EQUIPMENT_SETS is module-private in exercise-plan.ts and stays that way —
// exporting it to satisfy a test would widen the API for no other caller. It
// is read from source instead, the same way test-spend-cap reads its
// constants, and §0 proves the parse actually found something rather than
// silently yielding empty sets (an empty set would make rule B vacuous and
// this whole gate would pass while saying nothing).
// ---------------------------------------------------------------------------
const planSrc = fs.readFileSync('src/lib/exercise-plan.ts', 'utf8')

function parseEquipmentSets(): Record<string, Set<string> | null> {
  const start = planSrc.indexOf('const EQUIPMENT_SETS')
  if (start < 0) throw new Error('EQUIPMENT_SETS not found in exercise-plan.ts')
  const block = planSrc.slice(start, planSrc.indexOf('\n}', start))
  const out: Record<string, Set<string> | null> = {}
  for (const tier of ['full_gym', 'home_gym', 'minimalist', 'bodyweight']) {
    const at = block.indexOf(`${tier}:`)
    if (at < 0) throw new Error(`tier ${tier} missing from EQUIPMENT_SETS`)
    const rest = block.slice(at)
    if (/^\w+:\s*null/.test(rest)) { out[tier] = null; continue }
    const setBody = rest.slice(rest.indexOf('['), rest.indexOf(']') + 1)
    out[tier] = new Set([...setBody.matchAll(/'([^']+)'/g)].map(m => m[1]))
  }
  return out
}

const SETS = parseEquipmentSets()

/**
 * The implements a person would be wrong-footed by. Each maps to the words
 * that count as naming it. Deliberately NOT every string in the sets: a plyo
 * box swaps one accessory for another, a barbell decides whether half the
 * plan exists.
 */
const DISCLOSABLE: { key: string; names: RegExp }[] = [
  { key: 'barbell', names: /\bbarbell\b/i },
  { key: 'squat rack', names: /\brack\b/i },
  { key: 'bench', names: /\bbench\b/i },
  { key: 'dumbbells', names: /\bdumbbells?\b/i },
  { key: 'kettlebell', names: /\bkettlebells?\b/i },
  { key: 'resistance band', names: /\bbands?\b/i },
  { key: 'pull-up bar', names: /\bpull-up bar\b/i },
  { key: 'weighted backpack', names: /\bweighted (bag|backpack)\b|\brucksack\b/i },
]

/** Everything before an "— no ..." clause is a claim; the clause itself is not. */
function split(description: string): { claim: string; excluded: string } {
  const at = description.search(/—\s*no\b/i)
  return at < 0
    ? { claim: description, excluded: '' }
    : { claim: description.slice(0, at), excluded: description.slice(at) }
}

console.log('\n1. Every option has a description at all')
for (const o of EQUIPMENT_OPTIONS) {
  check(`${o.label} carries one`, typeof o.description === 'string' && o.description.trim().length > 10, o.description)
}

console.log('\n2. RULE A — nothing named is absent from the tier (no overclaim)')
for (const o of EQUIPMENT_OPTIONS) {
  const set = SETS[o.value]
  // full_gym is `null` — no filter, everything allowed — so it cannot overclaim.
  if (!set) { check(`${o.label} allows everything, so nothing can be overclaimed`, true); continue }
  const { claim } = split(o.description)
  const overclaimed = DISCLOSABLE.filter(d => d.names.test(claim) && !set.has(d.key))
  check(`${o.label} names nothing the tier lacks`, overclaimed.length === 0, overclaimed.map(d => d.key))
}

console.log('\n3. RULE B — nothing that matters is hidden (no unnamed kit)')
for (const o of EQUIPMENT_OPTIONS) {
  const set = SETS[o.value]
  if (!set) { check(`${o.label} says "everything", which is what null means`, /everything/i.test(o.description), o.description); continue }
  const { claim } = split(o.description)
  const hidden = DISCLOSABLE.filter(d => set.has(d.key) && !d.names.test(claim))
  check(`${o.label} names every implement that matters`, hidden.length === 0, hidden.map(d => d.key))
}

console.log('\n4. An exclusion clause must exclude things the tier really lacks')
for (const o of EQUIPMENT_OPTIONS) {
  const set = SETS[o.value]
  const { excluded } = split(o.description)
  if (!excluded) { check(`${o.label} has no exclusion clause to check`, true); continue }
  const wrong = DISCLOSABLE.filter(d => d.names.test(excluded) && (!set || set.has(d.key)))
  check(`${o.label}'s "no ..." names only things it genuinely lacks`, wrong.length === 0, wrong.map(d => d.key))
}

console.log('\n5. The three defects that prompted this cannot come back verbatim')
const byTier = Object.fromEntries(EQUIPMENT_OPTIONS.map(o => [o.value, o.description]))
check('Minimalist is no longer just "Bands & kettlebells"', byTier.minimalist !== 'Bands & kettlebells', byTier.minimalist)
check('Home gym is no longer just "Barbell, dumbbells, bench"', byTier.home_gym !== 'Barbell, dumbbells, bench', byTier.home_gym)
check('Bodyweight no longer claims "No equipment needed"', !/no equipment/i.test(byTier.bodyweight), byTier.bodyweight)
check('Minimalist discloses dumbbells specifically — the one that bit', /dumbbell/i.test(byTier.minimalist), byTier.minimalist)
check('Bodyweight discloses the pull-up bar specifically', /pull-up bar/i.test(byTier.bodyweight), byTier.bodyweight)

console.log('\n6. Sanity — the parse actually read the sets')
check('four tiers parsed', Object.keys(SETS).length === 4, Object.keys(SETS))
check('full_gym is the unfiltered one', SETS.full_gym === null)
check('home_gym parsed a real set', (SETS.home_gym?.size ?? 0) > 10, SETS.home_gym?.size)
check('minimalist parsed a real set', (SETS.minimalist?.size ?? 0) > 5, SETS.minimalist?.size)
check('minimalist really does permit dumbbells (the premise of §5)', SETS.minimalist?.has('dumbbells') === true)
check('bodyweight really does permit a pull-up bar', SETS.bodyweight?.has('pull-up bar') === true)

console.log('\n7. Where the description is SHOWN — both screens, not just setup')
const profileSrc = fs.readFileSync('src/components/ProfileScreen.tsx', 'utf8')
const selectSrc = fs.readFileSync('src/components/ui/select.tsx', 'utf8')
check('Profile passes the description through to the option list',
  /hint=\{o\.description\}/.test(profileSrc), null)
check('EditableSelectField accepts a description on its options',
  /options:\s*\{[^}]*description\?: string/.test(profileSrc), null)
check('the hint renders OUTSIDE ItemText, so the closed control stays label-only',
  selectSrc.indexOf('<SelectPrimitive.ItemText>') < selectSrc.indexOf('{hint ?'), null)
const chipsSrc = fs.readFileSync('src/components/onboarding/SlotChipsCard.tsx', 'utf8')
check('the setup card still renders option descriptions', /description/.test(chipsSrc), null)

console.log('\n8. The coach prompts agree with the sets they describe')
const onbSrc = fs.readFileSync('supabase/functions/onboarding-chat/index.ts', 'utf8')
const chatSrc = fs.readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8')
check('setup prompt no longer says home_gym MEANS barbell+dumbbells+bench',
  !/home_gym means barbell\+dumbbells\+bench/i.test(onbSrc), null)
check('setup prompt maps "just some dumbbells" to minimalist, not home_gym',
  /just some dumbbells at home"?\s*→\s*equipment=minimalist/i.test(onbSrc), null)
check('coach tool description admits bodyweight assumes a pull-up bar',
  /bodyweight[^"]{0,80}pull-up bar/i.test(chatSrc), null)
check('coach §3b names what minimalist actually assumes',
  /minimalist assumes dumbbells, kettlebells, bands, a pull-up bar and a weighted bag/i.test(chatSrc), null)
check('the "closest fit, not exact" honesty caveat survived',
  /closest fit/i.test(chatSrc), null)

console.log('\n9. The swap warning asks the generator, it does not re-implement it')
// The bug this replaced: `equipment.filter(eq => !allowed.has(eq))` warned on
// EVERY missing implement, so an `equipment_alternatives` entry (one of the
// two is enough) was reported unavailable to someone who owned the other.
check('getExerciseCompatibilityWarnings calls isEquipmentAllowed',
  /isEquipmentAllowed\(exercise, tier\)/.test(planSrc), null)
// Real catalogue entries, not stubs: a stub that forgets `loads_joints` sends
// the injury half of this function down a different path, and the point is to
// exercise the code exactly as the swap dialog calls it.
const homeGym = { equipment_access: 'home_gym' as EquipmentAccess, injuries: [] } as unknown as UserProfile
const byName = (n: string): ExerciseEntry => {
  const e = EXERCISE_DATABASE.find(x => x.name === n)
  if (!e) throw new Error(`catalogue entry "${n}" not found — re-anchor this check`)
  return e
}

// T-Bar Rows: equipment ['t-bar','barbell'], equipment_alternatives true.
// home_gym owns the barbell and not the t-bar, so ONE of the two is present.
const eitherOr = byName('T-Bar Rows')
check('the probe entry is genuinely an either-implement one',
  eitherOr.equipment_alternatives === true && eitherOr.equipment.length > 1, eitherOr.equipment)
check('an either-implement exercise with ONE present warns not at all',
  getExerciseCompatibilityWarnings(eitherOr, homeGym).length === 0,
  getExerciseCompatibilityWarnings(eitherOr, homeGym))
check('...and the generator agrees it is allowed',
  isEquipmentAllowed(eitherOr, 'home_gym') === true)

// The same entry at a tier that owns NEITHER implement must still warn — the
// fix must not have turned the warning off wholesale.
const bodyweightOnly = { equipment_access: 'bodyweight' as EquipmentAccess, injuries: [] } as unknown as UserProfile
const w = getExerciseCompatibilityWarnings(eitherOr, bodyweightOnly)
check('the same exercise at a tier owning NEITHER still warns', w.length >= 1, w)
check('...and joins the misses with "or", because any one would do',
  w[0]?.includes(' or '), w[0])

// An ordinary (all-implements-required) entry the tier cannot satisfy.
const ordinary = EXERCISE_DATABASE.find(e =>
  !e.equipment_alternatives && !isEquipmentAllowed(e, 'home_gym'))
check('an ordinary exercise outside the tier still warns',
  !!ordinary && getExerciseCompatibilityWarnings(ordinary, homeGym).some(x => x.startsWith('Needs ')),
  ordinary ? getExerciseCompatibilityWarnings(ordinary, homeGym) : 'no such entry')

console.log('\n10. A volunteered load ceiling is KEPT — and is never asked for')
// Item 11's second half. The Exercise tab asks "what are your heaviest
// dumbbells?" because setup had nowhere to put the answer; these three slots
// are that place. They sit in NEVER_BLOCKING_SLOTS beside dislikedExercises,
// which is the existing precedent for "recorded when volunteered, never asked".
const CEILING_KEYS = ['maxDumbbellKg', 'maxSingleImplementKg', 'maxImprovisedKg'] as const
const slotsSrc = fs.readFileSync('src/lib/onboarding-slots.ts', 'utf8')
for (const k of CEILING_KEYS) {
  const def = ONBOARDING_SLOTS.find(s2 => s2.key === k)
  check(`${k} exists as a slot`, !!def)
  check(`${k} never blocks a plan`, NEVER_BLOCKING_SLOTS.includes(k as never), NEVER_BLOCKING_SLOTS)
  check(`${k} is a numeric column bounded like the Exercise-tab prompt`,
    def?.control === 'numeric' && def?.destination === 'column' && def?.min === 1 && def?.max === 100,
    { control: def?.control, destination: def?.destination, min: def?.min, max: def?.max })
  check(`${k} does not apply at full_gym`,
    def?.requiredIf?.({ ...initialSlotValues(), equipment: 'full_gym' }) === false)
  check(`${k} DOES apply on limited kit`,
    def?.requiredIf?.({ ...initialSlotValues(), equipment: 'minimalist' }) === true)
  // Order tolerance: a ceiling volunteered before the equipment question is
  // still applicable, or an early "I've only got 12kg dumbbells" is lost to
  // whichever set_slot the model happened to emit first.
  check(`${k} still applies before equipment is answered`,
    def?.requiredIf?.({ ...initialSlotValues(), equipment: null }) === true)
}
check('the bounds match the Exercise-tab prompt exactly',
  LOAD_CEILING_MIN_KG === 1 && LOAD_CEILING_MAX_KG === 100,
  [LOAD_CEILING_MIN_KG, LOAD_CEILING_MAX_KG])

console.log('\n11. The number has to be in HER OWN WORDS')
// The whole safety story: statedCeilingKg treats any number it finds as a hard
// clamp, and nothing downstream can tell an invented one from a stated one.
const W = (t: string, v: unknown, k: (typeof CEILING_KEYS)[number] = 'maxDumbbellKg') => ceilingIsInUserWords(k, v, t)
check('"I have only got 12kg dumbbells" -> 12 accepted', W('I have only got 12kg dumbbells', 12) === true)
check('"my dumbbells go up to 24" -> 24 accepted', W('my dumbbells go up to 24', 24) === true)
check('"heaviest kettlebell is 16kg" -> 16 accepted',
  W('my heaviest kettlebell is 16kg', 16, 'maxSingleImplementKg') === true)
check('"the bag holds about 10kg" -> 10 accepted',
  W('the bag holds about 10kg', 10, 'maxImprovisedKg') === true)
check('"I weigh 80kg" is NOT a dumbbell ceiling — no implement named', W('I weigh 80kg', 80) === false)
check('"I train with dumbbells" is NOT a ceiling — no number said', W('I train with dumbbells', 20) === false)
check('a number she never said is refused', W('I have only got 12kg dumbbells', 30) === false)
check('a decimal is not satisfied by its whole part', W('my dumbbells are 12.5kg', 12) === false)
check('a kettlebell sentence does not set the dumbbell ceiling',
  W('my heaviest kettlebell is 16kg', 16) === false)
check('zero and nonsense are refused', W('I have only got 12kg dumbbells', 0) === false && W('x', NaN) === false)
check('a non-ceiling slot is untouched by this guard',
  ceilingIsInUserWords('age' as never, 30, 'no numbers here') === true)
check('the client actually applies the guard before writing',
  /isCeilingSlot\(key\) && !ceilingIsInUserWords\(key, coerced, userText\)/.test(
    fs.readFileSync('src/components/onboarding/ConversationalOnboarding.tsx', 'utf8')), null)

console.log('\n12. The ceiling survives all the way to the database')
const withCeiling = (equipment: 'minimalist' | 'full_gym') => assembleProfile({
  ...initialSlotValues(),
  displayName: 'Probe', fitnessGoal: 'fat_loss', trainingDays: ['Mon'], recoveryCapacity: 'moderate',
  conditioningPreference: 'some', sessionDuration: '45-60', equipment, trainingStyle: 'hybrid',
  trainingExperience: 'novice', maxDumbbellKg: '12', maxSingleImplementKg: '16', maxImprovisedKg: '10',
} as never)
const kept = withCeiling('minimalist')
check('a stated ceiling reaches the profile', kept.max_dumbbell_kg === 12 && kept.max_single_implement_kg === 16 && kept.max_improvised_kg === 10,
  [kept.max_dumbbell_kg, kept.max_single_implement_kg, kept.max_improvised_kg])
const gym = withCeiling('full_gym')
check('a full-gym answer discards it — the rack really does go that high',
  gym.max_dumbbell_kg === undefined && gym.max_single_implement_kg === undefined && gym.max_improvised_kg === undefined,
  [gym.max_dumbbell_kg, gym.max_single_implement_kg, gym.max_improvised_kg])
const unstated = assembleProfile({
  ...initialSlotValues(), displayName: 'Probe', fitnessGoal: 'fat_loss', trainingDays: ['Mon'],
  recoveryCapacity: 'moderate', conditioningPreference: 'some', sessionDuration: '45-60',
  equipment: 'minimalist', trainingStyle: 'hybrid', trainingExperience: 'novice',
} as never)
check('unstated stays ABSENT, never a limit of zero', unstated.max_dumbbell_kg === undefined, unstated.max_dumbbell_kg)
// The exact shape that already bit once: a column-by-column profile write that
// forgets these three (see the header of ceiling-reconcile.ts).
const appSrc = fs.readFileSync('src/App.tsx', 'utf8')
const insert = appSrc.slice(appSrc.indexOf("from('fitness_profiles')\n      .insert({"), appSrc.indexOf("from('fitness_profiles')\n      .insert({") + 4000)
for (const col of ['max_dumbbell_kg', 'max_single_implement_kg', 'max_improvised_kg']) {
  check(`the onboarding insert names ${col}`, insert.includes(`${col}:`), null)
}

console.log('\n13. Setup never ASKS for a ceiling')
const onbPrompt = fs.readFileSync('supabase/functions/onboarding-chat/index.ts', 'utf8')
check('the prompt tells the model never to ask',
  /WHAT THEY CAN ACTUALLY LOAD[\s\S]{0,900}NEVER ASK/.test(onbPrompt), null)
check('...and never to infer one',
  /never infer it from their bodyweight/i.test(onbPrompt), null)
check('...and gives the three set_slot targets',
  /maxDumbbellKg=/.test(onbPrompt) && /maxSingleImplementKg=/.test(onbPrompt) && /maxImprovisedKg=/.test(onbPrompt), null)
check('no ceiling slot is on the proactive question list',
  CEILING_KEYS.every(k => NEVER_BLOCKING_SLOTS.includes(k as never)), null)
check("Ashley's ruling is still recorded where the prompt lives",
  /NOT IN ONBOARDING/.test(fs.readFileSync('src/lib/load-ceiling-prompt.ts', 'utf8')), null)

console.log(failures === 0 ? '\nAll equipment-label checks passed.\n' : `\n${failures} check(s) failed.\n`)
process.exit(failures === 0 ? 0 : 1)
