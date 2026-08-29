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
