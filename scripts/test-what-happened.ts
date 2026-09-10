/**
 * Gate: what happened to today's session — the five verbs, on the screen too.
 *
 * Ashley, 10 Sep 2026, from the must-have audit's MISSING list. Four day-level
 * verbs (move, rest day, something else instead, did it elsewhere) existed as
 * coach tools only; "missed" existed nowhere — the week strip guessed it once
 * the date passed, and the coach's only offer rewrote it as a rest.
 *
 * Her ruling: a missed day STAYS missed. What this file holds down:
 *  1. The declared miss is a real state, ranked where the plan says.
 *  2. The coach stops asking about a miss it has been told, and its chips
 *     offer three different facts instead of two.
 *  3. ONE WRITER PER COLUMN — the sheet and the coach write through the same
 *     functions, so the two surfaces cannot disagree.
 *  4. The sheet offers exactly the verbs that apply to the day's state, and
 *     each verb writes what it says.
 *  5. The coach's own "mark it missed" is a proposal on the same rail as rest.
 *  6. The wiring: menu item, panel, migration, type.
 */
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { classifyDay, countsTowardWeekTally } from '../src/hooks/useTrainingWeek'
import { missedYesterdayFrom, pickOpener, type OpenerInput } from '../src/lib/coach-opener'
import type { WorkoutDay } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

let failures = 0
function check(label: string, ok: boolean, extra?: unknown) {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}

const session = (day: string): WorkoutDay => ({ day, focus: 'Push', exercises: [{ name: 'Barbell Bench Press' }] } as unknown as WorkoutDay)
const PLAN = [session('Monday'), session('Wednesday'), session('Friday')]
const PLAN_START = '2026-09-01'
const TODAY = '2026-09-09'  // Wednesday
const MON = '2026-09-07'
const WED = '2026-09-09'
const FRI = '2026-09-11'
const dash = (session: Record<string, unknown> | null, logs: unknown[] = []) => ({ date: '', metric: null, nutrition: null, session, exercises: [], workoutLogs: logs, cardioLogs: [] }) as never

// ---------------------------------------------------------------------------
console.log('\n1. A declared miss is a real state, ranked where the ruling says')
// ---------------------------------------------------------------------------
check('a past day marked missed reads missed', classifyDay('Monday', MON, TODAY, PLAN, dash({ marked_missed: true }), PLAN_START) === 'missed')
check('...and TODAY marked missed reads missed tonight, not tomorrow', classifyDay('Wednesday', WED, TODAY, PLAN, dash({ marked_missed: true }), PLAN_START) === 'missed',
  classifyDay('Wednesday', WED, TODAY, PLAN, dash({ marked_missed: true }), PLAN_START))
check('logged work still outranks it — marked missed, then trained, is done',
  classifyDay('Monday', MON, TODAY, PLAN, dash({ marked_missed: true, is_completed: true }, [{ id: 'x' }]), PLAN_START) === 'done')
check('...and partial work reads partial', classifyDay('Monday', MON, TODAY, PLAN, dash({ marked_missed: true }, [{ id: 'x' }]), PLAN_START) === 'partial')
check('missed outranks a move — the day was missed even though the work moved',
  classifyDay('Monday', MON, TODAY, PLAN, dash({ marked_missed: true, moved_to_date: FRI }), PLAN_START, [{ fromDate: MON, toDate: '2026-09-08' }]) === 'missed')
check('missed outranks a chosen rest on the same row — the two are never one fact',
  classifyDay('Monday', MON, TODAY, PLAN, dash({ marked_missed: true, deliberate_rest: true }), PLAN_START) === 'missed')
check('it counts against the week, as the ruling requires', countsTowardWeekTally('missed'))
check('an undeclared past day is still inferred missed — nothing existing changed meaning',
  classifyDay('Monday', MON, TODAY, PLAN, dash(null), PLAN_START) === 'missed')
check('...and a future day is due, marked or not', classifyDay('Friday', FRI, TODAY, PLAN, dash(null), PLAN_START) === 'due')

// ---------------------------------------------------------------------------
console.log('\n2. The coach stops asking about a miss it has been told, and offers three facts')
// ---------------------------------------------------------------------------
const days = [{ date: MON, dayName: 'Monday', state: 'missed' }]
check('an inferred miss yesterday is raised', missedYesterdayFrom(days, MON, [{ day: 'Monday', focus: 'Push' }])?.focus === 'Push')
check('a DECLARED miss yesterday is not raised again', missedYesterdayFrom([{ ...days[0], markedMissed: true }], MON, [{ day: 'Monday', focus: 'Push' }]) === null)
const base: OpenerInput = { hour: 9, cutoffHour: 21, awaitingFeel: null, missedYesterday: { dayName: 'Monday', focus: 'Push' }, planKnown: true, todaySession: null, todayLogged: false, tomorrowSession: null } as unknown as OpenerInput
const opener = pickOpener(base)
check('the opener offers "Mark it missed"', opener.chips.includes('Mark it missed'), opener.chips)
check('...and a rest as a separate, honest choice', opener.chips.includes('Call it a rest day'), opener.chips)
check('...and no longer offers rest as the ONLY alternative to training', !opener.chips.some(c => /call yesterday a rest day/i.test(c)), opener.chips)
check('...still no drama', /no drama/.test(opener.text), opener.text)
const nudge = strip(read('src/lib/coach-nudge.ts'))
check('the nudge offers the same three', /'Mark it missed'/.test(nudge) && /'Call it a rest day'/.test(nudge) && !/Call yesterday a rest day/.test(nudge))

// ---------------------------------------------------------------------------
console.log('\n3. One writer per column')
// ---------------------------------------------------------------------------
const srcFiles = ['src/lib/daily-tracking.ts', 'src/lib/pending-action-executor.ts', 'src/components/exercise/WhatHappenedSheet.tsx', 'src/components/ChatAssistant.tsx', 'src/components/exercise/TodayPanel.tsx', 'src/hooks/useTrainingWeek.ts']
const writesOf = (col: string) => srcFiles.filter(f => new RegExp(`${col}:\\s*(missed|activity|true|resting|toDate)\\b`).test(strip(read(f))))
check('marked_missed is written in exactly one module', writesOf('marked_missed').join() === 'src/lib/daily-tracking.ts', writesOf('marked_missed'))
check('swapped_for_activity is written on the client in exactly one module', writesOf('swapped_for_activity').join() === 'src/lib/daily-tracking.ts', writesOf('swapped_for_activity'))
const sheet = strip(read('src/components/exercise/WhatHappenedSheet.tsx'))
check('the sheet never talks to the database itself', !/supabase/.test(sheet) && !/from\('/.test(sheet))
check('...it writes through the day-flag writers the coach uses',
  /setMarkedMissed\(profileId!, date, true\)/.test(sheet) && /setDeliberateRest\(profileId!, date, true\)/.test(sheet)
  && /setSessionMove\(profileId!, to\.remapFrom \?\? date, to\.date\)/.test(sheet) && /setSwappedForActivity\(profileId!, date, name\)/.test(sheet))
check('...and every declared state can be unsaid through the same writer',
  /setMarkedMissed\(profileId!, date, false\)/.test(sheet) && /setDeliberateRest\(profileId!, date, false\)/.test(sheet)
  && /setSwappedForActivity\(profileId!, date, null\)/.test(sheet) && /setSessionMove\(profileId!, date, null\)/.test(sheet))
const tracking = strip(read('src/lib/daily-tracking.ts'))
// EACH WRITER WRITES ITS OWN COLUMN, IN BOTH BRANCHES. A mutation that swapped
// the update branch's column to deliberate_rest passed the one-writer check
// above, because the insert branch still named marked_missed. The property
// is stronger than "only this module writes it": every branch of the writer
// writes that column and no other day-flag.
const writerBody = (name: string, next: string) => tracking.slice(tracking.indexOf(`export async function ${name}`), tracking.indexOf(`export async function ${next}`))
const missedBody = writerBody('setMarkedMissed', 'setSwappedForActivity')
check('setMarkedMissed writes marked_missed on update AND insert, and no other flag',
  /\.update\(\{ marked_missed: missed/.test(missedBody) && /marked_missed: true/.test(missedBody)
  && !/deliberate_rest|swapped_for_activity|moved_to_date/.test(missedBody))
const swapBody = tracking.slice(tracking.indexOf('export async function setSwappedForActivity'), tracking.indexOf('export interface WeeklyDashboardDay'))
check('setSwappedForActivity writes swapped_for_activity on update AND insert, and no other flag',
  /\.update\(\{ swapped_for_activity: activity/.test(swapBody) && /swapped_for_activity: activity,/.test(swapBody)
  && !/deliberate_rest|marked_missed|moved_to_date/.test(swapBody))
check('the new writers read before they write, like their siblings',
  (tracking.match(/\.select\('id'\)[\s\S]{0,120}\.maybeSingle\(\)/g) || []).length >= 4)
check('...and never invent a row to record a negative',
  /if \(!missed\) return true/.test(tracking) && /if \(!activity\) return true/.test(tracking))

// ---------------------------------------------------------------------------
console.log('\n4. The sheet offers the verbs that apply, and each writes what it says')
// ---------------------------------------------------------------------------
const verbs = sheet.slice(sheet.indexOf('const verbs: Verb[] = useMemo'), sheet.indexOf('const moveCandidates'))
check('a logged day, a day with no session, or a day moved away gets no verbs', /if \(!target \|\| isDone \|\| !hasSession \|\| movedAway\) return \[\]/.test(verbs))
check('"did it, not in the app" is a PAST-day verb only', /if \(isPast\) out\.push\('did_elsewhere'\)/.test(verbs))
check('"I missed it" needs a day that has happened, and not already declared', /\(isPast \|\| isToday\) && !declared\.missed\) out\.push\('missed'\)/.test(verbs))
check('"something else instead" likewise', /\(isPast \|\| isToday\) && !declared\.swapped\) out\.push\('something_else'\)/.test(verbs))
check('move and rest apply to any day with a session', /out\.push\('move'\)/.test(verbs) && /if \(!declared\.rest\) out\.push\('rest'\)/.test(verbs))
check('today points at the grid rather than a shortcut', /Tick the sets below/.test(sheet) && !/is_completed: true/.test(sheet))
const cands = sheet.slice(sheet.indexOf('const moveCandidates'), sheet.indexOf('const nextFree'))
check('move destinations come from the coach\'s own resolver, one candidate per requested day',
  /resolveMoveTarget\(\{ fromDate: date, requestedDate: d\.date/.test(cands) && /r\.ok && r\.asWanted/.test(cands))
check('after a miss, the offer to move uses the resolver\'s next free day', /resolveMoveTarget\(\{ fromDate: date, todayDate: today, plan, weekOf, existing: moves \}\)/.test(sheet) && /missed_recorded/.test(sheet))
check('"something else" leaves the same two rows the coach\'s tool leaves',
  /saveCardioLog\(\{ userId: profileId!, date, activityName: name, durationMinutes: Math\.round\(mins\), intensityRpe: 6, notes: 'Swapped in place of the prescribed lifting session' \}\)/.test(sheet))
const did = sheet.slice(sheet.indexOf('const saveDidElsewhere'), sheet.indexOf('const focus ='))
check('"did it elsewhere" logs real sets through the history writer, then completes the row',
  did.indexOf('writeHistoricalSession(') > 0 && did.indexOf('markSessionCompleted(') > did.indexOf('writeHistoricalSession('))
check('...and refuses to log nothing', /if \(sets\.length === 0\)/.test(did))
check('...carrying the prescription\'s own unit — a 40m carry is not 40 reps', /unit: prescriptionUnit\(ex\.prescription_type\)/.test(did))
check('...and nothing is logged until "Log it" — the hint says so', /Nothing is logged until you tap Log it/.test(sheet) && !/logged as you type/.test(sheet))
check('a failed write is a sentence on screen, not a silent tick', /Couldn't save that/.test(sheet) && /setError/.test(sheet))
check('the sheet re-reads the week after every write', /onChanged\(\)/.test(sheet))

// ---------------------------------------------------------------------------
console.log('\n5. The coach\'s "mark it missed" is a proposal on the same rail as rest')
// ---------------------------------------------------------------------------
const chat = read('supabase/functions/chat-gemini/index.ts')
check('the tool is declared', /name: "propose_missed_session"/.test(chat))
check('...and its description keeps missed and rest apart', /It is NOT propose_rest_day/.test(chat))
const handler = chat.slice(chat.indexOf('name === "propose_missed_session"'), chat.indexOf('name === "log_workout_session"'))
check('...its handler PROPOSES and writes nothing', /proposal:[\s\S]{0,120}kind: "propose_missed_session"/.test(handler) && !/workout_sessions|PATCH/.test(handler))
const rule = chat.slice(chat.indexOf('NEVER CLAIM AN ACTION'), chat.indexOf('NEVER CLAIM AN ACTION') + 4000)
check('the honesty rule names it, and says a miss is not a rest', /propose_missed_session/.test(rule) && /A miss is not a rest/.test(rule))
check('the day tools are four, not three', /The four day tools differ/.test(chat) && !/The three day tools differ/.test(chat))
check('the trigger rule exists', /Trigger propose_missed_session when they tell you a session did NOT happen/.test(chat))
const ui = strip(read('src/components/ChatAssistant.tsx'))
check('the client builds its card', /buildMissedSessionProposal/.test(ui) && /kind === 'propose_missed_session'[\s\S]{0,200}buildMissedSessionProposal/.test(ui))
check('...whose card says the day stays on the record', /stays on your record as a session that didn't happen/.test(ui))
check('...refuses a day that has not happened yet', /delta > 0\) return null/.test(ui.slice(ui.indexOf('const buildMissedSessionProposal'), ui.indexOf('const buildMissedSessionProposal') + 1600)))
check('...executes it on confirm and can undo it', /row\.kind === 'propose_missed_session'[\s\S]{0,200}executeMissedSession/.test(ui) && /undoMissedSession/.test(ui))
const exec = strip(read('src/lib/pending-action-executor.ts'))
const execBody = exec.slice(exec.indexOf('export async function executeMissedSession'), exec.indexOf('export async function undoMissedSession'))
check('the executor writes the missed column, never the rest one', /setMarkedMissed\(profile\.id, payload\.date, true\)/.test(execBody) && !/setDeliberateRest/.test(execBody))
check('the receipt kind is known to the client', /'propose_missed_session'/.test(read('src/lib/types.ts')))

// ---------------------------------------------------------------------------
console.log('\n6. The wiring')
// ---------------------------------------------------------------------------
const row = strip(read('src/components/exercise/WeekContextRow.tsx'))
check('the day menu has the item', /data-testid="what-happened-item"/.test(row) && /What happened\?/.test(row))
const panel = strip(read('src/components/exercise/TodayPanel.tsx'))
check('the panel opens it for the day on screen — a peeked day, else today', /const dayName = peekDay \?\? todayName/.test(panel) && /onOpenWhatHappened=\{profileId \? openWhatHappened : undefined\}/.test(panel))
check('...and re-reads the week and tells the app after a write', /<WhatHappenedSheet[\s\S]{0,900}onChanged=\{\(\) => \{ weekTrain\.refresh\(\); onLogsUpdated\?\.\(\) \}\}/.test(panel))
const mig = 'supabase/migrations/20260910160000_add_marked_missed.sql'
check('the column has a migration', existsSync(join(ROOT, mig)) && /ADD COLUMN IF NOT EXISTS marked_missed boolean/.test(read(mig)))
check('...and the row type knows it', /marked_missed\?: boolean \| null/.test(read('src/lib/types.ts')))
check('the week hook exposes what was declared, so the sheet can offer to unsay it', /markedMissed: !!dashboardDay\?\.session\?\.marked_missed/.test(read('src/hooks/useTrainingWeek.ts')))

console.log(failures === 0 ? '\nAll what-happened checks passed.' : `\n${failures} what-happened check(s) FAILED`)
process.exit(failures === 0 ? 0 : 1)
