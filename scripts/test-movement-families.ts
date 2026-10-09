// ---------------------------------------------------------------------------
// Gate: A DAY NEVER HOLDS THE SAME MOVEMENT TWICE — and every deliberate
// exception to "a substitution group is a family" is listed here, with its
// reason.
//
// THIS GATE WAS NAMED FOR A MONTH BEFORE IT EXISTED. exercise-db.ts said
// "test:movement-families pins which is which" from 8 Sep 2026; a tracer's
// report cited it as a gate a family change would have to pass; nothing held
// the rule at all (test:band-slots and test:style-starve read families only in
// passing). Written 9 Oct 2026 with the two splits in
// docs/plans/a-shoulders-day-with-shoulder-work.md.
//
// And the rule itself was not being kept. Named slots and the tier picks take
// one movement per family. The selector's REFILL loop filtered its candidates
// once and then pushed them without re-checking, so one pass could admit a
// family three times: measured before the fix on 288 seeded bodybuilding
// plans, 94 held a day with two or three exercises of one family.
//
// WHAT IS HELD ON A GENERATED PLAN IS "THE SAME MOVEMENT TWICE", NOT "TWO OF
// ONE FAMILY" — and that is a measured choice, not a retreat. Making the
// refill strictly one-per-family cost uninjured full-gym plans a tenth of
// their chest sets, because a long chest day had been getting Barbell Bench
// Press beside Incline Dumbbell Press that way: two angles, which a coach
// writes. The scorer already drew the line between a variation and a repeat
// (same family, same plane, an implement in common — duplicate_movement_family)
// and the refill loop now draws it in the same place, through the same
// function. Section 3 holds that; section 4 says how much variety is left.
//
// A SPLIT IS A CLAIM that two movements are different enough to share a day.
// The test is "would a coach call these the same exercise". Adding one means
// editing the table below and writing down why — which is the point.
// ---------------------------------------------------------------------------

import { EXERCISE_DATABASE, getMovementFamily, movementFamilyOverrides, getExerciseEntry, isGenuineDuplicate, type ExerciseEntry } from '../src/lib/exercise-db'
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { buildProfile, comboKey, type Combination } from './quality-grid'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ''}`) }
}
const live = EXERCISE_DATABASE.filter(e => !e.retired)
const sortedJson = (v: unknown) => JSON.stringify(v, (_k, val) =>
  val && typeof val === 'object' && !Array.isArray(val) ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b))) : Array.isArray(val) ? [...val].sort() : val)

/**
 * EVERY SUBSTITUTION GROUP WHOSE MEMBERS DO NOT ALL SHARE ONE FAMILY.
 * group -> family -> the members that carry it. `why` is the claim.
 */
const DELIBERATE_SPLITS: Record<string, { why: string; families: Record<string, string[]> }> = {
  bench_press: {
    why: 'A push-up is not a bench press (bodyweight, closed chain). And since 9 Oct 2026 a neutral-grip dumbbell press is not a flat barbell or floor press: different implement, grip, bar path and loaded range — a coach programmes a barbell/floor press and a dumbbell press in one session routinely. Decided as a CSCS coach; it is what gives a shoulder-flagged chest day a second press.',
    families: {
      bench_press: ['Barbell Bench Press', 'Smith Machine Bench Press', 'Dumbbell Bench Press', 'Barbell Floor Press', 'Dumbbell Floor Press', 'Incline Dumbbell Press', 'Incline Machine Press', 'Incline Push-Ups', 'Deficit Push-Ups', 'Archer Push-Ups', 'Chest Press Machine', 'Knee Push-Ups', 'Wide Push-Ups'],
      neutral_grip_press: ['Neutral-Grip Dumbbell Press'],
      push_up: ['Push-Ups'],
    },
  },
  tricep_extension: {
    why: 'Since 9 Oct 2026. Elbow extension with the shoulder neutral (pushdown), extended (kickback) and flexed (overhead, lying): three different lengths for the long head. The flexed arm keeps the group\'s own name, so Overhead Tricep Extension and Skull Crushers still exclude each other. Decided as a CSCS coach; both band triceps movements were one family, so a shoulder-flagged chest day had one triceps exercise.',
    families: {
      tricep_pushdown: ['Tricep Pushdowns', 'Rope Tricep Pushdown', 'Straight-Bar Tricep Pushdown', 'Band Tricep Pushdown'],
      tricep_kickback: ['Band Tricep Kickback'],
      tricep_extension: ['Overhead Tricep Extension', 'Skull Crushers', 'Chair Dips'],
    },
  },
  row: {
    why: 'Close-Grip Lat Pulldown is filed with rows and is a pulldown: it shares the Lat Pulldown\'s family so the two cannot share a day.',
    families: {
      row: ['Chest-Supported Row', 'Neutral-Grip Seated Cable Row', 'Barbell Rows', 'Seated Cable Row', 'Dumbbell Rows', 'T-Bar Rows', 'Landmine Row', 'Inverted Row', 'Towel Row', 'Backpack Row', 'Table Row', 'Seated Machine Row', 'T-Bar Row Machine'],
      pulldown: ['Close-Grip Lat Pulldown'],
    },
  },
  vertical_pull: {
    why: 'A pull-up and its assisted form are one movement; the two wide pulldowns are one movement; the rest of the group are different pulls.',
    families: {
      pull_up: ['Pull-Ups', 'Pull-Ups (Assisted)'],
      pulldown: ['Lat Pulldown'],
      vertical_pull: ['Single-Arm Lat Pulldown', 'Kneeling Band Lat Pulldown', 'Chin-Ups', 'Band Lat Pulldown', 'Pull-Up Negatives'],
    },
  },
  hip_hinge: {
    why: 'A deadlift from the floor is its own family (two bars, one lift); the heavy swing shares a family with the warm-up swing so they cannot share a session.',
    families: {
      deadlift: ['Deadlifts', 'Trap Bar Deadlift'],
      kettlebell_swing: ['Kettlebell Swing (Heavy)'],
      hip_hinge: ['Romanian Deadlifts', 'Cable Pull-Through', 'Good Mornings', 'Back Extension Machine', 'Reverse Hyper Machine', 'Glute Bridge', 'Single-Leg RDL (Bodyweight)', 'Bodyweight Good Morning', 'Bodyweight Hip Hinge to Wall'],
    },
  },
  calf: {
    why: 'Bilateral calf raises are one movement whatever the implement; single-leg and bent-knee work is apart.',
    families: {
      calf_raise: ['Calf Raises', 'Seated Calf Raises', 'Calf Raises (Bodyweight)'],
      calf: ['Standing Calf Raise Machine', 'Single-Leg Dumbbell Calf Raise', 'Single-Leg Calf Raise (Bodyweight)', 'Single-Leg Calf Raise Hold', 'Bent-Knee Calf Raise (Bodyweight)'],
    },
  },
  explosive_upper: {
    why: 'A plyometric push-up is a push-up: it shares the Push-Ups family so both cannot land on one day.',
    families: {
      explosive_upper: ['Medicine Ball Slams'],
      push_up: ['Plyo Push-Ups'],
    },
  },
}

/** Families that reach ACROSS substitution groups — "the same movement wearing different hats". */
const DELIBERATE_MERGES: Record<string, string[]> = {
  push_up: ['Push-Ups', 'Plyo Push-Ups'],
  pulldown: ['Lat Pulldown', 'Close-Grip Lat Pulldown'],
  kettlebell_swing: ['Kettlebell Swing (Heavy)', 'Kettlebell Swings'],
}

function main() {
  // =========================================================================
  console.log('\n1. The table: every split and merge is one this file lists')
  // =========================================================================
  const actualSplits: Record<string, Record<string, string[]>> = {}
  const byGroup = new Map<string, Map<string, string[]>>()
  for (const e of live) {
    const g = byGroup.get(e.substitution_group) ?? new Map<string, string[]>()
    g.set(getMovementFamily(e), [...(g.get(getMovementFamily(e)) ?? []), e.name])
    byGroup.set(e.substitution_group, g)
  }
  for (const [group, fams] of byGroup) if (fams.size > 1) actualSplits[group] = Object.fromEntries(fams)
  const expectedSplits = Object.fromEntries(Object.entries(DELIBERATE_SPLITS).map(([g, v]) => [g, v.families]))
  const unlisted = Object.keys(actualSplits).filter(g => !(g in expectedSplits))
  const gone = Object.keys(expectedSplits).filter(g => !(g in actualSplits))
  check('no substitution group is split that this file does not list', unlisted.length === 0, unlisted.map(g => ({ [g]: actualSplits[g] })))
  check('no split listed here has quietly gone', gone.length === 0, gone)
  for (const group of Object.keys(DELIBERATE_SPLITS)) {
    check(`"${group}" splits exactly as listed`, sortedJson(actualSplits[group] ?? {}) === sortedJson(expectedSplits[group]),
      { actual: actualSplits[group], expected: expectedSplits[group] })
  }
  check('every split carries a written reason', Object.values(DELIBERATE_SPLITS).every(v => v.why.length > 40))

  const byFamily = new Map<string, Set<string>>()
  for (const e of live) byFamily.set(getMovementFamily(e), new Set([...(byFamily.get(getMovementFamily(e)) ?? []), e.substitution_group]))
  const actualMerges = Object.fromEntries([...byFamily].filter(([, gs]) => gs.size > 1).map(([f]) => [f, live.filter(e => getMovementFamily(e) === f).map(e => e.name)]))
  check('families that span two groups are exactly the listed ones', sortedJson(actualMerges) === sortedJson(DELIBERATE_MERGES), { actual: actualMerges })

  // =========================================================================
  console.log('\n2. The override table names real things')
  // =========================================================================
  const overrides = movementFamilyOverrides()
  const stale = Object.keys(overrides).filter(name => !live.some(e => e.name === name))
  check('every name in the override table is a live catalogue entry', stale.length === 0, stale)
  check('the table is not empty (a detector that cannot fire)', Object.keys(overrides).length >= 20, Object.keys(overrides).length)

  const fam = (name: string) => { const e = live.find(x => x.name === name); return e ? getMovementFamily(e) : `MISSING ${name}` }
  check('9 Oct split, presses: a neutral-grip dumbbell press may share a day with a floor press or a barbell bench press',
    fam('Neutral-Grip Dumbbell Press') !== fam('Barbell Floor Press') && fam('Neutral-Grip Dumbbell Press') !== fam('Dumbbell Floor Press') && fam('Neutral-Grip Dumbbell Press') !== fam('Barbell Bench Press'),
    [fam('Neutral-Grip Dumbbell Press'), fam('Barbell Floor Press')])
  check('…and the two floor presses, and a floor press and a bench press, still may not (one lift, two implements)',
    fam('Barbell Floor Press') === fam('Dumbbell Floor Press') && fam('Barbell Floor Press') === fam('Barbell Bench Press') && fam('Dumbbell Bench Press') === fam('Incline Dumbbell Press'))
  check('9 Oct split, triceps: a pushdown, a kickback and an overhead extension are three movements',
    new Set([fam('Band Tricep Pushdown'), fam('Band Tricep Kickback'), fam('Overhead Tricep Extension')]).size === 3)
  check('…and four pushdowns are one; overhead and lying extensions are one',
    new Set(['Tricep Pushdowns', 'Rope Tricep Pushdown', 'Straight-Bar Tricep Pushdown', 'Band Tricep Pushdown'].map(fam)).size === 1 &&
    fam('Overhead Tricep Extension') === fam('Skull Crushers'))
  check('the lateral raises are one movement whatever is in the hand; so are the shrugs',
    new Set(live.filter(e => e.substitution_group === 'lateral_delt').map(getMovementFamily)).size === 1 &&
    new Set(live.filter(e => e.substitution_group === 'shrug').map(getMovementFamily)).size === 1)
  check('Landmine Press was never in the bench-press family (the plan\'s third arm needed no change): it is an overhead press',
    fam('Landmine Press') === 'overhead_press' && live.find(e => e.name === 'Landmine Press')?.movement_pattern === 'vertical_push', fam('Landmine Press'))

  // =========================================================================
  {
    const e = (name: string) => live.find(x => x.name === name)!
    check('the line between a repeat and a variation: a Plank and a Dead Bug are one movement twice; two bench angles are not',
      isGenuineDuplicate(e('Plank'), e('Dead Bug')) === true &&
      isGenuineDuplicate(e('Air Squat'), e('Tempo Air Squat')) === true &&
      isGenuineDuplicate(e('Barbell Bench Press'), e('Incline Dumbbell Press')) === false &&
      // Same implement, different plane: the pair that isolates the plane
      // half of the rule (a mutation dropping it was MISSED without this).
      e('Dumbbell Bench Press').equipment.includes('dumbbells') && e('Incline Dumbbell Press').equipment.includes('dumbbells') &&
      isGenuineDuplicate(e('Dumbbell Bench Press'), e('Incline Dumbbell Press')) === false &&
      // Same plane, no implement in common: the pair that isolates the other half.
      isGenuineDuplicate(e('Lateral Raises'), e('Cable Lateral Raises')) === false &&
      isGenuineDuplicate(e('Plank'), e('Plank')) === false &&
      isGenuineDuplicate(e('Band Tricep Pushdown'), e('Band Tricep Kickback')) === false,
      [isGenuineDuplicate(e('Plank'), e('Dead Bug')), isGenuineDuplicate(e('Air Squat'), e('Tempo Air Squat')), isGenuineDuplicate(e('Barbell Bench Press'), e('Incline Dumbbell Press'))])
  }

  // =========================================================================
  console.log('\n3. The rule, on generated plans: no day holds the same movement twice')
  // =========================================================================
  // Every style, the two long sessions (where a day is filled past its named
  // slots and the refill loop does the work), every kit, uninjured and with a
  // shoulder flag: 4 x 2 x 4 x 2 = 64 seeded plans, sixteen weeks of each.
  const styles: Combination['style'][] = ['bodybuilding', 'functional', 'combat', 'hybrid']
  const kits: Combination['equipment'][] = ['full_gym', 'home_gym', 'minimalist', 'bodyweight']
  const offenders: string[] = []
  let plans = 0, days = 0, primerPairs = 0, variations = 0
  const log = console.log, warn = console.warn
  console.log = () => {}; console.warn = () => {}
  try {
    for (const style of styles) for (const duration of ['60-90', '90+'] as Combination['duration'][]) for (const equipment of kits) for (const injuries of [[], ['shoulders']]) {
      const combo: Combination = { equipment, injuries, duration, style, experience: 'intermediate', goal: 'hypertrophy', recovery: 'moderate', conditioningPref: 'tolerate' }
      setRandomSource(seededRngFromKey(comboKey(combo)))
      let meso
      try { meso = generateMesocycle(buildProfile(combo)) } finally { resetRandomSource() }
      plans++
      for (const week of meso) for (const day of week.days) {
        if (day.exercises.length === 0) continue
        days++
        const entries = day.exercises.map(ex => getExerciseEntry(ex.name)).filter((e): e is ExerciseEntry => !!e)
        // A warm-up drill counts against the day's WORK (the motivating case:
        // Kettlebell Swings as the primer, Kettlebell Swing (Heavy) as a lift).
        // Two warm-up drills are not compared with each other: most are filed
        // in one catch-all group ('conditioning'), which is a shelf, not a
        // movement — a clamshell and a band pull-apart are not one exercise.
        for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
          const a = entries[i], b = entries[j]
          if (a.name === b.name || getMovementFamily(a) !== getMovementFamily(b)) continue
          if (a.mechanics_tier === 'primer' && b.mechanics_tier === 'primer') { primerPairs++; continue }
          if (isGenuineDuplicate(a, b)) offenders.push(`${comboKey(combo)} w${week.week_number} ${day.day}: ${a.name} + ${b.name} (${getMovementFamily(a)})`)
          else variations++
        }
      }
    }
  } finally { console.log = log; console.warn = warn }
  console.log(`  (${plans} plans, ${days} training days; ${variations} same-family pairs that are two VARIATIONS, which is allowed; ${primerPairs} pairs of warm-up drills sharing a shelf, not compared)`)
  check('the sample is the size it claims', plans === 64 && days > 3000, { plans, days })
  check('no day on it holds the same movement twice', offenders.length === 0,
    { count: offenders.length, first: offenders.slice(0, 4) })
  check('…and the detector can see a same-family pair at all (a zero above is not a blind detector)', variations > 0, variations)

  console.log(`\n${ran} checks ran, ${failures} failed.`)
  if (failures > 0) console.error(`\n${failures} movement-family check(s) FAILED`)
  else console.log('\nPASSED — one movement per family per day, and every split is listed with its reason.')
}

main()
process.exit(failures > 0 ? 1 : 0)
