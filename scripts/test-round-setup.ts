// ---------------------------------------------------------------------------
// test:round-setup — THE ROUND-TIMER SETUP SHEET (design handoff 4c, 10 Oct 2026).
//
// The arithmetic the sheet shows, run rather than read: the step lists and
// "nearest in the direction tapped", the EMOM rule, the preview total and its
// "no rest after the last", the timeline, the caption, the settings record,
// and the two wiring rules that matter on a gym floor — beeps and buzz switch
// off the ROUND timer's cues only, and Start runs the countdown it names.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  WORK_STEPS, REST_STEPS, ROUNDS_MIN, ROUNDS_MAX, COUNTDOWN_STEPS, stepThrough, stepConfig, withRest,
  clock, workingSeconds, roundsLabel, roundCaption, timelineSegments, doneAt, startLabel, nextCountdown,
} from '../src/lib/round-setup'
import { ROUND_PRESETS, totalRoundSeconds, presetForConfig, type RoundConfig } from '../src/lib/timer-engine'
import { selectedChoiceKey, protocolChoices } from '../src/components/timers/ProtocolChips'

const ROOT = join(import.meta.dirname, '..')
let failures = 0
let ran = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`) }
}
const code = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const tabata: RoundConfig = { rounds: 8, workSeconds: 20, restSeconds: 10 }

console.log('\n1. The steppers walk the brief\'s lists')
{
  check('work steps are the brief\'s twelve', WORK_STEPS.join() === '10,15,20,30,40,45,60,90,120,180,240,300')
  check('rest steps are the brief\'s ten, None first', REST_STEPS.join() === '0,5,10,15,20,30,45,60,90,120')
  check('rounds are held to 1-50', ROUNDS_MIN === 1 && ROUNDS_MAX === 50)
  check('a listed value steps to its neighbour', stepThrough(WORK_STEPS, 40, 1) === 45 && stepThrough(WORK_STEPS, 40, -1) === 30)
  check('an unlisted value (Today\'s 25s) steps to the NEAREST in that direction, not the list\'s start',
    stepThrough(WORK_STEPS, 25, 1) === 30 && stepThrough(WORK_STEPS, 25, -1) === 20, [stepThrough(WORK_STEPS, 25, 1), stepThrough(WORK_STEPS, 25, -1)])
  check('...and holds at the ends', stepThrough(WORK_STEPS, 300, 1) === 300 && stepThrough(REST_STEPS, 0, -1) === 0)
  let r = { ...tabata, rounds: 50 }
  r = stepConfig(r, 'rounds', 1)
  check('rounds stop at 50', r.rounds === 50, r.rounds)
  check('...and at 1', stepConfig({ ...tabata, rounds: 1 }, 'rounds', -1).rounds === 1)
  check('a stepper never carries a run\'s lead-in into the draft',
    stepConfig({ ...tabata, leadInSeconds: 10, carried: { rounds: 2, seconds: 60 } }, 'work', 1).leadInSeconds === undefined)
}

console.log('\n2. No rest makes it an EMOM, and back')
{
  const e = withRest(tabata, 0)
  check('rest 0 marks the style', e.restSeconds === 0 && e.style === 'emom', e)
  check('rest above 0 clears it again', withRest(e, 10).style === undefined)
  check('the first stepper is called Minutes for a one-minute EMOM', roundsLabel({ rounds: 10, workSeconds: 60, restSeconds: 0, style: 'emom' }) === 'Minutes')
  check('...Intervals for any other EMOM', roundsLabel({ rounds: 10, workSeconds: 120, restSeconds: 0, style: 'emom' }) === 'Intervals')
  check('...and Rounds otherwise', roundsLabel(tabata) === 'Rounds')
}

console.log('\n3. The preview says what will run')
{
  check('the total has no rest after the last round: Tabata is 3:50, not 4:00', clock(workingSeconds(tabata)) === '3:50', clock(workingSeconds(tabata)))
  check('...and leaves the countdown out (the engine\'s total includes it)', totalRoundSeconds({ ...tabata, leadInSeconds: 10 }) - workingSeconds(tabata) === 10)
  const seg = timelineSegments(tabata, 10)
  check('the timeline starts with the countdown', seg[0].kind === 'countdown' && seg[0].seconds === 10)
  check('...then 8 work and 7 rest — no rest after the last', seg.filter(s => s.kind === 'work').length === 8 && seg.filter(s => s.kind === 'rest').length === 7 && seg[seg.length - 1].kind === 'work')
  check('...and with the countdown off, none is drawn', timelineSegments(tabata, 0)[0].kind === 'work')
  const emom = ROUND_PRESETS.find(p => p.key === 'emom')!.config
  check('an EMOM timeline has no rest at all', !timelineSegments(emom, 10).some(s => s.kind === 'rest'))
  check('the caption for intervals', roundCaption({ rounds: 8, workSeconds: 40, restSeconds: 20 }, '40/20') === '8 rounds · 0:40 work · 0:20 rest · no rest after the last')
  check('the caption for an EMOM', roundCaption({ rounds: 12, workSeconds: 60, restSeconds: 0, style: 'emom' }, 'Custom') === 'EMOM · a new minute starts every 1:00, 12 times')
  check('...a two-minute one says interval, not minute', /a new interval starts every 2:00/.test(roundCaption(ROUND_PRESETS.find(p => p.key === 'e2mom')!.config, 'E2MOM')))
  check('one round promises no rest that does not exist', !/rest/.test(roundCaption({ rounds: 1, workSeconds: 60, restSeconds: 30 }, 'Custom')))
  // 23:58 + 10s countdown + 3:50 = 00:02 the next day: the clock wraps.
  const t = new Date(2026, 9, 10, 23, 58, 0).getTime()
  check('"done ~" is now plus countdown plus the round, in local time', doneAt(t, tabata, 10) === '00:02', doneAt(t, tabata, 10))
}

console.log('\n4. Start says the countdown it runs')
{
  check('Off → 5 → 10 → 15 → Off', COUNTDOWN_STEPS.map(nextCountdown).join() === '5,10,15,0')
  check('"Start · 10s countdown", and "Start now" when off', startLabel(10) === 'Start · 10s countdown' && startLabel(0) === 'Start now')
  const sheet = code('src/components/timers/RoundTimerSheet.tsx')
  check('the button\'s words and the run read the same setting',
    /startLabel\(prefs\.countdownSeconds\)/.test(sheet) && /timers\.startRound\(\{ \.\.\.config, leadInSeconds: prefs\.countdownSeconds \}\)/.test(sheet))
  check('full screen opens only on Start, and only when the switch is on',
    /if \(prefs\.openFullScreenOnStart\) timers\.setRoundFullScreen\(true\)/.test(sheet) && (sheet.match(/setRoundFullScreen\(/g) ?? []).length === 1)
  check('Buzz is offered only where the phone can vibrate', /\{canVibrate\(\) && optionChip\('buzz'/.test(sheet))
}

console.log('\n5. Beeps and Buzz silence the ROUND timer only')
{
  const hook = code('src/hooks/useTimers.tsx')
  const roundCues = hook.match(/playTimerCue\([^)]*\)/g) ?? []
  check('both round-timer cues pass her switches', roundCues.length === 2 && roundCues.every(c => /roundCueOpts\(prefsRef\.current\)/.test(c)), roundCues)
  check('...read through a ref, so a switch flipped mid-round silences the next cue', /prefsRef\.current = timerPrefs/.test(hook))
  const dock = code('src/components/BottomDock.tsx')
  check('the rest timer\'s chime does not read them', /playTimerCue\('rest-complete'\)/.test(dock))
  const cues = code('src/lib/timer-cues.ts')
  check('sound off skips the tone', /if \(opts\.sound !== false\) try \{/.test(cues))
  check('buzz off skips the vibration', /opts\.vibrate !== false && navigator\.vibrate/.test(cues))
}

console.log('\n6. Her settings are their own record, so a reset cannot wipe them')
{
  const store = new Map<string, string>()
  ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k), clear: () => store.clear(), key: () => null, length: 0,
  } as Storage
  const { getTimerPrefs, saveTimerPrefs, saveTimerRecord, clearTimerRecord, defaultTimerRecord, DEFAULT_TIMER_PREFS } = await import('../src/lib/timer-store')
  check('defaults are what the timer did before: 10s, sound and buzz on, no full screen',
    JSON.stringify(getTimerPrefs('p1')) === JSON.stringify({ countdownSeconds: 10, beepsOn: true, buzzOn: true, openFullScreenOnStart: false }))
  saveTimerPrefs('p1', { ...DEFAULT_TIMER_PREFS, beepsOn: false, countdownSeconds: 0 })
  saveTimerRecord('p1', defaultTimerRecord('round'))
  clearTimerRecord('p1')
  const after = getTimerPrefs('p1')
  check('clearing the timer record leaves her settings', after.beepsOn === false && after.countdownSeconds === 0, after)
  store.set('fitplan_timer_prefs_v1:p2', JSON.stringify({ countdownSeconds: 7, beepsOn: 'yes', buzzOn: false }))
  const odd = getTimerPrefs('p2')
  check('an unreadable setting falls back on its own, not all at once',
    odd.countdownSeconds === 10 && odd.beepsOn === true && odd.buzzOn === false, odd)
  const hook = code('src/hooks/useTimers.tsx')
  check('the hook reads and writes the settings record, not the timer record',
    /getTimerPrefs\(profileId\)/.test(hook) && /saveTimerPrefs\(profileId, next\)/.test(hook))
}

console.log('\n7. Which card is lit: the first whose numbers ARE the selection')
{
  const today: RoundConfig = { rounds: 6, workSeconds: 20, restSeconds: 40 }
  const choices = protocolChoices(today, null)
  check('Today\'s numbers light Today', selectedChoiceKey(choices, today) === 'today')
  check('a preset\'s numbers light that preset', selectedChoiceKey(choices, tabata) === 'tabata')
  const draft = stepConfig(tabata, 'rounds', 1)
  check('one stepper tap off a preset lights Custom', selectedChoiceKey(choices, draft) === 'custom' && presetForConfig(draft) === null)
  check('...and stepping back onto it lights the preset again', selectedChoiceKey(choices, stepConfig(draft, 'rounds', -1)) === 'tabata')
  check('Today wins over a preset with the same numbers (it is first)',
    selectedChoiceKey(protocolChoices({ ...tabata }, null), tabata) === 'today')
  const cards = code('src/components/timers/ProtocolChips.tsx')
  check('Custom saves a draft on tap, and otherwise brings back what she saved',
    /if \(isDraft && active\) \{ timers\.setCustomRoundConfig\(active\); return \}/.test(cards) && /config = saved \?\? choice\.config/.test(cards))
  check('the draft card says "save as preset"', /choice\.key === 'custom' && isDraft\s*\?\s*'save as preset'/.test(cards))
}

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.log(`${failures} round-setup check(s) FAILED`); process.exit(1) }
console.log('All round-setup checks passed.')
