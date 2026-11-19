/**
 * WHAT THE CHAT SAYS WHEN IT HAS LOGGED A WORKOUT (19 Nov 2026).
 *
 * The coach exam of 18 Nov 2026: "squats done, got 50kg for all three sets" was a first at that weight and the
 * chat answered with a card and no words. A tester, the same week: the line above the card was the card's own title,
 * so "Logged · Wednesday" read twice, and still said so after Undo.
 *
 * The line is the app's own (the numbers a chat log writes are never the model's), a best is named with its unit the
 * way every other screen names one, and WHAT a best is stays the record engine's decision: this asks it.
 *
 * Not proven here: the line on a real screen. That is verify:chat-log-words.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { bestAmongLogged, logBubble } from '../src/lib/log-words'
import { LOG_WORDS } from '../src/lib/coach-voice'
import { refreshPRCacheFromDB } from '../src/lib/pr-engine'
import { setSupabaseClient } from '../src/lib/supabase'
import type { ExerciseSetLog } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
let ran = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}

const USER = 'gate-chat-log-words'
const TODAY = '2026-11-18'
const earlier = (exercise_name: string, o: Record<string, unknown>) => ({
  user_id: USER, exercise_name, set_number: 1, weight_kg: 0, reps_completed: 0, is_bodyweight: true, is_warmup: false,
  drop_index: 0, added_load_kg: null, completed_at: '2026-11-11T12:00:00', ...o,
})
const HISTORY = [
  earlier('Barbell Back Squat', { weight_kg: 45, reps_completed: 8, is_bodyweight: false }),
  earlier('Barbell Bench Press', { weight_kg: 60, reps_completed: 5, is_bodyweight: false }),
  earlier('Press-Up', { reps_completed: 5 }),
]
const row = (exercise_name: string, o: Partial<ExerciseSetLog>): ExerciseSetLog => ({
  user_id: USER, date: TODAY, exercise_name, set_number: 1, weight_kg: 0, reps_completed: 8, is_bodyweight: false, ...o,
})

async function main() {
  {
    const answer = { data: HISTORY, error: null }
    const chain: Record<string, unknown> = { then: (ok: (v: typeof answer) => unknown) => Promise.resolve(answer).then(ok) }
    for (const m of ['select', 'eq', 'gt']) chain[m] = () => chain
    setSupabaseClient({ from: () => chain } as never)
    await refreshPRCacheFromDB(USER)
  }
  const best = (rows: ExerciseSetLog[]) => bestAmongLogged(USER, rows, TODAY)
  const bubble = (rows: ExerciseSetLog[], o: Partial<{ saved: boolean; corrected: boolean }> = {}) =>
    logBubble({ saved: o.saved ?? true, corrected: o.corrected ?? false, title: 'Logged · Wednesday', best: best(rows) })

  console.log('\n1. The exam\'s case: 50kg for all three sets, where the record was 45')
  const three = [1, 2, 3].map(n => row('Barbell Back Squat', { set_number: n, weight_kg: 50 }))
  const b = best(three)
  check('it is a best, on that lift, as a weight', b?.exerciseName === 'Barbell Back Squat' && b.reading.kind === 'load' && (b.reading as { weightKg: number }).weightKg === 50 && b.more === 0, b)
  check('the line names the lift and the weight WITH ITS UNIT', bubble(three) === "That's a new best on Barbell Back Squat: 50kg. Nice work.", bubble(three))
  check('...and it is not the card\'s title said again', !bubble(three).includes('Logged ·'))

  console.log('\n2. What is not a best says one plain line')
  check('the same weight as the record is not a best', best([row('Barbell Back Squat', { weight_kg: 45 })]) === null && bubble([row('Barbell Back Squat', { weight_kg: 45 })]) === LOG_WORDS.logged)
  check('a FIRST log of a lift is a baseline, never a best (the record engine\'s rule)', best([row('Cable Row', { weight_kg: 200 })]) === null)
  check('a build-up set at a record weight is not a best', best([row('Barbell Back Squat', { weight_kg: 80, is_warmup: true })]) === null)
  check('a drop is not a best', best([row('Barbell Back Squat', { weight_kg: 80, drop_index: 1 })]) === null)
  check('a hold counted in seconds is not a best', best([row('Press-Up', { is_bodyweight: true, reps_completed: 60, unit: 'seconds' })]) === null)
  check('the detector can fire on each of those lifts: the plain version of each IS a best',
    best([row('Barbell Back Squat', { weight_kg: 80 })]) !== null && best([row('Press-Up', { is_bodyweight: true, reps_completed: 60 })]) !== null)

  console.log('\n3. Every kind of record is said in its own unit')
  check('most reps at bodyweight: reps, never kg', bubble([row('Press-Up', { is_bodyweight: true, reps_completed: 9 })]) === "That's a new best on Press-Up: 9 reps. Nice work.", bubble([row('Press-Up', { is_bodyweight: true, reps_completed: 9 })]))
  const lighter = bubble([row('Barbell Bench Press', { weight_kg: 55, reps_completed: 10 })])
  check('a best the estimate found shows the whole set, never a bare lighter weight (his 17 Sep ruling)', lighter === "That's a new best on Barbell Bench Press: 55kg × 10. Nice work.", lighter)
  check('no best line ever carries a number with no unit', [bubble(three), lighter, bubble([row('Press-Up', { is_bodyweight: true, reps_completed: 9 })])].every(t => !/\d(?!\d|kg|\.\d| reps| ×|\))/.test(t.replace(/× \d+/, '× n'))), [bubble(three), lighter])

  console.log('\n4. Several sets, several lifts')
  const climbing = [50, 52.5, 50].map((kg, i) => row('Barbell Back Squat', { set_number: i + 1, weight_kg: kg }))
  check('of three sets, the heaviest is the one named', bubble(climbing).includes('52.5kg'), bubble(climbing))
  const two = [...three, row('Press-Up', { is_bodyweight: true, reps_completed: 9 })]
  check('a second lift with a best is counted, not listed', best(two)?.more === 1 && bubble(two) === "That's a new best on Barbell Back Squat: 50kg. And 1 more best in there. Nice work.", bubble(two))
  check('...and three says "bests"', LOG_WORDS.best('Squat', '50kg', 2).includes('And 2 more bests in there.'))

  console.log('\n5. A correction, and a log that saved nothing')
  check('a correction says so', bubble([row('Barbell Back Squat', { weight_kg: 45 })], { corrected: true }) === LOG_WORDS.corrected)
  check('...a best still wins over "corrected"', bubble(three, { corrected: true }).startsWith("That's a new best"))
  check('nothing saved: the title is the news, and no best is claimed', bubble(three, { saved: false }) === 'Logged · Wednesday')

  console.log('\n6. The chat uses it')
  const chat = readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const at = chat.indexOf("kind: 'log_workout',\n        title,")
  const ret = chat.slice(chat.lastIndexOf('return {', at), at)
  check('the line above a chat log is logBubble(...), asked about the sets that were WRITTEN',
    at > 0 && /text: logBubble\(\{ saved: savedAnything, corrected: replacedSets > 0, title, best: bestAmongLogged\([^)]*written, activeSession\.date\) \}\)/.test(ret), ret)
  check('...and never the bare title', !/text: title,/.test(ret))
  check('the rows it asks about are the ones logSet returned', /logSet: input => \{ const row = activeSession\.logSet\(input\); if \(row\) written\.push\(row\); return row \}/.test(chat))
  // A message's words live in `content` (found by verify:chat-log-words, 19 Nov 2026: this check once pinned `text`,
  // passed, and the bubble never changed). What the screen shows after Undo is the driver's to prove; this only holds
  // that the Undo branch names the line at all.
  check('Undo takes the line back too', /m\.receipt\.kind === 'log_workout' \? \{ content: LOG_WORDS\.undone \} : \{\}/.test(chat))
  check('the taken-back line does not say it was logged', !/logged|best/i.test(LOG_WORDS.undone) && LOG_WORDS.undone.length > 5)

  console.log(`\nchat-log-words: ${ran} checks ran`)
  if (failures > 0) console.error(`chat-log-words: ${failures} check(s) FAILED`)
  else console.log('chat-log-words: all checks passed')
}
main().catch(err => { console.error(err); failures++ }).finally(() => { if (failures > 0) process.exit(1) })
