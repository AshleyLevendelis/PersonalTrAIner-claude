// ---------------------------------------------------------------------------
// A FINISHED ROUND MUST ACTUALLY BE WRITTEN DOWN.
//
// Ashley, 12 Sep 2026, from the live app: "I started a round timer and did 3
// rounds 120s each with 30s rest. When I finished, the app asked me if i
// wanted to log the workout. I logged it but it doesn't show anywhere on the
// app and the coach has no knowledge of it."
//
// IT NEVER LOGGED. RoundField's finished-state button said "Log session" and
// its handler was `timers.reset(); window.location.hash = tabHash('exercise')`
// — no write of any kind, and the reset destroyed the round on the way out.
//
// The comment above that code said: "A REAL ACTION, not a decoration ... a
// button that only dismissed itself would be lying about what it does."
// Navigating away IS dismissing itself. The sentence was right and the code
// did not obey it, and nothing checked, so it shipped and stayed.
//
// WHAT THIS GATE PINS is therefore not wording but the two things that were
// actually wrong: the summary is derived from the round that ran, and the
// button hands it to something that writes rather than throwing it away.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { roundLogSummary, totalRoundSeconds, leadInMsOf } from '../src/lib/timer-engine'

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

console.log('\n1. Her round, turned into a log entry')
{
  // The exact session she reported.
  const hers = { rounds: 3, workSeconds: 120, restSeconds: 30, leadInSeconds: 10 }
  const s = roundLogSummary(hers)
  check('it is 7 minutes — 3x120s work plus 2x30s rest', s.durationMinutes === 7, s)
  // PINNED AS INVARIANCE, not against a computed number. The first version
  // recomputed the same expression the code uses and compared — on a 7-minute
  // round a 10-second countdown cannot move the rounding either way, so the
  // check was arithmetically incapable of failing and a mutation that counted
  // the countdown sailed through it. Two configs differing ONLY in lead-in
  // must log the same duration, and a ten-minute countdown makes that bite.
  const noLead = roundLogSummary({ rounds: 3, workSeconds: 120, restSeconds: 30 })
  const hugeLead = roundLogSummary({ rounds: 3, workSeconds: 120, restSeconds: 30, leadInSeconds: 600 })
  check('...and the get-ready countdown is NOT counted as training',
    noLead.durationMinutes === hugeLead.durationMinutes && hugeLead.durationMinutes === 7,
    { noLead: noLead.durationMinutes, hugeLead: hugeLead.durationMinutes })
  check('it is called conditioning, not a lift', s.activityName === 'Intervals', s.activityName)
  check('the detail says what actually ran', s.detail === '3 rounds · 120s work / 30s rest', s.detail)
}

console.log('\n2. Every shape survives it')
{
  const emom = roundLogSummary({ rounds: 10, workSeconds: 60, restSeconds: 0, style: 'emom' })
  check('an EMOM is logged as an EMOM', emom.activityName === 'EMOM', emom)
  check('...ten minutes of it', emom.durationMinutes === 10, emom)
  check('...described by its interval, not a zero rest', emom.detail === '10 × every 60s', emom.detail)

  const tabata = roundLogSummary({ rounds: 8, workSeconds: 20, restSeconds: 10 })
  check('Tabata is four minutes', tabata.durationMinutes === 4, tabata)

  // A LOG MUST NOT READ "0 min". A short session is still a session, and an
  // app that rounds it away is telling her it did not happen.
  const tiny = roundLogSummary({ rounds: 2, workSeconds: 10, restSeconds: 5 })
  check('a very short round still logs at least a minute', tiny.durationMinutes >= 1, tiny)
}

console.log('\n3. The button hands the round over instead of discarding it')
{
  const field = strip(readFileSync('src/components/timers/RoundField.tsx', 'utf8'))
  check('the finished button calls out to something that can write',
    /onLogSession\(roundLogSummary\(config\)\)/.test(field), null)
  // THE ORIGINAL DEFECT, pinned so it cannot come back: reset-then-navigate.
  check('...and no longer resets and changes tab instead of logging',
    !/timers\.reset\(\)\s*\n\s*window\.location\.hash/.test(field), null)
  check('the round is NOT reset before the write lands',
    !/onLogSession\(roundLogSummary\(config\)\)[\s\S]{0,80}timers\.reset\(\)/.test(field), null)
  // A button must not offer what its screen cannot do.
  check('with nothing able to log, the button stops saying it logs',
    /onLogSession \? 'Log session' : 'Done'/.test(field), null)

  const tools = strip(readFileSync('src/components/ToolsTab.tsx', 'utf8'))
  check('Tools gives the field somewhere to send it',
    /<RoundField onLogSession=\{setRoundToLog\} \/>/.test(tools), null)
  check('...opening the conditioning sheet already filled in',
    /prefill=\{roundToLog/.test(tools) && /notes: roundToLog\.detail/.test(tools), null)
  check('...and the timer is reset only inside onCardioLogged',
    /onCardioLogged=\{\(\) => \{[\s\S]{0,400}?timers\.reset\(\)/.test(tools), null)
  // THE BANNER MUST BE SET, not merely renderable. The first version tested
  // only that `{loggedNote && ...}` existed in the file; deleting the line
  // that sets it left the render in place and the check green while nothing
  // could ever appear.
  check('a successful save says so on screen',
    /setLoggedNote\(`Logged/.test(tools) && /loggedNote &&/.test(tools), null)
}

console.log('\n4. It reaches the places she looked')
{
  // She checked the app and asked the coach. Both read cardio, so one write
  // covers both — pinned here because that is WHY conditioning was the right
  // shape, and a future change that logs it somewhere else should fail this.
  const chat = strip(readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
  check('the coach is sent cardio history', /cardio_log_history: cardioLogHistory/.test(chat), null)
  const week = strip(readFileSync('src/hooks/useTrainingWeek.ts', 'utf8'))
  check('the week counts a cardio log as work done',
    /cardioLogs\?\.length \?\? 0\) > 0/.test(week), null)

  // AND IT MUST NOT INVENT THE EFFORT. saveCardioLog demands an RPE; the app
  // cannot know one, so the sheet asks. A prefilled RPE would be the app
  // making up a fact about her training.
  const sheet = strip(readFileSync('src/components/exercise/AddUnplannedWork.tsx', 'utf8'))
  check('the prefill fills the activity and the duration', /setActivity\(prefill\.activityName\)/.test(sheet)
    && /setDuration\(String\(prefill\.durationMinutes\)\)/.test(sheet), null)
  check('...and never the effort, which only she knows',
    !/prefill\.(rpe|intensity)/.test(sheet), null)
  // AND THE DETAIL SURVIVES THE SAVE. Checked at the writing end, not the
  // passing end: ToolsTab handing over `notes` proves nothing if the save
  // then drops them, which is what a mutation did while this file was green.
  check('the round detail is written into the log, not just handed over',
    /notes: prefill\?\.notes \?\? null/.test(sheet), null)
}

if (failures > 0) { console.error(`\n${failures} check(s) failed`); process.exit(1) }
console.log('\nA finished round is written down, not waved away.\n')
