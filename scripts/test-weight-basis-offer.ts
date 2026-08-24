// ---------------------------------------------------------------------------
// Gate for the weight-basis rebuild offer (src/lib/weight-basis-offer.ts +
// rebuildForWeightBasis in plan-adaptations.ts).
//
// The rules, stated once:
//
//   OFFERED only when the stored plan was built on a body we invented, a real
//   weight now exists, nothing was declined, AND a rebuild would actually
//   change something on screen.
//   REBUILT never touches a week the trainee has already lived through, and
//   never renumbers a week anything else might be holding a reference to.
//   NEVER writes back the weight — profile.weight_kg is formally the
//   immutable onboarding number.
//
// Why a gate and not a code review — every one of these was earned:
//
//   - A rebuild that renumbered weeks would orphan every logged set, every
//     load_suggestions row keyed by block_number, and the active session,
//     while looking perfectly correct in isolation.
//   - A rebuild that reached backwards would silently disagree with sets the
//     trainee had already logged.
//   - "The plan holds assumed_body loads" looks like the eligibility rule and
//     is not. Someone who declined weight, age AND sex still has an unknown
//     sex after a weight rebuild, so that flag stays true forever and the
//     offer would re-ask on every app load. This gate caught it.
//   - The headline change was written as "largest INCREASE", which silently
//     skipped the one case with a real safety cost: a trainee LIGHTER than
//     the light stand-in, currently carrying numbers too heavy for them. This
//     gate caught that too.
//
// The over-firing half matters as much as the invariant half: someone who
// gave their weight at signup must never see this offer at all, because for
// them there is nothing dishonest to correct — that is ordinary weight drift,
// deliberately out of scope.
//
// Everything asserted here is pure. The Supabase-backed halves
// (checkForWeightBasisOffer's row reads/writes, confirmWeightBasisOffer's
// save) are not exercised — this environment has no database egress, and the
// rules worth protecting are the ones above, not the CRUD.
// ---------------------------------------------------------------------------

import {
  planHasAssumedBodyLoads,
  rebuildableWeekNumbers,
  rebuildChangesAnything,
  headlineChange,
  offerText,
} from '../src/lib/weight-basis-offer'
import { rebuildForWeightBasis } from '../src/lib/plan-adaptations'
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import type { UserProfile, MesocycleWeek } from '../src/lib/types'

let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function buildProfile(overrides: Partial<UserProfile>): UserProfile {
  return {
    age: 35, gender: 'male', height_cm: 180, weight_kg: 85,
    activity_level: 'moderate', fitness_goal: 'hypertrophy', preferred_time: 'morning',
    bmr: 1800, tdee: 2500, equipment_access: 'full_gym', injuries: [],
    training_style: 'bodybuilding', training_experience: 'intermediate',
    session_duration_preference: '60-90', workout_split_preference: 'ai_recommendation',
    training_days: [
      { day: 'Monday', available: true },
      { day: 'Tuesday', available: false },
      { day: 'Wednesday', available: true },
      { day: 'Thursday', available: false },
      { day: 'Friday', available: true },
      { day: 'Saturday', available: false },
      { day: 'Sunday', available: false },
    ],
    weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
    exercise_exclusions: [] as unknown as never,
    macro_calculation_mode: 'STANDARD_STATIC', coaching_persona: 'supportive',
    recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
    ...overrides,
  } as UserProfile
}

function withoutBody(p: UserProfile): UserProfile {
  const out = { ...p }
  delete (out as Record<string, unknown>).weight_kg
  delete (out as Record<string, unknown>).age
  delete (out as Record<string, unknown>).gender
  return out
}

function generate(profile: UserProfile, seed: string): MesocycleWeek[] {
  setRandomSource(seededRngFromKey(seed))
  const d = console.debug, w = console.warn
  console.debug = () => {}; console.warn = () => {}
  try { return generateMesocycle(profile) } finally { console.debug = d; console.warn = w; resetRandomSource() }
}

// The trainee this whole feature exists for: declined every body metric at
// signup, so their plan was built on the light stand-in, and they really
// weigh 100kg.
const DECLINED = withoutBody(buildProfile({ training_experience: 'intermediate' }))
const REAL_WEIGHT_KG = 100
const STATED = buildProfile({ weight_kg: REAL_WEIGHT_KG })

const declinedPlan = generate(DECLINED, 'wbo')
const statedPlan = generate(STATED, 'wbo')

// ---------------------------------------------------------------------------
console.log('\n1. Offered only when there is something dishonest to correct')
// ---------------------------------------------------------------------------
{
  check('a plan built on an assumed body is eligible', planHasAssumedBodyLoads(declinedPlan))
  check('a plan built on a real body is NOT', !planHasAssumedBodyLoads(statedPlan))

  // The specific over-fire this guards: 'estimate' is also unverified, but it
  // came from metrics the user DID give. Rebuilding those is ordinary weight
  // drift, deliberately out of scope — so the check must key on
  // 'assumed_body' exactly, not on isUnverifiedLoadSource.
  const sources = new Set<string>()
  for (const wk of statedPlan) for (const day of wk.days) for (const ex of day.exercises) {
    if (ex.suggested_load_kg != null) sources.add(ex.load_source ?? '(unset)')
  }
  check('...and the stated plan really is full of plain estimates',
    sources.has('estimate') && !sources.has('assumed_body'), [...sources].join(','))

  check('an empty plan is never eligible', !planHasAssumedBodyLoads([]))

  // Once a rebuild has happened the offer must stop firing, or it re-asks
  // forever — and this is exactly where the cheap pre-gate is NOT enough.
  // Someone who declined weight, age and sex still has an unknown sex after a
  // weight-only rebuild, so their loads stay correctly marked 'assumed_body'
  // and the pre-gate stays true. rebuildChangesAnything is what goes quiet.
  // The stored plan after a confirm is rebuildForWeightBasis' OWN output, so
  // that is what the re-check has to run against — building a stand-in by
  // hand would compare two differently-seeded generations and prove nothing.
  const allWeeks = rebuildableWeekNumbers(declinedPlan, 1)
  const rebuildArgs = {
    profile: DECLINED, basisWeightKg: REAL_WEIGHT_KG, exclusions: [], weekNumbers: allWeeks,
  }
  const rebuiltAll = await rebuildForWeightBasis({ ...rebuildArgs, mesocycle: declinedPlan })
  check('the un-rebuilt plan DOES change, so it is offered',
    rebuildChangesAnything(declinedPlan, rebuiltAll, allWeeks))
  check('a weight-only rebuild is STILL flagged assumed_body (sex is still a guess)',
    planHasAssumedBodyLoads(rebuiltAll))
  const second = await rebuildForWeightBasis({ ...rebuildArgs, mesocycle: rebuiltAll })
  check('...but re-previewing it changes nothing, so it is never re-offered',
    !rebuildChangesAnything(rebuiltAll, second, allWeeks))

  // Reproducibility is what makes that true, and it is worth asserting
  // directly: preview and confirm are two separate generation runs, and if
  // they disagreed the offer could name a lift the applied rebuild never
  // contained.
  const previewA = await rebuildForWeightBasis({ ...rebuildArgs, mesocycle: declinedPlan })
  const previewB = await rebuildForWeightBasis({ ...rebuildArgs, mesocycle: declinedPlan })
  check('two runs of the same rebuild produce the same plan',
    !rebuildChangesAnything(previewA, previewB, allWeeks) &&
    JSON.stringify(previewA) === JSON.stringify(previewB))
}

// ---------------------------------------------------------------------------
console.log('\n2. A rebuild never reaches backwards')
// ---------------------------------------------------------------------------
{
  const liveWeek = 6
  const weeks = rebuildableWeekNumbers(declinedPlan, liveWeek)
  check('the live week is included', weeks.includes(liveWeek))
  check('nothing before it is', weeks.every(w => w >= liveWeek), `min=${Math.min(...weeks)}`)
  check('everything after it is', weeks.length === declinedPlan.length - (liveWeek - 1), String(weeks.length))
  check('week 1 live means the whole plan', rebuildableWeekNumbers(declinedPlan, 1).length === declinedPlan.length)
}

// ---------------------------------------------------------------------------
console.log('\n3. The rebuild itself')
// ---------------------------------------------------------------------------
{
  const liveWeek = 6
  const weekNumbers = rebuildableWeekNumbers(declinedPlan, liveWeek)
  const before = declinedPlan
  const after = await rebuildForWeightBasis({
    profile: DECLINED, basisWeightKg: REAL_WEIGHT_KG, exclusions: [], mesocycle: before, weekNumbers,
  })

  check('every week still exists', after.length === before.length)
  check('week identity is preserved', after.every((w, i) =>
    w.week_number === before[i].week_number &&
    w.block_number === before[i].block_number &&
    w.label === before[i].label &&
    w.phase_label === before[i].phase_label))

  // Past weeks must be the SAME objects, not equal-looking rebuilds — the
  // strongest form of "history was not touched".
  const pastUntouched = before.slice(0, liveWeek - 1).every((w, i) => after[i] === w)
  check('past weeks are returned untouched, by identity', pastUntouched)

  const loadsOf = (weeks: MesocycleWeek[], weekNumber: number) => {
    const wk = weeks.find(w => w.week_number === weekNumber)
    const out = new Map<string, number>()
    for (const day of wk?.days ?? []) for (const ex of day.exercises) {
      if (ex.suggested_load_kg != null && !out.has(ex.name)) out.set(ex.name, ex.suggested_load_kg)
    }
    return out
  }
  const beforeLive = loadsOf(before, liveWeek)
  const afterLive = loadsOf(after, liveWeek)
  let heavier = 0, compared = 0
  for (const [name, kg] of beforeLive) {
    const now = afterLive.get(name)
    if (now == null) continue
    compared++
    if (now > kg) heavier++
  }
  check(`the live week's loads actually move (${heavier} of ${compared} shared lifts heavier)`,
    compared > 0 && heavier > 0, `${heavier}/${compared}`)

  // A weight-only rebuild does NOT clear the assumed-body label, and must
  // not: this profile still has no sex or age on record, and sex is the
  // larger half of the standards error. Claiming 'estimate' here would be the
  // app asserting it knew a body it does not — the exact untruth item 2b
  // exists to stop. The chips correctly keep reading "starting light".
  const rebuiltSources = new Set<string>()
  for (const w of after) {
    if (w.week_number < liveWeek) continue
    for (const day of w.days) for (const ex of day.exercises) {
      if (ex.suggested_load_kg != null) rebuiltSources.add(ex.load_source ?? '(unset)')
    }
  }
  check('rebuilt weeks stay marked assumed_body while sex is still unknown',
    rebuiltSources.has('assumed_body'), [...rebuiltSources].join(','))

  // ...whereas a profile that gave everything but its weight ends up honest,
  // because after the rebuild nothing about its body is assumed any more.
  const weightOnlyGap = { ...buildProfile({}), weight_kg: undefined } as UserProfile
  const gapPlan = generate(weightOnlyGap, 'wbo2')
  const gapRebuilt = await rebuildForWeightBasis({
    profile: weightOnlyGap, basisWeightKg: 85, exclusions: [],
    mesocycle: gapPlan, weekNumbers: rebuildableWeekNumbers(gapPlan, 1),
  })
  const gapSources = new Set<string>()
  for (const w of gapRebuilt) for (const day of w.days) for (const ex of day.exercises) {
    if (ex.suggested_load_kg != null) gapSources.add(ex.load_source ?? '(unset)')
  }
  check('a weight-only GAP rebuilds to an honest estimate', !gapSources.has('assumed_body'),
    [...gapSources].join(','))
  check('...and that provenance flip alone counts as a change worth offering',
    rebuildChangesAnything(gapPlan, gapRebuilt, rebuildableWeekNumbers(gapPlan, 1)))

  // The separation rule, same one test:injury-separation protects for
  // injuries: the clone is local, the profile row is the caller's business.
  check('the caller\'s profile is not mutated', DECLINED.weight_kg === undefined, String(DECLINED.weight_kg))
}

// ---------------------------------------------------------------------------
console.log('\n4. What they are shown before they agree')
// ---------------------------------------------------------------------------
{
  const weekNumbers = rebuildableWeekNumbers(declinedPlan, 1)
  const after = await rebuildForWeightBasis({
    profile: DECLINED, basisWeightKg: REAL_WEIGHT_KG, exclusions: [], mesocycle: declinedPlan, weekNumbers,
  })
  const change = headlineChange(declinedPlan, after, weekNumbers)
  check('a real change is found', change != null)
  check('it moves, in whichever direction', change != null && change.toKg !== change.fromKg,
    change ? `${change.fromKg} -> ${change.toKg}` : '')
  check('it names a real exercise', !!change?.exercise && change.exercise.length > 2, change?.exercise)
  console.log(`      headline: ${change?.exercise} ${change?.fromKg}kg -> ${change?.toKg}kg`)

  // The headline must be the LARGEST change, not merely the first found —
  // showing a 2kg move while a 35kg one is waiting in the same plan would be
  // technically true and functionally a lie.
  let largest = 0
  const afterByWeek = new Map(after.map(w => [w.week_number, w]))
  for (const wk of declinedPlan) {
    const rebuilt = afterByWeek.get(wk.week_number)
    if (!rebuilt) continue
    const byName = new Map<string, number>()
    for (const d of rebuilt.days) for (const e of d.exercises) {
      if (e.suggested_load_kg != null && !byName.has(e.name)) byName.set(e.name, e.suggested_load_kg)
    }
    for (const d of wk.days) for (const e of d.exercises) {
      const to = e.suggested_load_kg == null ? null : byName.get(e.name)
      if (to == null || e.suggested_load_kg == null) continue
      largest = Math.max(largest, Math.abs(to - e.suggested_load_kg))
    }
  }
  check('it is the largest change in the whole rebuild',
    change != null && Math.abs(change.toKg - change.fromKg) === largest,
    `${change ? Math.abs(change.toKg - change.fromKg) : '?'} vs ${largest}`)

  // The direction that carries the real risk: someone LIGHTER than the light
  // stand-in is currently carrying numbers too heavy for them. An earlier cut
  // reported only increases and would have skipped her entirely.
  const tiny = withoutBody(buildProfile({ training_experience: 'novice' }))
  const tinyPlan = generate(tiny, 'wbo3')
  const tinyWeeks = rebuildableWeekNumbers(tinyPlan, 1)
  const tinyRebuilt = await rebuildForWeightBasis({
    profile: tiny, basisWeightKg: 42, exclusions: [], mesocycle: tinyPlan, weekNumbers: tinyWeeks,
  })
  const tinyChange = headlineChange(tinyPlan, tinyRebuilt, tinyWeeks)
  check('a rebuild that makes loads LIGHTER is still reported', tinyChange != null,
    'a 42kg trainee on a 50kg stand-in must not be skipped')
  check('...and it is offered, not silently dropped', rebuildChangesAnything(tinyPlan, tinyRebuilt, tinyWeeks))
  if (tinyChange) console.log(`      lighter headline: ${tinyChange.exercise} ${tinyChange.fromKg}kg -> ${tinyChange.toKg}kg`)

  // Identical plans: nothing moves, and the copy must not pretend otherwise.
  const nothing = headlineChange(declinedPlan, declinedPlan, weekNumbers)
  check('no change is reported when nothing moved', nothing === null)
  const quietText = offerText(52, null)
  check('the "nothing moves" wording is honest, not silent',
    /barely changes/i.test(quietText) && !/would take/i.test(quietText), quietText)
  // The offer can fire twice (weight now, sex later), so no wording may claim
  // the weight was the missing piece — it won't be, the second time.
  check('neither wording claims the weight was what we were missing',
    !/didn't know what you weighed/i.test(quietText) && !/didn't know what you weighed/i.test(offerText(100, change!)))
  const loudText = offerText(100, change!)
  check('the "something moves" wording names the numbers',
    loudText.includes(change!.exercise) && loudText.includes(`${change!.toKg}kg`), loudText)
  check('both wordings state the weight they are based on', quietText.includes('52kg') && loudText.includes('100kg'))
}

console.log(failures === 0 ? '\nAll weight-basis offer checks passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
