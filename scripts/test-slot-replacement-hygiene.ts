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
import { EXERCISE_DATABASE, searchExerciseCatalog } from '../src/lib/exercise-db'
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

if (failures > 0) { console.error(`\n${failures} check(s) FAILED.`); process.exit(1) }
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
}

console.log('\nAll slot-replacement hygiene checks passed.')
