/**
 * Slot-replacement hygiene — the CLASS gate for "wrong exercise's data
 * survives a slot change."
 *
 * Three separate bugs of this exact shape have now shipped:
 *   1. applyReplacement had no primer guard -> a warm-up movement inherited a
 *      real working load ("88kg Kettlebell Swings, labelled Light").
 *   2. substituteFloorClampedIsolation had no duplicate-family check.
 *   3. applyReplacement inherited prescription UNITS, the ramp block and the
 *      assistance fields from the outgoing exercise -> "40m" on a rep lift,
 *      and an outgoing lift's per-set warm-up kg sitting under a new name.
 *
 * Rather than testing each instance, this asserts the INVARIANT every
 * slot-changing path must hold: after a replacement, no field that describes
 * the OUTGOING exercise may survive on the slot. applyReplacement is the
 * shared choke point for swap / ban / injury adaptation / equipment
 * adaptation, so covering it covers all four.
 */
import { applyReplacement } from '../src/lib/mesocycle-edit'
import { EXERCISE_DATABASE, searchExerciseCatalog, searchExerciseCatalogByWords } from '../src/lib/exercise-db'
import { prescribeLoad } from '../src/lib/load-prescription'
import type { Exercise, UserProfile } from '../src/lib/types'

const profile = {
  age: 34, gender: 'male', height_cm: 178, weight_kg: 82,
  activity_level: 'moderate', fitness_goal: 'hypertrophy', preferred_time: 'morning',
  bmr: 1800, tdee: 2600, equipment_access: 'full_gym', injuries: [],
  training_style: 'hybrid', training_experience: 'intermediate',
  session_duration_preference: '45-60', workout_split_preference: 'ai_recommendation',
  training_days: [], weekly_schedule: {}, dietary_preferences: [],
  concurrent_activities: [], macro_calculation_mode: 'STANDARD_STATIC',
  coaching_persona: 'supportive', recovery_capacity: 'moderate',
  conditioning_preference: 'tolerate', created_at: new Date().toISOString(),
} as unknown as UserProfile

let failures = 0
function check(label: string, ok: boolean, extra?: unknown) {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — got ${JSON.stringify(extra)}` : ''}`) }
}

const byName = (n: string) => EXERCISE_DATABASE.find(e => e.name === n)
const loadFor = (name: string) => {
  const e = byName(name)!
  return prescribeLoad(e, profile, { targetRpeLabel: 'RPE 7-8', isFirstBlock: true, sets: 3, repRangeLabel: '8-12' })
}

/** A slot as it really appears mid-mesocycle, carrying every per-exercise field. */
function slotFor(name: string, over: Partial<Exercise> = {}): Exercise {
  const e = byName(name)!
  return {
    id: e.id, name: e.name, sets: 3, reps: '8-12', rest: '90s', substitution: '',
    prescription_type: e.prescription_type,
    intensity: 'RPE 7-8', suggested_load: '~60kg', suggested_load_kg: 60,
    per_set_load: [{ set_number: 1, load_kg: 60, display: '60kg' }],
    ramp_up: { sets: [{ label: 'set 1', load_kg: 40, reps: 5 }] } as unknown as Exercise['ramp_up'],
    suggested_assistance_kg: 20, assistance_ready_to_graduate: false,
    ...over,
  }
}

console.log('\n[1] Units are re-derived when prescription_type changes (carry -> rep lift)')
{
  const carry = EXERCISE_DATABASE.find(e => e.prescription_type === 'distance_load')
  const repLift = EXERCISE_DATABASE.find(e => e.prescription_type === 'reps' && e.mechanics_tier !== 'primer')
  if (!carry || !repLift) { check('fixtures exist', false); }
  else {
    const out = applyReplacement(slotFor(carry.name, { reps: '40m', prescription_type: 'distance_load' }), repLift, loadFor(repLift.name))
    check('prescription_type follows the incoming exercise', out.prescription_type === 'reps', out.prescription_type)
    check('reps are no longer in metres', !/m$/.test(out.reps), out.reps)
  }
}

console.log('\n[2] Units are re-derived the other way (rep lift -> carry)')
{
  const carry = EXERCISE_DATABASE.find(e => e.prescription_type === 'distance_load')
  const repLift = EXERCISE_DATABASE.find(e => e.prescription_type === 'reps' && e.mechanics_tier !== 'primer')
  if (carry && repLift) {
    const out = applyReplacement(slotFor(repLift.name), carry, loadFor(carry.name))
    check('prescription_type follows the incoming exercise', out.prescription_type === 'distance_load', out.prescription_type)
    check('a measured carry is prescribed in metres, not reps', /m$/.test(out.reps), out.reps)
  }
}

console.log('\n[3] A reps -> reps swap KEEPS the block\'s own rep prescription')
{
  const a = EXERCISE_DATABASE.filter(e => e.prescription_type === 'reps' && e.mechanics_tier !== 'primer')
  const out = applyReplacement(slotFor(a[0].name, { reps: '6-8' }), a[1], loadFor(a[1].name))
  check('reps unchanged on a same-units swap', out.reps === '6-8', out.reps)
}

console.log('\n[4] No outgoing-exercise data survives the replacement')
{
  const a = EXERCISE_DATABASE.filter(e => e.prescription_type === 'reps' && e.mechanics_tier !== 'primer')
  const out = applyReplacement(slotFor(a[0].name), a[1], loadFor(a[1].name))
  check('ramp_up (outgoing lift\'s warm-up kg ladder) cleared', out.ramp_up === undefined, out.ramp_up)
  check('suggested_assistance_kg cleared', out.suggested_assistance_kg === undefined, out.suggested_assistance_kg)
  check('assistance_ready_to_graduate cleared', out.assistance_ready_to_graduate === undefined, out.assistance_ready_to_graduate)
  check('superset_label cleared', out.superset_label === undefined, out.superset_label)
  check('name/id follow the incoming exercise', out.name === a[1].name && out.id === a[1].id, { n: out.name, i: out.id })
}

console.log('\n[5] Primer guard still holds (regression 1 above)')
{
  const primer = EXERCISE_DATABASE.find(e => e.mechanics_tier === 'primer')
  const repLift = EXERCISE_DATABASE.find(e => e.prescription_type === 'reps' && e.mechanics_tier !== 'primer')
  if (primer && repLift) {
    const out = applyReplacement(slotFor(repLift.name), primer, loadFor(repLift.name))
    check('a primer never carries a numeric load', out.suggested_load_kg === null, out.suggested_load_kg)
    check('a primer never carries a per-set ladder', out.per_set_load === null, out.per_set_load)
    check('a primer\'s intensity is forced, not inherited', out.intensity === 'Light — movement prep', out.intensity)
  }
}

// MOVED TO THE BOTTOM, 17 Sep 2026. This line used to sit HERE, above section
// [6] — so every check below it printed FAIL and the gate still exited 0.
// MEASURED by breaking section [6]'s last check on purpose: it printed
// "FAIL: the query still finds the live sibling", then "All slot-replacement
// hygiene checks passed", then exit 0. Section [6] had been decorative since
// the day it was written. CLAUDE.md's rule — a gate has exactly ONE exit, and
// one that can print FAIL and exit 0 is worse than no gate, because the tick
// is now evidence.
console.log('\n[6] The swap search offers only live entries')
{
  // A retired entry stays in the DB so history keeps resolving, and
  // getConstrainedPool already filters it out of NEW plans — but
  // searchExerciseCatalog (the free-search box in both swap dialogs) was
  // reading the raw array, so the one path built for "record what I
  // actually did" was also the one path still offering a retired movement.
  // Derived from the DB, not a name list: every retired entry, whatever is
  // retired in future, must be unfindable by its own exact name.
  const retired = EXERCISE_DATABASE.filter(e => e.retired)
  check('there is at least one retired entry, so this has teeth', retired.length >= 1, retired.length)
  for (const e of retired) {
    check(`search cannot surface retired "${e.name}"`,
      !searchExerciseCatalog(e.name).some(r => r.name === e.name))
  }
  // The skip must be the reason, not query luck: the same query that names
  // the retired row still returns its live replacement.
  check('the query still finds the live sibling (Seated Cable Row)',
    searchExerciseCatalog('cable row').some(r => r.name === 'Seated Cable Row'))
  // The picker's own search must not reopen the hole this section closed.
  for (const e of retired) {
    check(`the picker search cannot surface retired "${e.name}" either`,
      !searchExerciseCatalogByWords(e.name).some(r => r.name === e.name))
  }
}

console.log('\n[7] The picker finds what a person actually types')
{
  // Ashley, 17 Sep 2026, standing in a gym mid-session: "Iso lateral leg curl
  // isn't available as a swap". It was in the catalogue the whole time. Typing
  // her exact words returned "No matching exercise found", because the strict
  // matcher wants ONE CONTIGUOUS SUBSTRING and the entry is called
  // "Iso-Lateral Kneeling Leg Curl" — her hyphen missing, and the word
  // "Kneeling" sitting in the middle of the phrase.
  //
  // That box is the escape hatch she RULED FOR on 13 Sep 2026 ("show
  // everything, warn me"), so a search that cannot find her own words makes
  // her ruling untrue in practice rather than merely inconvenient.
  //
  // MEASURED, and it was never about one exercise: 49 of the 200 live entries
  // could not be found by typing their OWN NAME without punctuation — every
  // Push-Ups variant, T-Bar Rows, Chest-Supported Row, Neutral-Grip anything.
  const depunct = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const live = EXERCISE_DATABASE.filter(e => !e.retired)
  check('there are enough live entries for this to mean something', live.length > 100, live.length)

  // THE PROPERTY, derived from the database rather than a hand-written list,
  // so it keeps holding for entries nobody has added yet: if you type an
  // exercise's name the way a person types — no hyphens, no capitals — the
  // picker finds it.
  const unfindable = live.filter(e => !searchExerciseCatalogByWords(depunct(e.name), 60).some(r => r.name === e.name))
  check('every live exercise is findable by its own name, typed without punctuation',
    unfindable.length === 0, unfindable.slice(0, 8).map(e => e.name))

  // Her literal case, kept beside the general property because a general
  // property that happens to pass says nothing about the report it came from.
  check('"iso lateral leg curl" finds the Iso-Lateral Kneeling Leg Curl',
    searchExerciseCatalogByWords('iso lateral leg curl', 20).some(r => r.name === 'Iso-Lateral Kneeling Leg Curl'))

  // THE SEPARATION IS THE POINT, and this is the half that protects her plan.
  // searchExerciseCatalog's other two callers are RESOLVERS: fact-compiler
  // turns a typed phrase into a hard exercise BAN over every name returned,
  // and set-parse keys on "exactly one match" to decide a logged set is
  // unambiguous. Widening THAT function would silently ban more than she
  // named. So the two must stay measurably different, and a future tidy-up
  // that unifies them has to fail here rather than pass quietly.
  check('the strict matcher is NOT widened — it still needs one contiguous run',
    searchExerciseCatalog('iso lateral leg curl', 20).length === 0,
    searchExerciseCatalog('iso lateral leg curl', 20).map(r => r.name))
  check('...and the ban resolver therefore still resolves to what it always did',
    searchExerciseCatalog('leg curl', 50).length === 7, searchExerciseCatalog('leg curl', 50).length)

  // RECALL MUST NOT BECOME NOISE. Every word typed has to appear, so a
  // hamstring query can never drag in a quad machine.
  const legCurl = searchExerciseCatalogByWords('leg curl', 30).map(r => r.name)
  check('"leg curl" returns curls', legCurl.includes('Lying Leg Curl') && legCurl.includes('Seated Leg Curl'))
  check('...and never a Leg Press', !legCurl.includes('Leg Press'), legCurl)

  // PROVE THE DETECTOR, so this section cannot go vacuous if the matcher is
  // ever loosened to "any word matches" — which would make every check above
  // pass while the box returned the whole catalogue.
  check('a word that appears nowhere finds nothing',
    searchExerciseCatalogByWords('zebra curl', 30).length === 0,
    searchExerciseCatalogByWords('zebra curl', 30).map(r => r.name))
  check('...and a single word is still handled by the strict matcher alone',
    searchExerciseCatalogByWords('deadlift', 30).length === searchExerciseCatalog('deadlift', 30).length)
}

if (failures > 0) { console.error(`\n${failures} check(s) FAILED.`); process.exit(1) }
console.log('\nAll slot-replacement hygiene checks passed.')
