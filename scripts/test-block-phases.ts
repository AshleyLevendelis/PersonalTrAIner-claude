// ---------------------------------------------------------------------------
// THE FOUR WEEKS OF A BLOCK, NAMED — AND THE NAMES AGREEING WITH THE PROSE.
//
// Ashley, on the Full Program screen: "each block still shows the same phase.
// 4 weeks all show hypertrophy rather than going through each phase." Then:
// "Why are 4 weeks anatomical adaptation, followed by four weeks of
// hypertrophy. Shouldn't it change week by week through the phases."
//
// The plan was right — a phase is a stimulus that needs weeks of repeated
// exposure, and VISION.md commits to "four-week blocks with distinct phases".
// The screen was wrong: the four weeks genuinely differ (her block 1 ran
// 72.5 -> 77.5 -> 82.5kg then deloaded to 57.5) and the largest text on the
// page repeated one word four times.
//
// So the strip names each week. THE RISK THAT MATTERS IS A SECOND VOCABULARY:
// a strip that calls week 3 "Peak" over a paragraph that calls it something
// else is worse than no strip, because the two would be arguing on one screen
// about the same week. §2 is the check for that, and it is the reason this
// gate reads generated plans rather than a fixture — the paragraph is built
// by the generator and can only be compared against the real thing.
//
// §4 reads source, because a correct helper the screen does not call is the
// failure mode this repo keeps producing.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { generateExercisePlan, generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { weekRole, type WeekRoleKey } from '../src/lib/week-role'
import { weekNoteText } from '../src/lib/week-note'
import { getPhaseConfig, shortPhaseLabel } from '../src/lib/periodization'
import type { UserProfile, MesocycleWeek, TrainingPhase } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 400)}` : ''}`) }
}

const buildProfile = (o: Partial<UserProfile>): UserProfile => ({
  age: 34, gender: 'male', height_cm: 178, weight_kg: 85, activity_level: 'moderate',
  fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1800, tdee: 2600,
  equipment_access: 'full_gym', injuries: [], training_style: 'hybrid',
  training_experience: 'intermediate', session_duration_preference: '45-60',
  workout_split_preference: 'upper_lower',
  training_days: [
    { day: 'Monday', available: true }, { day: 'Tuesday', available: true },
    { day: 'Wednesday', available: false }, { day: 'Thursday', available: true },
    { day: 'Friday', available: true }, { day: 'Saturday', available: false },
    { day: 'Sunday', available: false },
  ],
  weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
  exercise_exclusions: [] as unknown as never, macro_calculation_mode: 'STANDARD_STATIC',
  coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
  ...o,
} as UserProfile)

const quiet = <T,>(f: () => T): T => {
  const d = console.debug, w = console.warn
  console.debug = () => {}; console.warn = () => {}
  try { return f() } finally { console.debug = d; console.warn = w }
}

function planFor(o: Partial<UserProfile>, seed: string): MesocycleWeek[] {
  return quiet(() => {
    setRandomSource(seededRngFromKey(seed))
    try {
      const p = buildProfile(o)
      return generateMesocycle(p, generateExercisePlan(p).plan)
    } finally { resetRandomSource() }
  })
}

// KNOWN LIFTS IS THE DISCRIMINATOR FOR §1's calibration check, and the reason
// it is a pair rather than one plan: a profile that reported its numbers must
// get "Baseline" in week 1 and one that didn't must get "Calibration". One
// plan alone could not tell those apart, and a gate that only ever sees one
// answer cannot prove the branch works.
const KNOWN_LIFTS: Partial<UserProfile> = {
  skip_calibration_week: true, known_squat_kg: 100, known_bench_kg: 80, known_deadlift_kg: 130,
}

const PLANS: [string, MesocycleWeek[]][] = [
  ['full_gym/hypertrophy (calibrates)', planFor({}, 'bp:1')],
  ['full_gym/hypertrophy (knows lifts)', planFor(KNOWN_LIFTS, 'bp:2')],
  ['bodyweight/beginner', planFor({ equipment_access: 'bodyweight', training_experience: 'beginner' }, 'bp:3')],
  ['minimalist/fat_loss', planFor({ equipment_access: 'minimalist', fitness_goal: 'fat_loss' }, 'bp:4')],
  ['full_gym/functional/advanced', planFor({ fitness_goal: 'functional', training_experience: 'advanced' }, 'bp:5')],
]

console.log('\n1. Every week of every block gets exactly one name')
{
  const problems: unknown[] = []
  let weeks = 0, deloads = 0, calibrations = 0
  for (const [label, plan] of PLANS) {
    check(`${label}: the plan generated 16 weeks (sanity check on this sweep)`, plan.length === 16, plan.length)
    for (const w of plan) {
      weeks++
      const role = weekRole(w)
      if (role.key === 'deload') deloads++
      if (role.key === 'calibration') calibrations++

      // The deload is the claim that must never be wrong in the unsafe
      // direction: calling a recovery week a working one tells someone to
      // push on the week designed for them to back off.
      const isFourth = (w.week_in_block ?? ((w.week_number - 1) % 4) + 1) === 4
      if (isFourth !== (role.key === 'deload')) {
        problems.push({ plan: label, week: w.week_number, week_in_block: w.week_in_block, role: role.key, is_deload: w.is_deload })
      }
      if (!role.label.trim()) problems.push({ plan: label, week: w.week_number, error: 'empty label' })
    }
  }
  console.log(`      ${weeks} weeks across ${PLANS.length} plans; ${deloads} deloads, ${calibrations} calibration weeks`)
  check('the fourth week of every block is the deload, and no other week is', problems.length === 0, problems.slice(0, 6))
  check('...and there are four deloads per plan, so that check has teeth', deloads === PLANS.length * 4, deloads)
}

console.log('\n2. Calibration is named only where the plan actually calibrates')
{
  const calibrating = PLANS.find(p => p[0].includes('calibrates'))![1]
  const knowsLifts = PLANS.find(p => p[0].includes('knows lifts'))![1]
  check('a trainee who did not report their lifts opens on Calibration',
    weekRole(calibrating[0]).key === 'calibration', weekRole(calibrating[0]))
  check('...and a trainee who did opens on Baseline instead',
    weekRole(knowsLifts[0]).key === 'baseline', weekRole(knowsLifts[0]))
  // Calibration is a one-time "find your numbers" exercise, not a recurring
  // one — the generator gates it on weekCounter === 1, and every LATER block
  // must therefore open on Baseline.
  const laterFirstWeeks = calibrating.filter(w => (w.week_in_block ?? 0) === 1 && w.week_number > 1)
  check('every later block still opens on Baseline, not a second Calibration',
    laterFirstWeeks.length > 0 && laterFirstWeeks.every(w => weekRole(w).key === 'baseline'),
    laterFirstWeeks.map(w => ({ week: w.week_number, role: weekRole(w).key })))
}

console.log('\n3. The strip and the paragraph say the same thing about a week')
{
  // THE POINT OF THIS GATE. weekRole takes its vocabulary from the note that
  // buildProgressionNote already writes; if the two ever diverge, one screen
  // ends up arguing with itself about the same week.
  const EXPECTED: Record<WeekRoleKey, RegExp | null> = {
    deload: /deload/i,
    calibration: /deliberately light|find the (weight|version)/i,
    baseline: /baseline/i,
    // "Building" and "Peak" are the strip's own shorthand for sentences that
    // are phrased several ways depending on whether the plan progresses by
    // load, by reps, or has no weight to add at all. Pinning a wording would
    // be pinning the wrong thing; what must hold is that the note SAYS
    // something about this week rather than only about the block.
    building: null,
    peak: null,
  }
  const mismatches: unknown[] = []
  let compared = 0
  for (const [label, plan] of PLANS) {
    for (const w of plan) {
      const role = weekRole(w)
      const note = weekNoteText(w)
      // An activity-only week (a walking plan) returns the walk's own reason
      // and no lifting copy at all — nothing to compare.
      if (!note.trim() || (w.days ?? []).every(d => d.exercises.length === 0)) continue
      compared++
      const pattern = EXPECTED[role.key]
      if (pattern && !pattern.test(note)) {
        mismatches.push({ plan: label, week: w.week_number, role: role.key, note: note.slice(0, 120) })
      }
    }
  }
  console.log(`      compared ${compared} weeks that carry lifting copy`)
  check('the sweep found weeks to compare (sanity check on this check)', compared > 40, compared)
  check('a week the strip calls Deload/Calibration/Baseline is described that way in the note',
    mismatches.length === 0, mismatches.slice(0, 5))
}

// Every phase key, shared by §4 (short-label round-trip) and §6 (floors read
// off the configs). Hoisted so both sections read the same list.
const PHASES: TrainingPhase[] = ['anatomical_adaptation', 'hypertrophy', 'strength', 'power', 'metabolic', 'consolidation']

console.log('\n4. Short phase names round-trip, and an unknown one is not swallowed')
{
  const bad: unknown[] = []
  for (const phase of PHASES) {
    const config = getPhaseConfig(phase)
    const short = shortPhaseLabel(config.label)
    if (short !== config.shortLabel || !short.trim()) bad.push({ phase, label: config.label, got: short })
    // The rail is four-across on a phone. A "short" form no shorter than the
    // full one buys nothing, so the two that already fit are allowed to be
    // equal and the rest must genuinely shrink.
    if (config.label.includes(' ') && short.length >= config.label.length) {
      bad.push({ phase, label: config.label, short, error: 'multi-word label did not shorten' })
    }
  }
  check('every phase in the catalogue has a working short form', bad.length === 0, bad)
  check('an unrecognised label comes back unchanged, not blank',
    shortPhaseLabel('Some Future Phase') === 'Some Future Phase')
  check('...and whitespace does not defeat the lookup',
    shortPhaseLabel('  Anatomical Adaptation  ') === 'Adaptation')
}

console.log('\n5. The screen is wired to it, and leads with the week')
{
  // COMMENTS STRIPPED. This file's own explanation names every symbol it
  // forbids, and a check its documentation can satisfy is the defect this
  // repo keeps catching in its own gates.
  const src = readFileSync(join(ROOT, 'src/components/exercise/ProgramBrowse.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

  check('the browse screen names weeks through weekRole', /weekRole\(/.test(src))
  check('...and keeps no week-name list of its own',
    !/'Baseline'|"Baseline"|'Building'|"Building"|'Peak'|"Peak"/.test(src))
  check('the block labels shorten phase names through the shared map', /shortPhaseLabel\(/.test(src))

  // THE HEADING LEADS WITH THE WEEK — Ashley's ruling after the first attempt
  // named the block instead and still repeated for four weeks. Asserted on the
  // 1.875rem heading specifically, because putting the role anywhere on the
  // page is not the same as putting it where the complaint was.
  const heading = src.slice(src.indexOf('text-[1.875rem]'), src.indexOf('text-[1.875rem]') + 320)
  check('the heading exists to be checked (sanity check on this check)', heading.length > 100, heading.length)
  check('the heading is the WEEK\'s role, not the block\'s name',
    /weekRole\(weekObj\)\.label/.test(heading) && !/Block \$\{currentBlockNumber\}:/.test(heading))
  // The phase name has to survive somewhere readable. Her mockup left it only
  // as a 10px label under the strip; the line under the heading carries it.
  check('...and the phase is named in full on the line beneath',
    /Block \{currentBlockNumber\} of \{blockCount\}[\s\S]{0,160}weekObj\?\.phase_label/.test(src))

  // THE ONE PIECE OF MEANING THAT MUST NOT BE LOST, and it has now survived
  // two rewrites of this strip. Three weeks that mean "more" and one that
  // means "less" cannot look identical, and the app already spends
  // --role-warn on exactly this distinction in the delta chip.
  check('the deload week is coloured as a warning, not as the primary accent',
    /role\.key === 'deload'\s*\n?\s*\?\s*\(?selected \? 'var\(--role-warn\)'/.test(src))
  // A strip nobody can navigate with is a picture.
  check('the strip is tappable', /onClick=\{\(\) => setBrowseWeek\(w\.week_number\)\}/.test(src))
  check('every tick names itself for a screen reader', /aria-label=\{`Week \$\{w\.week_number\}, \$\{role\.label\}/.test(src))
}

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\n6. A block that sets a main-lift rep floor never asks a main lift for fewer')
{
  // Ashley, 2 Sep 2026, shown "Deadlifts 3x3-5" under a Hypertrophy heading
  // that promises moderate loads and higher volume: "Lift it to at least 6
  // reps." Then, shown 7-9 under Metabolic Conditioning: "Lift to at least
  // 10 reps." docs/plans/six-reps-in-a-hypertrophy-block.md. THE FLOORS ARE
  // READ OFF THE PHASE CONFIGS, not typed here, so the next ruling of this
  // shape is covered the moment its config carries a floor — and a floor
  // that quietly vanished from a config would empty this section's teeth
  // rather than pass it (the sanity check below insists at least one phase
  // sets one).
  //
  // The two sources of a too-low main lift were combat style (bases its main
  // lifts at 3-5) and the fat-loss goal (pulls main lifts two reps heavier),
  // so the sweep is built from exactly those, at every experience tier, over
  // every goal that reaches a floored phase — a sweep of bodybuilding
  // hypertrophy plans would pass with the floors deleted.
  const sweep: [string, MesocycleWeek[]][] = [...PLANS]
  for (const training_style of ['combat', 'functional', 'hybrid', 'bodybuilding'] as const) {
    for (const fitness_goal of ['hypertrophy', 'fat_loss', 'functional', 'conditioning'] as const) {
      for (const training_experience of ['beginner', 'novice', 'intermediate', 'advanced'] as const) {
        sweep.push([`${training_style}/${fitness_goal}/${training_experience}`,
          planFor({ training_style, fitness_goal, training_experience }, `bp6:${training_style}:${fitness_goal}:${training_experience}`)])
      }
    }
  }
  const low = (reps: string): number | null => { const m = reps.match(/^(\d+)/); return m ? Number(m[1]) : null }
  const flooredPhases = PHASES
    .map(p => getPhaseConfig(p))
    .filter(c => c.main_lift_rep_floor != null)
    .map(c => ({ label: c.label, floor: c.main_lift_rep_floor! }))
  const floorFor = new Map(flooredPhases.map(f => [f.label, f.floor]))
  check(`at least one phase sets a main-lift rep floor (sanity check on this section): ${flooredPhases.map(f => `${f.label} ${f.floor}`).join(', ')}`,
    flooredPhases.length > 0)
  // HER RULINGS ARE PINNED BY NAME, not derived. Reading the floors off the
  // configs is what makes the NEXT ruling covered automatically — but it also
  // means deleting a floor would quietly delete its check. Found by mutation:
  // with the metabolic floor removed, everything above still passed. The two
  // rulings she has actually made are therefore asserted as facts; a change
  // to either is a change to a decision, and must be made here on purpose.
  check("Ashley's rulings are still in the configs — Hypertrophy at least 6, Metabolic Conditioning at least 10",
    floorFor.get('Hypertrophy') === 6 && floorFor.get('Metabolic Conditioning') === 10, [...floorFor.entries()])

  const slots = new Map<string, number>(), deloadSlots = new Map<string, number>()
  const under: string[] = []
  let strengthMainLiftsBelowSix = 0, strengthMainLifts = 0
  // week-in-block 1 and 2 reps of every loadless main lift in a floored
  // block, keyed by plan/block/day/slot — for the floor-is-a-floor check.
  const loadlessWeek1: Map<string, string> = new Map(), loadlessWeek2: Map<string, string> = new Map()
  for (const [label, plan] of sweep) {
    for (const w of plan) {
      for (const d of w.days) {
        d.exercises.forEach((ex, slot) => {
          if (ex.tier !== 'tier_1_primary') return
          const lo = low(ex.reps)
          if (lo == null) return
          const phase = w.phase_label ?? ''
          const floor = floorFor.get(phase)
          if (floor != null) {
            slots.set(phase, (slots.get(phase) ?? 0) + 1)
            if (w.is_deload) deloadSlots.set(phase, (deloadSlots.get(phase) ?? 0) + 1)
            if (lo < floor) under.push(`${label} w${w.week_number} ${d.day} ${ex.name} ${ex.reps} (${phase}, floor ${floor})`)
            // Beginners INCLUDED since 2 Sep 2026 (Ashley: reps climb when the
            // weight cannot): the experience floor is a minimum too, and the
            // ramp now climbs from it. They were excluded while it swallowed
            // the ramp; that exclusion hid the thing this now pins.
            if (ex.suggested_load_kg == null && !w.is_deload) {
              const key = `${label}|b${w.block_number}|${d.day}|${slot}|${ex.name}`
              if (w.week_in_block === 1) loadlessWeek1.set(key, ex.reps)
              if (w.week_in_block === 2) loadlessWeek2.set(key, ex.reps)
            }
          } else if (phase === 'Maximal Strength') {
            strengthMainLifts++
            if (lo < 6) strengthMainLiftsBelowSix++
          }
        })
      }
    }
  }
  for (const { label, floor } of flooredPhases) {
    console.log(`      ${label}: floor ${floor}, ${slots.get(label) ?? 0} main-lift slots (${deloadSlots.get(label) ?? 0} on deload weeks)`)
    check(`${label} has main-lift slots to judge, deload weeks included (sanity check)`,
      (slots.get(label) ?? 0) > 100 && (deloadSlots.get(label) ?? 0) > 0, [slots.get(label), deloadSlots.get(label)])
  }
  console.log(`      ${sweep.length} plans; ${strengthMainLifts} strength main-lift slots, ${strengthMainLiftsBelowSix} below six`)
  check(`every main lift in every floored week starts at its phase's floor or more (${under.length} under)`, under.length === 0, under.slice(0, 4))
  // THE LEAK CHECK. Each floor lives on its own phase config. If a floor were
  // applied regardless of phase, Maximal Strength — whose whole point is
  // fewer, heavier reps — would lose every 3-5 and 4-6 it has. So the same
  // sweep must still show strength main lifts below six.
  check('...and Maximal Strength still asks main lifts for fewer than six, so no floor has leaked into a phase that goes heavy',
    strengthMainLiftsBelowSix > 0, strengthMainLiftsBelowSix)
  // A FLOOR IS A MINIMUM, NOT A VALUE. The day the first floor landed,
  // test:quality's frozen-week count rose by 511 plans: a loadless main lift
  // (pull-ups) lifted from 4-6 to 6-8 had its weekly +1 rep ramp clamped
  // straight back to 6-8, so weeks 1, 2 and 3 read identically. A floor is
  // now a constant lift added before the ramp, so loadless main lifts under
  // any floor (which ramp reps by design — no weight to add) must have moved
  // between week 1 and week 2 of the block.
  const stuck: string[] = []
  let compared = 0
  for (const [key, w1] of loadlessWeek1) {
    const w2 = loadlessWeek2.get(key)
    if (w2 == null) continue
    compared++
    if (w1 === w2) stuck.push(`${key} ${w1} -> ${w2}`)
  }
  check(`loadless main lifts exist under a floor to compare (${compared} week-1/week-2 pairs)`, compared > 0, compared)
  check(`...and the floors do not freeze them — reps still climb from week 1 to week 2 (${stuck.length} stuck)`,
    stuck.length === 0, stuck.slice(0, 3))
}

// ---------------------------------------------------------------------------
console.log("\n7. A beginner's third block is Consolidation — and nobody else ever sees it")
// ---------------------------------------------------------------------------
{
  // Ashley, 2 Sep 2026: a beginner's third block read "Maximal Strength" over
  // 8-10, the same reps as their Hypertrophy block. Rename it ('consolidation',
  // a real phase key, strength's dosing under a true name) and let reps climb.
  // docs/plans/consolidation-and-the-capped-bar.md. The phase is kept out of
  // the dedupe pool and the bodyweight set on purpose, so it must never appear
  // on anyone but a beginner — and a beginner must never see the two headings
  // that promise heavy work they are not given.
  let beginnerThirds = 0
  const wrongThird: string[] = [], heavyHeadingOnBeginner: string[] = [], leakedToOthers: string[] = []
  for (const equipment_access of ['full_gym', 'home_gym', 'minimalist', 'bodyweight'] as const) {
    for (const fitness_goal of ['hypertrophy', 'fat_loss', 'functional', 'conditioning'] as const) {
      for (const training_experience of ['beginner', 'novice', 'intermediate', 'advanced'] as const) {
        const label = `${equipment_access}/${fitness_goal}/${training_experience}`
        const plan = planFor({ equipment_access, fitness_goal, training_experience }, `bp7:${label}`)
        const third = plan.find(w => w.block_number === 3)?.phase_label ?? '(none)'
        if (training_experience === 'beginner') {
          beginnerThirds++
          // The two goals whose beginner sequence reaches the phase, on
          // equipment that allows it. Fat loss goes metabolic; conditioning
          // keeps its own sequence; a bodyweight beginner keeps today's block 3.
          const expectsConsolidation = (fitness_goal === 'hypertrophy' || fitness_goal === 'functional') && equipment_access !== 'bodyweight'
          if (expectsConsolidation && third !== 'Consolidation') wrongThird.push(`${label}: block 3 is ${third}`)
          for (const w of plan) {
            if (w.phase_label === 'Maximal Strength' || w.phase_label === 'Power & Expression') heavyHeadingOnBeginner.push(`${label} w${w.week_number} ${w.phase_label}`)
          }
        } else {
          for (const w of plan) if (w.phase_label === 'Consolidation') leakedToOthers.push(`${label} w${w.week_number}`)
        }
      }
    }
  }
  check(`beginner plans were generated to judge (${beginnerThirds})`, beginnerThirds > 0, beginnerThirds)
  check(`a beginner's third block is Consolidation wherever the sequence reaches it (${wrongThird.length} wrong)`, wrongThird.length === 0, wrongThird.slice(0, 4))
  check(`no beginner week is headed Maximal Strength or Power & Expression (${heavyHeadingOnBeginner.length})`, heavyHeadingOnBeginner.length === 0, heavyHeadingOnBeginner.slice(0, 3))
  check(`no novice, intermediate or advanced plan ever shows Consolidation (${leakedToOthers.length})`, leakedToOthers.length === 0, leakedToOthers.slice(0, 3))
}

console.log('\nFour weeks, four names, and the strip agrees with the prose.\n')
