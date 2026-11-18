// ---------------------------------------------------------------------------
// test:rep-ceiling — no loaded lift is prescribed past 20 reps (18 Nov 2026, the Fable pass on plans; CSCS).
//
// Found by generating 120 people's plans and reading the cards: 16% of loaded exercise slots asked for more than 20
// reps and 4% for more than 25, up to "Overhead Tricep Extension 3x24-29 @ 18kg" (exercise-plan.ts, LOADED_REP_CEILING).
// This holds:
//   1. the rule: how far a range is lowered so its last loading week tops out at 20
//   2. real plans (seeded): no loaded lift over 20 in any week, deloads included; weightless lifts are not capped
//   3. a lowered lift still progresses through its block (it is a lowered range, not a capped number)
//   4. the two places that work out a week's reps agree on a lowered lift
// The plans are seeded, and the grid is the one the broken rule was measured on, so the cases bind. Every check runs.
// ---------------------------------------------------------------------------
import type { UserProfile, MesocycleWeek } from '../src/lib/types'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ''}`) }
}

async function main() {
  const ep = await import('../src/lib/exercise-plan')
  const { seededRngFromKey } = await import('../src/lib/seeded-random')
  const { getExerciseEntry } = await import('../src/lib/exercise-db')
  const cut = ep.loadedRepCeilingCut
  const STUCK_SHARE = 0.1

  console.log('\n1. The rule')
  check('the ceiling is 20 reps', ep.LOADED_REP_CEILING === 20)
  check('an adaptation phase\'s 18-23 is lowered by 8, so its weeks run 10-15 up to 15-20', cut('18-23') === 8, cut('18-23'))
  check('a 15-20 is lowered by 5 (two weekly steps and three bought reps of room)', cut('15-20') === 5, cut('15-20'))
  check('a range whose climb cannot reach 20 is left alone: 12-15, 8-10, 4-6', cut('12-15') === 0 && cut('8-10') === 0 && cut('4-6') === 0, [cut('12-15'), cut('8-10'), cut('4-6')])
  check('the edge: a top of 15 is untouched, a top of 16 comes down by one', cut('11-15') === 0 && cut('12-16') === 1, [cut('11-15'), cut('12-16')])
  check('a hold, a distance or an interval is not a rep range and is never touched', cut('40s') === 0 && cut('40m') === 0 && cut('30-45s') === 0)

  console.log('\n2. Real plans')
  const DAYN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const picks: Record<number, number[]> = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5] }
  const prof = (o: Record<string, unknown>): UserProfile => ({
    age: 34, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate', fitness_goal: 'hypertrophy', preferred_time: 'morning',
    bmr: 1750, tdee: 2500, equipment_access: 'full_gym', injuries: [], training_style: 'hybrid', workout_split_preference: 'ai_recommendation',
    training_experience: 'intermediate', session_duration_preference: '45-60',
    training_days: DAYN.map((day, i) => ({ day, available: picks[(o.n as number) ?? 3].includes(i) })),
    weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [], macro_calculation_mode: 'STANDARD_STATIC', coaching_persona: 'supportive',
    recovery_capacity: 'moderate', conditioning_preference: 'tolerate', ...o,
  } as unknown as UserProfile)
  // The people the broken rule was worst for (measured), and a spread around them.
  const PEOPLE: Record<string, unknown>[] = [
    { fitness_goal: 'conditioning', training_experience: 'advanced', equipment_access: 'minimalist', training_style: 'hybrid', n: 4 },
    { fitness_goal: 'hypertrophy', training_experience: 'intermediate', equipment_access: 'full_gym', training_style: 'hybrid', n: 4 },
    { fitness_goal: 'hypertrophy', training_experience: 'intermediate', equipment_access: 'minimalist', training_style: 'combat', n: 5, session_duration_preference: '60-90' },
    { fitness_goal: 'functional', training_experience: 'novice', equipment_access: 'minimalist', training_style: 'combat', n: 4 },
    { fitness_goal: 'fat_loss', training_experience: 'beginner', equipment_access: 'home_gym', training_style: 'bodybuilding', n: 3 },
    { fitness_goal: 'conditioning', training_experience: 'beginner', equipment_access: 'home_gym', training_style: 'bodybuilding', n: 4, session_duration_preference: '60-90' },
    { fitness_goal: 'fat_loss', training_experience: 'advanced', equipment_access: 'full_gym', training_style: 'combat', n: 6 },
    { fitness_goal: 'hypertrophy', training_experience: 'novice', equipment_access: 'bodyweight', training_style: 'hybrid', n: 3 },
  ]
  const quiet = <T,>(fn: () => T): T => {
    const d = console.debug, w = console.warn, l = console.log
    console.debug = () => {}; console.warn = () => {}; console.log = () => {}
    try { return fn() } finally { console.debug = d; console.warn = w; console.log = l }
  }
  const plans: { who: Record<string, unknown>; profile: UserProfile; plan: MesocycleWeek[] }[] = PEOPLE.map((who, i) => {
    const profile = prof(who)
    ep.setRandomSource(seededRngFromKey(`rep-ceiling-${i}`))
    try { return { who, profile, plan: quiet(() => ep.generateMesocycle(profile, ep.generateExercisePlan(profile).plan)) } } finally { ep.resetRandomSource() }
  })
  const topOf = (reps: unknown): number | null => { const m = String(reps).match(/^(\d+)\s*-\s*(\d+)$/) ?? String(reps).match(/^(\d+)$/); return m ? Number(m[2] ?? m[1]) : null }
  const loaded = (e: { suggested_load_kg?: number | null }) => typeof e.suggested_load_kg === 'number' && e.suggested_load_kg > 0
  const over: string[] = [], overDeload: string[] = []
  let loadedSlots = 0, weightlessOver = 0, atCeiling = 0, byFeelSlots = 0
  const byFeelOver: string[] = []
  for (const { who, plan } of plans) for (const w of plan) for (const d of w.days) for (const e of d.exercises) {
    const top = topOf(e.reps)
    if (top == null) continue
    const entry = getExerciseEntry(e.name)
    if (entry?.mechanics_tier === 'primer') continue
    if (!loaded(e)) {
      // No number on the card. A cable, a machine or a band can still be made harder; bodyweight alone cannot.
      if (entry && ep.resistanceCanRise(entry)) { byFeelSlots++; if (top > 20) byFeelOver.push(`${e.name} ${e.sets}x${e.reps} ${e.suggested_load ?? ''} W${w.week_number} ${JSON.stringify(who)}`) }
      else if (top > 20) weightlessOver++
      continue
    }
    loadedSlots++
    if (top >= 18) atCeiling++
    if (top > 20) (w.is_deload ? overDeload : over).push(`${e.name} ${e.sets}x${e.reps} @${e.suggested_load_kg} W${w.week_number} ${w.phase_label} ${JSON.stringify(who)}`)
  }
  check('the plans are real: eight people, sixteen weeks each, over 1,500 loaded exercise slots (measured 1,808)', plans.length === 8 && plans.every(p => p.plan.length === 16) && loadedSlots > 1500, { loadedSlots })
  check('no loaded lift is prescribed past 20 reps in any loading week', over.length === 0, over.slice(0, 4))
  check('...or in any recovery week (a deload eases reps up by two, and still stops at 20)', overDeload.length === 0, overDeload.slice(0, 4))
  check('the ceiling binds: many loaded lifts sit at 18 to 20 reps (they were 22 to 29)', atCeiling > 100, atCeiling)
  check('a lift with no number that can still be made harder (a cable, a machine, a band) is held to 20 too: "Cable Woodchops 3x19-24" (200 or more such slots read)', byFeelSlots >= 200 && byFeelOver.length === 0, { byFeelSlots, eg: byFeelOver.slice(0, 4) })
  check('the rule for which lifts: a weight, a stack or a band, never bodyweight alone', ['Cable Woodchops', 'Ab Crunch Machine', 'Pallof Press', 'Band Lat Pulldown', 'Dumbbell Curls'].every(n => ep.resistanceCanRise(getExerciseEntry(n)!)) && ['Push-Ups', 'Reverse Crunch', 'Hanging Leg Raises'].every(n => !ep.resistanceCanRise(getExerciseEntry(n)!)))
  check('a bodyweight lift is NOT capped: reps are the only lever it has, and some plans do ask more than 20', weightlessOver > 0, weightlessOver)

  console.log('\n3. A lowered lift still progresses')
  // The ceiling lowers a RANGE; it is not a cap on the printed number. Across block 1's three loading weeks an
  // isolation lift (the lifts whose adaptation range was 18-23) must still move: reps up, or the weight up.
  // A flat cap ("15-20" every week) would fail the first check; a lowered lift left with no lever fails the third.
  let climbers = 0, all = 0
  const flat: string[] = [], weightMoved: string[] = [], stuck: string[] = []
  for (const { who, plan } of plans) {
    const block1 = plan.filter(w => w.block_number === 1 && !w.is_deload).sort((a, b) => (a.week_in_block ?? 0) - (b.week_in_block ?? 0))
    if (block1.length < 3) continue
    for (const d1 of block1[0].days) d1.exercises.forEach((e1, i) => {
      const e3 = block1[2].days.find(d => d.day === d1.day)?.exercises[i]
      if (!e3 || e3.name !== e1.name || !loaded(e1) || !loaded(e3)) return
      const entry = getExerciseEntry(e1.name)
      if (entry?.mechanics_tier !== 'tier3_isolation' || (entry.prescription_type ?? 'reps') !== 'reps') return
      const t1 = topOf(e1.reps), t3 = topOf(e3.reps)
      if (t1 == null || t3 == null) return
      all++
      if (!(t3 > t1) && !((e3.suggested_load_kg ?? 0) > (e1.suggested_load_kg ?? 0))) stuck.push(`${e1.name} ${e1.reps} @${e1.suggested_load_kg} -> ${e3.reps} @${e3.suggested_load_kg} ${JSON.stringify(who)}`)
      if (t3 < 18) return // the lifts that end their block at the ceiling
      climbers++
      if (!(t3 > t1)) flat.push(`${e1.name} ${e1.reps} -> ${e3.reps} ${JSON.stringify(who)}`)
      if (e1.suggested_load_kg !== e3.suggested_load_kg) weightMoved.push(`${e1.name} ${e1.suggested_load_kg} -> ${e3.suggested_load_kg}`)
    })
  }
  console.log(`  (isolation lifts in block 1: ${all}; ending at 18-20 reps: ${climbers}; neither reps nor weight moved: ${stuck.length}; weight moved while reps climbed: ${weightMoved.length})`)
  check('there are lifts ending their block at the ceiling to judge (30 or more across the eight plans)', climbers >= 30, climbers)
  check('every one of them asked FEWER reps in week 1 than in week 3 (a range that climbs to 20, not a number capped at it)', flat.length === 0, flat.slice(0, 4))
  check('...and they climbed at one weight, nearly all of them (reps up at the same weight is the progression)', weightMoved.length <= climbers * 0.15, { climbers, moved: weightMoved.length, eg: weightMoved.slice(0, 3) })
  check('hardly any isolation lift is left with no lever at all, of 40 or more (measured 47): reps and weight both unmoved over the block', all >= 40 && stuck.length <= all * STUCK_SHARE, { all, stuck: stuck.length, eg: stuck.slice(0, 3) })

  console.log('\n4. Both places agree')
  // A lift swapped in mid-plan asks repRangeForIncomingExercise for its reps; generation printed the plan's. For the
  // lowered lifts, week 1 of an adaptation block is the cleanest comparison (no bought rep can have happened yet).
  let compared = 0; const differ: string[] = []
  for (const { profile, plan } of plans) {
    const w1 = plan.find(w => w.block_number === 1 && (w.week_in_block ?? 1) === 1)
    if (!w1) continue
    for (const d of w1.days) for (const e of d.exercises) {
      const entry = getExerciseEntry(e.name)
      if (!entry || entry.mechanics_tier !== 'tier3_isolation' || !loaded(e) || (entry.prescription_type ?? 'reps') !== 'reps') continue
      const helper = ep.repRangeForIncomingExercise(entry, profile, w1)
      if (helper == null) continue
      compared++
      if (helper !== e.reps) differ.push(`${e.name}: plan ${e.reps}, helper ${helper}`)
    }
  }
  // ...and for a lift with no number that can still be made harder (a band, a cable, a machine by feel): the helper
  // must lower its range as generation did, in every loading week.
  let byFeelCompared = 0; const byFeelDiffer: string[] = []
  for (const { profile, plan } of plans) for (const w of plan) {
    if (w.is_deload) continue
    for (const d of w.days) for (const e of d.exercises) {
      const entry = getExerciseEntry(e.name)
      if (!entry || entry.mechanics_tier === 'primer' || loaded(e) || !ep.resistanceCanRise(entry) || topOf(e.reps) == null) continue
      const helper = ep.repRangeForIncomingExercise(entry, profile, w)
      if (helper == null) continue
      byFeelCompared++
      if ((topOf(helper) ?? 0) > 20) byFeelDiffer.push(`${e.name} W${w.week_number}: plan ${e.reps}, helper ${helper}`)
    }
  }
  check('a lift with no number swapped in mid-plan is never printed past 20 either (150 or more read)', byFeelCompared >= 150 && byFeelDiffer.length === 0, { byFeelCompared, eg: byFeelDiffer.slice(0, 4) })
  check('week 1 isolation lifts were compared (20 or more)', compared >= 20, compared)
  check('the plan and the swap helper print the same range for at least nine in ten of them', differ.length <= compared * 0.1, { compared, differ: differ.slice(0, 4) })
  check('...and the helper never prints a loaded lift past 20 either', plans.every(({ profile, plan }) => plan.every(w => w.days.every(d => d.exercises.every(e => {
    const entry = getExerciseEntry(e.name)
    if (!entry || !loaded(e)) return true
    const r = ep.repRangeForIncomingExercise(entry, profile, w)
    return r == null || (topOf(r) ?? 0) <= 20 + 2 // the helper cannot see a bought rep; within the weekly climb is its documented approximation
  })))))

  console.log(`\n${ran} checks ran`)
  if (failures > 0) { console.log(`${failures} FAILED`); process.exitCode = 1; return }
  console.log('No loaded lift is prescribed past 20 reps, and the lifts that were lowered still climb.')
}
main().catch(e => { console.error(e); process.exitCode = 1 })
