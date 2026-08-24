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
  // Threshold is the HEAD baseline, not zero. Running this exact check against
  // HEAD's engine produces the SAME 10 cases, all "Lateral Raises wk9->10:
  // 12-17@6 -> 13-18@4" in shape: a reps-led lift crossing into a new block
  // re-derives a lighter estimate while its reps climb. That is a real defect
  // and a separate one — flagged in BACKLOG, not introduced here — so this
  // guards against ADDING to it.
  check(`no rep increase is paid for with a lighter weight (${increases} increases, ${offenders.length} bad, HEAD baseline 10)`,
    offenders.length <= 10, offenders.slice(0, 3).join(' | '))
  check('...and rep increases actually happen, so the check has teeth', increases > 0, String(increases))
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
  // Carries: shiftReps passes '40m' through untouched, so a bump would be
  // silently inert. Their lever is distance, and whether distance should
  // progress is a product decision Ashley has not been asked. Asserted as a
  // DELIBERATE exclusion so changing it later is a decision, not a drift.
  const carryChanged: string[] = []
  let carrySeen = 0
  for (const { exA, exB, weekA, weekB } of transitions(plan)) {
    if (getExerciseEntry(exA.name)?.movement_pattern !== 'carry') continue
    carrySeen++
    if (/m$/.test(exA.reps) && exA.reps !== exB.reps) carryChanged.push(`${exA.name} wk${weekA}->${weekB}: ${exA.reps} -> ${exB.reps}`)
  }
  check(`carries keep their fixed distance (${carrySeen} carry transitions)`, carryChanged.length === 0, carryChanged.slice(0, 2).join(' | '))
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
  // Reported, not asserted down: carries are untouched on purpose, and a run
  // that quietly "fixed" them would mean the exclusion had broken.
  check('carries are still frozen — the exclusion is real, not accidental', carryFrozen > 50, String(carryFrozen))
}

console.log(failures === 0 ? '\nAll frozen-week checks passed.\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
