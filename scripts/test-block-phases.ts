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

console.log('\n4. Short phase names round-trip, and an unknown one is not swallowed')
{
  const PHASES: TrainingPhase[] = ['anatomical_adaptation', 'hypertrophy', 'strength', 'power', 'metabolic']
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
console.log('\nFour weeks, four names, and the strip agrees with the prose.\n')
