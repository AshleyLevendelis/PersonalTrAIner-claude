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
  generateExercisePlan, setRandomSource, resetRandomSource,
  getConstrainedPool, getFlaggedJoints, pickRehabMovement,
} from '../src/lib/exercise-plan'
import { getExerciseEntry, isIndicatedFor, EXERCISE_DATABASE } from '../src/lib/exercise-db'
import { seededRngFromKey } from '../src/lib/seeded-random'
import type { UserProfile, WorkoutDay } from '../src/lib/types'

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
for (const injury of ['shoulders', 'knees'] as const) {
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
  for (const injury of ['shoulders', 'knees'] as const) {
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
  for (const injury of ['shoulders', 'knees'] as const) {
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
for (const injury of ['shoulders', 'knees'] as const) {
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
  check('an unmapped injury code is not a licence to invent one',
    pickRehabMovement(pool, getFlaggedJoints(['hips']), new Set()) === null)

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
  for (const injury of ['shoulders', 'knees'] as const) {
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
  // Documents the coverage gap rather than asserting it away: five of the
  // eight injury codes a user can pick have no rehab movements at all, so
  // this feature is silent for them. Flagged for Ashley, not fixed here.
  console.log(`      joints with rehab movements: ${[...joints].join(', ')} (${tagged.length} entries)`)
  check('the two joints this feature covers are still covered',
    joints.has('shoulder') && joints.has('knee'), [...joints].join(', '))
}

console.log(failures === 0 ? '\nAll rehab-prescription checks passed.\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
