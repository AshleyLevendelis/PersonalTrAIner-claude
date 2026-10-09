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
import { EXERCISE_DATABASE, isBallisticMovement, searchExerciseCatalog, searchExerciseCatalogByWords } from '../src/lib/exercise-db'
import { prescribeLoad } from '../src/lib/load-prescription'
import { generateExercisePlan, generateMesocycle, isTempoEligible, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { substituteForInjury } from '../src/lib/plan-adaptations'
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

console.log('\n[3] With no programming handed in, the slot\'s own rep range is copied (the ADD path)')
{
  // RE-LABELLED 9 Oct 2026, behaviour unchanged. This used to read "a reps ->
  // reps swap KEEPS the block's own rep prescription", and that was the rule
  // for every replacement until M32 showed what it cost: a slot's reps are the
  // block's range AFTER the outgoing lift's own levers have worked on it (a
  // band kickback walked to 16-19 handed that to a loaded dumbbell lift).
  // Swap, ban, injury/kit adaptation and session rebuild now pass the incoming
  // lift's OWN programming (buildReplacementSlot; held by
  // test:replacement-prescription). What is left on this bare call is the ADD
  // path, which has no outgoing exercise and copies a peer on purpose.
  const a = EXERCISE_DATABASE.filter(e => e.prescription_type === 'reps' && e.mechanics_tier !== 'primer')
  const out = applyReplacement(slotFor(a[0].name, { reps: '6-8' }), a[1], loadFor(a[1].name))
  check('reps copied from the template when no programming is passed', out.reps === '6-8', out.reps)
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

// ---------------------------------------------------------------------------
// 9 Oct 2026 — the FOURTH, FIFTH and SIXTH fields to leak through this one
// function, found on a tester's plan ("2s down · drive up" on a Kettlebell
// Swing and on a timed Spanish Squat hold), and the reason sections [8]-[10]
// stop testing fields one at a time.
//
// Sections [4] and [5] above each name the fields somebody had already been
// bitten by. That is why `tempo` got through: the gate could only ever hold
// what had already gone wrong. [9] holds the CLASS instead — a field the gate
// has never heard of must not survive either.
// ---------------------------------------------------------------------------
console.log('\n[8] A tempo cue follows the INCOMING exercise, never the outgoing one')
{
  const bw = (n: string) => slotFor(n, { tempo: '2-0-1', suggested_load: 'Bodyweight', suggested_load_kg: null, per_set_load: null, reps: '10-12' })
  const bodyweightLoad = (n: string) => prescribeLoad(byName(n)!, profile, { targetRpeLabel: 'RPE 7-8', sets: 3, repRangeLabel: '10-12' })

  // The tester's two rows, by name, because a general property that happens
  // to pass says nothing about the report it came from.
  const hold = applyReplacement(bw('Box Squat (Bodyweight)'), byName('Spanish Squat')!, bodyweightLoad('Spanish Squat'))
  check('Spanish Squat is a timed hold after the swap', /s$/.test(hold.reps), hold.reps)
  check('...and a timed hold carries no tempo', hold.tempo === undefined, hold.tempo)

  const swing = applyReplacement(bw('Single-Leg Glute Bridge'), byName('Kettlebell Swing (Heavy)')!, loadFor('Kettlebell Swing (Heavy)'))
  check('Kettlebell Swing (Heavy) carries a weight after the swap', typeof swing.suggested_load_kg === 'number', swing.suggested_load_kg)
  check('...and a loaded, ballistic lift carries no tempo', swing.tempo === undefined, swing.tempo)

  // THE OTHER HALF, or "clear it always" would pass everything above. Where
  // there is still no weight to add, the block's tempo is still the lever and
  // must stay: a tempo'd bodyweight squat swapped for another bodyweight,
  // rep-counted lift keeps it.
  const stays = applyReplacement(bw('Box Squat (Bodyweight)'), byName('Glute Bridge')!, bodyweightLoad('Glute Bridge'))
  check('a weightless rep-counted lift KEEPS the block\'s tempo', stays.tempo === '2-0-1', stays.tempo)
  // ...and nothing invents one: an outgoing slot with no tempo (a deload week,
  // a power block) hands none on.
  const none = applyReplacement({ ...bw('Box Squat (Bodyweight)'), tempo: undefined }, byName('Glute Bridge')!, bodyweightLoad('Glute Bridge'))
  check('no tempo in, no tempo out', none.tempo === undefined, none.tempo)

  // THE PROPERTY, over the whole catalogue rather than three names: whatever
  // comes in, the slot carries a tempo only if generation's own rule would
  // have given that exercise one.
  const live = EXERCISE_DATABASE.filter(e => !e.retired)
  const wrong: string[] = []
  let kept = 0
  for (const incoming of live) {
    const load = prescribeLoad(incoming, profile, { targetRpeLabel: 'RPE 7-8', sets: 3, repRangeLabel: '10-12' })
    const out = applyReplacement(bw('Box Squat (Bodyweight)'), incoming, load, profile)
    const eligible = isTempoEligible(incoming, out, 'intermediate')
    if (out.tempo !== undefined) kept++
    if ((out.tempo !== undefined) !== eligible) wrong.push(`${incoming.name}:${out.tempo ?? 'none'}`)
    if (out.tempo !== undefined && (incoming.prescription_type !== 'reps' || isBallisticMovement(incoming) || incoming.mechanics_tier === 'primer')) {
      wrong.push(`${incoming.name} is a hold/carry/interval/ballistic/primer with a tempo`)
    }
  }
  check(`across all ${live.length} live exercises, tempo survives exactly where generation would give one`, wrong.length === 0, wrong.slice(0, 8))
  check('...and that is a real choice: some keep it and most do not', kept > 10 && kept < live.length - 10, kept)
  // THE ONE LOADED LIFT THAT KEEPS IT, by Ashley's ruling ("slow the movement
  // down"): a backpack sitting on its ceiling has no more weight to add. Held
  // here so "a weight means no tempo" cannot be simplified into the rule.
  {
    const bag = byName('Backpack Row')!
    const bagLoad = prescribeLoad(bag, profile, { targetRpeLabel: 'RPE 7-8', sets: 3, repRangeLabel: '10-12' })
    const out = applyReplacement(bw('Box Squat (Bodyweight)'), bag, bagLoad, profile)
    check('a backpack at its limit keeps the tempo (20kg for an intermediate)', out.suggested_load_kg === 20 && out.tempo === '2-0-1', { kg: out.suggested_load_kg, tempo: out.tempo })
    const unknown = applyReplacement(bw('Box Squat (Bodyweight)'), bag, bagLoad)
    check('...but with no experience to read the limit from, a weighted lift is not guessed at', unknown.tempo === undefined, unknown.tempo)
  }

  // PROVE THE BALLISTIC DETECTOR, so it cannot go vacuous: every entry whose
  // own coaching note or cues call it ballistic, explosive or a jump/slam must
  // answer true, and an ordinary lift must not.
  const saysBallistic = live.filter(e => /ballistic|explosive/i.test([e.coach_note_swap, ...(e.form_cues ?? [])].join(' ')) && e.prescription_type === 'reps')
  const missed = saysBallistic.filter(e => !isBallisticMovement(e)).map(e => e.name)
  check(`every rep-counted entry the catalogue itself calls ballistic/explosive is caught (${saysBallistic.length})`, saysBallistic.length >= 3 && missed.length === 0, missed)
  // The eligibility rule holds it in its own right, not by the accident that
  // today's one working-set swing always carries a weight: a swing with no
  // number on it ("choose by feel") is still not slowed down.
  check('a swing with no weight on it is still not tempo-eligible',
    isTempoEligible(byName('Kettlebell Swing (Heavy)')!, { suggested_load_kg: null, reps: '10-12' }, 'intermediate') === false)
  // Belt and braces, each half held on its own: the entry says what the
  // movement IS and the string says what was actually written, and the two
  // have disagreed before ("8-12" left on a carry). Either alone refuses.
  check('a hold is refused by what it IS, even holding a rep-count string',
    isTempoEligible(byName('Spanish Squat')!, { suggested_load_kg: null, reps: '10-12' }, 'intermediate') === false)
  check('...and a rep lift is refused when its string is not a rep count',
    isTempoEligible(byName('Glute Bridge')!, { suggested_load_kg: null, reps: '30-45s' }, 'intermediate') === false)
  check('...while an ordinary weightless rep lift is', isTempoEligible(byName('Glute Bridge')!, { suggested_load_kg: null, reps: '10-12' }, 'intermediate') === true)
  check('...and a squat, a curl and a leg swing warm-up are not', !isBallisticMovement(byName('Barbell Squats')!) && !isBallisticMovement(byName('Hammer Curls')!) && !isBallisticMovement(byName('Leg Swings')!))
}

console.log('\n[9] The slot is BUILT from the incoming exercise — nothing unlisted can ride along')
{
  const a = EXERCISE_DATABASE.filter(e => e.prescription_type === 'reps' && e.mechanics_tier !== 'primer' && !e.retired)
  // Every per-exercise field the type has today that describes the lift that
  // was THERE, each set to a value that would be a lie on the lift coming in —
  // plus one the type does not have, standing in for the next field somebody
  // adds. A spread-and-delete implementation passes every named field it
  // remembered and fails on the one it did not.
  const stuffed = {
    ...slotFor(a[0].name),
    tempo: '4-1-1',
    suggested_added_load_kg: 17.5,
    load_source: 'known_weight',
    load_hold: 'unaffordable_step',
    rep_bump: 'bought',
    distance_bump: 'walked',
    selection_note: 'Picked over the runner-up for its lower joint stress.',
    block_hold_note: 'Held from last block — no progress logged.',
    substitution: 'Some Other Lift',
    superset_label: 'A',
    a_field_nobody_has_written_yet: 'belongs to the outgoing exercise',
  } as unknown as Exercise
  const load = loadFor(a[1].name)
  const out = applyReplacement(stuffed, a[1], load) as unknown as Record<string, unknown>

  check('a field this gate has never heard of does not survive', !('a_field_nobody_has_written_yet' in out) || out.a_field_nobody_has_written_yet === undefined, Object.keys(out))
  check('load_hold (why the OUTGOING weight was stuck) does not survive', out.load_hold === undefined || out.load_hold === (load.hold ?? undefined), out.load_hold)
  check('rep_bump (the outgoing lift\'s frozen-weight rep) does not survive', out.rep_bump === undefined, out.rep_bump)
  check('distance_bump does not survive', out.distance_bump === undefined, out.distance_bump)
  check('block_hold_note does not survive', out.block_hold_note === undefined, out.block_hold_note)
  check('selection_note does not survive', out.selection_note === undefined, out.selection_note)
  check('suggested_added_load_kg (a belt weight) does not survive', out.suggested_added_load_kg === undefined, out.suggested_added_load_kg)
  check('load_source describes the incoming prescription, not the outgoing one', out.load_source === load.load_source, out.load_source)
  check('a loaded lift still carrying a weight takes no tempo', out.tempo === undefined, out.tempo)
  // What a replacement is ALLOWED to carry, stated so that "return nothing"
  // cannot pass: the slot's own programming and effort.
  check('sets, rest and effort ARE carried — that is the slot\'s programming', out.sets === stuffed.sets && out.rest === stuffed.rest && out.intensity === stuffed.intensity, { s: out.sets, r: out.rest, i: out.intensity })
  check('...and the incoming lift has its weight', out.suggested_load_kg === load.starting_weight_kg && out.suggested_load === load.display, { kg: out.suggested_load_kg, d: out.suggested_load })
}

async function endToEnd() {
  console.log('\n[10] End to end: the tester\'s knee adaptation, on a seeded build of his plan')
  // Minimalist, bodybuilding, Mon/Tue/Thu/Sat, 30-45 min, intermediate,
  // shoulder flag, fat loss, 24kg dumbbells — the profile the report came
  // from. Seeded, because selection carries a random tie-break.
  setRandomSource(seededRngFromKey('sam:2'))
  try {
    const sam = {
      ...profile, fitness_goal: 'fat_loss', equipment_access: 'minimalist', injuries: ['shoulders'],
      training_style: 'bodybuilding', session_duration_preference: '30-45', max_dumbbell_kg: 24,
      training_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        .map(day => ({ day, available: ['Monday', 'Tuesday', 'Thursday', 'Saturday'].includes(day) })),
    } as unknown as UserProfile
    const meso = generateMesocycle(sam, generateExercisePlan(sam, []).plan)
    const before = new Map<string, string>()
    for (const w of meso) for (const d of w.days) for (const e of d.exercises) before.set(`${w.week_number}|${d.day}|${e.name}`, e.reps)
    const { mesocycle: after, touchedSlots } = await substituteForInjury({ mesocycle: meso, profile: sam, injuryCode: 'knees', weekNumbers: [1, 2], exclusions: [] })
    check('the adaptation changed something, so this has teeth', touchedSlots.filter(t => t.after).length >= 4, touchedSlots.length)

    const incoming = new Set(touchedSlots.filter(t => t.after).map(t => `${t.weekNumber}|${t.dayName}|${t.after}`))
    const leaks: string[] = []
    let seen = 0
    for (const w of after) for (const d of w.days) for (const e of d.exercises) {
      if (!incoming.has(`${w.week_number}|${d.day}|${e.name}`)) continue
      seen++
      const entry = byName(e.name)
      if (e.tempo !== undefined && !isTempoEligible(entry, e, 'intermediate')) leaks.push(`${e.name} ${e.reps} ${e.suggested_load} tempo=${e.tempo}`)
      if (e.rep_bump !== undefined) leaks.push(`${e.name} rep_bump=${e.rep_bump}`)
      if (e.suggested_load_kg == null && e.load_hold !== undefined) leaks.push(`${e.name} has no weight but load_hold=${e.load_hold}`)
    }
    check(`all ${seen} replaced slots were inspected`, seen === incoming.size && seen >= 4, { seen, expected: incoming.size })
    check('no replaced slot carries the outgoing lift\'s tempo, rep bump or hold reason', leaks.length === 0, leaks.slice(0, 6))
  } finally {
    resetRandomSource()
  }
}

endToEnd().then(() => {
  if (failures > 0) { console.error(`\n${failures} check(s) FAILED.`); process.exit(1) }
  console.log('\nAll slot-replacement hygiene checks passed.')
}).catch(err => { console.error(err); process.exit(1) })
