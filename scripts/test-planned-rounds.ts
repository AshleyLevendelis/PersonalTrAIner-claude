// ---------------------------------------------------------------------------
// A PLANNED CARDIO SESSION THAT IS ROUNDS RUNS ON THE ROUND TIMER (Ashley, 23 Nov 2026, option A of three).
//
// His report: the coach suggested "4 × 3 min, 1 min rest" on the bike, he said yes, and the day read "Wednesday:
// Assault Bike Rounds, 16 minutes." with nothing to start and nothing to log. This holds:
//   1. what the timer runs for a planned session (stored rounds, else the activity's own protocol, never a guess);
//   2. the coach's card carries the rounds (its own numbers, else the reply he said yes to, only when they fit);
//   3. the write keeps them, and a session is never shorter than its rounds;
//   4. a round knows which planned session it is, on which date;
//   5. the screens are wired (source only: verify:planned-rounds drives them).
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { setSupabaseClient } from '../src/lib/supabase'
import { cardioSessionRounds, plannedRoundsOf, roundIsPlannedSession, roundsMinutes, sessionMinutesFor } from '../src/lib/planned-rounds'
import { isSensibleRoundConfig } from '../src/lib/timer-engine'
import { executeCardioSession } from '../src/lib/pending-action-executor'
import type { MesocycleWeek, UserProfile } from '../src/lib/types'

setSupabaseClient({
  from: () => ({ upsert: () => Promise.resolve({ error: null }) }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any)

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail: unknown = '') => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== '' ? ` — ${JSON.stringify(detail)}` : ''}`) }
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/[^\n]*/g, (_m, p1) => p1)

const BIKE = { rounds: 4, workSeconds: 180, restSeconds: 60 }

async function main() {
  console.log('\n1. What the timer runs for a planned session')
  check('stored rounds are the timer', same(plannedRoundsOf({ activity: 'Assault Bike Rounds', rounds: BIKE }), BIKE), plannedRoundsOf({ activity: 'Assault Bike Rounds', rounds: BIKE }))
  check('...else the protocol written into the activity ("— 6 rounds of 40s hard / 20s easy")',
    same(plannedRoundsOf({ activity: 'Rowing Intervals — 6 rounds of 40s hard / 20s easy' }), { rounds: 6, workSeconds: 40, restSeconds: 20 }),
    plannedRoundsOf({ activity: 'Rowing Intervals — 6 rounds of 40s hard / 20s easy' }))
  check('...and the stored rounds win over a protocol', same(plannedRoundsOf({ activity: 'Row — 6 rounds of 40s hard / 20s easy', rounds: BIKE }), BIKE))
  check('a steady session has no timer', plannedRoundsOf({ activity: 'Walk' }) === null && plannedRoundsOf({ activity: 'Run — easy, conversational' }) === null)
  check('stored rounds that are not a timer are not started (1 round, 2s work)',
    plannedRoundsOf({ activity: 'Bike', rounds: { rounds: 1, workSeconds: 2, restSeconds: 60 } }) === null)
  check('the bounds are the ones the chat\'s timer button uses', isSensibleRoundConfig({ rounds: 2, workSeconds: 5, restSeconds: 5 }) && isSensibleRoundConfig({ rounds: 50, workSeconds: 900, restSeconds: 900 })
    && !isSensibleRoundConfig({ rounds: 51, workSeconds: 30, restSeconds: 30 }) && !isSensibleRoundConfig({ rounds: 4, workSeconds: 30, restSeconds: 4 }) && !isSensibleRoundConfig({ rounds: 2.5, workSeconds: 30, restSeconds: 30 }))

  console.log('\n2. The coach\'s card carries the rounds')
  const said = 'For Muay Thai conditioning, try 4 × 3 min hard on the assault bike, 1 min rest between, like a fight. Would you like me to add this to your plan?'
  check('the coach\'s own three numbers', same(cardioSessionRounds({ rounds: 5, work_seconds: 120, rest_seconds: 60 }, 20, said), { rounds: 5, workSeconds: 120, restSeconds: 60 }))
  check('...not two of them: then the reply he said yes to (his 23 Nov case)', same(cardioSessionRounds({ rounds: 5, work_seconds: 120 }, 16, said), BIKE), cardioSessionRounds({ rounds: 5, work_seconds: 120 }, 16, said))
  check('none sent: the reply he said yes to', same(cardioSessionRounds({ activity: 'Assault Bike Rounds' }, 16, said), BIKE))
  check('...only when its rounds fit the session (15 min of rounds in a 10-minute session is another session)', cardioSessionRounds({ activity: 'Bike' }, 10, said) === null)
  check('...and a reply with no intervals gives none', cardioSessionRounds({ activity: 'Run' }, 30, 'Zone 2 for 35 minutes, keep it conversational.') === null)
  check('a protocol in the activity name is read', same(cardioSessionRounds({ activity: 'Row — 6 rounds of 40s hard / 20s easy' }, 20, null), { rounds: 6, workSeconds: 40, restSeconds: 20 }))

  console.log('\n3. The write keeps them, and a session is never shorter than its rounds')
  check('4 × 3 min, 1 min rest takes 15 minutes', roundsMinutes(BIKE) === 15, roundsMinutes(BIKE))
  check('a 10-minute session of those rounds is 15', sessionMinutesFor(10, BIKE) === 15)
  check('...a 16-minute one stays 16 (warm-up included)', sessionMinutesFor(16, BIKE) === 16)
  check('...and a session with no rounds keeps its minutes', sessionMinutesFor(35, null) === 35)

  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const mkWeek = (n: number): MesocycleWeek => ({
    week_number: n, block_number: 1, phase: 'Anatomical Adaptation',
    days: DAYS.map(d => ({ day: d, focus: d === 'Monday' ? 'Upper Body' : 'Rest', exercises: d === 'Monday' ? [{ name: 'Bench Press', sets: 3, reps: '8-10', rest_seconds: 120 }] : [] })),
  } as unknown as MesocycleWeek)
  const meso = [mkWeek(1), mkWeek(2), mkWeek(3)]
  const profile = { id: '00000000-0000-4000-8000-000000000001' } as UserProfile
  const out = await executeCardioSession(profile, meso, { weekNumber: 2, dayName: 'Wednesday', activity: 'Assault Bike Rounds', minutes: 16, targetRpe: 8, rounds: BIKE, scope: 'permanent' })
  const wed = (w: MesocycleWeek) => w.days.find(d => d.day === 'Wednesday')!.plannedActivity
  check('the rounds are written onto the day', same(wed(out.mesocycle[1])?.rounds, BIKE), wed(out.mesocycle[1]))
  check('...on every week it writes (the rest of the block)', same(wed(out.mesocycle[2])?.rounds, BIKE))
  check('...and the timer reads them back from the plan', same(plannedRoundsOf(wed(out.mesocycle[2])), BIKE))
  check('...and the receipt names them', /4 × 3 min, 1 min rest/.test(out.receipt.landed[0] ?? ''), out.receipt)
  const plain = await executeCardioSession(profile, meso, { weekNumber: 2, dayName: 'Thursday', activity: 'Cycle', minutes: 35, targetRpe: 3, scope: 'permanent' })
  check('a session with no rounds writes none', plain.mesocycle[1].days.find(d => d.day === 'Thursday')!.plannedActivity?.rounds === undefined)

  console.log('\n4. A round knows which planned session it is')
  const cfg = { ...BIKE, planned: { activity: 'Assault Bike Rounds', date: '2026-11-25' } }
  check('the session it was started for, on its date', roundIsPlannedSession(cfg, 'Assault Bike Rounds', '2026-11-25'))
  check('...not another session', !roundIsPlannedSession(cfg, 'Run', '2026-11-25'))
  check('...not another date (a round left running past midnight is just a round)', !roundIsPlannedSession(cfg, 'Assault Bike Rounds', '2026-11-26'))
  check('...and a round from anywhere else is none', !roundIsPlannedSession(BIKE, 'Assault Bike Rounds', '2026-11-25') && !roundIsPlannedSession(null, 'Assault Bike Rounds', '2026-11-25'))

  console.log('\n5. Wired to the screens and the coach (source; verify:planned-rounds drives them)')
  const fn = strip(readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8'))
  const tool = fn.slice(fn.indexOf('name: "propose_cardio_session"'), fn.indexOf('required: ["activity", "minutes", "target_rpe"'))
  check('the coach\'s tool takes rounds, work_seconds and rest_seconds', tool.length > 0 && /\brounds:\s*\{/.test(tool) && /work_seconds:\s*\{/.test(tool) && /rest_seconds:\s*\{/.test(tool))
  const chat = strip(readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
  const builder = chat.slice(chat.indexOf('const buildCardioSessionProposal'), chat.indexOf('const buildCardioSessionProposal') + 6000)
  check('the card asks cardioSessionRounds( with the minutes and the last coach reply', /cardioSessionRounds\(rawArgs, minutes, lastCoachReply\)/.test(builder))
  check('...and the payload carries the rounds and the session\'s minutes', /\brounds,\s*\n/.test(builder) && /minutes: sessionMinutes/.test(builder))
  const card = strip(readFileSync('src/components/exercise/RestDayCard.tsx', 'utf8'))
  check('the day\'s card hands the row its Start, and hides the boxes while its round runs or asks',
    /<PlannedCardioRow prescription=\{planned\} timer=\{<PlannedRoundsStart planned=\{planned\} \/>\} hideEntry=\{roundState === 'mine' \|\| roundState === 'done'\}/.test(card))
  const row = strip(readFileSync('src/components/exercise/CardioSetRow.tsx', 'utf8'))
  check('...and the row draws it under the session\'s name, over the boxes', row.indexOf('{!saved && timer}') > row.indexOf('data-testid="cardio-prescription"') && row.indexOf('{!saved && timer}') < row.indexOf('<EntryBoxes', row.indexOf('{!saved && timer}')) && /hideEntry \? null : \(/.test(row))
  const tools = strip(readFileSync('src/components/ToolsTab.tsx', 'utf8'))
  check('the round timer logs a planned round as the session (one effort tap)', /roundIsPlannedSession\(timers\.roundConfig, todaysPlanned\.activity, todayDate\)/.test(tools) && /<PlannedRoundEffort/.test(tools))
  const peek = strip(readFileSync('src/components/exercise/TodayPanel.tsx', 'utf8'))
  check('another day\'s planned session is a preview, not one sentence', /peekWorkout\?\.plannedActivity \? \(\s*<PlannedActivityPreview /.test(peek) && !/plannedActivity\.duration\} minutes\./.test(peek))

  console.log(`\n${ran} checks ran`)
  if (failures > 0) { console.error(`${failures} failure(s)`); process.exit(1) }
  console.log('All planned-rounds checks passed.')
}

main().catch(e => { console.error(e); process.exit(1) })
