// ---------------------------------------------------------------------------
// Gate for a week not being a carbon copy of the week before.
//
// The unverified ramp (load-prescription.ts:1264) is a CEILING APPROACH: each
// loading week steps up from the last, capped by that week's fresh standards
// estimate. That cap is right — for someone the app has never seen lift,
// prescribing past the estimate would be inventing strength data. But once the
// ramp converges on the ceiling, Math.min pins it there, and these are
// load-progression lifts, so reps are held flat BECAUSE load was supposed to
// be the lever. Nothing moves. Ashley's ruling: buy a rep with the week.
//
// This shipped on the SIXTH attempt. Five earlier ones each improved the
// headline number and broke something else; docs/PLAN-the-weeks-that-repeat-
// themselves.md records them. Every rule below is one of those failures,
// turned into an assertion so it cannot come back.
//
//   OBSERVE FIRST, THEN PIN. The probe runs with BASE reps and no pin, so it
//   asks honestly whether the weight would have moved on its own. Pinning
//   first made the freeze self-perpetuating — this week set equal to last, so
//   still "stuck", so pinned again, and the weight could never escape.
//   A REP BOUGHT MUST NOT COST WEIGHT. Reps feed prescribeLoad as
//   repRangeLabel, so more reps means a lower estimate. More reps at less
//   weight is a deload wearing progress's clothes, and the frozen-week counter
//   falls either way — so it has to be asserted, not measured.
//   ONE DECISION PER LIFT PER WEEK. A lift holding two slots incremented the
//   streak twice and showed "4-6" on Monday and "5-7" on Thursday at the same
//   weight.
//   IT ACCUMULATES, THEN STOPS. 7-9, then 8-10 — and no further, because
//   shiftReps has a floor and no ceiling and a rep range carries its block's
//   intent.
// ---------------------------------------------------------------------------

import { generateExercisePlan, generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { getExerciseEntry } from '../src/lib/exercise-db'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { DEFAULT_CARRY_DISTANCE_M } from '../src/lib/session-duration'
import { seededRngFromKey } from '../src/lib/seeded-random'
import type { UserProfile, MesocycleWeek } from '../src/lib/types'

// Read from source rather than restated, so raising either constant in
// exercise-plan.ts fails this gate instead of silently widening the cap.
const PLAN_SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/lib/exercise-plan.ts'), 'utf8')
const STEP_M = Number(/const FROZEN_CARRY_DISTANCE_STEP_M = (\d+)/.exec(PLAN_SRC)?.[1] ?? NaN)
const MAX_STEPS = Number(/const MAX_FROZEN_CARRY_DISTANCE_STEPS = (\d+)/.exec(PLAN_SRC)?.[1] ?? NaN)

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

function meso(profile: UserProfile, seed: string): MesocycleWeek[] {
  setRandomSource(seededRngFromKey(seed))
  const d = console.debug, w = console.warn
  console.debug = () => {}; console.warn = () => {}
  try { return generateMesocycle(profile, generateExercisePlan(profile).plan) } finally { console.debug = d; console.warn = w; resetRandomSource() }
}

const EQUIP = ['full_gym', 'home_gym', 'minimalist', 'bodyweight'] as const
const SPLITS = ['upper_lower', 'push_pull_legs', 'full_body'] as const
const EXP = ['novice', 'intermediate', 'advanced'] as const

const repLow = (reps: string): number | null => {
  const m = reps.match(/^(\d+)/)
  return m ? Number(m[1]) : null
}

function* transitions(plan: MesocycleWeek[]) {
  for (let i = 0; i < plan.length - 1; i++) {
    const a = plan[i], b = plan[i + 1]
    if (a.is_deload || b.is_deload) continue
    for (const dayA of a.days) {
      const dayB = b.days.find(d => d.day === dayA.day)
      if (!dayB) continue
      for (let j = 0; j < dayA.exercises.length; j++) {
        const exA = dayA.exercises[j], exB = dayB.exercises[j]
        if (!exB || exB.name !== exA.name) continue
        yield { exA, exB, weekA: a.week_number, weekB: b.week_number, day: dayA.day }
      }
    }
  }
}

function* everyCombo() {
  for (const equipment_access of EQUIP) {
    for (const workout_split_preference of SPLITS) {
      for (const training_experience of EXP) {
        yield {
          profile: buildProfile({ equipment_access, workout_split_preference, training_experience }),
          seed: `frozen:${equipment_access}:${workout_split_preference}:${training_experience}`,
          label: `${equipment_access}/${workout_split_preference}/${training_experience}`,
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
console.log('\n1. A rep bought must never cost weight')
// ---------------------------------------------------------------------------
{
  const offenders: string[] = []
  let increases = 0
  for (const { profile, seed, label } of everyCombo()) {
    for (const { exA, exB, weekA, weekB, day } of transitions(meso(profile, seed))) {
      const lowA = repLow(exA.reps), lowB = repLow(exB.reps)
      if (lowA == null || lowB == null || lowB <= lowA) continue
      if (exA.suggested_load_kg == null || exB.suggested_load_kg == null) continue
      increases++
      if (exB.suggested_load_kg < exA.suggested_load_kg) {
        offenders.push(`${label} ${exA.name} ${day} wk${weekA}->${weekB}: ${exA.reps}@${exA.suggested_load_kg} -> ${exB.reps}@${exB.suggested_load_kg}`)
      }
    }
  }
  // ZERO, since 31 Aug 2026. This used to hold a HEAD baseline of 10 —
  // "Lateral Raises wk9->10: 12-17@6 -> 13-18@4" and others of that shape,
  // a reps-led lift whose weight followed its own falling standards estimate
  // down as the block's reps climbed. A gate parked at a non-zero baseline
  // only stops the defect GROWING, and this one grew to 11 before anyone
  // looked. Ashley's ruling: within a block the weight never drops. So the
  // threshold is 0 and the offenders list is the evidence, not a budget.
  check(`no rep increase is paid for with a lighter weight (${increases} increases, ${offenders.length} bad, must be 0)`,
    offenders.length === 0, offenders.slice(0, 3).join(' | '))
  check('...and rep increases actually happen, so the check has teeth', increases > 0, String(increases))

  // THE FLOOR MUST NOT REACH THE DELOAD. Dropping the weight is what a deload
  // is FOR, so the "never drops" rule is scoped to loading weeks — and the
  // check above cannot see that, because transitions() skips every deload
  // pair. Measured: mutating the floor to apply on deloads too left the whole
  // gate green, which is a rule with no test behind it.
  //
  // THE COMPARISON IS THE IMMEDIATELY PRECEDING WEEK, not the last time the
  // lift was seen. The first version of this check used last-seen and went red
  // on "Seated Cable Row wk12: 40 -> 45" — a deload in block 3 against a
  // sighting back in block 2, where the whole block was lighter. That is not a
  // deload going up; it is two different blocks. A check that fires on a
  // legitimate difference is worse than no check, because the next person
  // reads past it.
  let deloadDrops = 0
  const deloadRises: string[] = []
  for (const { profile, seed, label } of everyCombo()) {
    const plan = meso(profile, seed)
    for (let i = 1; i < plan.length; i++) {
      const wk = plan[i]
      if (!wk.is_deload) continue
      const prevWeek = new Map<string, number>()
      for (const day of plan[i - 1].days) {
        for (const e of day.exercises) {
          if (e.suggested_load_kg == null) continue
          const already = prevWeek.get(e.name)
          prevWeek.set(e.name, already == null ? e.suggested_load_kg : Math.min(already, e.suggested_load_kg))
        }
      }
      for (const day of wk.days) {
        for (const e of day.exercises) {
          if (e.suggested_load_kg == null) continue
          const prev = prevWeek.get(e.name)
          if (prev == null) continue
          if (e.suggested_load_kg < prev) deloadDrops++
          if (e.suggested_load_kg > prev) deloadRises.push(`${label} ${e.name} wk${wk.week_number}: ${prev} -> ${e.suggested_load_kg}`)
        }
      }
    }
  }
  check(`a deload still takes the weight down (${deloadDrops} drops)`, deloadDrops > 0, String(deloadDrops))

  // TWO KNOWN OFFENDERS, PINNED BY NAME rather than by a count. This check is
  // new (31 Aug 2026) and found these two on its first run — measured against
  // the engine BOTH with and without the load floor, identically, so they are
  // pre-existing and not caused by it. A deload that comes in HEAVIER than the
  // week before it is a real defect: the week is supposed to be the easy one.
  //
  // Listed rather than counted deliberately. A budget of "at most 2" would let
  // one of these be fixed while a different lift quietly broke, which is the
  // exact failure §1 above spent eleven offenders learning. A new name here
  // fails even though the total is unchanged. Logged in BACKLOG for a fix.
  // NOW EMPTY, AND THAT IS A MEASUREMENT, NOT AN EDIT TO GET GREEN.
  //
  //   two    (31 Aug 2026, first run)
  //   one    (1 Sep 2026) — 'full_gym/full_body/intermediate Seated Cable Row
  //          wk12: 40 -> 45' stopped reproducing when the machine-floor batch
  //          added 15 full_gym candidates and changed which exercises that
  //          seeded plan picks. DISPLACED, not fixed.
  //   zero   (1 Sep 2026) — 'minimalist/full_body/intermediate Dumbbell Floor
  //          Press wk16: 18 -> 20' stopped reproducing when
  //          enforceOneWeightPerPrescription landed. That one IS a fix and the
  //          mechanism explains it: the lift held two weights in week 15, the
  //          deload was built against one of them and this check compares
  //          against the other (Math.min above). One weight per week per
  //          prescription removes the disagreement the comparison was reading.
  //
  // The list stays here, empty, rather than being deleted with its checks: an
  // empty pin is the strongest form of this gate — ANY deload rise now fails
  // by name on the line above.
  const KNOWN_DELOAD_RISES: string[] = []
  const newRises = deloadRises.filter(r => !KNOWN_DELOAD_RISES.includes(r))
  const fixedRises = KNOWN_DELOAD_RISES.filter(r => !deloadRises.includes(r))
  check('...and no NEW deload comes in heavier than the week before it',
    newRises.length === 0, newRises.slice(0, 3).join(' | '))
  check('...with the known ones still exactly as recorded — remove them here when fixed',
    fixedRises.length === 0, fixedRises.join(' | '))
}

// ---------------------------------------------------------------------------
console.log('\n2. One decision per lift per week')
// ---------------------------------------------------------------------------
{
  // A lift on two days must not show two different targets at one weight. The
  // streak is keyed by lift name but was applied per slot, so the second slot
  // incremented it again: 19 such lift-weeks at HEAD became 108. The threshold
  // is the HEAD baseline, not zero — a handful pre-date this work.
  let sameWeightDifferentReps = 0
  for (const { profile, seed } of everyCombo()) {
    for (const week of meso(profile, seed)) {
      const byLift = new Map<string, { reps: Set<string>; loads: Set<number> }>()
      for (const day of week.days) {
        for (const ex of day.exercises) {
          if (ex.suggested_load_kg == null) continue
          const e = byLift.get(ex.name) ?? { reps: new Set<string>(), loads: new Set<number>() }
          e.reps.add(ex.reps); e.loads.add(ex.suggested_load_kg)
          byLift.set(ex.name, e)
        }
      }
      for (const v of byLift.values()) if (v.reps.size > 1 && v.loads.size === 1) sameWeightDifferentReps++
    }
  }
  check(`one lift at one weight shows one rep target (${sameWeightDifferentReps}, HEAD baseline 19)`,
    sameWeightDifferentReps <= 19, String(sameWeightDifferentReps))
}

// ---------------------------------------------------------------------------
console.log('\n3. The bump accumulates, and then it stops')
// ---------------------------------------------------------------------------
{
  const overshoot: string[] = []
  let runsSeen = 0
  for (const { profile, seed, label } of everyCombo()) {
    const plan = meso(profile, seed)
    const byLift = new Map<string, { reps: string; load: number; phase: string }[]>()
    for (const week of plan) {
      if (week.is_deload) continue
      for (const day of week.days) {
        for (const ex of day.exercises) {
          if (ex.suggested_load_kg == null) continue
          const arr = byLift.get(ex.name) ?? []
          arr.push({ reps: ex.reps, load: ex.suggested_load_kg, phase: week.phase_label ?? '' })
          byLift.set(ex.name, arr)
        }
      }
    }
    for (const [name, history] of byLift) {
      // A REP ceiling, so carries are not its business — repLow('45m') reads
      // 45 and cheerfully compares it against a 40m baseline as "+5 reps".
      // Correct arithmetic, wrong unit. Carry distance has its own cap,
      // asserted against the source constants in section 4.
      if (history.some(h => /^\d+\s*m$/.test(String(h.reps)))) continue
      let baseLow: number | null = null
      for (let i = 1; i < history.length; i++) {
        // A phase change rewrites the base rep range wholesale — Maximal
        // Strength's 5-7 becoming Hypertrophy's 10-12 is periodisation, not a
        // bump. Learned the honest way: an earlier version of this check
        // flagged "Walking Lunges 6-8 -> 10-12 (+5)" as a cap failure, and the
        // trace showed a block boundary whose load matched at 20kg either side.
        if (history[i].phase !== history[i - 1].phase || history[i].load !== history[i - 1].load) {
          baseLow = null
          continue
        }
        if (baseLow == null) { baseLow = repLow(history[i - 1].reps); runsSeen++ }
        const low = repLow(history[i].reps)
        // Two ceilings, because two mechanisms add reps. This one — the
        // frozen-load bump — is capped at 3. A reps-led lift ALSO climbs
        // w-1 within its block by design, up to 2 more, and that predates
        // this work. So a load-led lift (the bump alone) may gain at most 3;
        // any lift may gain at most 5. Conflating the two is what made an
        // earlier version of this check fail on Landmine Press at +4.
        const entry = getExerciseEntry(name)
        const loadLedOnly = entry?.mechanics_tier === 'tier1_compound'
        const ceiling = loadLedOnly ? 3 : 5
        if (baseLow != null && low != null && low - baseLow > ceiling) {
          overshoot.push(`${label} ${name}: ${history[i - 1].reps} -> ${history[i].reps} (+${low - baseLow}, ceiling ${ceiling})`)
        }
      }
    }
  }
  check('a stuck lift never gains more reps than its ceiling allows', overshoot.length === 0, overshoot.slice(0, 3).join(' | '))
  check('...and stuck runs actually occur, so the check has teeth', runsSeen > 0, String(runsSeen))
}

// ---------------------------------------------------------------------------
console.log('\n4. Where it deliberately does not fire')
// ---------------------------------------------------------------------------
{
  const plan = meso(buildProfile({}), 'frozen:full_gym:upper_lower:intermediate')
  // THIS ASSERTION USED TO SAY THE OPPOSITE, and the change of meaning is
  // deliberate rather than a drift. It read "carries keep their fixed
  // distance", written so the exclusion could not quietly rot into an
  // accident — at the time their lever was load only, and whether distance
  // should progress was an unasked product question. Ashley has now answered
  // it: when the weight can't move, walk further. MEASURED, carries were 100
  // of 265 frozen transitions before that and are 52 after, with 52 of the
  // residual sitting at exactly the 55m cap.
  //
  // The teeth move to the other side. Distance must move ONLY when load
  // didn't, never on a deload or calibration week, and never past the cap.
  // SWEPT, not sampled. The first version of this block ran one profile and
  // its over-fire check asserted "distance never moves in the same week the
  // load did" — it passed, and it was WRONG on both counts: swept across
  // every combo the real figure is 8 of 272, and all 8 are the deliberate
  // reset (a carry that earned a heavier weight goes back to the base
  // distance, exactly as double progression resets a rep range). A gate that
  // passes because its one profile happens not to show the behaviour is a
  // gate with a blind spot.
  const carryDistances = new Set<string>()
  const wentBackwardsUnearned: string[] = []
  const grewWhileLoadGrew: string[] = []
  const overCap: string[] = []
  let carrySeen = 0
  for (const { profile, seed } of everyCombo()) {
    const plan = meso(profile, seed)
    for (const { exA, exB, weekA, weekB } of transitions(plan)) {
      if (getExerciseEntry(exA.name)?.movement_pattern !== 'carry') continue
      // The isometric carry HOLD is time-prescribed; distance is not its unit.
      if (!/^\d+\s*m$/.test(String(exA.reps)) || !/^\d+\s*m$/.test(String(exB.reps))) continue
      const wkA = plan.find(w => w.week_number === weekA)
      const wkB = plan.find(w => w.week_number === weekB)
      // A deload resets to the base distance by design — see
      // fixedUnitPrescription. Comparing across one measures the reset, not
      // the progression.
      if (wkA?.is_deload || wkB?.is_deload) continue
      carrySeen++
      carryDistances.add(String(exA.reps))
      const dA = parseInt(String(exA.reps), 10), dB = parseInt(String(exB.reps), 10)
      const lA = exA.suggested_load_kg ?? 0, lB = exB.suggested_load_kg ?? 0
      const where = `${exA.name} wk${weekA}->${weekB}: ${dA}m@${lA} -> ${dB}m@${lB}`

      // THE PROPERTY THAT ACTUALLY MATTERS. Walking LESS far is only ever
      // acceptable as the price of a heavier carry. Shorter for the same or
      // less weight is a straight regression the trainee would see on the
      // card, and is what the naive one-profile check failed to look for.
      if (dB < dA && lB <= lA) wentBackwardsUnearned.push(where)
      // And distance must never climb in the same week the weight did — that
      // is two levers at once, which is what buying distance exists to avoid.
      if (dB > dA && lB !== lA) grewWhileLoadGrew.push(where)

      for (const m of [dA, dB]) {
        if (m > DEFAULT_CARRY_DISTANCE_M + MAX_STEPS * STEP_M) overCap.push(`${exA.name}: ${m}m`)
      }
    }
  }
  check(`carry distance actually progresses (${carryDistances.size} distinct distances across ${carrySeen} loading transitions)`,
    carryDistances.size > 1 && carrySeen > 200, `${[...carryDistances].join(', ')} over ${carrySeen}`)
  check(`distance never shortens unless the weight went up (${wentBackwardsUnearned.length} of ${carrySeen})`,
    wentBackwardsUnearned.length === 0, wentBackwardsUnearned.slice(0, 3).join(' | '))
  check(`distance never grows in the same week the weight did (${grewWhileLoadGrew.length})`,
    grewWhileLoadGrew.length === 0, grewWhileLoadGrew.slice(0, 3).join(' | '))
  check(`never past the ${DEFAULT_CARRY_DISTANCE_M + MAX_STEPS * STEP_M}m cap (${overCap.length})`,
    overCap.length === 0, [...new Set(overCap)].slice(0, 3).join(', '))

  // Deloads and calibration weeks are excluded at the source; asserted here
  // because a carry walking further on a recovery week is the exact shape of
  // "the fix fired where it shouldn't".
  const deloadCarries: string[] = []
  for (const wk of plan) {
    if (!wk.is_deload && !wk.isCalibrationWeek) continue
    for (const day of wk.days) for (const ex of day.exercises) {
      if (getExerciseEntry(ex.name)?.movement_pattern !== 'carry') continue
      if (/^\d+\s*m$/.test(String(ex.reps)) && parseInt(String(ex.reps), 10) > DEFAULT_CARRY_DISTANCE_M + MAX_STEPS * STEP_M) {
        deloadCarries.push(`w${wk.week_number} ${ex.name} ${ex.reps}`)
      }
    }
  }
  check(`a deload or calibration week never walks past the cap either (${deloadCarries.length})`,
    deloadCarries.length === 0, deloadCarries.slice(0, 2).join(', '))

  check('deload weeks still generate normally', plan.filter(w => w.is_deload).every(w => w.days.every(d => d.exercises.every(e => !!e.reps))))
}

// ---------------------------------------------------------------------------
console.log('\n5. The measured improvement holds')
// ---------------------------------------------------------------------------
{
  // BEFORE: 518 frozen transitions of 5,728 (9.0%), 380 loaded non-carry.
  // AFTER:  264 of 5,767 (4.6%), 126 loaded non-carry. Thresholds sit clear of
  // the measured figures so ordinary drift doesn't fail a build, but a
  // regression toward the old behaviour would.
  let total = 0, frozen = 0, loadedFrozen = 0, carryFrozen = 0
  for (const { profile, seed } of everyCombo()) {
    for (const { exA, exB } of transitions(meso(profile, seed))) {
      const pt = (exA as { prescription_type?: string }).prescription_type
      if (exA.tier === 'tier_0_primer' || pt === 'steady_state') continue
      total++
      const loadFrozen = exA.suggested_load_kg == null
        ? exB.suggested_load_kg == null
        : exA.suggested_load_kg === exB.suggested_load_kg
      if (!(loadFrozen && exA.reps === exB.reps)) continue
      frozen++
      if (getExerciseEntry(exA.name)?.movement_pattern === 'carry') carryFrozen++
      else if (exA.suggested_load_kg != null) loadedFrozen++
    }
  }
  const rate = frozen / total * 100
  console.log(`      ${frozen}/${total} frozen (${rate.toFixed(1)}%) — ${loadedFrozen} loaded non-carry, ${carryFrozen} carries`)
  check('the frozen rate stays well below the 9.0% it started at', rate < 6.0, `${rate.toFixed(1)}%`)
  check('loaded non-carry freezes stay far below the 380 they started at', loadedFrozen < 180, String(loadedFrozen))
  // This assertion also changed meaning with the carry work. It used to read
  // "carries are still frozen — the exclusion is real, not accidental",
  // guarding an exclusion that no longer exists. MEASURED across this sweep:
  // 100 carries frozen before distance progressed, 52 after — and 52 of the
  // residual sit at exactly the 55m cap, which is a ceiling reached rather
  // than a lever missing. Asserted as a real reduction with a floor under it,
  // so neither a regression NOR a silent walk past the cap passes.
  check(`carries roughly halved and stopped at the cap (${carryFrozen}, was 100)`,
    carryFrozen < 70 && carryFrozen > 20, String(carryFrozen))
}

console.log(failures === 0 ? '\nAll frozen-week checks passed.\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
