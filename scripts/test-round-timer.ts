// ---------------------------------------------------------------------------
// Gate: the round timer's schedule (design handoff v2 §6 + build notes).
//
// WHY THIS EXISTS SEPARATELY FROM test:timers. That gate covers the engine's
// anchoring and transitions and passed throughout — including while the engine
// ran for rounds x (work + rest), so every 6 x 40/20 session took 6:00 and
// ended by sitting through a rest with nothing left to recover for. The
// handoff is explicit that the trailing rest does not exist:
//
//   "Skip the final rest. Six rounds means six work intervals and five rests."
//   "Derive the total, never state it: ROUNDS x WORK + (ROUNDS - 1) x REST.
//    Six rounds of 40s/20s is 5:40, not 6:00."
//
// This file holds those two rules, and the one-graphic-one-meaning split
// between the ring and the pips.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  computeRoundState, totalRoundSeconds, roundPips, intervalProgress, type RoundConfig,
} from '../src/lib/timer-engine'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const SIX: RoundConfig = { workSeconds: 40, restSeconds: 20, rounds: 6 }
const START = new Date('2026-08-30T10:00:00.000Z')
const at = (sec: number) => computeRoundState(SIX, START.toISOString(), START.getTime() + sec * 1000)

console.log('\n1. Six rounds is 5:40, not 6:00')
{
  check('the derived total is 340s', totalRoundSeconds(SIX) === 340, totalRoundSeconds(SIX))
  check('...and NOT rounds x (work + rest)', totalRoundSeconds(SIX) !== 6 * 60)
  check('one round has no rest at all', totalRoundSeconds({ ...SIX, rounds: 1 }) === 40)
  check('zero rounds is zero', totalRoundSeconds({ ...SIX, rounds: 0 }) === 0)
}

console.log('\n2. The run ends on WORK — there is no trailing rest')
{
  check('at 339s the last work interval is still running', at(339).isComplete === false && at(339).currentPhase === 'work',
    [at(339).isComplete, at(339).currentPhase])
  check('at 340s it is complete', at(340).isComplete === true)
  check('...and it did NOT keep going to 360s', at(345).isComplete === true && at(359).isComplete === true)
  // The bug this file was written for: the old engine reported a rest here.
  check('the completed state is work, not a rest nobody is taking',
    at(340).currentPhase === 'work', at(340).currentPhase)
}

console.log('\n3. Positions through the run')
{
  check('t=0 round 1 work', at(0).currentRound === 1 && at(0).currentPhase === 'work')
  check('t=41s round 1 rest', at(41).currentPhase === 'rest', at(41))
  check('t=61s round 2 work', at(61).currentRound === 2 && at(61).currentPhase === 'work')
  check('t=300s round 6 work — the last one', at(300).currentRound === 6 && at(300).currentPhase === 'work')
}

console.log('\n4. One graphic, one meaning: the ring is the interval, the pips are the rounds')
{
  const mid = at(20)
  check('the ring is half through THIS interval', Math.abs(intervalProgress(mid, SIX) - 0.5) < 0.02, intervalProgress(mid, SIX))
  check('...not through the whole run', Math.abs(intervalProgress(mid, SIX) - 20 / 340) > 0.1)
  const pips = roundPips(mid, SIX)
  check('one pip per round', pips.length === 6, pips.length)
  check('round 1 current, rest upcoming', pips[0] === 'current' && pips.slice(1).every(p => p === 'upcoming'), pips)
  check('by round 6 five pips are done', roundPips(at(310), SIX).filter(p => p === 'done').length === 5)
  check('a finished run has every pip done', roundPips(at(340), SIX).every(p => p === 'done'))
  check('the ring is full when complete', intervalProgress(at(340), SIX) === 1)
}

console.log('\n5. It is anchored to a timestamp, not a tick count')
{
  // Comments stripped: the engine's own prose explains why it does not count
  // ticks, which satisfied this check against the raw file the first time.
  const src = readFileSync(join(ROOT, 'src/lib/timer-engine.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  check('no interval or tick counter in the engine', !/setInterval|tick\+\+|count\+\+/.test(src))
  check('every reading is derived from the start anchor and now',
    /computeRoundState\(config: RoundConfig, roundStartedAtIso: string, now: number\)/.test(src))
  // A phone asleep for two minutes must land where a perfect ticker would.
  check('a two-minute gap lands in the right place',
    at(125).currentRound === 3 && at(125).currentPhase === 'work', at(125))
}

console.log('\n7. The ten-second countdown before round 1')
// ---------------------------------------------------------------------------
// Ashley, 11 Sep 2026: "The round timer starts with no countdown. As soon as
// you start it begins." It did. The countdown is an OFFSET on the same single
// anchor, never a stored phase — this file's whole subject is that nothing
// steps, so the checks below prove the schedule after the countdown is the
// same schedule, just later.
// ---------------------------------------------------------------------------
{
  const LEAD: RoundConfig = { ...SIX, leadInSeconds: 10 }
  const led = (sec: number) => computeRoundState(LEAD, START.toISOString(), START.getTime() + sec * 1000)

  check('the moment you press start it is counting down, not working',
    led(0).currentPhase === 'lead_in' && led(0).phaseRemainingMs === 10_000, led(0))
  check('...and it is not complete, and not round 0',
    !led(0).isComplete && led(0).currentRound === 1, led(0))
  check('still counting down at 9.9s', led(9.9).currentPhase === 'lead_in', led(9.9))
  check('work begins exactly at 10s', led(10).currentPhase === 'work' && led(10).currentRound === 1, led(10))
  check('...with the WHOLE work interval, not a second eaten',
    led(10).phaseRemainingMs === 40_000, led(10))

  // THE PROPERTY THE WHOLE DESIGN RESTS ON: after the countdown the schedule
  // is bit-for-bit the one that has always run, just shifted. Compared across
  // the full run rather than at a couple of convenient points.
  const drift: string[] = []
  for (let t = 0; t <= totalRoundSeconds(SIX) + 30; t += 0.5) {
    const plain = at(t)
    const shifted = led(t + 10)
    if (plain.currentRound !== shifted.currentRound || plain.currentPhase !== shifted.currentPhase
      || plain.phaseRemainingMs !== shifted.phaseRemainingMs || plain.isComplete !== shifted.isComplete) {
      drift.push(`t=${t}`)
    }
  }
  check('after the countdown, the schedule is identical to the one without it', drift.length === 0, drift.slice(0, 5))

  // THE COMPAT RULE, and the reason the engine reads `?? 0` and never `?? 10`.
  // A round already running from a persisted record carries no lead-in field;
  // defaulting it to ten would rewind a live timer by ten seconds on its very
  // next tick.
  check('a config with no countdown behaves exactly as it always has',
    at(0).currentPhase === 'work' && at(0).phaseRemainingMs === 40_000, at(0))
  check('...and its total is unchanged', totalRoundSeconds(SIX) === 340)
  check('the countdown is counted in the total, or a finished run un-finishes itself',
    totalRoundSeconds(LEAD) === 350, totalRoundSeconds(LEAD))
  check('...and the run completes at that total', led(350).isComplete && !led(349).isComplete, led(350))

  check('nothing is lit on the pips while it counts down',
    roundPips(led(0), LEAD).every(p => p === 'upcoming'), roundPips(led(0), LEAD))
  check('...and round 1 lights the moment work starts',
    roundPips(led(10), LEAD)[0] === 'current', roundPips(led(10), LEAD))
  check('the ring fills across the countdown like any other phase',
    intervalProgress(led(0), LEAD) === 0 && Math.abs(intervalProgress(led(5), LEAD) - 0.5) < 0.001,
    intervalProgress(led(5), LEAD))

  // The cue diff treats a step of exactly 1 as a live transition, so the
  // lead-in must sit one below round 1's work — that is what gives the timer
  // a "go" beep at the start, which it has never had.
  const src = readFileSync(join(ROOT, 'src/lib/timer-engine.ts'), 'utf8')
  check('the countdown sits one step below round 1, so the start plays a cue',
    /if \(state\.currentPhase === 'lead_in'\) return -1/.test(src))
  check('the countdown is an offset on the anchor, not a stored phase',
    /sinceAnchor - leadInMs/.test(src) && !/leadInElapsed|countingDown:|isCountingDown/.test(src))

  // Skipping it is the same move pause/resume make — the anchor, and nothing
  // else. A "skipped" flag would be a second source of truth for a fact the
  // anchor already carries.
  const hook = readFileSync(join(ROOT, 'src/hooks/useTimers.tsx'), 'utf8')
  check('you can start early', /const skipLeadIn = useCallback/.test(hook))
  check('...by moving the anchor, not by setting a flag',
    /startedAtIso: new Date\(now - leadInMs\)\.toISOString\(\)/.test(hook))
  check('...and it refuses once work has already begun, rather than rewinding',
    /if \(now - new Date\(record\.startedAtIso\)\.getTime\(\) >= leadInMs\) return/.test(hook))
  check('a new round is started WITH the countdown',
    /leadInSeconds: config\.leadInSeconds \?\? ROUND_LEAD_IN_SECONDS/.test(hook))
  check('...and the app says so before you press it',
    /Starts after a \{ROUND_LEAD_IN_SECONDS\}-second countdown/.test(
      readFileSync(join(ROOT, 'src/components/timers/TimersPanel.tsx'), 'utf8')))
}

console.log('\n6. Audio and haptics exist, and are not a second copy')
{
  const cues = readFileSync(join(ROOT, 'src/lib/timer-cues.ts'), 'utf8')
  check('the app has one cue module', /export function playTimerCue/.test(cues))
  check('...with a distinct tone per transition', /'work-to-rest'|'rest-to-work'/.test(cues))
  check('...and haptics beside the audio, since the phone is face down',
    /navigator\.vibrate/.test(cues))
  // The round timer must use it rather than growing its own oscillator.
  const hook = readFileSync(join(ROOT, 'src/hooks/useTimers.tsx'), 'utf8')
  check('the round timer fires the shared cues', /playTimerCue/.test(hook))
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll round-timer checks passed.')
