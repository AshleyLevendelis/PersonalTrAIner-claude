// ---------------------------------------------------------------------------
// Gate for a loaded bar getting real recovery between sets.
//
// Root finding: someone whose goal is CONDITIONING was prescribed Barbell
// Squats and Barbell Bench Press with 42 SECONDS rest between sets. Nothing
// was broken — conditioning's restSecondsMultiplier is 0.8 on tier1, and on a
// short session that lands at 42s. The goal working exactly as designed, on
// the one exercise where it should not.
//
// Ashley's ruling: the session still conditions, the part with a bar on your
// back does not. Short rest stays everywhere else — accessories, machines,
// bodyweight, carries. The asymmetry is the argument: too much rest on one
// lift costs a slightly easier session, too little costs a rep failing under
// load.
//
// MEASURED before: 91% of conditioning's LOADED main lifts rested under 90s,
// and it was the only goal that ever went below 60s at all. Other goals sat at
// 17-27% under 90s with nothing under 60 — which is why the floor is scoped to
// the goal rather than applied globally. A blanket floor would have quietly
// rewritten a fifth of every other goal's main lifts.
//
// THE FLOOR HAS TO HOLD IN THREE PLACES, and that is the real lesson here.
// Rest is set independently at prescription (assignSetsRepsFromConfig), at the
// per-week phase adjustment (adjustRest), and at the duration trimmer
// (trimWeekRestForBudget, which carried its own hardcoded 60s). Fixing only
// the first left 288 of 432 still under the floor; fixing the first two left
// 285. Each path needs it.
//
// FOUR PLACES, as it turned out — and this gate did not catch the fourth,
// which is why section 4 below exists. All three floors above were gated on
// isExternallyLoaded, so they only ever guarded a bar. stageTimeCap's Phase 2
// takes a blanket -15s off EVERY non-cardio exercise with a 30s floor and no
// main-lift gate at all, and a BODYWEIGHT main lift fell straight through it:
// measured, 553 of 9,216 combinations (6.0%) had the day's main lift under a
// minute, every observed one a pull-up at 42s or 57s.
//
// Ashley's second ruling: a flat 60-second minimum under any main lift,
// bodyweight included, and nothing may take it below — not the time squeeze,
// not the phase. Her first ruling still stands ABOVE that line, which is what
// section 3 keeps honest: conditioning's 90s floor is still loaded-only, so a
// conditioning chin-up still rests less than a conditioning squat.
// ---------------------------------------------------------------------------

import { generateExercisePlan, generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { getExerciseEntry } from '../src/lib/exercise-db'
import { isExternallyLoaded } from '../src/lib/load-prescription'
import { getGoalPolicy } from '../src/lib/goal-policies'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { dayAnchorExercise } from '../src/lib/session-derive'
import { ANCHOR_DIFFICULTY_BUMP } from '../src/lib/movement-difficulty'
import { EXERCISE_DATABASE } from '../src/lib/exercise-db'
import { parseRestSeconds } from '../src/lib/session-duration'
import type { UserProfile, FitnessGoal, SessionDuration, EquipmentAccess } from '../src/lib/types'

/** Sections 5-6 generate a lot of plans; the engine's debug chatter drowns the result. */
function quietly<T>(fn: () => T): T {
  const d = console.debug, w = console.warn, l = console.log
  console.debug = () => {}; console.warn = () => {}; console.log = () => {}
  try { return fn() } finally { console.debug = d; console.warn = w; console.log = l }
}

let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function buildProfile(o: Partial<UserProfile>): UserProfile {
  return {
    age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
    fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1800, tdee: 2500,
    equipment_access: 'full_gym', injuries: [], training_style: 'hybrid',
    training_experience: 'intermediate', session_duration_preference: '45-60',
    workout_split_preference: 'upper_lower',
    training_days: [
      { day: 'Monday', available: true }, { day: 'Tuesday', available: true },
      { day: 'Wednesday', available: true }, { day: 'Thursday', available: true },
      { day: 'Friday', available: false }, { day: 'Saturday', available: false },
      { day: 'Sunday', available: false },
    ],
    weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
    exercise_exclusions: [] as unknown as never, macro_calculation_mode: 'STANDARD_STATIC',
    coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
    ...o,
  } as UserProfile
}

const GOALS: FitnessGoal[] = ['hypertrophy', 'fat_loss', 'strength', 'endurance', 'conditioning', 'functional']
const STYLES = ['hybrid', 'bodybuilding', 'functional'] as const
const DURATIONS: SessionDuration[] = ['30-45', '45-60', '60-90']

interface Row { loaded: number; underFloor: number; underSixty: number; bodyweight: number; bodyweightShort: number; bodyweightUnderSixty: number; deloadMains: number; deloadUnderSixty: number }
const rows = new Map<FitnessGoal, Row>()

for (const goal of GOALS) {
  const row: Row = { loaded: 0, underFloor: 0, underSixty: 0, bodyweight: 0, bodyweightShort: 0, bodyweightUnderSixty: 0, deloadMains: 0, deloadUnderSixty: 0 }
  const floor = getGoalPolicy(goal).minLoadedMainLiftRestSeconds ?? 60
  for (const training_style of STYLES) {
    for (const session_duration_preference of DURATIONS) {
      const profile = buildProfile({ fitness_goal: goal, training_style, session_duration_preference })
      setRandomSource(seededRngFromKey(`rw:${goal}:${training_style}:${session_duration_preference}`))
      const d = console.debug, w = console.warn
      console.debug = () => {}; console.warn = () => {}
      let plan
      try { plan = generateMesocycle(profile, generateExercisePlan(profile).plan) }
      finally { console.debug = d; console.warn = w; resetRandomSource() }

      for (const week of plan) {
        for (const day of week.days) {
          const i = day.exercises.findIndex(ex => ex.tier === 'tier_1_primary')
          if (i < 0) continue
          const main = day.exercises[i]
          const entry = getExerciseEntry(main.name)
          if (!entry) continue
          const seconds = parseInt(String(main.rest), 10)
          if (!Number.isFinite(seconds)) continue
          // The 60s floor is NOT a density rule, so unlike the goal's loaded
          // floor it holds on a deload too — a light week does not make a set
          // easier to finish 42 seconds after the last one. Counted
          // separately so section 4 can say so out loud.
          if (week.is_deload) {
            row.deloadMains++
            if (seconds < 60) row.deloadUnderSixty++
            continue
          }
          if (!isExternallyLoaded(entry)) {
            row.bodyweight++
            if (seconds < floor) row.bodyweightShort++
            if (seconds < 60) row.bodyweightUnderSixty++
            continue
          }
          row.loaded++
          if (seconds < floor) row.underFloor++
          if (seconds < 60) row.underSixty++
        }
      }
    }
  }
  rows.set(goal, row)
}

// ---------------------------------------------------------------------------
console.log('\n1. A loaded main lift never rests less than its goal allows')
// ---------------------------------------------------------------------------
for (const goal of GOALS) {
  const r = rows.get(goal)!
  const floor = getGoalPolicy(goal).minLoadedMainLiftRestSeconds ?? 60
  check(`${goal}: ${r.underFloor}/${r.loaded} loaded main lifts under ${floor}s`, r.underFloor === 0, String(r.underFloor))
}

// ---------------------------------------------------------------------------
console.log('\n2. Nothing anywhere puts a bar under 60 seconds')
// ---------------------------------------------------------------------------
{
  // The hard line, independent of any goal's own floor. 60s is the threshold
  // quality-score.ts itself calls "not a full rest period" for a main lift.
  const total = GOALS.reduce((n, g) => n + rows.get(g)!.underSixty, 0)
  const seen = GOALS.reduce((n, g) => n + rows.get(g)!.loaded, 0)
  check(`no loaded main lift rests under 60s (${total} of ${seen})`, total === 0, String(total))
  check('...and there are loaded main lifts to check', seen > 500, String(seen))
}

// ---------------------------------------------------------------------------
console.log('\n3. Conditioning keeps its density everywhere else')
// ---------------------------------------------------------------------------
{
  // The over-fire check, and the half of the ruling that is easy to lose. If
  // the floor had been applied by TIER rather than by "is there a bar", a
  // conditioning trainee's chin-up day would have been slowed down too, and
  // the goal would have quietly become hypertrophy.
  const c = rows.get('conditioning')!
  check(`conditioning bodyweight main lifts keep short rest (${c.bodyweightShort} of ${c.bodyweight} still under 90s)`,
    c.bodyweight === 0 || c.bodyweightShort > 0, `${c.bodyweightShort}/${c.bodyweight}`)
  // The 60s floor must not have swallowed the density it was scoped to
  // preserve: "under 90 but at or above 60" is the band that has to survive.
  const inBand = c.bodyweightShort - c.bodyweightUnderSixty
  check(`...and they land in the 60-90s band, not at the 90s loaded floor (${inBand} of ${c.bodyweight})`,
    c.bodyweight === 0 || inBand > 0, `${inBand}/${c.bodyweight}`)

  // Ashley ruled on this line twice, a day apart, and the second ruling
  // inverted what this loop used to assert.
  //
  //   2 Sep 2026 — conditioning ALONE gets a loaded-main-lift floor (90s),
  //   because it was the only goal ever going under 60. Everyone else was
  //   left alone, and this loop asserted exactly that: "no other goal has a
  //   floor of its own".
  //
  //   3 Sep 2026 — two minutes on a loaded main lift for every other goal,
  //   measured off 80.9% of main-lift slots resting under 120s. Conditioning
  //   keeps its short rest, which is the same asymmetry as before.
  //
  // The second ruling shipped in PR #15 and left this loop RED — five failing
  // checks, merged to main, and found the next day by a whole-app audit
  // rather than by anyone reading the gate's output. Worth saying plainly,
  // because the gate did its job and the merge did not.
  //
  // The check was never wrong about the INTENT — conditioning must not be
  // dragged up to everyone else's rest — only about the incidental fact that
  // everyone else had no floor at all. So it asserts the intent now. The
  // numbers are hardcoded on purpose: this is where a ruling is pinned, and
  // changing one should cost a conversation rather than pass silently.
  const conditioningFloor = getGoalPolicy('conditioning').minLoadedMainLiftRestSeconds
  check(`conditioning's loaded floor is still 90s (${conditioningFloor}s)`,
    conditioningFloor === 90, conditioningFloor)
  for (const goal of GOALS) {
    if (goal === 'conditioning') continue
    const floor = getGoalPolicy(goal).minLoadedMainLiftRestSeconds
    check(`${goal} carries the two-minute floor, above conditioning's (${floor}s)`,
      floor === 120 && conditioningFloor != null && floor > conditioningFloor, floor)
  }
}

// ---------------------------------------------------------------------------
console.log('\n4. No main lift anywhere rests under a minute — bar or no bar')
// ---------------------------------------------------------------------------
{
  // The check that was missing. Section 2 asks the same question of LOADED
  // main lifts only, which is exactly how a bodyweight pull-up at 42s passed
  // this gate green while quality-score was deducting for it in 6% of plans.
  const bwShort = GOALS.reduce((n, g) => n + rows.get(g)!.bodyweightUnderSixty, 0)
  const bwSeen = GOALS.reduce((n, g) => n + rows.get(g)!.bodyweight, 0)
  check(`no bodyweight main lift rests under 60s (${bwShort} of ${bwSeen})`, bwShort === 0, String(bwShort))
  check('...and there are bodyweight main lifts to check', bwSeen > 100, String(bwSeen))

  const dShort = GOALS.reduce((n, g) => n + rows.get(g)!.deloadUnderSixty, 0)
  const dSeen = GOALS.reduce((n, g) => n + rows.get(g)!.deloadMains, 0)
  check(`the floor holds on deload weeks too (${dShort} of ${dSeen})`, dShort === 0, String(dShort))
  check('...and there are deload main lifts to check', dSeen > 100, String(dSeen))
}

// ---------------------------------------------------------------------------
console.log('\n5. A day with NO tier-1 still has a hardest lift, and it keeps its rest')
// ---------------------------------------------------------------------------
{
  // 96 of 256 generated days contain no tier_1_primary at all — full_gym 0,
  // home_gym 0, minimalist 48 of 64, bodyweight 48 of 64 — because 6 of the
  // catalogue's 8 tier1_compound entries need a barbell. Sections 1-4 above
  // all ask their question OF a main lift, so every one of them passed green
  // while 37.5% of days had nothing for the rule to point at.
  //
  // The floor now promotes the day's hardest standalone movement. Three
  // things have to hold, and the third is the one that bit: the promoted
  // floor was wired at four call sites and MISSED at trimWeekRestForBudget,
  // which trims last — 227 anchors were floored to 60s and then walked back
  // down to 30. Measured, not assumed.
  const TIERS: EquipmentAccess[] = ['full_gym', 'home_gym', 'minimalist', 'bodyweight']
  let noTierOne = 0, anchored = 0, underSixty = 0, inSuperset = 0, pulledDown = 0
  const before = new Map<string, number>()

  for (const equipment_access of TIERS)
    for (const fitness_goal of GOALS)
      for (const session_duration_preference of ['30-45', '45-60', '60-90'] as SessionDuration[]) {
        const profile = buildProfile({ equipment_access, fitness_goal, session_duration_preference } as Partial<UserProfile>)
        const key = `anchor:${equipment_access}:${fitness_goal}:${session_duration_preference}`
        const weeks = quietly(() => {
          setRandomSource(seededRngFromKey(key))
          try { return generateMesocycle(profile) } finally { resetRandomSource() }
        })
        for (const wk of weeks) for (const day of wk.days) {
          if (!day.exercises.length) continue
          if (day.exercises.some(e => e.tier === 'tier_1_primary')) continue
          noTierOne++
          const anchor = dayAnchorExercise(day.exercises)
          if (!anchor) continue
          anchored++
          if (anchor.superset_label) inSuperset++
          const rest = parseRestSeconds(anchor.rest)
          if (rest > 0 && rest < 60) underSixty++
          before.set(anchor.name, (before.get(anchor.name) ?? 0) + 1)
        }
      }

  check(`days with no tier-1 exist to check (${noTierOne})`, noTierOne > 200, String(noTierOne))
  check(`every one of them gets a promoted anchor (${anchored} of ${noTierOne})`, anchored === noTierOne, `${noTierOne - anchored} without`)
  check(`no promoted anchor rests under 60s (${underSixty})`, underSixty === 0, String(underSixty))
  // The invariant that stops the app contradicting itself on screen: a
  // superset prints "alternate — no rest between" directly under its members,
  // so promoting one and giving it a 60s floor would print both at once.
  check(`no superset member is ever promoted (${inSuperset})`, inSuperset === 0, String(inSuperset))
  check(`...and promotion reaches more than one movement (${before.size} distinct)`, before.size >= 4, String(before.size))
}

// ---------------------------------------------------------------------------
console.log('\n6. Promotion is a FLOOR, never a ceiling')
// ---------------------------------------------------------------------------
{
  // 388 of the days measured already rested at or above 60s on their hardest
  // movement. Promotion must not pull a single one of them DOWN to the floor
  // — the same one-way rule the stated load ceilings follow, where new
  // information may raise a prescription but never cut it.
  //
  // Asked of a LONG-REST goal, because that is where a ceiling bug would show
  // up: strength rests longest, so if the floor were being applied as an
  // assignment rather than a Math.max, strength anchors would all read 60.
  let above = 0, exactlySixty = 0
  for (const equipment_access of ['bodyweight', 'minimalist'] as EquipmentAccess[]) {
    const profile = buildProfile({ equipment_access, fitness_goal: 'strength', session_duration_preference: '60-90' } as Partial<UserProfile>)
    const weeks = quietly(() => {
      setRandomSource(seededRngFromKey(`ceil:${equipment_access}`))
      try { return generateMesocycle(profile) } finally { resetRandomSource() }
    })
    for (const wk of weeks) for (const day of wk.days) {
      if (!day.exercises.length) continue
      if (day.exercises.some(e => e.tier === 'tier_1_primary')) continue
      const anchor = dayAnchorExercise(day.exercises)
      if (!anchor) continue
      const rest = parseRestSeconds(anchor.rest)
      if (rest > 60) above++
      else if (rest === 60) exactlySixty++
    }
  }
  check(`anchors resting ABOVE 60s are left alone (${above} above, ${exactlySixty} at exactly 60)`,
    above > 0, 'every anchor landed on exactly 60 — the floor is being assigned, not floored')
}

// ---------------------------------------------------------------------------
console.log('\n7. The difficulty list has not rotted')
// ---------------------------------------------------------------------------
{
  // ANCHOR_DIFFICULTY_BUMP is hand-maintained and there is no way around
  // that: "a Nordic curl is brutal" is editorial, with no property of an
  // entry to derive it from. What CAN be guaranteed is that it never drifts
  // silently — a renamed exercise would otherwise drop back to baseline and
  // the day would quietly nominate something easier, with nothing red.
  const known = new Set(EXERCISE_DATABASE.map(e => e.name))
  const orphans = Object.keys(ANCHOR_DIFFICULTY_BUMP).filter(n => !known.has(n))
  check(`every ranked movement still exists in the catalogue (${Object.keys(ANCHOR_DIFFICULTY_BUMP).length} ranked)`,
    orphans.length === 0, orphans.join(', '))

  // Spanish Squat is a patellar-tendon rehab tool that the injury pass places
  // deliberately. Promoting it to a day's MAIN LIFT would turn a rehab
  // prescription into the centrepiece of the session, so its absence from the
  // list is load-bearing rather than an oversight — named here so it cannot
  // be "helpfully" added later.
  check('Spanish Squat is not ranked — it is rehab, not a main lift',
    !(('Spanish Squat') in ANCHOR_DIFFICULTY_BUMP))
}

console.log(failures === 0 ? '\nAll main-lift-rest checks passed.\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
