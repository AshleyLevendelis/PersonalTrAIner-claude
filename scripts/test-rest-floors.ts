/**
 * REST THAT SUITS THE EXERCISE.
 *
 * Ashley, from the gym floor 17 Sep 2026: "The rest breaks between the lat
 * pulldown seem very short 30s, check that is correct." It was not. Measured
 * across 1,728 profiles the next day: 49.2% of every exercise in a week rested
 * 30 seconds or less, and 29.1% of SECOND-TIER COMPOUNDS — the lat pulldown's
 * class, prescribed 75s by the hybrid style's own table — were at or under 30.
 *
 * Her ruling, 18 Sep 2026, from four options: PROTECT THE REST, DO LESS.
 *
 * This file holds the rule by CALLING it, not by reading it, and then proves
 * the rule survives a whole generated mesocycle — because the defect was never
 * in one function. Three passes cut rest independently (the day-level time
 * cap, the per-block week trimmer, the phase's own shift) and each was correct
 * on its own; what was wrong was that they all spent the same seconds.
 */
import { restFloorFor, unbudgetedRestSeconds, REST_FLOOR_BY_TIER, generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { STYLE_CONFIGS } from '../src/lib/exercise-plan'
import { PHASE_CONFIGS } from '../src/lib/periodization'
import { EXERCISE_DATABASE } from '../src/lib/exercise-db'
import type { UserProfile, TrainingStyle, SessionDuration, FitnessGoal, ExerciseTier } from '../src/lib/types'

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}

/**
 * SEEDED, OR THIS FILE FLIPS ON A TUESDAY. generateMesocycle picks exercises
 * through `randomSource`, which is Math.random unless a caller says otherwise
 * — so an unseeded run reads a different plan every time. The first version of
 * this gate was unseeded, passed, and failed on its very next run against
 * identical code. That is the exact failure CLAUDE.md records: a check that
 * flips with the roll means green is not evidence.
 */
const seeded = <T>(key: string, fn: () => T): T => {
  setRandomSource(seededRngFromKey(key))
  try { return fn() } finally { resetRandomSource() }
}

const entryFor = (name: string) => EXERCISE_DATABASE.find(e => e.name === name)
const tierOf = (name: string) => entryFor(name)?.mechanics_tier ?? 'unknown'

function profile(over: Record<string, unknown>): UserProfile {
  return {
    age: 34, gender: 'female', height_cm: 168, weight_kg: 70, activity_level: 'moderate',
    fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1500, tdee: 2200,
    equipment_access: 'full_gym', injuries: [], training_style: 'hybrid',
    training_experience: 'intermediate', session_duration_preference: '45-60',
    workout_split_preference: 'ai_recommendation',
    training_days: [
      { day: 'Monday', available: true }, { day: 'Tuesday', available: true },
      { day: 'Wednesday', available: false }, { day: 'Thursday', available: true },
      { day: 'Friday', available: true }, { day: 'Saturday', available: false },
      { day: 'Sunday', available: false },
    ],
    weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
    exercise_exclusions: [], macro_calculation_mode: 'STANDARD_STATIC',
    coaching_persona: 'supportive', recovery_capacity: 'moderate',
    conditioning_preference: 'tolerate',
    ...over,
  } as unknown as UserProfile
}

// ---------------------------------------------------------------------------
console.log('\n[1] The floor itself — called, not read')
{
  check('a second-tier compound prescribed 75s floors at 60',
    restFloorFor('tier_2_secondary', 75) === 60, restFloorFor('tier_2_secondary', 75))
  check('an isolation slot prescribed 60s floors at 45',
    restFloorFor('tier_3_isolation', 60) === 45, restFloorFor('tier_3_isolation', 60))

  // THE HALF THAT MAKES IT A FLOOR RATHER THAN A TABLE. Combat style
  // deliberately prescribes 45s isolation and a primer is 20s on purpose.
  // Reading the tier number as an absolute would rewrite those in the name of
  // protecting them.
  check('a floor NEVER raises a rest the plan deliberately set lower',
    restFloorFor('tier_3_isolation', 45) === 45
    && restFloorFor('tier_2_secondary', 40) === 40
    && restFloorFor('tier_0_primer', 20) === 20,
    [restFloorFor('tier_3_isolation', 45), restFloorFor('tier_2_secondary', 40), restFloorFor('tier_0_primer', 20)])
  check('...including a slot prescribed no rest at all',
    restFloorFor('tier_3_isolation', 0) === 0, restFloorFor('tier_3_isolation', 0))

  check('a main lift takes the goal floor it was handed, never the tier table',
    restFloorFor('tier_1_primary', 45, 90) === 90 && restFloorFor('tier_1_primary', 200) === REST_FLOOR_BY_TIER.tier_1_primary,
    [restFloorFor('tier_1_primary', 45, 90), restFloorFor('tier_1_primary', 200)])
  check('...and a promoted anchor gets the flat main-lift floor',
    restFloorFor('tier_3_isolation', 30, REST_FLOOR_BY_TIER.tier_1_primary) === REST_FLOOR_BY_TIER.tier_1_primary)

  // THE PARAMETER IS THE UNBUDGETED PRESCRIPTION, NOT THE LIVE VALUE, and
  // this is the case that forced it: a 60s isolation slot trimmed to 45 and
  // then shifted -15 by the adaptation phase lands on 30 — Ashley's number.
  // Asked against the baseline instead, the same case floors at 45.
  check('the floor is read off the prescription, so two passes cannot spend the same seconds twice',
    restFloorFor('tier_3_isolation', 60 - 15) === 45 && restFloorFor('tier_3_isolation', 45 - 15) === 30,
    [restFloorFor('tier_3_isolation', 45), restFloorFor('tier_3_isolation', 30)])
}

// ---------------------------------------------------------------------------
console.log('\n[2] The prescription the floor is read from')
{
  const pulldown = entryFor('Lat Pulldown')
  check('the catalogue still has the lift she reported, in the class she reported it in',
    !!pulldown && pulldown.mechanics_tier === 'tier2_compound', pulldown?.mechanics_tier)
  check('hybrid prescribes it 75s before any time pressure',
    unbudgetedRestSeconds(pulldown, 'hybrid') === 75, unbudgetedRestSeconds(pulldown, 'hybrid'))
  check('...and combat, which trains for density, prescribes 60s',
    unbudgetedRestSeconds(pulldown, 'combat') === 60, unbudgetedRestSeconds(pulldown, 'combat'))
  check('a phase that wants short rest is carried through, not overridden',
    unbudgetedRestSeconds(pulldown, 'hybrid', -20) === 55, unbudgetedRestSeconds(pulldown, 'hybrid', -20))

  // Cardio's rest is the bout, not the tier — every caller exempts it, and
  // this is the signal they exempt it BY.
  const bike = EXERCISE_DATABASE.find(e => e.mechanics_tier === 'cardio')
  check('cardio reports no tier prescription at all', unbudgetedRestSeconds(bike, 'hybrid') === null)
  check('...and so does an exercise the catalogue does not hold', unbudgetedRestSeconds(undefined, 'hybrid') === null)

  // EVERY STYLE, EVERY TIER, AGAINST THE TABLE ITSELF. A generated plan cannot
  // tell these apart wherever the tier floor happens to dominate the answer —
  // reading the second-tier column for an isolation slot changes nothing for a
  // hybrid trainee (min(75,45) and min(60,45) are both 45) and everything for
  // a combat one in a short-rest phase. Measured by mutation: the plan-level
  // checks below missed exactly that.
  const EXPECTED: Record<TrainingStyle, { tier1: number; tier2: number; tier3: number }> = {
    bodybuilding: { tier1: 120, tier2: 120, tier3: 60 },
    functional: { tier1: 90, tier2: 75, tier3: 60 },
    combat: { tier1: 75, tier2: 60, tier3: 45 },
    hybrid: { tier1: 90, tier2: 75, tier3: 60 },
  }
  const sample = {
    tier1: EXERCISE_DATABASE.find(e => e.mechanics_tier === 'tier1_compound')!,
    tier2: EXERCISE_DATABASE.find(e => e.mechanics_tier === 'tier2_compound')!,
    tier3: EXERCISE_DATABASE.find(e => e.mechanics_tier === 'tier3_isolation')!,
  }
  for (const style of Object.keys(EXPECTED) as TrainingStyle[]) {
    const got = {
      tier1: unbudgetedRestSeconds(sample.tier1, style),
      tier2: unbudgetedRestSeconds(sample.tier2, style),
      tier3: unbudgetedRestSeconds(sample.tier3, style),
    }
    check(`${style} reads its own row of the rest table, column by column`,
      got.tier1 === EXPECTED[style].tier1 && got.tier2 === EXPECTED[style].tier2 && got.tier3 === EXPECTED[style].tier3,
      { style, got, expected: EXPECTED[style] })
  }
}

// ---------------------------------------------------------------------------
console.log('\n[3] A whole generated plan — the defect was never in one function')
{
  // Four profiles across the spread, every week, every day. A source check
  // could not catch this: three independent passes cut rest, and the failure
  // was their SUM.
  const CASES: { label: string; p: UserProfile }[] = [
    { label: 'hybrid 45-60', p: profile({}) },
    { label: 'hybrid 30-45 (the tightest budget)', p: profile({ session_duration_preference: '30-45' as SessionDuration }) },
    { label: 'bodybuilding 45-60', p: profile({ training_style: 'bodybuilding' as TrainingStyle }) },
    { label: 'combat 30-45 (a style that wants short rest)', p: profile({ training_style: 'combat' as TrainingStyle, session_duration_preference: '30-45' as SessionDuration, fitness_goal: 'conditioning' as FitnessGoal }) },
    // THE SQUEEZED CASE, and the reason it is named separately: the trimmers
    // only run on a day that is OVER budget, so a gate built from comfortable
    // profiles never reaches the code it exists to hold. Measured by mutation
    // — reverting the day-level pass to its old flat 30 was MISSED until this
    // row was added. Six days a week at the shortest session, training for
    // size, is the combination that squeezes hardest.
    { label: 'bodybuilding 30-45, six days (the squeezed case)', p: profile({
      training_style: 'bodybuilding' as TrainingStyle,
      session_duration_preference: '30-45' as SessionDuration,
      training_days: [
        { day: 'Monday', available: true }, { day: 'Tuesday', available: true },
        { day: 'Wednesday', available: true }, { day: 'Thursday', available: true },
        { day: 'Friday', available: true }, { day: 'Saturday', available: true },
        { day: 'Sunday', available: false },
      ],
    }) },
  ]

  // THE FLOOR IS DERIVED, NOT MEASURED ONCE.
  //
  // This gate shipped asserting a flat 45s for second-tier compounds and 30s
  // for isolation — the lowest values seen in a 1,728-profile sample. It was
  // RED AT THE COMMIT THAT INTRODUCED IT and reported green, because the sample
  // under-represented one combination: combat's table asks 60s of a second-tier
  // compound, a conditioning block's adaptation phase shifts rest by -20s, and
  // `restFloorFor` deliberately returns `min(unbudgeted, tierFloor)` so a block
  // that genuinely wants 40s gets 40s. The app was right and the number was
  // wrong.
  //
  // So the floor now comes from the two tables the app itself reads — the
  // style's own rest row and the deepest rest_adjust_seconds any phase applies
  // — capped by the tier's own ceiling. It goes stale on its own if either
  // table moves, which a pinned number cannot do.
  const worstPhaseShift = Math.min(...Object.values(PHASE_CONFIGS).map(c => c.rest_adjust_seconds))
  const floorFor = (style: TrainingStyle, tier: string): number => {
    const row = STYLE_CONFIGS[style].restSeconds
    const base = tier === 'tier2_compound' ? row.tier2 : row.tier3
    const cap = tier === 'tier2_compound' ? REST_FLOOR_BY_TIER.tier_2_secondary : REST_FLOOR_BY_TIER.tier_3_isolation
    return Math.min(cap, Math.max(0, base + worstPhaseShift))
  }

  let checkedExercises = 0
  const offenders: { case: string; week: number; name: string; tier: string; rest: string; floor: string }[] = []
  // AND THE RULING ITSELF, as an absolute. Ashley's report was a 30-second lat
  // pulldown, and her words were that 30 seconds on one is not a short rest but
  // a different exercise. The derived floors above are all 40s or more for a
  // second-tier compound, so this can never pass vacuously — it is the one line
  // that would still be here if every table changed.
  const tooShort: { case: string; week: number; name: string; rest: string }[] = []
  for (const c of CASES) {
    for (const week of seeded(`rest-floors:${c.label}`, () => generateMesocycle(c.p))) {
      for (const day of week.days) {
        for (const ex of day.exercises ?? []) {
          const tier = String(tierOf(ex.name))
          if (tier !== 'tier2_compound' && tier !== 'tier3_isolation') continue
          // A superset shares its rest by design, and the card says A1/A2.
          // Its partner's rest is the literal string 'alternate', which is
          // why every number below is read from a solo slot only.
          if (ex.superset_label) continue
          checkedExercises++
          const secs = parseInt(String(ex.rest ?? '0'), 10) || 0
          // MEASURED FLOORS, NOT CHOSEN ONES. Across 1,728 profiles after this
          // change the lowest solo second-tier rest was 45s and the lowest
          // solo isolation rest was 30s; before it they were 30s and 20s. A
          // gate set at the measured minimum fails the moment any path stops
          // asking for the floor.
          const mustBeAtLeast = floorFor(c.p.training_style as TrainingStyle, tier)
          if (secs > 0 && secs < mustBeAtLeast) offenders.push({ case: c.label, week: week.week_number, name: ex.name, tier, rest: String(ex.rest), floor: `${mustBeAtLeast}s` })
          if (tier === 'tier2_compound' && secs > 0 && secs <= 30) tooShort.push({ case: c.label, week: week.week_number, name: ex.name, rest: String(ex.rest) })
        }
      }
    }
  }
  check('the plans held second-tier compounds to read (the check is not vacuous)', checkedExercises > 200, checkedExercises)
  check('NO solo compound or isolation slot rests below the floor its own style and phase imply',
    offenders.length === 0, offenders.slice(0, 5))
  check('...and NO second-tier compound rests 30s or less — her report, as an absolute',
    tooShort.length === 0, tooShort.slice(0, 5))
  console.log(`  derived floors (worst phase shift ${worstPhaseShift}s): ` +
    (['hybrid', 'bodybuilding', 'combat', 'functional'] as TrainingStyle[])
      .map(st => `${st} t2=${floorFor(st, 'tier2_compound')}s t3=${floorFor(st, 'tier3_isolation')}s`).join('  '))

  // AND THE OPPOSITE ERROR: the floor must not have quietly LENGTHENED a style
  // that asks for density. Combat prescribes 45s isolation, and after this
  // change it must still get 45s.
  //
  // CORRECTED FROM ITS FIRST VERSION, which asserted a flat `<= 45` and went
  // red on its second run. The exception is real and is not this change's
  // doing: on a day with no tier-1 lift at all, the hardest movement is
  // PROMOTED and takes the main lift's 60s floor — a rule that predates this
  // work by weeks (see mainLiftRestFloor's `promoted` flag). An isolation
  // slot on such a day is allowed exactly that 60, and nothing else above 45.
  const combatWeeks = seeded('rest-floors:combat-density', () => generateMesocycle(CASES[3].p))
  const tooLong: { day: string; name: string; rest: number; dayHasMainLift: boolean }[] = []
  let combatIsolationSeen = 0
  for (const w of combatWeeks) {
    for (const d of w.days) {
      const dayHasMainLift = (d.exercises ?? []).some(e => tierOf(e.name) === 'tier1_compound')
      for (const e of d.exercises ?? []) {
        if (tierOf(e.name) !== 'tier3_isolation' || e.superset_label) continue
        combatIsolationSeen++
        const secs = parseInt(String(e.rest ?? '0'), 10) || 0
        const allowed = dayHasMainLift ? 45 : Math.max(45, REST_FLOOR_BY_TIER.tier_1_primary)
        if (secs > allowed) tooLong.push({ day: `${w.week_number}/${d.day}`, name: e.name, rest: secs, dayHasMainLift })
      }
    }
  }
  check('combat had isolation work to read (the check is not vacuous)', combatIsolationSeen > 20, combatIsolationSeen)
  check('combat still trains at its own density — no isolation slot rests longer than its 45s prescription',
    tooLong.length === 0, tooLong.slice(0, 5))
}

// ---------------------------------------------------------------------------
console.log('\n[4] Every tier has a floor on record')
{
  const tiers: ExerciseTier[] = ['tier_0_primer', 'tier_1_primary', 'tier_2_secondary', 'tier_3_isolation', 'tier_4_finisher']
  check('no tier can reach restFloorFor and fall through to zero by accident',
    tiers.every(t => typeof REST_FLOOR_BY_TIER[t] === 'number'), REST_FLOOR_BY_TIER)
  check('...and the finisher entry is deliberately zero, because cardio is exempted before it is asked',
    REST_FLOOR_BY_TIER.tier_4_finisher === 0)
}

// ONE EXIT.
if (failures > 0) {
  console.error(`\n${failures} rest-floor check(s) FAILED.\n`)
  process.exit(1)
}
console.log('\nRest suits the exercise, on every path that sets it.\n')
