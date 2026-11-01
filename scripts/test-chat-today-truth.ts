// ---------------------------------------------------------------------------
// Gate: THE CHAT'S OWN SENTENCES SAY ONLY WHAT HAPPENED (1 Nov 2026).
//
// Found while tracing Ashley's "you've just wrapped up your workout" on a rest day (test:today-claim
// holds the model's half). The app wrote the same kind of sentence itself, in places the model never
// touches:
//   1. Past the training hour, the opener and the first greeting said "today was Push. How'd it go?"
//      whether or not anything was trained.
//   2. A personal best is listed for seven days and three lines said it with no day ("That's a PR —
//      bench at 80 kg"), heard on a rest day as a session just finished. And one line said "N days on
//      the trot" for a streak that counts sessions (her 17 Oct ruling).
//   3. "How did Friday feel?" asked about any completed session row, with or without a set in it.
//   4. "Yesterday's X didn't happen" named X from TODAY's plan week, wrong on a new week's first day.
//   5. "Workout Logged Today" counted warm-ups; the chat's copy of Home read no moves and went stale
//      when the plan changed; the dynamic calorie day used the machine clock; the opener bubbles carried
//      no time, so an old one restored on a later day reached the coach as if said just now.
// Behaviour where it is a pure function (1, 2, 4), source where it is wiring inside ChatAssistant or a
// database read (3, 5) — those are named as source-held, not proven reached.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs'
import { pickOpener, missedYesterdayFrom } from '../src/lib/coach-opener'
import { pickNudge } from '../src/lib/coach-nudge'
import { whenSaid } from '../src/lib/coach-voice'
import { buildTodayHeader } from '../src/lib/chat-plan-context'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')

// ---------------------------------------------------------------------------
console.log('\n1. Past the training hour, "How\'d it go?" only when something was trained')
// ---------------------------------------------------------------------------
const base = {
  hour: 19, cutoffHour: 13, awaitingFeel: null, missedYesterday: null, planKnown: true,
  todaySession: { focus: 'Upper Pull', movements: 'Rows, Pulldowns' }, tomorrowSession: null,
  movedTo: null, noticed: null, lastOrdinaryKind: null, breakDays: null,
} as unknown as Parameters<typeof pickOpener>[0]
const untrained = pickOpener({ ...base, todayLogged: false })
check('nothing trained: it ASKS whether it happened', untrained.kind === 'training_done_today' && /did today's Upper Pull happen\?/.test(untrained.text) && !/today was/i.test(untrained.text), untrained)
const trained = pickOpener({ ...base, todayLogged: true })
check('trained: it asks how it went', /today was Upper Pull \(Rows, Pulldowns\)\. How'd it go\?/.test(trained.text), trained)
const chat = strip(read('../src/components/ChatAssistant.tsx'))
const greet = chat.slice(chat.indexOf('const initialGreetingDetail'), chat.indexOf('const firstRunSessionBrief'))
check('the first greeting never says "today was … How\'d it go?" (it is drawn before any log is read)', greet.length > 100 && !/today was \$\{/.test(greet) && /did today's \$\{todaySession\.focus\} happen\?/.test(greet), greet.slice(0, 120))
check('...and a row with no exercises is not a session', /todaySession && todaySession\.exercises\.length > 0/.test(greet))
check('"trained" for the opener is working sets or the strip\'s day, never any row (warm-ups out)',
  (chat.match(/todayLogged: activeSession\.logs\.some\(l => !l\.is_warmup\) \|\| trainedTodayFacts\(activeSession\.date\)\.trainedToday/g) ?? []).length === 2)

// ---------------------------------------------------------------------------
console.log('\n2. A best says which day it was; a streak says sessions')
// ---------------------------------------------------------------------------
check('whenSaid: today', whenSaid('2026-11-01', '2026-11-01') === 'today')
check('whenSaid: yesterday', whenSaid('2026-10-31', '2026-11-01') === 'yesterday')
check('whenSaid: a weekday', whenSaid('2026-10-29', '2026-11-01') === 'on Thursday', whenSaid('2026-10-29', '2026-11-01'))
const nudge = pickNudge({
  today: '2026-11-01', hour: 11, cutoffHour: 13, planKnown: true, awaitingFeel: null, missedYesterday: null,
  recentPR: { exerciseName: 'Bench Press', metric: 'load', value: 80, date: '2026-10-29' }, streak: 0, todaySession: null, todayLogged: false,
}, [])
check('the PR message names Thursday', nudge?.kind === 'personal_best' && /Bench Press at 80 ?kg on Thursday/.test(nudge.text), nudge)
check('the opener\'s noticed best and the greeting\'s PR line carry the day',
  /\$\{whenSaid\(pr\.date, activeSession\.date\)\} is a best/.test(chat) && /nice PR on \$\{recentPR\.exerciseName\}[^`]*\$\{whenSaid\(recentPR\.date, activeSession\.date\)\}/.test(chat))
check('no "days on the trot": the streak opener uses the sessions wording', !/days on the trot/.test(chat) && /\$\{streak\} \$\{streakLabel\(streak\)\} now/.test(chat))

// ---------------------------------------------------------------------------
console.log('\n3. "How did it feel?" only about a session with work in it (source-held)')
// ---------------------------------------------------------------------------
const feel = strip(read('../src/lib/session-feel.ts'))
check('the candidates carry their id', /\.select\('id, date, day'\)/.test(feel))
check('...their working sets are read (warm-ups out)', /\.from\('exercise_set_logs'\)[\s\S]{0,120}\.in\('session_id'[\s\S]{0,80}\.eq\('is_warmup', false\)/.test(feel))
check('...and only a candidate with one is asked about; a failed read asks about none', /awaitingRow = candidates\.find\(c => withWork\.has\(c\.id\)\)/.test(feel) && /workedErr \? \[\]/.test(feel))

// ---------------------------------------------------------------------------
console.log('\n4. Yesterday\'s miss names yesterday\'s own session')
// ---------------------------------------------------------------------------
const y = missedYesterdayFrom(
  [{ date: '2026-10-29', dayName: 'Thursday', state: 'missed', session: { focus: 'Lower Strength' } }],
  '2026-10-29', [{ day: 'Thursday', focus: 'Full Body Power' }])
check('the cell\'s own session wins over today\'s week row', y?.focus === 'Lower Strength', y)
const y2 = missedYesterdayFrom([{ date: '2026-10-29', dayName: 'Thursday', state: 'missed' }], '2026-10-29', [{ day: 'Thursday', focus: 'Full Body Power' }])
check('...and the row is still the fallback', y2?.focus === 'Full Body Power', y2)

// ---------------------------------------------------------------------------
console.log('\n5. The rest of what the coach is told about today (source-held)')
// ---------------------------------------------------------------------------
const eff = chat.slice(chat.indexOf('const chatMovesKey'), chat.indexOf('const chatMovesKey') + 900)
check('the chat\'s copy of Home reads the moves Home reads', /moves: trainingWeek\.moves/.test(eff))
check('...and re-reads when the plan or the moves change', /exercisePlan, mesocycle, planCreatedAt, chatMovesKey\]/.test(eff))
const nt = strip(read('../src/lib/nutrition-targets.ts'))
check('the dynamic calorie day is the app\'s today, not the machine\'s', /getAppNow\(profileId\)\.toLocaleDateString/.test(nt) && !/new Date\(\)\.toLocaleDateString/.test(nt))
check('the opener bubbles carry when they were said (seed, composed, reseed)',
  (chat.match(/status: 'complete',\s*created_at: new Date\(\)\.toISOString\(\)/g) ?? []).length >= 3
  && /content: greeting, status: 'complete', created_at: new Date\(\)\.toISOString\(\)/.test(chat), (chat.match(/status: 'complete',\s*created_at: new Date\(\)\.toISOString\(\)/g) ?? []).length)

// ---------------------------------------------------------------------------
console.log('\n6. What she said about today reaches the coach\'s header')
// ---------------------------------------------------------------------------
const hdr = { dayName: 'Sunday', hour: 11, clock: '11:21 AM', focus: 'Upper Pull', isGymSession: true, setsLogged: 0, setsPlanned: 12, finished: false, next: null }
check('no declaration: "NOT LOGGED yet", as before', /Upper Pull, NOT LOGGED yet/.test(buildTodayHeader(hdr)))
const rest = buildTodayHeader({ ...hdr, declared: { kind: 'rest_chosen' } })
check('a rest she chose is said, and "NOT LOGGED" is not', /CHOSE TO REST/.test(rest) && !/NOT LOGGED/.test(rest), rest)
const swap = buildTodayHeader({ ...hdr, declared: { kind: 'swapped', line: 'Football · 60 min' } })
check('a swap names what she did instead', /SWAPPED the Upper Pull session for Football · 60 min/.test(swap) && !/NOT LOGGED/.test(swap), swap)
const miss = buildTodayHeader({ ...hdr, declared: { kind: 'missed' } })
check('a session she marked missed is said as not happening', /NOT HAPPENING \(marked missed\)/.test(miss) && !/NOT LOGGED yet/.test(miss), miss)
check('the client reads the declaration off the strip\'s own cell',
  /if \(cell\.state === 'rest_chosen'\) return \{ kind: 'rest_chosen' as const \}/.test(chat) && /if \(cell\.state === 'swapped'\)/.test(chat) && /if \(cell\.markedMissed\) return \{ kind: 'missed' as const \}/.test(chat))

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.error(`chat today truth: ${failures} check(s) failed`); process.exit(1) }
console.log('chat today truth: all checks passed')
