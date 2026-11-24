// ---------------------------------------------------------------------------
// test:ban-running-session — A BAN TAPPED DURING TODAY'S SESSION TAKES THE
// EXERCISE OFF THAT SESSION (24 Nov 2026).
//
// Ashley, mid-session, banned Clamshell from the ⋮ menu. The sheet said "It
// isn't in any session still to come … The session already behind you keeps
// it", the receipt said "out for good", and Clamshell stayed on the session in
// front of him. A RUNNING session counted as trained, so the ban skipped it.
//
// Now (plan-guard buildBanGuard): today's running session is open to a ban of
// an exercise with nothing logged today. An exercise with a logged set, a
// closed day, a past day and an unreadable day stay as they are.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { join } from 'path'
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { banExerciseFromMesocycle } from '../src/lib/mesocycle-edit'
import { buildBanGuard, buildDayGuard } from '../src/lib/plan-guard'
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

setRandomSource(seededRngFromKey('ban-running-session:1'))
const plan: MesocycleWeek[] = silently(() => generateMesocycle(sam))
resetRandomSource()

const CREATED = new Date(2026, 9, 5, 0, 0, 0).toISOString() // Monday 5 Oct 2026
const THU = '2026-10-08'
const thursday = plan[0].days.find(d => d.day === 'Thursday')!
const victim = thursday.exercises.find(e => e.tier !== 'tier_0_primer')!.name
const other = thursday.exercises.find(e => e.tier !== 'tier_0_primer' && e.name !== victim)!.name
const base = { planCreatedAt: CREATED, today: THU, moves: [] as never[], loggedDates: [THU], closedDates: [] as string[] }
const ban = (over: Partial<Parameters<typeof buildBanGuard>[1]> = {}) =>
  buildBanGuard(plan, { ...base, runningToday: true, loggedTodayNames: new Set<string>(), exerciseName: victim, ...over })
const holds = (m: MesocycleWeek[], week: number, day: string, name = victim) =>
  m.find(w => w.week_number === week)!.days.find(d => d.day === day)!.exercises.some(e => e.name === name)

async function main() {
  console.log(`\n(fixture: banning ${victim} during Thursday's session of week 1)`)

  console.log('\n1. The guard opens today for a running session with nothing of it logged')
  check('today is open to the ban', ban()(1, 'Thursday') === false)
  check('the days before today stay shut', ban()(1, 'Monday') === true && ban()(1, 'Tuesday') === true)
  check('a later day is still open', ban()(1, 'Saturday') === false)
  check('the rebuild guard still treats today as trained (a rebuild never redraws a running session)',
    buildDayGuard(plan, base)(1, 'Thursday') === true)

  console.log('\n2. Today stays shut wherever it should')
  check('a set of THIS exercise logged today keeps it', ban({ loggedTodayNames: new Set([victim.toLowerCase()]) })(1, 'Thursday') === true)
  check('a set of ANOTHER exercise logged today does not', ban({ loggedTodayNames: new Set([other.toLowerCase()]) })(1, 'Thursday') === false)
  check('matching is by name whatever the case', ban({ loggedTodayNames: new Set([victim.toUpperCase().toLowerCase()]), exerciseName: victim.toUpperCase() })(1, 'Thursday') === true)
  check('no session running: shut, as before', ban({ runningToday: false })(1, 'Thursday') === true)
  check('a closed day (missed, rested, swapped): shut', ban({ closedDates: [THU] })(1, 'Thursday') === true)
  check("today's sets unreadable: shut (errs protective)", ban({ loggedTodayNames: null })(1, 'Thursday') === true)

  console.log('\n3. The ban itself takes it off the running session')
  {
    const banned = await silentlyAsync(() => banExerciseFromMesocycle({ mesocycle: plan, profile: sam, bannedName: victim, exclusions: [victim], isProtected: ban() }))
    check('it is gone from today', !holds(banned, 1, 'Thursday'))
    const mon = plan[0].days.find(d => d.day === 'Monday')
    const monHad = !!mon?.exercises.some(e => e.name === victim)
    check('a day already behind him is untouched', !monHad || holds(banned, 1, 'Monday'))
    const kept = await silentlyAsync(() => banExerciseFromMesocycle({ mesocycle: plan, profile: sam, bannedName: victim, exclusions: [victim], isProtected: ban({ loggedTodayNames: new Set([victim.toLowerCase()]) }) }))
    check('with a set of it logged, today keeps it as the record', holds(kept, 1, 'Thursday'))
  }

  console.log('\n4. The sheet counts today as still to come, never as behind him')
  {
    const radius = banBlastRadius(plan, victim, ban())
    const lines = banConfirmLines(radius)
    check('today is a session that changes', radius.sessions >= 1, radius)
    check('the sheet does not say it is in no session to come', !/isn't in any session still to come/.test(lines.info), lines)
    // HIS CASE: the exercise is on today's session and nowhere else.
    const onlyToday = plan.map(w => ({ ...w, days: w.days.map(d => (w.week_number === 1 && d.day === 'Thursday')
      ? d : { ...d, exercises: d.exercises.filter(e => e.name !== victim) }) }))
    const onlyGuard = buildBanGuard(onlyToday, { ...base, runningToday: true, loggedTodayNames: new Set<string>(), exerciseName: victim })
    const only = banBlastRadius(onlyToday, victim, onlyGuard)
    check('only on today: one session changes, none kept', only.sessions === 1 && only.kept === 0, only)
    const onlyLines = banConfirmLines(only)
    check('only on today: the sheet says one session changes, not "every week"', /one session still to come/.test(onlyLines.warn ?? '') && !/every week/.test(onlyLines.warn ?? ''), onlyLines)
    check('only on today: no "behind you", no "nothing changes ahead"',
      !/behind you|nothing changes ahead/.test(`${onlyLines.warn ?? ''} ${onlyLines.info}`), onlyLines)
  }

  console.log('\n5. Every ban path writes and counts through the ban guard')
  {
    const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'))
    check('the screen ban', /\.banGuard\(exerciseName\)/.test(read('src/lib/screen-ban.ts')))
    check("the coach's ban confirm", /\.banGuard\(name\)/.test(read('src/lib/pending-action-executor.ts')))
    check("the coach's ban card", /\.banGuard\(name\)/.test(read('src/components/ChatAssistant.tsx')))
    check("the Exercise tab's sheet", /c\.banGuard\(name\)/.test(read('src/components/exercise/ExerciseTab.tsx')))
    check("Profile's sheet", /c\.banGuard\(name\)/.test(read('src/App.tsx')))
    check('the sheet asks the guard for THIS exercise', /loadGuard\(exerciseName\)/.test(read('src/components/exercise/BanExerciseSheet.tsx')))
  }

  console.log(`\n${ran} checks ran, ${failures} failed`)
  if (failures > 0) process.exit(1)
}
main().catch(err => { console.error(err); process.exit(1) })
