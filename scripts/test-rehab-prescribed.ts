// ---------------------------------------------------------------------------
// Gate for rehab actually being PRESCRIBED, not merely permitted.
//
// exercise-db.ts has always documented `indicated_joints` as "the prep/rehab
// work a physio would prescribe FOR that joint... the plan should deliberately
// include them when the matching injury is present." Nothing implemented that
// sentence: isIndicatedFor was read only to keep rehab ELIGIBLE, and to append
// "Chosen to help your shoulder" to a movement nothing had chosen.
//
// MEASURED before the fix, over 576 training days per joint: rehab arrived on
// 51.0% of a shoulder-injured trainee's days and 50.7% of a knee-injured
// trainee's — by luck of the shuffle — and 40 of 144 knee plans contained none
// at all. After: 100% / 100%, uninjured control unmoved at 0%.
//
// The rules this file exists to hold:
//
//   REHAB IS GUARANTEED, NOT LIKELY. Every session, or the ruling ("rehab in
//   every session") is decoration.
//   GENTLEST MEANS GENTLEST. A guaranteed slot may never reach for a Spanish
//   Squat or a Wall Sit. "Every session" is only defensible while it is small.
//   IT MUST NOT FIRE FOR THE UNINJURED. A guarantee that leaks is a different
//   bug wearing this one's clothes.
//   A PREFERENCE MAY NOT DELETE A SAFETY RESPONSE. The style filter used to
//   strip every knee-rehab drill from a 'bodybuilding' trainee. That is the
//   fifth instance of one tag answering another tag's question, and it gets
//   its own section rather than being folded into the coverage count.
// ---------------------------------------------------------------------------

import {
  generateExercisePlan, generateMesocycle, setRandomSource, resetRandomSource,
  getConstrainedPool, getFlaggedJoints, pickRehabMovement,
} from '../src/lib/exercise-plan'
import { readFileSync } from 'fs'
import { getExerciseEntry, isIndicatedFor, EXERCISE_DATABASE } from '../src/lib/exercise-db'
import { scorePlan } from '../src/lib/quality-score'
import { seededRngFromKey } from '../src/lib/seeded-random'
import type { UserProfile, WorkoutDay } from '../src/lib/types'

/**
 * Every injury the catalogue can actually prescribe FOR. Was a repeated
 * ['shoulders','knees'] literal in six loops, which is how hips and the lower
 * back stayed untested after they were given rehab of their own — six places
 * to update, and the gate would have gone on passing had any been missed.
 *
 * Named once so adding a joint's rehab reaches every section at the same
 * time. The four still absent (ankle, elbow, wrist, neck) belong here the day
 * they get any indicated work.
 */
// Ankles, wrists and elbows joined on 29 Aug 2026 (Ashley's scope ruling).
// Every section below loops this list, so they are covered by all of them at
// once rather than by whichever ones somebody remembered to extend.
const REHAB_INJURIES = ['shoulders', 'knees', 'hips', 'lower_back', 'ankles', 'wrists', 'elbows'] as const
/** Ruled OUT of scope, and checked as explicitly as the ones that are in. */
const NOT_PRESCRIBED = ['neck'] as const
/** The nine entries added for ankles/wrists/elbows, by name. */
const NEW_REHAB_MOVEMENTS = [
  'Ankle Alphabet', 'Banded Ankle Dorsiflexion', 'Single-Leg Balance Hold',
  'Wrist Circles', 'Banded Wrist Extension', 'Banded Wrist Flexion',
  'Isometric Grip Squeeze', 'Eccentric Wrist Extension', 'Forearm Pronation-Supination',
] as const

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

function gen(profile: UserProfile, seed: string): WorkoutDay[] {
  setRandomSource(seededRngFromKey(seed))
  const d = console.debug, w = console.warn
  console.debug = () => {}; console.warn = () => {}
  try { return generateExercisePlan(profile).plan } finally { console.debug = d; console.warn = w; resetRandomSource() }
}

const SPLITS = ['upper_lower', 'push_pull_legs', 'full_body', 'ai_recommendation'] as const
const STYLES = ['hybrid', 'bodybuilding', 'functional'] as const
const EQUIP = ['full_gym', 'home_gym', 'minimalist', 'bodyweight'] as const

// ---------------------------------------------------------------------------
console.log('\n1. Every session carries the joint\'s own rehab work')
// ---------------------------------------------------------------------------
for (const injury of REHAB_INJURIES) {
  const flagged = getFlaggedJoints([injury])
  let days = 0
  const misses: string[] = []
  for (const split of SPLITS) {
    for (const style of STYLES) {
      for (const equipment_access of EQUIP) {
        const profile = buildProfile({ injuries: [injury], workout_split_preference: split, training_style: style, equipment_access })
        for (const day of gen(profile, `rehab:${injury}:${split}:${style}:${equipment_access}`)) {
          if (day.exercises.length === 0) continue
          days++
          const hit = day.exercises.some(ex => {
            const e = getExerciseEntry(ex.name)
            return !!e && isIndicatedFor(e, flagged)
          })
          if (!hit) misses.push(`${split}/${style}/${equipment_access}: ${day.focus}`)
        }
      }
    }
  }
  check(`${injury}: rehab on every one of ${days} training days`, misses.length === 0,
    `${misses.length} without: ${misses.slice(0, 3).join(' | ')}`)
}

// ---------------------------------------------------------------------------
console.log('\n2. Gentlest means gentlest — the guaranteed slot stays small')
// ---------------------------------------------------------------------------
{
  // Ashley's ruling: rehab goes in every session, taking the gentlest option.
  // These are the movements that ruling excludes from a GUARANTEED slot. They
  // remain fully available through ordinary slots — this asserts what the
  // rehab picker reaches for, not what a plan may contain.
  const TOO_BIG = ['Spanish Squat', 'Wall Sit', 'Step-Down (Eccentric)', 'Low Box Step-Up']
  const picked = new Set<string>()
  for (const injury of REHAB_INJURIES) {
    const flagged = getFlaggedJoints([injury])
    for (const style of STYLES) {
      for (const equipment_access of EQUIP) {
        const profile = buildProfile({ injuries: [injury], training_style: style, equipment_access })
        const pool = getConstrainedPool(profile, [])
        for (let s = 0; s < 8; s++) {
          setRandomSource(seededRngFromKey(`pick:${injury}:${style}:${equipment_access}:${s}`))
          const pick = pickRehabMovement(pool, flagged, new Set())
          resetRandomSource()
          if (pick) picked.add(pick.name)
        }
      }
    }
  }
  check('the rehab slot never reaches for a big movement',
    TOO_BIG.every(n => !picked.has(n)), TOO_BIG.filter(n => picked.has(n)).join(', '))
  check('...and never for a tier2 compound, whatever its name',
    [...picked].every(n => getExerciseEntry(n)?.mechanics_tier !== 'tier2_compound'),
    [...picked].filter(n => getExerciseEntry(n)?.mechanics_tier === 'tier2_compound').join(', '))
  // The other half: a slot that only ever picks one thing is monotony, not a
  // prescription. Measured at 576/576 for Seated Short-Arc Quad Set before
  // the gentleness BAND replaced a strict minimum.
  check('...while still offering more than one movement', picked.size > 2, [...picked].join(', '))
}

// ---------------------------------------------------------------------------
console.log('\n2b. The guaranteed slot never doubles up on the warm-up')
// ---------------------------------------------------------------------------
{
  // Caught by eyeballing a generated plan, NOT by this file's first draft: a
  // session opened "Scapular Push-Ups, Scapular Push-Ups", because seven of
  // the nine shoulder-indicated movements are primers, so the ordinary primer
  // pick and the rehab pick were drawing from the same small set. usedGroups
  // stopped `main` colliding with rehab and said nothing about the primer.
  const dupes: string[] = []
  let days = 0
  for (const injury of REHAB_INJURIES) {
    for (const split of SPLITS) {
      for (const style of STYLES) {
        for (const equipment_access of EQUIP) {
          for (const day of gen(buildProfile({ injuries: [injury], workout_split_preference: split, training_style: style, equipment_access }), `dup:${injury}:${split}:${style}:${equipment_access}`)) {
            if (day.exercises.length === 0) continue
            days++
            const names = day.exercises.map(e => e.name)
            const seen = new Set<string>()
            for (const n of names) {
              if (seen.has(n)) dupes.push(`${injury}/${split}/${style}/${equipment_access} ${day.focus}: ${n}`)
              seen.add(n)
            }
          }
        }
      }
    }
  }
  check(`no exercise appears twice in the same session (${days} days)`, dupes.length === 0,
    `${dupes.length}: ${dupes.slice(0, 3).join(' | ')}`)
}

// ---------------------------------------------------------------------------
console.log('\n3. Rehab rotates across a week rather than repeating')
// ---------------------------------------------------------------------------
for (const injury of REHAB_INJURIES) {
  const flagged = getFlaggedJoints([injury])
  let sawVariety = 0, weeks = 0
  for (const split of SPLITS) {
    for (let s = 0; s < 4; s++) {
      const plan = gen(buildProfile({ injuries: [injury], workout_split_preference: split }), `rot:${injury}:${split}:${s}`)
      const names = new Set<string>()
      for (const day of plan) {
        for (const ex of day.exercises) {
          const e = getExerciseEntry(ex.name)
          if (e && isIndicatedFor(e, flagged)) names.add(ex.name)
        }
      }
      weeks++
      if (names.size > 1) sawVariety++
    }
  }
  check(`${injury}: most weeks carry more than one rehab movement`, sawVariety > weeks / 2, `${sawVariety}/${weeks}`)
}

// ---------------------------------------------------------------------------
console.log('\n4. The over-fire check — nothing fires for an uninjured trainee')
// ---------------------------------------------------------------------------
{
  const profile = buildProfile({})
  const pool = getConstrainedPool(profile, [])
  check('no flagged joints means no rehab pick at all',
    pickRehabMovement(pool, new Set(), new Set()) === null)
  // Used 'hips' as its example of a joint with no rehab until hips was given
  // some, at which point this went red — correctly, and it is the check
  // catching its own staleness rather than a regression. Swapped to a code
  // that is still genuinely empty.
  //
  // 'ankles' is the STRONGER case anyway: it maps to a real joint tag (all
  // eight codes have mapped since 31b05d7) and simply has no indicated work
  // behind it, so this now asserts the interesting half — a joint the app
  // knows about but cannot treat must return null rather than reach for
  // something approximate. Move it on the day ankles gets rehab.
  //
  // THAT DAY CAME (29 Aug 2026) and this went red a second time, correctly,
  // for the same reason it went red when hips was treated. The neck is the
  // last mapped joint with nothing behind it — and unlike ankles and hips it
  // is empty BY DECISION, not by omission: Ashley ruled the neck out of scope
  // because "my neck bothers me" spans a stiff desk neck and a nerve problem
  // that must not be loaded, and the app cannot tell which.
  //
  // So this check has changed meaning, and there is no next joint to move it
  // to. It is now the assertion that the scope line HOLDS. If it ever goes
  // red again, the honest response is not to swap the code again — it is that
  // somebody has started prescribing neck work, and that needs Ashley, not an
  // edit here.
  for (const injury of NOT_PRESCRIBED) {
    check(`${injury}: a mapped joint ruled out of scope gets nothing invented for it`,
      pickRehabMovement(pool, getFlaggedJoints([injury]), new Set()) === null)
  }

  // AND THE UNINJURED PLAN ITSELF MUST NOT MOVE — found by measuring, not by
  // reasoning. The nine ankle/wrist/elbow entries were first written with the
  // obvious primer_pattern_affinity (lower-body for ankles, upper-body for
  // wrists and elbows), which made them eligible for the ORDINARY warm-up
  // slot and put one of them on 231 of 576 healthy training days — 40.1%.
  // Nobody asked for everyone's warm-up to change; the ask was that injured
  // people stop getting nothing back. Dropping the affinity took it to 0/576
  // while leaving the guarantee at 576/576, because pickRehabMovement filters
  // on indicated_joints and tier and never consults affinity.
  //
  // This asserts the 0, so re-adding an affinity line to any of the nine
  // turns it red rather than quietly reshaping every healthy user's session.
  {
    const newSet = new Set<string>(NEW_REHAB_MOVEMENTS)
    let healthyDays = 0, leaked = 0
    for (const style of STYLES) {
      for (const equipment_access of EQUIP) {
        const plan = gen(buildProfile({ training_style: style, equipment_access }), `leak:${style}:${equipment_access}`)
        for (const day of plan) {
          if (day.exercises.length === 0) continue
          healthyDays++
          if (day.exercises.some(e => newSet.has(e.name))) leaked++
        }
      }
    }
    check('an uninjured trainee never meets the ankle/wrist/elbow rehab set',
      leaked === 0, `${leaked}/${healthyDays} days`)
    // 3 styles x 4 equipment tiers x 4 training days = 48. Written as the
    // arithmetic rather than a round number, because the round number I first
    // guessed (>50) was wrong and this check caught it — which is the only
    // reason a sanity check on a zero-assertion is worth having: "0 leaked"
    // is equally true of a loop that ran no plans at all. At the 40.1% the
    // affinity version measured, 48 days would show ~19.
    check('...and there were healthy days to check (sanity check on this check)',
      healthyDays >= STYLES.length * EQUIP.length * 4, `${healthyDays}`)
  }

  // THE TRIM NEVER REACHES ZERO — Ashley's ruling, 29 Aug 2026: "shorten the
  // rehab set when a session would overrun." enforceDayDurationBudget may now
  // take a rehab primer from 2 sets to 1, which it can do to nothing else in
  // the warm-up. The guarantee it must not cross is presence: a session that
  // is over budget still carries the rehab, just less of it.
  //
  // Exercised on the exact configuration that overran before the change —
  // bodyweight / 30-45 / bodybuilding — because that is where the trim
  // actually fires. A looser profile would pass without ever running it.
  for (const injury of ['wrists', 'ankles', 'elbows']) {
    const flagged = getFlaggedJoints([injury])
    let daysChecked = 0, zeroSets = 0, missingEntirely = 0
    for (const split of ['upper_lower', 'push_pull_legs', 'full_body', 'ai_recommendation'] as const) {
      const plan = gen(buildProfile({
        injuries: [injury], equipment_access: 'bodyweight', training_style: 'bodybuilding',
        session_duration_preference: '30-45', workout_split_preference: split,
      }), `trim:${injury}:${split}`)
      for (const day of plan) {
        if (day.exercises.length === 0) continue
        daysChecked++
        const rehab = day.exercises.filter(ex => {
          const e = getExerciseEntry(ex.name)
          return !!e && isIndicatedFor(e, flagged)
        })
        if (rehab.length === 0) { missingEntirely++; continue }
        if (rehab.some(r => r.sets < 1)) zeroSets++
      }
    }
    check(`${injury}: the budget trim never removes the rehab movement`, missingEntirely === 0, `${missingEntirely}/${daysChecked} days`)
    check(`${injury}: ...and never takes it below one set`, zeroSets === 0, `${zeroSets}/${daysChecked} days`)
    check(`${injury}: ...on the tight config where the trim actually fires`, daysChecked > 0, `${daysChecked} days`)
  }

  // The real regression risk of the style-filter change: for someone who
  // reported no injury, the new joints argument is an empty set, so the pool
  // must contain exactly what it always did — every survivor on-style, no
  // exceptions riding in through the rehab exemption.
  for (const style of STYLES) {
    for (const equipment_access of EQUIP) {
      const pool = getConstrainedPool(buildProfile({ training_style: style, equipment_access }), [])
      const offStyle = pool.filter(e => !e.style_tags.includes(style))
      check(`uninjured ${style}/${equipment_access}: pool is unchanged — every survivor on-style`,
        offStyle.length === 0, offStyle.slice(0, 3).map(e => e.name).join(', '))
    }
  }

  let days = 0
  for (const split of SPLITS) {
    for (const day of gen(buildProfile({ workout_split_preference: split }), `clean:${split}`)) {
      if (day.exercises.length > 0) days++
    }
  }
  check(`uninjured plans still generate normally (${days} training days)`, days > 0)
}

// ---------------------------------------------------------------------------
console.log('\n5. A style preference may not delete a safety response')
// ---------------------------------------------------------------------------
{
  // The specific bug: 'bodybuilding' stripped every knee-rehab drill, because
  // a seated short-arc quad set is tagged functional/hybrid and nobody tags a
  // rehab drill 'bodybuilding'. Full gym left one survivor; home gym,
  // minimalist and bodyweight left zero. MIN_VIABLE_POOL never fired — the
  // pool stayed large, just missing the category that mattered.
  for (const injury of REHAB_INJURIES) {
    const flagged = getFlaggedJoints([injury])
    for (const equipment_access of EQUIP) {
      const profile = buildProfile({ injuries: [injury], training_style: 'bodybuilding', equipment_access })
      const pool = getConstrainedPool(profile, [])
      const survivors = pool.filter(e => isIndicatedFor(e, flagged))
      check(`${injury} + bodybuilding + ${equipment_access}: rehab survives the style filter`,
        survivors.length > 0, String(survivors.length))
    }
  }
  // Over-fire the other way: the exemption must let rehab through and nothing
  // else. An off-style movement with no indication is still filtered out.
  const profile = buildProfile({ injuries: ['knees'], training_style: 'bodybuilding' })
  const pool = getConstrainedPool(profile, [])
  const offStyleNonRehab = pool.filter(e =>
    !e.style_tags.includes('bodybuilding') && !isIndicatedFor(e, getFlaggedJoints(['knees'])))
  check('the exemption is for rehab only — no other off-style movement rides in',
    offStyleNonRehab.length === 0, offStyleNonRehab.slice(0, 3).map(e => e.name).join(', '))
}

// ---------------------------------------------------------------------------
console.log('\n6. The data the guarantee rests on')
// ---------------------------------------------------------------------------
{
  const tagged = EXERCISE_DATABASE.filter(e => (e.indicated_joints ?? []).length > 0)
  const joints = new Set(tagged.flatMap(e => e.indicated_joints ?? []))
  check('every indicated movement records the joint it loads, honestly',
    tagged.every(e => (e.indicated_joints ?? []).every(j => e.loads_joints.includes(j))),
    tagged.filter(e => (e.indicated_joints ?? []).some(j => !e.loads_joints.includes(j))).map(e => e.name).join(', '))
  // Documents the coverage gap rather than asserting it away. It read "five
  // of the eight injury codes have no rehab movements at all"; hips and the
  // lower back have since been filled, leaving FOUR — ankles, elbows, wrists
  // and neck — for which this feature is still silent. Flagged for Ashley,
  // not fixed here.
  console.log(`      joints with rehab movements: ${[...joints].join(', ')} (${tagged.length} entries)`)
  check('every joint this feature claims to cover is still covered',
    ['shoulder', 'knee', 'hip', 'lower_back_axial'].every(j => joints.has(j)), [...joints].join(', '))
}

// ---------------------------------------------------------------------------
console.log('\n7. The quality score knows a rehab warm-up is a legitimate second one')
// ---------------------------------------------------------------------------
{
  // Ashley's ruling was to keep BOTH warm-ups — the one for the day's training
  // and the rehab one — and teach the check, rather than drop one to protect a
  // number. quality-score.ts's `primer_not_first` used to fire on any primer
  // past position 0, which encoded "a session has exactly one warm-up".
  //
  // These assertions exist so the relaxation cannot quietly widen into "any
  // second warm-up is fine". Structure readings for INJURED profiles are not
  // comparable across this change; uninjured ones are unaffected, which is
  // itself asserted below.
  const structureRules = (profile: UserProfile, seed: string) => {
    setRandomSource(seededRngFromKey(seed))
    const d = console.debug, w = console.warn
    console.debug = () => {}; console.warn = () => {}
    try {
      const plan = generateExercisePlan(profile).plan
      const meso = generateMesocycle(profile, plan)
      return new Set(scorePlan(profile, meso, seed).dimensions.structure.deductions.map(x => x.rule))
    } finally { console.debug = d; console.warn = w; resetRandomSource() }
  }

  let injuredClean = 0, injuredTotal = 0
  for (const injury of REHAB_INJURIES) {
    for (const split of SPLITS) {
      injuredTotal++
      const rules = structureRules(buildProfile({ injuries: [injury], workout_split_preference: split }), `qs:${injury}:${split}`)
      if (!rules.has('primer_not_first')) injuredClean++
    }
  }
  check(`an injured trainee's rehab warm-up is not scored as misplaced (${injuredClean}/${injuredTotal})`,
    injuredClean === injuredTotal, `${injuredTotal - injuredClean} still flagged`)

  // The teeth. A hand-built day with a SECOND warm-up that is not rehab for
  // this trainee must still be flagged, or the rule has stopped meaning
  // anything. Built by hand rather than generated, because the engine will no
  // longer produce this shape — which is the point.
  const shoulderRehabPrimer = EXERCISE_DATABASE.find(e => e.mechanics_tier === 'primer' && (e.indicated_joints ?? []).includes('shoulder'))!
  const plainPrimer = EXERCISE_DATABASE.find(e => e.mechanics_tier === 'primer' && (e.indicated_joints ?? []).length === 0)!
  const mainLift = EXERCISE_DATABASE.find(e => e.mechanics_tier === 'tier1_compound')!
  const slot = (name: string, tier: string) => ({
    id: name, name, sets: 2, reps: '8', rest: '60s', intensity: 'Light — movement prep', tier,
  }) as unknown as import('../src/lib/types').Exercise
  const dayOf = (names: [string, string][]) => ({
    day: 'Monday', focus: 'Full Body Power',
    exercises: names.map(([n, t]) => slot(n, t)),
    warmup: { total_seconds: 300 },
  }) as unknown as import('../src/lib/types').WorkoutDay
  const mesoOf = (day: unknown) => ([{ week_number: 1, block_number: 1, label: 'Wk 1', days: [day] }] as unknown as import('../src/lib/types').MesocycleWeek[])
  const injuredProfile = buildProfile({ injuries: ['shoulders'] })

  const twoPlain = scorePlan(injuredProfile, mesoOf(dayOf([
    [plainPrimer.name, 'tier_0_primer'], [plainPrimer.name, 'tier_0_primer'], [mainLift.name, 'tier_1_primary'],
  ])), 'k').dimensions.structure.deductions.map(d => d.rule)
  check('a second warm-up that is NOT rehab is still flagged',
    twoPlain.includes('primer_not_first'), twoPlain.join(', ') || '(nothing flagged)')

  const rehabAfterMain = scorePlan(injuredProfile, mesoOf(dayOf([
    [plainPrimer.name, 'tier_0_primer'], [mainLift.name, 'tier_1_primary'], [shoulderRehabPrimer.name, 'tier_0_primer'],
  ])), 'k').dimensions.structure.deductions.map(d => d.rule)
  check('a rehab warm-up AFTER the main lift is still flagged',
    rehabAfterMain.includes('primer_not_first'), rehabAfterMain.join(', ') || '(nothing flagged)')

  const uninjured = scorePlan(buildProfile({}), mesoOf(dayOf([
    [plainPrimer.name, 'tier_0_primer'], [shoulderRehabPrimer.name, 'tier_0_primer'], [mainLift.name, 'tier_1_primary'],
  ])), 'k').dimensions.structure.deductions.map(d => d.rule)
  check('the exemption needs the INJURY, not just the tag — uninjured is still flagged',
    uninjured.includes('primer_not_first'), uninjured.join(', ') || '(nothing flagged)')
}

// ---------------------------------------------------------------------------
console.log('\nTHE OVER-FIRE CONTROL, WHICH USED TO BE A TAUTOLOGY')
// ---------------------------------------------------------------------------
{
  // A CORRECTION TO A NUMBER I REPORTED. report-rehab-coverage printed
  // "CONTROL — no injury flagged: 0/576 days" and I quoted that zero as
  // evidence the rehab slot does not fire for uninjured people. It was not
  // evidence of anything: it ran the sweep with an EMPTY flagged-joint set
  // and then counted movements indicated FOR THE FLAGGED JOINTS. Nothing can
  // match an empty set, so it read 0 whatever the plans contained — it would
  // have read 0 with the slot firing on every day of every plan.
  //
  // The property does hold, and for a better reason than that sweep:
  // pickRehabMovement returns null on an empty joint set before it looks at
  // the pool at all.
  //
  // WHAT EACH CHECK BELOW ACTUALLY CATCHES, measured rather than assumed,
  // because the first version of this comment overclaimed:
  //
  //   delete the early return          only the SOURCE-SHAPE check fires.
  //                                    The behavioural one still passes —
  //                                    with no flagged joints the pool filter
  //                                    matches nothing and null comes back
  //                                    anyway, by a second mechanism. So on
  //                                    that mutation the behavioural check is
  //                                    close to the same tautology it
  //                                    replaced, and saying otherwise would
  //                                    have repeated the original mistake.
  //   add a "return something rather   FOUR checks fire, this one among them.
  //   than nothing" pool[0] fallback   That is the realistic refactor error,
  //                                    and it is the one that would actually
  //                                    put rehab in an uninjured plan.
  //
  // Both are kept: the shape check guards the guard, the behavioural check
  // guards the outcome, and neither covers the other's mutation.
  const pool = getConstrainedPool(buildProfile({ injuries: [] }), [])
  check('the rehab slot cannot fire with no joints flagged',
    pickRehabMovement(pool, new Set<string>(), new Set<string>()) === null)

  // ...and it DOES fire when one is. Without this the check above is
  // satisfiable by a function that always returns null, which would "pass"
  // while removing rehab from everyone.
  const kneeJoints = getFlaggedJoints(['knees'])
  check('...and does fire when a joint IS flagged',
    pickRehabMovement(pool, kneeJoints, new Set<string>()) !== null, [...kneeJoints])

  // The empty-set guard must be the FIRST thing it does. If it moved below
  // the pool scan, an empty set could still return a movement via a fallback
  // branch and the check above would be luck rather than design.
  const src = readFileSync(new URL('../src/lib/exercise-plan.ts', import.meta.url), 'utf8')
  const body = /export function pickRehabMovement\([\s\S]{0,400}?\{([\s\S]{0,200})/.exec(src)?.[1] ?? ''
  check('the empty-joint guard is the first statement in the function',
    /^\s*(\/\/[^\n]*\n\s*)*if \(flaggedJoints\.size === 0\) return null/.test(body), body.slice(0, 120))
}

console.log(failures === 0 ? '\nAll rehab-prescription checks passed.\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
