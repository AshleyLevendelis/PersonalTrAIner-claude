/**
 * Timers gate — timer-engine.ts pure functions (Timers + rest-complete flow
 * plan, Part 2 verification). Deadline anchoring surviving a simulated
 * reload (recompute from a stored anchor + a fresh `now`, never a counter),
 * round-timer transitions firing at the right moments, and
 * parseConditioningInterval never guessing on unstructured text.
 */
import {
  computeStopwatchElapsedMs,
  computeRoundState,
  roundPhaseIndex,
  parseConditioningInterval,
  type RoundConfig,
} from '../src/lib/timer-engine'

let failures = 0
function check(label: string, condition: boolean, extra?: unknown) {
  if (condition) {
    console.log(`  ok: ${label}`)
  } else {
    failures++
    console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`)
  }
}

function main() {
  console.log('[1] computeStopwatchElapsedMs — deadline-anchored, not tick-accumulated')
  const t0 = Date.now()
  check('stopped: returns accumulatedMs unchanged', computeStopwatchElapsedMs(5000, null, false, t0) === 5000)
  check('running: accumulated + (now - startedAt)', computeStopwatchElapsedMs(5000, new Date(t0 - 3000).toISOString(), true, t0) === 8000)
  check(
    'a simulated reload (fresh `now` far later) recomputes correctly from the same anchor, not a counter',
    computeStopwatchElapsedMs(5000, new Date(t0 - 3000).toISOString(), true, t0 + 60_000) === 68000
  )

  console.log('\n[2] computeRoundState — pure derivation from the start anchor, transitions at the right moments')
  const config: RoundConfig = { rounds: 3, workSeconds: 20, restSeconds: 10 }
  const start = Date.now()
  const startIso = new Date(start).toISOString()

  const midWork = computeRoundState(config, startIso, start + 5_000)
  check('mid-work: still round 1, still work, ~15s remaining', midWork.currentRound === 1 && midWork.currentPhase === 'work' && Math.abs(midWork.phaseRemainingMs - 15_000) < 50)

  const justPastWork = computeRoundState(config, startIso, start + 20_000)
  check('work boundary: flips to rest, round unchanged', justPastWork.currentRound === 1 && justPastWork.currentPhase === 'rest')

  const midRest = computeRoundState(config, startIso, start + 25_000)
  check('mid-rest: round 1, rest phase, ~5s remaining', midRest.currentRound === 1 && midRest.currentPhase === 'rest' && Math.abs(midRest.phaseRemainingMs - 5_000) < 50)

  const roundBoundary = computeRoundState(config, startIso, start + 30_000)
  check('rest boundary: advances to round 2, work phase', roundBoundary.currentRound === 2 && roundBoundary.currentPhase === 'work')

  const allComplete = computeRoundState(config, startIso, start + 100_000)
  check('past the final round: isComplete, clamped to the last round', allComplete.isComplete && allComplete.currentRound === config.rounds)

  const beforeStart = computeRoundState(config, startIso, start - 5_000)
  check('a now before the anchor clamps to round 1 work start, never negative', beforeStart.currentRound === 1 && beforeStart.currentPhase === 'work' && beforeStart.phaseRemainingMs === 20_000)

  console.log('\n[3] computeRoundState — backgrounded/reloaded return derives the CORRECT round, not a stale one')
  // 32s after start = round 2, 2s into its work phase — regardless of what
  // any earlier render observed, because there is no intermediate state.
  const staleReload = computeRoundState(config, startIso, start + 32_000)
  check('return 32s after start (mid-round-2-work) lands on round 2, work, correct remaining', staleReload.currentRound === 2 && staleReload.currentPhase === 'work' && Math.abs(staleReload.phaseRemainingMs - 18_000) < 50, staleReload)

  // Backgrounded across THREE phase boundaries (round-1 rest, round-2 work,
  // round-2 rest): 65s in = round 3, 5s into work. The old stepping bug made
  // exactly this scenario stall or race; the pure derivation cannot.
  const longBackground = computeRoundState(config, startIso, start + 65_000)
  check('return after 3 missed boundaries lands on round 3 work, ~15s remaining', longBackground.currentRound === 3 && longBackground.currentPhase === 'work' && Math.abs(longBackground.phaseRemainingMs - 15_000) < 50, longBackground)

  check(
    'derivation is time-pure: same anchor + same now always agree (reload equivalence)',
    JSON.stringify(computeRoundState(config, startIso, start + 47_500)) === JSON.stringify(computeRoundState(config, startIso, start + 47_500))
  )

  console.log('\n[3b] roundPhaseIndex — monotonic schedule position for single-cue-per-live-transition logic')
  check('round 1 work is index 0', roundPhaseIndex(midWork, config) === 0)
  check('round 1 rest is index 1', roundPhaseIndex(midRest, config) === 1)
  check('round 2 work is index 2', roundPhaseIndex(roundBoundary, config) === 2)
  check('complete is index rounds*2', roundPhaseIndex(allComplete, config) === 6)
  check(
    'a background catch-up spans >1 index (cue logic must fire nothing, not a burst)',
    roundPhaseIndex(longBackground, config) - roundPhaseIndex(midWork, config) > 1
  )

  console.log('\n[4] parseConditioningInterval — matches the exact conditioning-profile shape, never guesses')
  check(
    'fat_loss dedicatedDay text parses',
    JSON.stringify(parseConditioningInterval('HIIT Metabolic Circuit — 8 rounds of 30s max effort / 30s rest')) === JSON.stringify({ rounds: 8, workSeconds: 30, restSeconds: 30 })
  )
  check(
    'fat_loss heavyDayBrief text parses',
    JSON.stringify(parseConditioningInterval('Rowing Intervals — 6 rounds of 20s hard / 40s easy')) === JSON.stringify({ rounds: 6, workSeconds: 20, restSeconds: 40 })
  )
  check(
    'default dedicatedDay text parses',
    JSON.stringify(parseConditioningInterval('Light Conditioning Circuit — 5 rounds of 30s work / 45s rest')) === JSON.stringify({ rounds: 5, workSeconds: 30, restSeconds: 45 })
  )
  check('unstructured Zone-2 prose returns null, not a guess', parseConditioningInterval('Zone 2 Aerobic Base (walking, cycling, swimming) — conversational pace, ~60-70% max HR') === null)
  check('undefined activity returns null', parseConditioningInterval(undefined) === null)
  check('empty string returns null', parseConditioningInterval('') === null)

  if (failures > 0) {
    console.error(`\n${failures} check(s) FAILED.`)
    process.exit(1)
  }
  console.log('\nAll timer checks passed.')
}

main()
