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

import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  computeRoundState, totalRoundSeconds, roundPips, intervalProgress, type RoundConfig,
  sessionTotalRounds, sessionRoundNumber, roundHeadline, roundDoneLabel, roundSubline,
  roundLogSummary, chipNumbers, protocolNameOf, secondsPhrase, sameRoundConfig,
} from '../src/lib/timer-engine'

/** Comments stripped, so a note explaining a rule cannot satisfy the check for it. */
const stripComments = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
/** Every .tsx under a directory — so "wherever a round can be started" is read, not listed. */
function walkTsx(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkTsx(full))
    else if (entry.name.endsWith('.tsx')) out.push(full)
  }
  return out
}

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
  // THE SENTENCE MOVED ONTO THE BUTTON, 12 Sep 2026: "Start · 10s countdown"
  // says it where the tap happens rather than in a line under it. Still
  // before you press, which is the whole point.
  //
  // RE-ANCHORED 13 Sep 2026 (frame 4a) OFF THE FILENAME. Start moved from the
  // setup panel to the always-present card, and a check that names one file
  // would have failed on a move rather than on a broken promise. So: find
  // every component that can start a round, and require each of them to name
  // the countdown. That also catches the real future defect — a SECOND start
  // control added somewhere quiet, without the promise.
  //
  // NOTE, and it is a deliberate departure from the mock: 4a's idle card
  // draws a button reading only "Start". An app that pauses ten seconds after
  // a tap without having said it would is indistinguishable from one that has
  // not started, so the longer label wins over the shorter word.
  const componentDir = join(ROOT, 'src/components')
  const starters = walkTsx(componentDir).filter(f => /timers\.startRound\(/.test(readFileSync(f, 'utf8')))
  check('something on screen can start a round (sanity check on this check)', starters.length > 0, starters.length)
  const silent = starters.filter(f => !/\{ROUND_LEAD_IN_SECONDS\}s countdown/.test(readFileSync(f, 'utf8')))
  check('...and the app says so before you press it, wherever it can be pressed',
    silent.length === 0, silent.map(f => f.replace(ROOT, '')))
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

// ---------------------------------------------------------------------------
console.log('\n8. Switching protocol mid-round keeps the count honest')
// ---------------------------------------------------------------------------
//
// Design handoff frame 4a, 13 Sep 2026. Tapping 40/20 during round 3 of 8 must
// pick up at round 4, still of 8. The engine derives everything from ONE
// immutable anchor, so the switch starts a genuinely new block whose `rounds`
// is only what remains — and the ONLY thing that keeps the words honest across
// that seam is `carried`.
//
// THE DEFECT THIS SECTION EXISTS TO CATCH is a card that says "Round 1 of 5" a
// second after promising "at round 4". Every display function is driven with a
// carried config and checked against the SESSION's numbers, not the block's.
{
  const base = { rounds: 8, workSeconds: 20, restSeconds: 10 }
  // What the boundary watcher builds when it switches at round 4 of 8: five
  // rounds left, three done, and the seconds those three took.
  const after = { rounds: 5, workSeconds: 40, restSeconds: 20, carried: { rounds: 3, seconds: 3 * 30 } }

  check('a plain config has nothing carried', sessionTotalRounds(base) === 8 && sessionRoundNumber(base, 3) === 3)
  check('a switched block still totals the session', sessionTotalRounds(after) === 8, sessionTotalRounds(after))
  check('...and its round 1 is the session\'s round 4', sessionRoundNumber(after, 1) === 4, sessionRoundNumber(after, 1))

  check('the headline counts the session, not the block',
    roundHeadline(after, 1) === 'Round 4 of 8', roundHeadline(after, 1))
  check('...and so does the finished label',
    roundDoneLabel(after) === '8 of 8 rounds done', roundDoneLabel(after))
  check('...and the line under the clock',
    roundSubline(after, 'work', 1) === 'Round 4 of 8 — 20s rest next.', roundSubline(after, 'work', 1))
  // THE REST NAMED IS THE NEW BLOCK'S, because that is what happens next.
  check('...quoting the rest the NEW protocol will actually give',
    roundSubline(after, 'work', 1).includes('20s rest'), roundSubline(after, 'work', 1))

  // ONE PIP PER ROUND OF THE SESSION. Pips that shrank with the block would
  // report the session getting smaller as it went on.
  const anchor = START.toISOString()
  const midBlock = computeRoundState(after, anchor, START.getTime() + 1000)
  const pips = roundPips(midBlock, after)
  check('the pips span the whole session', pips.length === 8, pips.length)
  check('...with the rounds done before the switch marked done',
    pips.slice(0, 3).every(x => x === 'done'), pips)
  check('...and the current one where the session says it is',
    pips[3] === 'current', pips)
  // AND DURING A COUNTDOWN. Nothing is "current" in a lead-in — round 1 has
  // not started — but rounds already DONE stay done, and the branch that says
  // so is only reachable from a config that carries something. The app never
  // builds one (a switched block has no countdown), so this drives the
  // function's contract directly rather than leaving the branch unwatched.
  const leadInPips = roundPips(
    computeRoundState({ ...after, leadInSeconds: 10 }, anchor, START.getTime() + 1000),
    { ...after, leadInSeconds: 10 })
  check('...and a countdown does not un-do the rounds already done',
    leadInPips.slice(0, 3).every(x => x === 'done') && leadInPips.slice(3).every(x => x === 'upcoming'),
    leadInPips)

  // THE LOG COVERS BOTH HALVES. Eight rounds happened; a log saying five
  // because the protocol changed at round four would be the app disbelieving
  // her — the same defect roundLogSummary's own header was written about.
  const logged = roundLogSummary(after)
  const expectedSeconds = 3 * 30 + (5 * 40 + 4 * 20)
  check('the logged duration counts the rounds before the switch too',
    logged.durationMinutes === Math.max(1, Math.round(expectedSeconds / 60)),
    { got: logged.durationMinutes, expectedSeconds })
  check('...and it is strictly more than the block alone',
    logged.durationMinutes > roundLogSummary({ rounds: 5, workSeconds: 40, restSeconds: 20 }).durationMinutes,
    logged)
  check('...and the note says the session switched rather than hiding it',
    /8 rounds/.test(logged.detail) && /first 3/.test(logged.detail), logged.detail)

  // CARRIED IS DISPLAY ONLY. The block's own schedule must not grow with it,
  // or the finished state banks the wrong number and un-finishes itself.
  check('the block\'s own length ignores what came before',
    totalRoundSeconds(after) === totalRoundSeconds({ rounds: 5, workSeconds: 40, restSeconds: 20 }),
    { withCarry: totalRoundSeconds(after) })

  // THE CHIP ROW'S OWN VOCABULARY.
  // ON A CONFIG NO PRESET SHARES, deliberately. Checking Tabata alone passed
  // with the whole expression replaced by the literal "8×20/10" — the fixture
  // was the answer.
  check('a chip states its config in short form',
    chipNumbers(base) === '8×20/10' && chipNumbers({ rounds: 5, workSeconds: 45, restSeconds: 15 }) === '5×45/15',
    chipNumbers({ rounds: 5, workSeconds: 45, restSeconds: 15 }))
  // AND NEVER SAYS IT TWICE. A protocol named after its own numbers gets the
  // round count instead, so the chip does not read "40/20 · 8×40/20".
  check('...and a chip named after its numbers says how many rounds instead',
    chipNumbers({ rounds: 8, workSeconds: 40, restSeconds: 20 }, '40/20') === '8 rds',
    chipNumbers({ rounds: 8, workSeconds: 40, restSeconds: 20 }, '40/20'))
  check('...while a chip named after a protocol still states the numbers',
    chipNumbers(base, 'Tabata') === '8×20/10', chipNumbers(base, 'Tabata'))
  // A REST IS NEVER DROPPED TO SHORTEN THE CHIP. The minute form states the
  // work alone, so it is reserved for intervals long enough that nobody says
  // them in seconds; at one minute with a real rest, the rest is the half you
  // need. Found by reading the screen, not by a check — none of these looked
  // at a 60-second interval before.
  check('a one-minute round still shows the rest it has',
    chipNumbers({ rounds: 6, workSeconds: 60, restSeconds: 30 }) === '6×60/30',
    chipNumbers({ rounds: 6, workSeconds: 60, restSeconds: 30 }))
  check('...while a three-minute boxing round is said in minutes',
    chipNumbers({ rounds: 3, workSeconds: 180, restSeconds: 60 }, 'Boxing') === '3×3 min',
    chipNumbers({ rounds: 3, workSeconds: 180, restSeconds: 60 }, 'Boxing'))
  check('...and an EMOM states its length, not a rest it does not have',
    chipNumbers({ rounds: 10, workSeconds: 60, restSeconds: 0, style: 'emom' }) === '10 min',
    chipNumbers({ rounds: 10, workSeconds: 60, restSeconds: 0, style: 'emom' }))
  check('a protocol is named by its preset, and anything else is honestly Custom',
    protocolNameOf(base) === 'Tabata' && protocolNameOf({ rounds: 7, workSeconds: 25, restSeconds: 5 }) === 'Custom')
  check('the idle line says what the protocol IS',
    secondsPhrase(base) === '20s work · 10s rest', secondsPhrase(base))

  // TWO CONFIGS MATCH ON WHAT RUNS, not on bookkeeping. A running block
  // carries a lead-in and a carry that a chip never has; if those counted,
  // the row would show nothing selected in the middle of running that very
  // protocol.
  check('a running block still matches the chip that started it',
    sameRoundConfig({ ...base, leadInSeconds: 10 }, base))
  check('...and a switched block matches the chip it switched to',
    sameRoundConfig(after, { rounds: 5, workSeconds: 40, restSeconds: 20 }))
  check('...but a different protocol does not', !sameRoundConfig(base, { ...base, workSeconds: 30 }))

  // THE BOUNDARY ITSELF, read off the provider. It has to land at a round
  // edge and nowhere else, and it must not stop to count down again.
  const hook = stripComments(readFileSync(join(ROOT, 'src/hooks/useTimers.tsx'), 'utf8'))
  check('a queued switch waits for a new round to begin',
    /roundState\.currentRound > prevRound\.round/.test(hook))
  check('...and never lands during the get-ready countdown',
    /roundState\.currentPhase !== 'lead_in'/.test(hook))
  check('...nor after the session has finished', /!roundState\.isComplete/.test(hook))
  check('the new block runs only what is left',
    /rounds: remaining/.test(hook) && /sessionTotalRounds\(cfg\) - carried\.rounds/.test(hook))
  check('...with no second countdown in the middle of a session',
    /leadInSeconds: 0/.test(hook))
  check('...and hands over what has already been done',
    /rounds: \(cfg\.carried\?\.rounds \?\? 0\) \+ doneInBlock/.test(hook)
    && /seconds: \(cfg\.carried\?\.seconds \?\? 0\) \+ doneInBlock \* \(cfg\.workSeconds \+ cfg\.restSeconds\)/.test(hook))
  // ONE WRITER. Two effects both keyed on roundState both calling persist is
  // how the per-phase deadline corruption got in the first time.
  check('the switch is applied by the one effect that already writes the record',
    hook.indexOf('const queued = record.queuedRoundConfig') > hook.indexOf('const lastCueRef'), null)
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll round-timer checks passed.')
