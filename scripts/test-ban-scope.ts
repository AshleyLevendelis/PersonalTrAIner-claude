// ---------------------------------------------------------------------------
// test:ban-scope — A BAN REACHES EVERY SESSION STILL TO COME, AND NONE ALREADY
// DONE (runs 3-4 of the live-app test, 9-10 Oct 2026).
//
// M35: banning an exercise after finishing a session rewrote that finished
// day, and Home then named an exercise that was never in it. The rule every
// rebuild already followed (plan-guard: a session already trained is never
// rewritten) was not applied to the ban, on the screen or the coach's card.
//
// M40: a banned exercise came back in week 5. Every rebuild (injury, kit,
// style, goal, days, session length, the volume toggle) passed the bans to the
// base week but not to block rotation, which picks from its own pool. So the
// ban held for block 1 and lapsed from block 2.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { join } from 'path'
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { banExerciseFromMesocycle, containsExerciseName } from '../src/lib/mesocycle-edit'
import { rebuildAgainstProfile } from '../src/lib/plan-adaptations'
import { buildDayGuard, NOTHING_TRAINED } from '../src/lib/plan-guard'
import { NO_ACTIVE_ADAPTATIONS } from '../src/lib/effective-constraints'
import { banBlastRadius, banConfirmLines } from '../src/lib/screen-ban'
import type { MesocycleWeek, UserProfile } from '../src/lib/types'

const ROOT = join(import.meta.dirname, '..')
let failures = 0
let ran = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`) }
}
const quiet = console.log
const loud = console.warn
const silently = <T>(fn: () => T): T => { console.log = () => {}; console.warn = () => {}; try { return fn() } finally { console.log = quiet; console.warn = loud } }
async function silentlyAsync<T>(fn: () => Promise<T>): Promise<T> { console.log = () => {}; console.warn = () => {}; try { return await fn() } finally { console.log = quiet; console.warn = loud } }
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

// The runs' own tester: minimalist kit, a 24 kg dumbbell, four days.
const sam = {
  id: undefined, age: 34, gender: 'male', height_cm: 180, weight_kg: 82, activity_level: 'moderate', fitness_goal: 'fat_loss',
  preferred_time: 'evening', bmr: 1800, tdee: 2500, equipment_access: 'minimalist', injuries: [],
  training_style: 'bodybuilding', training_experience: 'intermediate', session_duration_preference: '30-45',
  workout_split_preference: 'ai_recommendation', max_dumbbell_kg: 24,
  training_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    .map(d => ({ day: d, available: ['Monday', 'Tuesday', 'Thursday', 'Saturday'].includes(d) })),
  weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [], macro_calculation_mode: 'STANDARD_STATIC',
  coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
} as unknown as UserProfile

setRandomSource(seededRngFromKey('ban-scope:1'))
const plan: MesocycleWeek[] = silently(() => generateMesocycle(sam))
resetRandomSource()

const CREATED = new Date(2026, 9, 5, 0, 0, 0).toISOString() // Monday 5 Oct 2026
const THU = '2026-10-08'
const guardOn = (today: string, logged: string[] = []) =>
  buildDayGuard(plan, { planCreatedAt: CREATED, today, moves: [], loggedDates: logged, closedDates: [] })

// The exercise on the most sessions, and one that is on a day already trained.
const counts = new Map<string, number>()
for (const w of plan) for (const d of w.days) for (const e of d.exercises) counts.set(e.name, (counts.get(e.name) ?? 0) + 1)
const thursday = plan[0].days.find(d => d.day === 'Thursday')!
const victim = thursday.exercises
  .filter(e => e.tier !== 'tier_0_primer')
  .map(e => e.name)
  .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))[0]

async function main() {
  console.log(`\n(fixture: banning ${victim}, on ${counts.get(victim)} sessions, including the trained Thursday of week 1)`)

  console.log('\n1. A ban leaves the sessions already done as they were (M35)')
  {
    // Thursday 8 Oct, the session finished: Monday, Tuesday and Thursday of
    // week 1 are trained; everything from Saturday on is still to come.
    const guard = guardOn(THU, [THU])
    const banned = await silentlyAsync(() => banExerciseFromMesocycle({ mesocycle: plan, profile: sam, bannedName: victim, exclusions: [victim], isProtected: guard }))
    const w1 = banned.find(w => w.week_number === 1)!
    check('the finished Thursday still holds it, exactly as trained',
      w1.days.find(d => d.day === 'Thursday') === thursday, w1.days.find(d => d.day === 'Thursday')?.exercises.map(e => e.name))
    const ahead = banned.flatMap(w => w.days.filter(d => !guard(w.week_number, d.day)).map(d => d.exercises.map(e => e.name)))
    check('...and no session still to come does', ahead.every(names => !names.some(n => n.toLowerCase() === victim.toLowerCase())))
    const trainedHolders = plan.flatMap(w => w.days.filter(d => guard(w.week_number, d.day) && d.exercises.some(e => e.name === victim)).map(d => `${w.week_number}|${d.day}`))
    check('...every trained session holding it kept it',
      trainedHolders.length > 0 && trainedHolders.every(k => { const [w, d] = k.split('|'); return banned.find(x => x.week_number === Number(w))!.days.find(x => x.day === d)!.exercises.some(e => e.name === victim) }), trainedHolders)
    // Not vacuous: the same ban with no guard rewrites the finished day.
    const unguarded = await silentlyAsync(() => banExerciseFromMesocycle({ mesocycle: plan, profile: sam, bannedName: victim, exclusions: [victim], isProtected: null }))
    check('with no guard the finished day WOULD change (the check above is not vacuous)',
      unguarded.find(w => w.week_number === 1)!.days.find(d => d.day === 'Thursday') !== thursday && !containsExerciseName(unguarded, victim))

    const radius = banBlastRadius(plan, victim, guard)
    const all = banBlastRadius(plan, victim, null)
    check('the confirm counts only the sessions that will change', radius.sessions + radius.kept === all.sessions && radius.kept === trainedHolders.length, { radius, all })
    const lines = banConfirmLines(radius)
    check('...and says the ones already done keep it',
      new RegExp(`${radius.kept === 1 ? 'The session' : `The ${radius.kept} sessions`} you've already done keeps? it`).test(lines.info), lines.info)
    check('...and says nothing of the kind when nothing is trained', !/already done/.test(banConfirmLines(all).info), banConfirmLines(all).info)
  }

  console.log('\n2. Both app paths load the trained-day guard before they ban')
  {
    const screen = stripComments(readFileSync(join(ROOT, 'src/lib/screen-ban.ts'), 'utf8'))
    const coachExec = stripComments(readFileSync(join(ROOT, 'src/lib/pending-action-executor.ts'), 'utf8'))
    const coachCard = stripComments(readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8'))
    const sheet = stripComments(readFileSync(join(ROOT, 'src/components/exercise/BanExerciseSheet.tsx'), 'utf8'))
    const loadsAndPasses = (src: string) => /const \{ isProtected \} = await loadPlanEditContext\(/.test(src)
      // The LOADED guard, by shorthand: "isProtected: null" would also name
      // the key and switch the guard off (caught by mutation).
      && /banExerciseFromMesocycle\(\{[^}]*[\s,{]isProtected,?\s*\}\)/.test(src)
    check('the screen\'s ban', loadsAndPasses(screen))
    check('the coach\'s ban', loadsAndPasses(coachExec))
    check('the coach\'s card counts with the same guard',
      /const \{ isProtected \} = await loadPlanEditContext\(/.test(coachCard) && /banBlastRadius\(mesocycle, name, isProtected\)/.test(coachCard))
    check('the screen\'s confirm sheet counts with the guard it is handed',
      /loadGuard\(\)\s*\n?\s*\.then\(guard => \{ if \(live\) setLines\(banConfirmLines\(banBlastRadius\(mesocycle, exerciseName, guard\)\)\) \}\)/.test(sheet))
  }

  console.log('\n3. A rebuild keeps the bans in every block, not just the first (M40)')
  {
    // Something rotation actually brings in from block 2: in the unbanned
    // plan, on a block-2+ week. Ban it, rebuild every week, and look.
    const later = plan.filter(w => (w.block_number ?? 1) >= 2).flatMap(w => w.days.flatMap(d => d.exercises.map(e => e.name)))
    const laterOnly = [...new Set(later)].filter(n => !plan.filter(w => (w.block_number ?? 1) === 1).some(w => w.days.some(d => d.exercises.some(e => e.name === n))))
    const pick = laterOnly[0] ?? later[0]
    const context = { isProtected: NOTHING_TRAINED, constraints: NO_ACTIVE_ADAPTATIONS, calendar: { planCreatedAt: CREATED, today: '2026-10-05', moves: [] }, constrainedUntil: null }
    const forward = plan.map(w => w.week_number)
    const rebuilt = await silentlyAsync(() => rebuildAgainstProfile(sam, [pick], plan, forward, context, 'ban-scope:rebuild'))
    const where = rebuilt.flatMap(w => w.days.filter(d => d.exercises.some(e => e.name === pick)).map(d => `${w.week_number}|${d.day}`))
    check(`a rebuild with "${pick}" banned holds it in no week of any block`, !!pick && where.length === 0, where)
    // The case is real: without the ban the same rebuild does schedule it.
    const free = await silentlyAsync(() => rebuildAgainstProfile(sam, [], plan, forward, context, 'ban-scope:rebuild'))
    check('...while the same rebuild without the ban does schedule it (not vacuous)', containsExerciseName(free, pick))
  }

  console.log(`\nban-scope: ${ran} checks ran`)
  console.log(failures === 0 ? 'All ban-scope checks passed.\n' : `${failures} ban-scope check(s) FAILED.\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
