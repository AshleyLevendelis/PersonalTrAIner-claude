/**
 * Gate: one lift, one weight, in a given week.
 *
 * The defect: the same exercise, in the same week, with IDENTICAL
 * sets/reps/intensity, prescribed two different weights. A user opening the
 * app saw "Calf Raises 3x15-20 @ RPE 6-7" at 12.5kg on one day and 20kg on
 * another, with no way to tell which was right.
 *
 * It surfaced as 2 `rotation_relative_load` failures in test:audit, which
 * made it look like a rotation problem. It was not: the audit only compares
 * consecutive weeks at the same slot INDEX, so it saw only the handful of
 * cases where the second instance happened to land in a slot that changed
 * hands. MEASURED across the same 4x4x4 sweep the audit uses: 202 of 1,536
 * lift-weeks, not 2.
 *
 * Cause: exercise-plan.ts memoised the per-week REP bump
 * (frozenBumpDecidedThisWeek) and the per-week CARRY step
 * (carryStepDecidedThisWeek) — the file's own comment describes the rep
 * version of this exact bug, "'4-6' on Monday and '5-7' on Thursday" — but
 * never the weight. A lift holding two slots in a week re-derived
 * independently in the second and could land an increment out.
 *
 * NOTHING REMAINS. This gate used to end "what remains is deliberate" and
 * exempt 87 of 92 cases as per-day safety ceilings, ratcheting the rest at 96.
 * That was wrong, and the exemption was hiding a second bug: the memo above
 * only pulls a LATER day down, so whenever the HEAVIER day was built first the
 * rule did not apply at all. Settling the week's weights before the ceilings
 * run took all 92 to zero — if a ceiling had really been diverging those 87 it
 * would have diverged them again afterwards. §2 now exempts nothing.
 *
 * 1 Sep 2026: §3 and §4 were added on the back of a regression found while
 * fixing this one. A prescribed weight is THREE fields — the number, the
 * string every screen renders, and the set-by-set breakdown — and a load floor
 * that raised only the number left the app telling the coach 7.5kg for a lift
 * it had prescribed at 8kg. §3 is that invariant over the sweep; §4 pins the
 * DIRECTION of the new pass, which no gate in the repo could otherwise see.
 */
import { generateMesocycle, setRandomSource, resetRandomSource, enforceOneWeightPerPrescription } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { WEIGHT_GENDER_OPTIONS, ALL_EXPERIENCE } from '../src/lib/dev-constraint-audit'
import { EXERCISE_DATABASE } from '../src/lib/exercise-db'
import { splitLoadDisplay } from '../src/lib/load-prescription'
import type { UserProfile, EquipmentAccess, TrainingExperience, WorkoutDay, Exercise } from '../src/lib/types'

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}

function base(o: Partial<UserProfile>): UserProfile {
  return { age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
    fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1800, tdee: 2500,
    equipment_access: 'full_gym', injuries: [], training_style: 'hybrid',
    training_experience: 'intermediate',
    // 60-90, matching baseMesocycleProfile in dev-constraint-audit.ts. The
    // audit's own failure LABEL says 45-60, which is a hardcoded string at the
    // point the case is recorded and does not name the profile it used — two
    // reproduction attempts went to the wrong configuration because of it.
    session_duration_preference: '60-90',
    workout_split_preference: 'upper_lower',
    training_days: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((day, i) => ({ day, available: i < 4 })),
    weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
    exercise_exclusions: [] as unknown as never, macro_calculation_mode: 'STANDARD_STATIC',
    coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate', ...o } as UserProfile
}
const quiet = <T,>(f: () => T): T => {
  const d = console.debug, w = console.warn, l = console.log
  console.debug = () => {}; console.warn = () => {}; console.log = () => {}
  try { return f() } finally { console.debug = d; console.warn = w; console.log = l }
}

/**
 * The two shapes enforceLoadCoherence CAN vary by day. Kept, though §2 no
 * longer exempts them, because `explained` is now an assertion in its own
 * right: it must stay 0. If a future change reintroduces divergence, knowing
 * whether it wears a safety-ceiling shape is the first thing to look at.
 */
const dayCeilingApplies = (name: string) => {
  const e = EXERCISE_DATABASE.find(x => x.name === name)
  if (!e) return false
  return !!e.unilateral
    || e.movement_pattern === 'isolation_bicep'
    || e.movement_pattern === 'isolation_shoulder'
}

let weeks = 0, total = 0, explained = 0
const unexplained: string[] = []
let loaded = 0, displayDisagrees = 0, perSetDisagrees = 0
const disagreements: string[] = []

for (const equipment of ['full_gym', 'home_gym', 'minimalist', 'bodyweight'] as EquipmentAccess[])
  for (const experience of ALL_EXPERIENCE as TrainingExperience[])
    for (const { weightKg, gender } of WEIGHT_GENDER_OPTIONS) {
      // Seeded exactly as the audit seeds, so this and test:audit describe the
      // same plans. An unseeded sweep here would be a coin flip.
      const comboLabel = `[mesocycle safety] equipment=${equipment} experience=${experience} weight=${weightKg} gender=${gender}`
      const meso = quiet(() => {
        setRandomSource(seededRngFromKey(comboLabel))
        try { return generateMesocycle(base({ equipment_access: equipment, training_experience: experience, weight_kg: weightKg, gender })) }
        finally { resetRandomSource() }
      })
      for (const week of meso) {
        weeks++
        const byPrescription = new Map<string, Set<number>>()
        for (const day of week.days) for (const ex of day.exercises) {
          if (ex.suggested_load_kg == null) continue
          loaded++
          // §3's evidence, gathered on the same pass. See its header.
          const parts = ex.suggested_load ? splitLoadDisplay(ex.suggested_load) : null
          if (!parts || Number(parts.value) !== ex.suggested_load_kg) {
            displayDisagrees++
            if (disagreements.length < 8) disagreements.push(
              `${equipment}/${experience}/${weightKg}${gender[0]} wk${week.week_number} ${ex.name}: holds ${ex.suggested_load_kg}kg, shows "${ex.suggested_load}"`)
          }
          const ps = ex.per_set_load
          if (ps && ps.length > 0) {
            const top = Math.max(...ps.map(s => s.load_kg))
            if (Math.abs(top - ex.suggested_load_kg) > 0.001) {
              perSetDisagrees++
              if (disagreements.length < 8) disagreements.push(
                `${equipment}/${experience}/${weightKg}${gender[0]} wk${week.week_number} ${ex.name}: holds ${ex.suggested_load_kg}kg, top set ${top}kg`)
            }
            for (const sl of ps) {
              const sp = splitLoadDisplay(sl.display)
              if (!sp || Number(sp.value) !== sl.load_kg) {
                perSetDisagrees++
                if (disagreements.length < 8) disagreements.push(
                  `${equipment}/${experience}/${weightKg}${gender[0]} wk${week.week_number} ${ex.name} set ${sl.set_number}: holds ${sl.load_kg}kg, shows "${sl.display}"`)
              }
            }
          }
          const key = `${ex.name}|${ex.sets}|${ex.reps}|${ex.intensity}`
          if (!byPrescription.has(key)) byPrescription.set(key, new Set())
          byPrescription.get(key)!.add(ex.suggested_load_kg)
        }
        for (const [key, weightsSeen] of byPrescription) {
          if (weightsSeen.size <= 1) continue
          total++
          if (dayCeilingApplies(key.split('|')[0])) explained++
          else if (unexplained.length < 8) unexplained.push(`${equipment}/${experience}/${weightKg}${gender[0]} wk${week.week_number} ${key} -> ${[...weightsSeen].sort((a, b) => a - b).join('/')}kg`)
        }
      }
    }

console.log(`\nSwept ${weeks} lift-weeks across the audit's own grid.`)
console.log(`Same lift, same sets/reps/RPE, different weight: ${total} (${explained} of a per-day-ceiling shape)`)

console.log('\n1. The sweep has teeth')
check('it actually generated plans', weeks > 1000, weeks)

console.log('\n2. No lift gets two weights for identical work, full stop')
{
  // THE EXEMPTION IS GONE, AND THAT IS THE HEADLINE. This check used to
  // allow any case whose shape enforceLoadCoherence could plausibly explain
  // (dayCeilingApplies: unilateral, isolation_bicep, isolation_shoulder) —
  // 87 of 92 — on the reasoning that a per-day safety ceiling outranks
  // week-level consistency.
  //
  // enforceOneWeightPerPrescription settles the week's weights BEFORE those
  // ceilings run, and all 92 went to zero, the 87 included. If the ceiling
  // had genuinely been what diverged them it would have diverged them again
  // afterwards. It did not: the exemption was matching the right SHAPE for
  // the wrong reason, and was quietly absorbing the day-order bug §5
  // describes. A safety ceiling that does fire still can — this check would
  // name it, which is the point of not exempting a shape in advance.
  //
  // SCALE NOTE: 202 -> 96 -> 0 are not three points on one curve. The first
  // two were counted WITH the exemption applied to §3's ratchet; this is the
  // unexempted total. Old figures from this gate do not compare.
  check('every lift has one weight per prescription per week', total === 0, unexplained)
  check('...and none needs a per-day-ceiling excuse (87 of 92 used to)', explained === 0, explained)
}

// ---------------------------------------------------------------------------
console.log('\n3. One exercise, one weight, across all three fields that carry it')
// ---------------------------------------------------------------------------
{
  // A PRESCRIBED WEIGHT IS THREE FIELDS, AND THEY CAN DISAGREE.
  // `suggested_load_kg` is the number, `suggested_load` is the string every
  // screen renders, and `per_set_load` is the set-by-set breakdown. Different
  // surfaces read different ones: the Exercise tab and the coach read the
  // string, the set grid reads the breakdown, the audit reads the number.
  //
  // §2 above asks "does this lift have one weight this week". This asks the
  // question one level down: does ONE EXERCISE have one weight AT ALL.
  //
  // It exists because it went wrong. The rep-target load floor in
  // exercise-plan.ts ("a rep bought with a lighter weight is a demotion")
  // raised `suggested_load_kg` by hand and left the other two on the old
  // figure, so the plan held 8kg for a Backpack Curl while the tab and the
  // coach both said "~7.5kg". 61 exercises across the coach sweep; 42 floor
  // applications, propagated forward by the carry-through fallback in the
  // weekly rebuild. test:coach-plan-context caught the string half by
  // accident — it checks what reaches the coach, not what the plan holds —
  // and nothing at all covered the per-set half.
  //
  // NUMERIC COMPARISON, NOT SUBSTRING. `"~7.5kg".includes("5")` is true, so a
  // 5kg number would have passed against a 7.5kg label. splitLoadDisplay is
  // the parser for this app's own output and the round-trip it relies on is
  // pinned by test:load-display §1.
  console.log(`      ${loaded} loaded exercises; ${displayDisagrees} disagree with their label, ${perSetDisagrees} with their set breakdown`)
  check('the sweep found loaded exercises (sanity check on this check)', loaded > 1000, loaded)
  check('the number and the label on screen are the same weight', displayDisagrees === 0, disagreements.slice(0, 8))
  check('...and the set-by-set breakdown tops out at that same weight', perSetDisagrees === 0, disagreements.slice(0, 8))
}

// ---------------------------------------------------------------------------
console.log('\n4. When two days disagree, the LOWER weight is the one that wins')
// ---------------------------------------------------------------------------
{
  // §2 proves the two days AGREE. It cannot prove WHICH of them moved, and
  // that is the half that matters: agreeing on the heavier number tells
  // someone to lift more than the lift earned on the other day, which is the
  // opposite of the rule the engine states. MEASURED: swapping Math.min for
  // Math.max inside enforceOneWeightPerPrescription left §2 green, along with
  // test:audit (17,423 combos), test:frozen-weeks and every other load gate.
  // Nothing in the repo could see it. Hence a direct call.
  const mk = (name: string, kg: number, display: string): Exercise => ({
    name, sets: 3, reps: '11-13', rest: '90s', substitution: '', intensity: 'RPE 6-7',
    suggested_load_kg: kg, suggested_load: display,
    per_set_load: [{ set_number: 1, load_kg: kg, display }, { set_number: 2, load_kg: kg, display }],
  })
  const day = (d: string, ex: Exercise): WorkoutDay => ({ day: d, focus: 'Upper', exercises: [ex] })

  const heavyFirst: WorkoutDay[] = [
    day('Monday', mk('Shoulder Press Machine', 45, '~45kg')),
    day('Wednesday', mk('Shoulder Press Machine', 32.5, '~32.5kg')),
  ]
  enforceOneWeightPerPrescription(heavyFirst)
  const kgs = heavyFirst.map(d => d.exercises[0].suggested_load_kg)
  check('the heavier day comes DOWN to the lighter one', kgs.every(k => k === 32.5), kgs)

  // The order the per-slot memo already handled, kept so this reads as a
  // property of the pass and not of the fixture that exposed the bug.
  const lightFirst: WorkoutDay[] = [
    day('Monday', mk('Shoulder Press Machine', 32.5, '~32.5kg')),
    day('Wednesday', mk('Shoulder Press Machine', 45, '~45kg')),
  ]
  enforceOneWeightPerPrescription(lightFirst)
  check('...and so does the heavier day when it comes second',
    lightFirst.map(d => d.exercises[0].suggested_load_kg).every(k => k === 32.5),
    lightFirst.map(d => d.exercises[0].suggested_load_kg))

  // It moves the WHOLE prescription, not just the number — the regression
  // §4 exists for, asserted at the one call site that is allowed to change a
  // weight after the fact.
  const moved = heavyFirst[0].exercises[0]
  check('...taking the label and the set breakdown with it',
    moved.suggested_load === '~32.5kg' && (moved.per_set_load ?? []).every(sl => sl.load_kg === 32.5 && sl.display === '~32.5kg'),
    { display: moved.suggested_load, perSet: moved.per_set_load })

  // A DIFFERENT PRESCRIPTION IS A DIFFERENT QUESTION. Two days at different
  // set counts are allowed to carry different weights; equalising those would
  // be the pass overreaching.
  const differentSets: WorkoutDay[] = [
    day('Monday', mk('Shoulder Press Machine', 45, '~45kg')),
    day('Wednesday', { ...mk('Shoulder Press Machine', 32.5, '~32.5kg'), sets: 4 }),
  ]
  enforceOneWeightPerPrescription(differentSets)
  check('a different set count is left alone',
    differentSets[0].exercises[0].suggested_load_kg === 45,
    differentSets.map(d => d.exercises[0].suggested_load_kg))
}

if (failures > 0) { console.error(`\n${failures} check(s) failed`); process.exit(1) }
console.log('\nAll week-load-consistency checks passed.\n')
