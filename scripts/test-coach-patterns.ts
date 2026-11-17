// PATTERNS THE APP SEES IN HIS LOGS (17 Nov 2026, the chat review, his "Build it all"). The app finds them; the coach
// is told them as facts. The thresholds are CSCS calls recorded in BACKLOG; each is held here where it binds:
//   stuck: three sessions of a lift at the same top weight, no rep gained (two is noise; a rep gained is progress);
//   low protein: his last three LOGGED days before today, each under 80% of target (an unlogged day is never a low day);
//   tiredness: "Too hard" on three or more lifts in seven days, one lift a day counted once.
import { readFileSync } from 'node:fs'
import { stuckLifts, lowProtein, tirednessBuilding, coachPatternLines } from '../src/lib/coach-patterns'

let ran = 0
let failures = 0
function check(name: string, ok: boolean, detail: unknown = '') {
  ran++
  if (ok) console.log(`ok: ${name}`)
  else { failures++; console.log(`FAIL: ${name}${detail !== '' ? ` (${JSON.stringify(detail).slice(0, 300)})` : ''}`) }
}
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const set = (date: string, w: number, r: number, extra: Record<string, unknown> = {}) => ({ exercise_name: 'Bench Press', date, weight_kg: w, reps_completed: r, ...extra })

console.log('1. A stuck lift')
const stuck3 = [set('2026-11-03', 60, 8), set('2026-11-03', 60, 7), set('2026-11-06', 60, 8), set('2026-11-10', 60, 8)]
check('three sessions at 60 kg with no rep gained is stuck', stuckLifts(stuck3).length === 1 && stuckLifts(stuck3)[0].weightKg === 60, stuckLifts(stuck3))
check('two sessions is not (noise)', stuckLifts(stuck3.slice(0, 3)).length === 0)
check('a rep gained is progress, not stuck', stuckLifts([set('2026-11-03', 60, 8), set('2026-11-06', 60, 8), set('2026-11-10', 60, 9)]).length === 0)
check('weight going up is progress', stuckLifts([set('2026-11-03', 60, 8), set('2026-11-06', 60, 8), set('2026-11-10', 62.5, 8)]).length === 0)
check('only the last three sessions count (an old stall since broken is not reported)', stuckLifts([set('2026-10-20', 55, 8), set('2026-10-23', 55, 8), set('2026-10-27', 55, 8), set('2026-11-03', 60, 8), set('2026-11-06', 62.5, 8), set('2026-11-10', 65, 8)]).length === 0)
check('warm-up sets never count', stuckLifts([...stuck3.slice(0, 2), set('2026-11-06', 100, 3, { is_warmup: true }), set('2026-11-06', 60, 8), set('2026-11-10', 60, 8)]).length === 1)

console.log('\n2. Low protein on logged days')
const day = (protein: number, meals = 3) => ({ protein, meals })
const low = { '2026-11-14': day(90), '2026-11-15': day(100), '2026-11-16': day(95), '2026-11-17': day(10) }
check('three logged days under 80% of 160 g is low', lowProtein(low, '2026-11-17', 160)?.days === 3, lowProtein(low, '2026-11-17', 160))
check('...today is never one of them (it is not over)', lowProtein({ '2026-11-15': day(90), '2026-11-16': day(90), '2026-11-17': day(10) }, '2026-11-17', 160) === null)
check('a day at 80% or more breaks it', lowProtein({ ...low, '2026-11-15': day(130) }, '2026-11-17', 160) === null)
check('an unlogged day is skipped, never read as a low day (the third logged day back was on target)', lowProtein({ '2026-11-12': day(150), '2026-11-14': day(90), '2026-11-15': day(0, 0), '2026-11-16': day(95) }, '2026-11-17', 160) === null)

console.log('\n3. "Too hard" piling up')
const hard = (name: string, date: string) => ({ exercise_name: name, date, weight_kg: 60, reps_completed: 8, rpe: 10 })
check('three lifts answered "Too hard" in a week', tirednessBuilding([hard('A', '2026-11-12'), hard('B', '2026-11-14'), hard('C', '2026-11-17')], '2026-11-17') === 3)
check('one lift on one day counts once', tirednessBuilding([hard('A', '2026-11-17'), hard('A', '2026-11-17'), hard('B', '2026-11-17')], '2026-11-17') === null)
check('older than seven days does not count', tirednessBuilding([hard('A', '2026-11-05'), hard('B', '2026-11-14'), hard('C', '2026-11-17')], '2026-11-17') === null)
check('"About right" does not count', tirednessBuilding([hard('A', '2026-11-12'), hard('B', '2026-11-14'), { ...hard('C', '2026-11-17'), rpe: 8 }], '2026-11-17') === null)

console.log('\n4. What the coach is told, and how it is told to use it')
const lines = coachPatternLines({ stuck: stuckLifts(stuck3), protein: lowProtein(low, '2026-11-17', 160), proteinTargetG: 160, tooHard: 3 })
check('one line per pattern, facts only', lines.length === 3 && /Bench Press has been 60 kg/.test(lines[0]) && /160 g target/.test(lines[1]) && /"Too hard" on 3 lifts/.test(lines[2]), lines)
check('nothing found, nothing said', coachPatternLines({ stuck: [], protein: null, proteinTargetG: 160, tooHard: null }).length === 0)
const chat = strip(readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
const server = strip(readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8'))
check('the chat sends them with the message', /patterns_seen: patterns\.length > 0 \? patterns\.join/.test(chat))
check('...worked out from the same 14 days of sets and the eaten log the turn reads', /stuck: stuckLifts\(recentLogsRef\.current\)/.test(chat) && /lowProtein\(todayEaten, eatenToday, macros\.protein\)/.test(chat))
check('the coach coaches to at most one, once, and never as a diagnosis', /context\.patterns_seen/.test(server) && /AT MOST ONE of these, once/.test(server) && /nothing here is a diagnosis/.test(server))

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.log(`${failures} FAILED.`); process.exit(1) }
console.log('The app sees the patterns; the coach is told the facts.')
