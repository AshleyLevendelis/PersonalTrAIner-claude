// ---------------------------------------------------------------------------
// A PLAN PAUSE (his ruling 14 Nov 2026, "Add a pause"; docs/plans/plan-pause.md). While paused: no session is due,
// nothing is missed, no workout reminder or cheerful nudge (chat or phone), meals carry on; Profile, today's card,
// Home and the coach all pause and resume through one function. One exit, at the bottom.
// ---------------------------------------------------------------------------
import fs from 'fs'
import { classifyDay, countsTowardWeekTally } from '../src/hooks/useTrainingWeek'
import { GLYPH, STATE_LABEL } from '../src/lib/week-glyphs'
import { isPausedOn, setPlanPausedSince, planPausedSince, PAUSE_WORDS } from '../src/lib/plan-pause'
import * as appMoments from '../src/lib/coach-moments'
import * as serverMoments from '../supabase/functions/_shared/coach-moments'
import { pickUnprompted } from '../src/lib/coach-nudge'
import { RED_FLAG_WORDS } from '../src/lib/red-flag'
import type { WorkoutDay } from '../src/lib/types'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')
const read = (p: string) => strip(fs.readFileSync(p, 'utf8'))

console.log('\n1. A paused day is neither due nor missed')
{
  const plan = [{ day: 'Monday', focus: 'Legs', exercises: [{ name: 'Goblet Squat', sets: 3, reps: '8', rest: '90s' }] }] as unknown as WorkoutDay[]
  const start = '2026-11-02', today = '2026-11-16'
  // Mondays: 9 Nov (before the pause), 16 Nov (today), 23 Nov (ahead). Pause from 12 Nov.
  const day = (date: string, since: string | null, logged = false) => classifyDay('Monday', date, today, plan, logged
    ? { date, workingLogs: [{ exercise_name: 'Goblet Squat' }], cardioLogs: [], session: { is_completed: true } } as never
    : undefined, start, [], since)
  check('a planned day after the pause began and before today is paused, not missed', day('2026-11-16', '2026-11-12') === 'paused' && day('2026-11-16', null) === 'due')
  check('...today is paused, not due; a day ahead is paused, not due', day('2026-11-16', '2026-11-16') === 'paused' && day('2026-11-23', '2026-11-12') === 'paused')
  check('...a day before the pause keeps its own answer (missed stays missed)', day('2026-11-09', '2026-11-12') === 'missed')
  check('...and work logged on a paused day still counts as done', day('2026-11-16', '2026-11-12', true) === 'done')
  check('a paused day is not in the week\'s count', !countsTowardWeekTally('paused') && countsTowardWeekTally('due'))
  check('the strip marks it with its own sign and says "plan paused"', GLYPH.paused === '‖' && STATE_LABEL.paused === 'plan paused')
  check('isPausedOn: from the start day on, never before, never with no pause', isPausedOn('2026-11-12', '2026-11-12') && !isPausedOn('2026-11-11', '2026-11-12') && !isPausedOn('2026-11-12', null))
  setPlanPausedSince('p1', '2026-11-12'); const a = planPausedSince('p1'); setPlanPausedSince('p1', null)
  check('the one store every reader asks holds the date and clears on resume', a === '2026-11-12' && planPausedSince('p1') === null && planPausedSince(undefined) === null)
  const hook = read('src/hooks/useTrainingWeek.ts')
  check('every week the app builds asks the store (the strip, the coach\'s weeks, weeks on plan)', (hook.match(/pausedSince: planPausedSince\(profileId\)/g) ?? []).length === 3, (hook.match(/pausedSince: planPausedSince\(profileId\)/g) ?? []).length)
}

console.log('\n2. Nothing unprompted while paused')
{
  const F = { localHour: 9, awaitingFeel: false, plannedToday: true, loggedToday: false, missedYesterday: false, daysSinceAnyLog: 0, blockJustEnded: false, beatTargetPending: false }
  check('no reminder, comeback or nudge on the phone\'s server or in the app while paused; they return on resume',
    [appMoments, serverMoments].every(m => m.momentsToRaise(F as never, { plan_paused_since: '2026-11-12' }, 0).length === 0 && m.momentsToRaise(F as never, {}, 0).length > 0 && m.momentsToRaise({ ...F, plannedToday: false, daysSinceAnyLog: 4 } as never, { plan_paused_since: '2026-11-12' }, 0).length === 0))
  check('...the server reads the pause off the profile with the settings', /plan_paused_since: typeof rows\[0\]\?\.plan_paused_since === "string"/.test(read('supabase/functions/coach-reach-out/index.ts')))
  const base = { now: Date.parse('2026-11-16T10:00:00Z'), today: '2026-11-16', cap: 3, unpromptedToday: 0, lastUnpromptedAt: 0, momentsSaidToday: [], said: [], greeting: 'Hey',
    event: { kind: 'due', text: 'Ready?', chips: [], keys: ['due:x'] } as never, hello: () => ({ text: 'Hey — morning!', chips: [] }), moments: [] }
  check('the chat says nothing unprompted while paused, not even the hello', pickUnprompted({ ...base, paused: true }) === null && pickUnprompted(base) !== null)
  const checkIn = { text: 'how are you?', chips: [], key: 'rf:1' }
  check('...except the one check-in after a red flag', pickUnprompted({ ...base, paused: true, redFlag: { mode: 'checkin', checkIn } })?.text === 'how are you?')
  const chat = read('src/components/ChatAssistant.tsx')
  check('...and the chat hands both the pause', /plan_paused_since: profile\.plan_paused_since \?\? null \}, now\)/.test(chat) && /paused: !!profile\.plan_paused_since,/.test(chat))
}

console.log('\n3. One function pauses and resumes, from every surface')
{
  const app = read('src/App.tsx')
  check('the profile reads the pause (as running before the database has it)', /plan_paused_since: typeof profileRow\.plan_paused_since === 'string' \? profileRow\.plan_paused_since : null/.test(app))
  check('...and mirrors it into the store while drawing, so the first strip knows', /if \(profile\?\.id\) setPlanPausedSince\(profile\.id, profile\.plan_paused_since \?\? null\)/.test(app))
  const h = app.slice(app.indexOf('const handlePlanPause = async'), app.indexOf('const handleProfilePatched'))
  check('handlePlanPause saves today or null, says "not switched on yet" before the migration, and updates the screen', /const since = pause \? getLocalDateString\(getAppNow\(profile\.id\)\) : null/.test(h) && /if \(outcome === 'not-yet'\) return PAUSE_WORDS\.notLive/.test(h) && /handleProfilePatched\(\{ plan_paused_since: since \}\)/.test(h))
  check('...handed to Profile, Exercise and the coach', (app.match(/onPlanPause=\{handlePlanPause\}/g) ?? []).length === 3)
  const store = read('src/lib/profile-store.ts')
  check('the write says when the database has no column, never pretends', /if \(isMissingColumnError\(error, 'plan_paused_since'\)\) return 'not-yet'/.test(store))
  check('the migration adds the column', /add column if not exists plan_paused_since date/.test(fs.readFileSync('supabase/migrations/20261114180000_add_plan_paused_since.sql', 'utf8')))
  const today = read('src/components/exercise/TodayPanel.tsx')
  check('today\'s card stops offering the session and offers Resume', /const pausedToday = todayCell\?\.state === 'paused'/.test(today) && /const notThisSession = !!swappedToday \|\| !!setAsideToday \|\| pausedToday/.test(today) && /setResumeError\(await onPlanPause\(false\)\)/.test(today))
  const home = read('src/components/Dashboard.tsx')
  check('Home says "Plan paused" and offers nothing to start', /todayCell\?\.state === 'paused' \? todayCell\.state : null/.test(home) && /declaredToday === 'paused' && !done\) \{\s*title = PAUSE_WORDS\.card/.test(home))
  const prof = read('src/components/ProfileScreen.tsx')
  check('Profile pauses and resumes', /setPauseNote\(await onPlanPause\(!profile\.plan_paused_since\)\)/.test(prof))
}

console.log('\n4. The coach')
{
  const coach = fs.readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8')
  check('the coach has a pause tool that only carries the request', /name: "propose_plan_pause"/.test(coach) && /kind: "propose_plan_pause",\s*rawArgs: \{ action: args\.action === "resume" \? "resume" : "pause"/.test(coach))
  check('...and is told when the plan is paused, and not to ask about sessions', /THEIR PLAN IS PAUSED since \$\{context\.plan_paused_since\}/.test(coach))
  const chat = read('src/components/ChatAssistant.tsx')
  const b = chat.slice(chat.indexOf('const buildPlanPauseProposal'), chat.indexOf('const buildGoalChangeProposal'))
  check('the card is refused when it would change nothing', /if \(pause && pausedNow\) return \{ ok: false, refusal: PAUSE_WORDS\.alreadyPaused/.test(b) && /if \(!pause && !pausedNow\) return \{ ok: false, refusal: PAUSE_WORDS\.notPaused \}/.test(b))
  check('...and confirms through the same function as Profile', /const failed = onPlanPause \? await onPlanPause\(pause\) : PAUSE_WORDS\.notLive/.test(chat))
  check('a red flag offers the pause, and not when already paused', /\[QUICK_REPLIES: "Pause my plan"\]/.test(RED_FLAG_WORDS.turn(true)) && !/QUICK_REPLIES/.test(RED_FLAG_WORDS.turn(true, true)) && PAUSE_WORDS.pause === 'Pause my plan')
}

console.log(`\n${ran} checks ran, ${failures} failed.`)
if (failures > 0) { console.error('test:plan-pause FAILED'); process.exit(1) }
console.log('A paused plan owes nothing, says nothing unprompted, and pauses and resumes one way everywhere.')
