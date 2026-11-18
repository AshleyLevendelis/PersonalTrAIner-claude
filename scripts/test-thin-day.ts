// ---------------------------------------------------------------------------
// A DAY THAT REACHED ITS EXERCISE COUNT AND IS STILL THIN TAKES WORK, NOT MOBILITY
// (18 Nov 2026, decided as a CSCS coach; BACKLOG, the 18 Nov sweep entry).
//
// The 9 Oct rule gives a day borrowed work before its spare time goes to
// optional mobility, and triggered on a day that could not reach its exercise
// COUNT. The count is sized for loaded work and its rests; with no kit the same
// count is a far shorter session. Measured: a bodyweight beginner's Chest &
// Triceps day on a 30-45 plan was two push-up variations and chair dips, seven
// working sets and 23 minutes, with a plank and a reverse crunch in the pool.
//
// What this holds, on the BASE plan (the week every week of the block is made
// from, so what is added here is in every week):
//   1. the named day is no longer thin, and what it took is trunk work;
//   2. over a slice of the grid, work IS taken (the checks bind), and every
//      movement taken is one the push:pull and squat:hinge counts do not see,
//      never a main lift, never a warm-up drill;
//   3. one movement per family on the day, and no movement on three days;
//   4. a day only takes work while it is thin: nine working sets or fewer;
//   5. ...and ten minutes short of its time; nothing taken pushes a day past
//      the longest session asked for.
// The mesocycle half (the day is not left thin with ten minutes of optional
// mobility while its pool has work to give) is test:day-purpose P4.
// ---------------------------------------------------------------------------
import { generateExercisePlan, generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { getExerciseEntry, getMovementFamily, type ExerciseEntry } from '../src/lib/exercise-db'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { estimateDaySeconds, getSessionMaximumSeconds, getDurationBudgetSeconds } from '../src/lib/session-duration'
import { ALL_EQUIPMENT, ALL_DURATIONS, ALL_STYLES, getInjuryCombinations } from '../src/lib/dev-constraint-audit'
import { buildProfile, comboKey, type Combination } from './quality-grid'
import type { WorkoutDay } from '../src/lib/types'

let ran = 0
let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 500)}` : ''}`) }
}
const quiet = <T,>(fn: () => T): T => {
  const d = console.debug, w = console.warn, l = console.log
  console.debug = () => {}; console.warn = () => {}; console.log = () => {}
  try { return fn() } finally { console.debug = d; console.warn = w; console.log = l }
}

/** The trace line the step writes; the one place this gate reads a sentence, so a reworded reason fails loudly. */
const TOOK = 'the day reached its exercise count and was still ten minutes short'
const BALANCE_SEEN = new Set(['horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull', 'knee_dominant', 'single_leg', 'hip_hinge'])
const entryOf = (name: string): ExerciseEntry | undefined => getExerciseEntry(name)
const isPrep = (name: string) => entryOf(name)?.mechanics_tier === 'primer'
const workingSets = (d: WorkoutDay, without: string[] = []) => d.exercises.reduce((n, e) => n + (isPrep(e.name) || without.includes(e.name) ? 0 : e.sets), 0)

const combo = (c: Partial<Combination>): Combination => ({
  equipment: 'bodyweight', injuries: [], duration: '30-45', style: 'bodybuilding', experience: 'beginner',
  goal: 'fat_loss', recovery: 'moderate', conditioningPref: 'tolerate', ...c,
} as Combination)
const basePlan = (c: Combination) => quiet(() => {
  setRandomSource(seededRngFromKey(comboKey(c)))
  try { return generateExercisePlan(buildProfile(c)) } finally { resetRandomSource() }
})
/** Which movements each day took by this step, read off the plan's own trace. */
const takenByDay = (trace: { structure_adjusted: { exercise: string; reason: string }[] }): Map<string, string[]> => {
  const out = new Map<string, string[]>()
  for (const t of trace.structure_adjusted) {
    if (!t.reason.includes(TOOK)) continue
    const day = /added ".*?" to (\w+)/.exec(t.reason)?.[1]
    if (day) out.set(day, [...(out.get(day) ?? []), t.exercise])
  }
  return out
}

function main() {
  console.log('\n1. The named day: a bodyweight beginner\'s chest day on a 30-45 plan')
  {
    const c = combo({})
    const { plan, constraint_trace } = basePlan(c)
    const chest = plan.find(d => d.focus === 'Chest & Triceps' && d.exercises.length > 0)
    const took = chest ? takenByDay(constraint_trace).get(chest.day) ?? [] : []
    check('the plan has a Chest & Triceps day', !!chest, plan.map(d => d.focus))
    check('it took work (it had reached its count and was still short)', took.length >= 1, took)
    check('...and what it took is trunk work', took.length >= 1 && took.every(n => entryOf(n)?.movement_pattern === 'core'), took.map(n => `${n}:${entryOf(n)?.movement_pattern}`))
    check('it is no longer thin: ten working sets or more (it was six in the plan every week is built from)', !!chest && workingSets(chest) >= 10, chest ? { sets: workingSets(chest), day: chest.exercises.map(e => `${e.name} ${e.sets}`) } : null)
    check('...and without what it took it WAS thin (the case binds)', !!chest && workingSets(chest, took) <= 9, chest ? workingSets(chest, took) : null)
    // In the plan he trains from: the same movement on that day in every loading week of the first block.
    const meso = quiet(() => { setRandomSource(seededRngFromKey(comboKey(c))); try { return generateMesocycle(buildProfile(c)) } finally { resetRandomSource() } })
    const block1 = meso.filter(w => w.block_number === meso[0].block_number && !w.is_deload)
    const everyWeek = took.length >= 1 && block1.length >= 2 && block1.every(w => w.days.some(d => d.focus === 'Chest & Triceps' && took.every(n => d.exercises.some(e => e.name === n))))
    check('what it took is on that day in every loading week of the block (added once, to the plan the weeks are made from)', everyWeek, block1.map(w => w.days.find(d => d.focus === 'Chest & Triceps')?.exercises.map(e => e.name)))
  }

  console.log('\n2. Over a slice of the grid: what is taken, and when')
  {
    // 4 kits x 9 injury sets x 4 lengths x 4 styles x three (experience, goal) pairs = 1,728 base plans, the grid's own
    // keys. The injury sets are in because two of the guards only bind where an injury has thinned the pool.
    // THIN_DAY_GRID=full runs every (experience, goal) pair, 9,216 plans; the same checks, a bigger slice.
    const full = process.env.THIN_DAY_GRID === 'full'
    const pairs: [Combination['experience'], Combination['goal']][] = full
      ? (['beginner', 'novice', 'intermediate', 'advanced'] as Combination['experience'][])
          .flatMap(x => (['hypertrophy', 'fat_loss', 'conditioning', 'functional'] as Combination['goal'][]).map(g => [x, g] as [Combination['experience'], Combination['goal']]))
      // The third pair is here because it is where "never a third of one pattern" binds (a beginner's conditioning
      // day holding two trunk movements): on the first two alone that check could not fail.
      : [['beginner', 'fat_loss'], ['intermediate', 'hypertrophy'], ['beginner', 'conditioning']]
    let plans = 0, daysThatTook = 0, movementsTaken = 0
    const bad = { seen: [] as string[], tier: [] as string[], family: [] as string[], thrice: [] as string[], notThin: [] as string[], over: [] as string[], onTime: [] as string[], third: [] as string[] }
    for (const equipment of ALL_EQUIPMENT) for (const injuries of getInjuryCombinations()) for (const duration of ALL_DURATIONS) for (const style of ALL_STYLES) for (const [experience, goal] of pairs) {
      const c = combo({ equipment, injuries, duration, style, experience, goal })
      const { plan, constraint_trace } = basePlan(c)
      plans++
      const taken = takenByDay(constraint_trace)
      const key = comboKey(c)
      const max = getSessionMaximumSeconds(duration)
      for (const d of plan) {
        const took = taken.get(d.day) ?? []
        if (took.length === 0) continue
        daysThatTook++
        movementsTaken += took.length
        for (const n of took) {
          const e = entryOf(n)
          if (!e || BALANCE_SEEN.has(e.movement_pattern)) bad.seen.push(`${key} ${d.day} ${n}:${e?.movement_pattern}`)
          if (!e || e.mechanics_tier === 'tier1_compound' || e.mechanics_tier === 'primer' || e.mechanics_tier === 'cardio') bad.tier.push(`${key} ${d.day} ${n}:${e?.mechanics_tier}`)
          if (plan.filter(x => x.exercises.some(ex => ex.name === n)).length > 2) bad.thrice.push(`${key} ${n}`)
          // Never a THIRD movement of one pattern on the day (two triceps movements, not four; two trunk movements,
          // not three), whichever list it came from.
          if (e && d.exercises.filter(ex => entryOf(ex.name)?.movement_pattern === e.movement_pattern && !isPrep(ex.name)).length > 2) bad.third.push(`${key} ${d.day} ${e.movement_pattern}: ${d.exercises.filter(ex => entryOf(ex.name)?.movement_pattern === e.movement_pattern).map(x => x.name).join(' | ')}`)
        }
        // The family of each movement TAKEN is on the day once. (Asked of the taken movement, not of the whole day:
        // four days on this slice already hold two of a family from their own selection, which is not this step's.)
        const fams = d.exercises.map(ex => entryOf(ex.name)).filter((e): e is ExerciseEntry => !!e).map(e => getMovementFamily(e))
        for (const n of took) {
          const e = entryOf(n)
          if (e && fams.filter(f => f === getMovementFamily(e)).length !== 1) bad.family.push(`${key} ${d.day} ${n} among ${d.exercises.map(x => x.name).join(' | ')}`)
        }
        // Thin when it took its LAST movement: nine working sets or fewer without it.
        if (workingSets(d, [took[took.length - 1]]) > 9) bad.notThin.push(`${key} ${d.day} sets without the last taken=${workingSets(d, [took[took.length - 1]])}`)
        if (estimateDaySeconds(d) > max) bad.over.push(`${key} ${d.day} ${Math.round(estimateDaySeconds(d) / 60)} min of ${max / 60}`)
        // ...and short of its time when it took it. Measured on the day as it ships less the last movement taken and
        // any cardio put on it afterwards; two minutes of slack for the rest floors applied after the step.
        const withoutLast: WorkoutDay = { ...d, exercises: d.exercises.filter(e => e.name !== took[took.length - 1]), recommendedCardio: undefined, mobilityFiller: undefined }
        const spare = getDurationBudgetSeconds(duration) - estimateDaySeconds(withoutLast)
        if (spare < 600 - 120) bad.onTime.push(`${key} ${d.day} spare=${Math.round(spare / 60)} min`)
      }
    }
    console.log(`  (${plans} plans, ${daysThatTook} days took work, ${movementsTaken} movements taken)`)
    check('the slice is the size it claims', plans === ALL_EQUIPMENT.length * getInjuryCombinations().length * ALL_DURATIONS.length * ALL_STYLES.length * pairs.length, plans)
    check('work IS taken somewhere on the slice (the checks below bind)', daysThatTook >= 5 && movementsTaken >= daysThatTook, { daysThatTook, movementsTaken })
    check('every movement taken is one the push:pull and squat:hinge counts do not see', bad.seen.length === 0, { count: bad.seen.length, first: bad.seen.slice(0, 3) })
    check('...and is never a main lift, a warm-up drill or cardio', bad.tier.length === 0, { count: bad.tier.length, first: bad.tier.slice(0, 3) })
    check('a movement taken is the only one of its family on the day', bad.family.length === 0, { count: bad.family.length, first: bad.family.slice(0, 2) })
    check('no movement taken is on three days of the week', bad.thrice.length === 0, { count: bad.thrice.length, first: bad.thrice.slice(0, 3) })
    check('no movement taken is a third of its pattern on the day', bad.third.length === 0, { count: bad.third.length, first: bad.third.slice(0, 3) })
    check('a day only takes work while it is thin (nine working sets or fewer before its last one)', bad.notThin.length === 0, { count: bad.notThin.length, first: bad.notThin.slice(0, 3) })
    check('nothing taken pushes a day past the longest session asked for', bad.over.length === 0, { count: bad.over.length, first: bad.over.slice(0, 3) })
    check('...and only while it is ten minutes short of its time', bad.onTime.length === 0, { count: bad.onTime.length, first: bad.onTime.slice(0, 3) })
  }

  console.log('\n3. A day with room to spare but enough work is left alone')
  {
    // Full gym, intermediate, 60-90: days are well over nine working sets; none may take work by this step.
    const c = combo({ equipment: 'full_gym', duration: '60-90', experience: 'intermediate', goal: 'hypertrophy' })
    const { plan, constraint_trace } = basePlan(c)
    const taken = takenByDay(constraint_trace)
    check('the fixture is what it claims: every training day holds ten working sets or more', plan.filter(d => d.exercises.length > 0).every(d => workingSets(d) >= 10), plan.map(d => workingSets(d)))
    check('...and none of them took work by this step', taken.size === 0, [...taken.entries()])
  }

  console.log(`\n${ran} checks ran.`)
  if (failures > 0) { console.error(`${failures} thin-day check(s) FAILED.`); process.exit(1) }
  console.log('A day that reached its count and was still thin takes trunk or small-muscle work before any mobility.')
}
main()
